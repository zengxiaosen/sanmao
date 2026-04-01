import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAiIcebreakerPayload,
  buildCompatibilitySummary,
  buildIcebreakerSuggestions,
  buildRecommendationReasons,
  createInitialState,
  escapeHtml,
  getLaunchCopy,
  getSeedQualityReport,
  resolveIcebreakerSuggestions
} from "../src/app.js";
import { defaultProfile, seedProfiles } from "../src/data.js";

test("launch copy excludes demo-only phrases", () => {
  const copy = getLaunchCopy();
  const serialized = JSON.stringify(copy);

  assert.equal(serialized.includes("假数据演示版"), false);
  assert.equal(serialized.includes("演示版资料只保存在你的浏览器"), false);
  assert.equal(serialized.includes("TODAY COMPLETE"), false);
  assert.equal(serialized.includes("命中预设的双向喜欢后"), false);
});

test("recommendation reasons return three readable bullets", () => {
  const reasons = buildRecommendationReasons(defaultProfile, seedProfiles[0]);

  assert.equal(Array.isArray(reasons), true);
  assert.equal(reasons.length, 3);
  reasons.forEach((reason) => {
    assert.equal(typeof reason, "string");
    assert.equal(reason.length > 8, true);
  });
});

test("icebreaker suggestions return three non-empty prompts", () => {
  const suggestions = buildIcebreakerSuggestions(seedProfiles[0]);

  assert.equal(suggestions.length, 3);
  suggestions.forEach((suggestion) => {
    assert.equal(typeof suggestion, "string");
    assert.equal(suggestion.includes("？") || suggestion.includes("吗"), true);
  });
});

test("compatibility summary stays light and product-facing", () => {
  const summary = buildCompatibilitySummary(defaultProfile, seedProfiles[0]);

  assert.equal(typeof summary, "string");
  assert.equal(summary.length > 12, true);
  assert.equal(summary.includes("算法"), false);
  assert.equal(summary.includes("测试"), false);
});

test("createInitialState starts with an empty draft message", () => {
  const state = createInitialState();

  assert.equal(state.draftMessage, "");
});

test("sending an icebreaker should not auto-insert a recipient reply for new chats", () => {
  const profile = seedProfiles[1];
  const before = [];
  const nextThread = [...before, { from: defaultProfile.id, text: "最近在听什么播客？" }];

  assert.equal(nextThread.length, 1);
  assert.equal(nextThread[0].from, defaultProfile.id);
  assert.equal(nextThread.some((message) => message.from === profile.id), false);
});

test("compatibility summary handles missing candidate safely", () => {
  const summary = buildCompatibilitySummary(defaultProfile, null);

  assert.equal(summary, "先回到消息列表看看新的匹配吧。");
});

test("escapeHtml escapes dangerous markup characters", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">&"\''),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&quot;&#39;"
  );
});

test("seed quality report flags no duplicate avatars", () => {
  const report = getSeedQualityReport(seedProfiles);

  assert.deepEqual(report.duplicateAvatarUrls, []);
  assert.equal(report.totalProfiles, seedProfiles.length);
  assert.equal(report.totalProfiles > 0, true);
});

test("ai icebreaker payload keeps only frontend-safe profile fields and recent thread", () => {
  const candidateProfile = seedProfiles[0];
  const recentMessages = [
    { from: defaultProfile.id, text: "你好呀" },
    { from: candidateProfile.id, text: "晚上好" }
  ];
  const payload = buildAiIcebreakerPayload(defaultProfile, candidateProfile, recentMessages);

  assert.deepEqual(payload.viewerProfile, {
    id: defaultProfile.id,
    city: defaultProfile.city,
    company: defaultProfile.company,
    role: defaultProfile.role,
    school: defaultProfile.school,
    tags: defaultProfile.tags,
    bio: defaultProfile.bio
  });
  assert.deepEqual(payload.candidateProfile, {
    id: candidateProfile.id,
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
  });
  assert.deepEqual(payload.recentMessages, recentMessages);
});

test("resolveIcebreakerSuggestions preserves ai suggestions when response is complete", () => {
  const candidateProfile = seedProfiles[0];
  const result = resolveIcebreakerSuggestions(candidateProfile, {
    suggestions: ["第一句", "第二句", "第三句"],
    source: "ai",
    fallbackUsed: false
  });

  assert.deepEqual(result, {
    suggestions: ["第一句", "第二句", "第三句"],
    source: "ai",
    fallbackUsed: false
  });
});

test("resolveIcebreakerSuggestions falls back when ai response is malformed", () => {
  const candidateProfile = seedProfiles[1];
  const result = resolveIcebreakerSuggestions(candidateProfile, {
    suggestions: ["只有一句"],
    source: "ai",
    fallbackUsed: false
  });

  assert.deepEqual(result, {
    suggestions: buildIcebreakerSuggestions(candidateProfile),
    source: "fallback",
    fallbackUsed: true
  });
});
