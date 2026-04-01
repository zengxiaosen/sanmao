import { setTimeout as delay } from "node:timers/promises";

const REQUEST_TIMEOUT_MS = 8000;
const MAX_SUGGESTIONS = 3;

function trimTrailingPunctuation(text) {
  return String(text || "")
    .trim()
    .replace(/^[\-•\d.\s]+/, "")
    .replace(/^['"“”‘’]+|['"“”‘’]+$/g, "")
    .trim();
}

function normalizeSuggestion(text) {
  return trimTrailingPunctuation(text).replace(/\s+/g, " ");
}

function extractSuggestionsFromContent(content) {
  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .filter(Boolean);

    return textParts.join("\n");
  }

  if (typeof content === "string") {
    return content;
  }

  if (content && typeof content.text === "string") {
    return content.text;
  }

  return "";
}

export function buildIcebreakerPrompt({ viewerProfile, candidateProfile, recentMessages = [] }) {
  const recentLines = recentMessages
    .slice(-6)
    .map((message) => `${message.from === viewerProfile.id ? "我" : candidateProfile.name}：${message.text}`)
    .join("\n");

  return [
    "你是中文恋爱社交产品里的开场白助手。",
    "请基于双方资料，生成 3 句自然、真诚、不油腻的中文开场白。",
    "要求：每句 12 到 30 字，适合第一次聊天，避免夸张、避免重复资料原文、不要使用编号。",
    "请只返回 JSON，格式为 {\"suggestions\":[\"...\",\"...\",\"...\"]}。",
    `我的资料：${JSON.stringify({
      city: viewerProfile.city,
      company: viewerProfile.company,
      role: viewerProfile.role,
      school: viewerProfile.school,
      tags: viewerProfile.tags,
      bio: viewerProfile.bio
    }, null, 0)}`,
    `对方资料：${JSON.stringify({
      name: candidateProfile.name,
      city: candidateProfile.city,
      company: candidateProfile.company,
      role: candidateProfile.role,
      school: candidateProfile.school,
      tags: candidateProfile.tags,
      bio: candidateProfile.bio,
      prompt: candidateProfile.prompt,
      vibe: candidateProfile.vibe,
      openerStyle: candidateProfile.openerStyle,
      idealFirstMove: candidateProfile.idealFirstMove,
      conversationHooks: candidateProfile.conversationHooks
    }, null, 0)}`,
    recentLines ? `最近聊天记录：\n${recentLines}` : "最近聊天记录：暂无，请按第一次开场来写。"
  ].join("\n");
}

export function buildVisionRequestBody(input) {
  return {
    messages: [
      {
        role: "user",
        content: buildIcebreakerPrompt(input)
      }
    ],
    temperature: 0.8
  };
}

export function normalizeIcebreakerResponse(payload) {
  const candidates = [];

  if (Array.isArray(payload?.suggestions)) {
    candidates.push(...payload.suggestions);
  }

  const contentText = extractSuggestionsFromContent(payload?.content ?? payload?.output ?? payload?.data?.content);
  if (contentText) {
    try {
      const parsed = JSON.parse(contentText);
      if (Array.isArray(parsed?.suggestions)) {
        candidates.push(...parsed.suggestions);
      }
    } catch {
      candidates.push(
        ...contentText
          .split(/\n+/)
          .map((line) => line.replace(/^\s*(?:[-•]|\d+[.)、])\s*/, ""))
      );
    }
  }

  const suggestions = Array.from(
    new Set(candidates.map(normalizeSuggestion).filter((item) => item.length >= 6))
  ).slice(0, MAX_SUGGESTIONS);

  return {
    suggestions,
    valid: suggestions.length === MAX_SUGGESTIONS
  };
}

export async function generateIcebreakers({
  viewerProfile,
  candidateProfile,
  recentMessages = [],
  apiUrl,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  if (!apiUrl || !apiKey) {
    return {
      suggestions: [],
      fallbackUsed: true,
      source: "fallback"
    };
  }

  const controller = new AbortController();
  const timer = delay(timeoutMs, null, { signal: controller.signal }).then(() => controller.abort()).catch(() => {});

  try {
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(buildVisionRequestBody({ viewerProfile, candidateProfile, recentMessages })),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    const normalized = normalizeIcebreakerResponse(payload);

    if (!response.ok || !normalized.valid) {
      return {
        suggestions: normalized.suggestions,
        fallbackUsed: true,
        source: "fallback"
      };
    }

    return {
      suggestions: normalized.suggestions,
      fallbackUsed: false,
      source: "ai"
    };
  } catch {
    return {
      suggestions: [],
      fallbackUsed: true,
      source: "fallback"
    };
  } finally {
    controller.abort();
    await timer;
  }
}
