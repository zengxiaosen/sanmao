import { loadState, saveState } from "./storage.js";

const DAILY_LIMIT = 30;

export function buildDistanceHint(viewerProfile, candidateProfile) {
  const viewerCity = String(viewerProfile?.city || "").trim();
  const candidateCity = String(candidateProfile?.city || "").trim();

  if (viewerCity && candidateCity && viewerCity === candidateCity) {
    return `你们都在${candidateCity}，同城见面成本更低，可以先从生活半径和周末安排聊起。`;
  }
  if (viewerCity && candidateCity) {
    return `你在${viewerCity}，她在${candidateCity}，先把聊天聊深一点，再考虑异城见面会更自然。`;
  }
  if (candidateCity) {
    return `她现在在${candidateCity}，先从城市节奏和日常安排切进去更容易接话。`;
  }
  return "先从彼此日常节奏聊起，确认是不是同一路人。";
}

export function buildAssistantCardTitle() {
  return "AI 恋爱助手";
}

export function getDemoModeCopy() {
  return {
    badge: "演示模式",
    description: "这里展示的是冷启动样板对话，用来帮你感受聊天节奏，不是真人在线即时回复。"
  };
}

export function buildRecommendationReasons(viewerProfile, candidateProfile) {
  const viewerTags = Array.isArray(viewerProfile?.tags)
    ? viewerProfile.tags
    : String(viewerProfile?.tags || "")
        .split(/[、,/]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
  const candidateTags = Array.isArray(candidateProfile?.tags)
    ? candidateProfile.tags
    : String(candidateProfile?.tags || "")
        .split(/[、,/]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
  const sharedTag = viewerTags.find((tag) => candidateTags.includes(tag));

  return [
    sharedTag
      ? `为什么现在适合开口：你们都对${sharedTag}有兴趣，第一句为什么容易接住会很明确。`
      : `为什么现在适合开口：${candidateProfile?.name || "对方"}的资料很具体，第一句为什么容易接住会更清楚。`,
    buildDistanceHint(viewerProfile, candidateProfile),
    `${String(candidateProfile?.prompt || "资料里留了不少可聊的线索").replace(/。$/, "")}，很适合顺着资料线索展开一段自然对话。`
  ];
}

export function buildIcebreakerSuggestions(candidateProfile, context = {}) {
  const tags = Array.isArray(candidateProfile?.tags)
    ? candidateProfile.tags
    : String(candidateProfile?.tags || "")
        .split(/[、,/]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
  const firstTag = tags[0] || "最近的兴趣";
  const prompt = String(candidateProfile?.prompt || "最近让你开心的一件小事").replace(/。$/, "");
  const city = candidateProfile?.city || "你现在的城市";
  const stage = context?.situation?.stage || "cold_start";

  const suggestionSets = {
    cold_start: [
      {
        id: "cold_start_interest_probe",
        text: `你资料里提到${firstTag}，最近一次让你特别开心的是什么？`,
        why: "先从她资料里最具体的线索开口，降低接话成本。",
        goal: "建立第一轮自然来回"
      },
      {
        id: "cold_start_prompt_expand",
        text: `看到你说“${prompt}”，这通常会是你理想周末的样子吗？`,
        why: "把资料里的表达展开成轻问题，不会显得像审问。",
        goal: "让对方多说一点自己的节奏"
      },
      {
        id: "cold_start_city_scene",
        text: `如果第一次见面安排在${city}，你会想选咖啡还是散步呢？`,
        why: "先轻轻试探相处场景，比直接推进见面更自然。",
        goal: "观察见面接受度"
      }
    ],
    warming: [
      {
        id: "warming_follow_hook",
        text: `你刚刚提到${firstTag}，通常你会怎么开始这件事？`,
        why: "顺着已有聊天线索继续，不会突然跳话题。",
        goal: "把聊天从点头变成展开"
      },
      {
        id: "warming_daily_rhythm",
        text: `感觉你平时节奏应该挺有自己的一套，最近让你最放松的一个晚上是怎么过的？`,
        why: "从生活节奏切入，容易带出更真实的日常感。",
        goal: "增加熟悉感"
      },
      {
        id: "warming_soft_preference",
        text: `如果周末想轻松一点，你一般会更偏向出去走走还是待着充电？`,
        why: "这个问题轻，但能让对方给出明确偏好。",
        goal: "为后续邀约积累信息"
      }
    ],
    engaged: [
      {
        id: "engaged_personalize_mood",
        text: "感觉我们现在已经不是只在走流程聊天了，你通常会对什么样的相处节奏更有好感？",
        why: "在对话已有温度时，适合轻一点聊相处偏好。",
        goal: "确认关系推进方式"
      },
      {
        id: "engaged_scene_build",
        text: `如果把这段聊天延续到线下，你会更想从咖啡、散步，还是找个安静地方慢慢聊开始？`,
        why: "把线上默契自然过渡到线下场景。",
        goal: "测试见面意愿"
      },
      {
        id: "engaged_open_loop",
        text: "我发现你说话挺让人想继续接下去的，你最近有没有一件还挺想分享、但别人不一定会问到的小事？",
        why: "给她一个被认真听见的感觉，容易拉近距离。",
        goal: "制造更深一点的来回"
      }
    ],
    invite_window: [
      {
        id: "invite_window_soft_lock",
        text: `感觉我们已经聊到可以见面也不会尴尬的程度了，如果这周找个轻松一点的时间，你会更偏向咖啡还是散步？`,
        why: "局面已经接近邀约窗口，直接但不压迫。",
        goal: "把见面意向落到具体形式"
      },
      {
        id: "invite_window_time_probe",
        text: "你最近哪天会相对轻松一点？如果节奏合适，我们可以找个不折腾的方式见一面。",
        why: "从时间切入，比直接定地点更容易获得回应。",
        goal: "确认可执行时间"
      },
      {
        id: "invite_window_low_pressure",
        text: "我们先把第一次见面想得轻一点也可以，找个顺路的地方坐一会儿，你会比较舒服。",
        why: "降低见面心理压力，减少她顾虑。",
        goal: "提高答应见面的概率"
      }
    ],
    stalled: [
      {
        id: "stalled_reset_light",
        text: `换个轻一点的话题，如果今天下班后只能留一个小确幸，你会选${firstTag}、好吃的，还是发呆？`,
        why: "当聊天发力过头时，先把氛围拉回轻松。",
        goal: "重新打开回应窗口"
      },
      {
        id: "stalled_reduce_pressure",
        text: "感觉前面的话题有点用力了，我换个简单的问法：你最近过得最像自己的一天是什么样？",
        why: "先承认节奏需要放松，降低对方心理负担。",
        goal: "恢复自然交流"
      },
      {
        id: "stalled_easy_choice",
        text: "不认真答也行，最近你会更想早点回家、出去走走，还是找家店坐一下？",
        why: "给出低门槛选择题，比开放式更容易回。",
        goal: "换回一条容易接的话"
      }
    ]
  };

  return suggestionSets[stage] || suggestionSets.cold_start;
}

export function buildAiIcebreakerPayload(viewerProfile, candidateProfile, recentMessages) {
  return {
    viewerProfile: {
      id: viewerProfile?.id,
      city: viewerProfile?.city,
      company: viewerProfile?.company,
      role: viewerProfile?.role,
      school: viewerProfile?.school,
      tags: viewerProfile?.tags,
      bio: viewerProfile?.bio
    },
    candidateProfile: {
      id: candidateProfile?.id,
      name: candidateProfile?.name,
      city: candidateProfile?.city,
      company: candidateProfile?.company,
      role: candidateProfile?.role,
      school: candidateProfile?.school,
      tags: candidateProfile?.tags,
      bio: candidateProfile?.bio,
      prompt: candidateProfile?.prompt,
      vibe: candidateProfile?.vibe,
      openerStyle: candidateProfile?.openerStyle,
      idealFirstMove: candidateProfile?.idealFirstMove,
      conversationHooks: candidateProfile?.conversationHooks
    },
    recentMessages: Array.isArray(recentMessages) ? recentMessages.slice(-6) : []
  };
}

export function resolveIcebreakerSuggestions(candidateProfile, responsePayload) {
  const fallbackSituation = {
    stage: "cold_start",
    label: "刚破冰",
    why: "现在还处在刚开始接触的阶段，先让对方容易接话最重要。",
    nextMove: "先从资料里的具体线索切进去，让对方更容易接话。",
    avoid: "别一上来就过度热情或直接推进见面。"
  };
  const incomingSituation = responsePayload?.situation && typeof responsePayload.situation === "object"
    ? {
        stage: responsePayload.situation.stage || fallbackSituation.stage,
        label: responsePayload.situation.label || fallbackSituation.label,
        why: responsePayload.situation.why || fallbackSituation.why,
        nextMove: responsePayload.situation.nextMove || fallbackSituation.nextMove,
        avoid: responsePayload.situation.avoid || fallbackSituation.avoid
      }
    : fallbackSituation;
  const fallbackSuggestions = buildIcebreakerSuggestions(candidateProfile, { situation: incomingSituation });
  const normalizedSuggestions = Array.isArray(responsePayload?.suggestions)
    ? responsePayload.suggestions
        .map((item, index) => {
          if (typeof item === "string") {
            const fallbackItem = fallbackSuggestions[index] || fallbackSuggestions[0];
            return {
              id: fallbackItem?.id || `fallback_${index + 1}`,
              text: item.trim(),
              why: fallbackItem?.why || "这句更容易让对方自然接住。",
              goal: fallbackItem?.goal || "推进聊天继续往下走"
            };
          }

          if (!item || typeof item !== "object") {
            return null;
          }

          const fallbackItem = fallbackSuggestions[index] || fallbackSuggestions[0];
          const text = String(item.text || "").trim();
          if (!text) {
            return null;
          }

          return {
            id: String(item.id || fallbackItem?.id || `fallback_${index + 1}`),
            text,
            why: String(item.why || fallbackItem?.why || "这句更容易让对方自然接住。"),
            goal: String(item.goal || fallbackItem?.goal || "推进聊天继续往下走")
          };
        })
        .filter((item) => item && item.text)
    : [];

  if (normalizedSuggestions.length >= 3) {
    return {
      summary: String(responsePayload?.summary || `现在更适合走“${incomingSituation.label}”这条线，先把聊天推进到下一步。`),
      situation: incomingSituation,
      suggestions: normalizedSuggestions.slice(0, 3),
      source: responsePayload?.source === "ai" ? "ai" : "fallback",
      fallbackUsed: Boolean(responsePayload?.fallbackUsed)
    };
  }

  return {
    summary: `现在更适合走“${incomingSituation.label}”这条线，先把聊天推进到下一步。`,
    situation: incomingSituation,
    suggestions: fallbackSuggestions,
    source: "fallback",
    fallbackUsed: true
  };
}

export function buildCompatibilitySummary(viewerProfile, candidateProfile) {
  if (!candidateProfile) {
    return "先回到消息列表看看新的匹配吧。";
  }

  const viewerCity = viewerProfile?.city || "同一座城市";
  const distanceHint = buildDistanceHint(viewerProfile, candidateProfile);
  return `${candidateProfile.name}的节奏真诚放松，和你在${viewerCity}想认真认识一个人的期待很合拍。${distanceHint}`;
}

export function getSeedQualityReport(profiles) {
  const avatarCounts = new Map();

  profiles.forEach((profile) => {
    const avatar = profile?.avatar || profile?.avatar_url;
    avatarCounts.set(avatar, (avatarCounts.get(avatar) || 0) + 1);
  });

  return {
    totalProfiles: profiles.length,
    duplicateAvatarUrls: Array.from(avatarCounts.entries())
      .filter(([avatar, count]) => avatar && count > 1)
      .map(([avatar]) => avatar)
  };
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttribute(value) {
  return escapeHtml(value);
}

export function sanitizeImageUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(String(value), base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function createInitialState() {
  return {
    auth: {
      userId: null,
      username: "",
      authenticated: false,
      checkingSession: true,
      status: "visitor",
      isGuest: false
    },
    ui: {
      activeTab: "discover",
      editingProfile: false,
      activeMatchId: null,
      selectedProfileUserId: null,
      guestModalOpen: false,
      usernameInput: "",
      passwordInput: "",
      usernameStatus: "",
      usernameError: "",
      authMode: "register",
      profileError: "",
      messageError: "",
      guestError: ""
    },
    local: {
      viewedCount: 0,
      skippedIds: []
    },
    guestDraft: {
      gender: "female",
      name: ""
    },
    pendingLikeUserId: null,
    draftMessage: "",
    appData: null,
    loading: false,
    aiIcebreakers: {},
    aiIcebreakerStatus: {},
    aiIcebreakerRequestSeq: {},
    selectedSuggestionByMatch: {},
    icebreakerClicksByMatch: {}
  };
}

export function createAuthDraft() {
  return {
    username: "",
    password: ""
  };
}

export function setAuthDraftField(draft, key, value) {
  if (draft[key] === value) {
    return draft;
  }

  return {
    ...draft,
    [key]: value
  };
}

export function resetAuthDraftPassword(draft) {
  return setAuthDraftField(draft, "password", "");
}

export function submitAuthDraft(state, authDraft, options = {}) {
  const username = authDraft.username.trim();
  const preservePassword = Boolean(options.preservePassword);
  return {
    state: {
      ...state,
      auth: {
        ...state.auth,
        username
      }
    },
    authDraft: {
      username,
      password: preservePassword ? authDraft.password : ""
    },
    credentials: {
      username,
      password: authDraft.password
    }
  };
}

export function getLaunchCopy() {
  return {
    heroEyebrow: "Sanmao demo",
    heroTitle: "认真认识一个人，不用把开始变得太重。",
    heroBody: "先留下名字，合适的时候再慢慢补完整资料，轻一点开始，真一点聊天。",
    heroNoteLabel: "轻一点开始",
    heroNoteTitle: "先进入看看，再决定怎么介绍自己。",
    heroNoteBody: "发现、喜欢、消息和我的四个页签，会陪你把认识一个人的过程慢慢走完。当前 demo 只用于展示产品体验，不会伪装成真人在线聊天。",
    authStepLabel: "开始",
    authRegisterTitle: "创建你的 Sanmao 账号",
    authLoginTitle: "欢迎回来",
    authRegisterBody: "先进入看看，再决定想怎么介绍自己。",
    authLoginBody: "继续上次的浏览、匹配和聊天。",
    authStatusRegister: "设置用户名和密码后注册",
    authStatusLogin: "输入用户名和密码后登录",
    authAvailabilityAction: "看看这个名字能不能用",
    authRegisterAction: "进入 Sanmao",
    authLoginAction: "登录",
    authPill: "登录后会保留你的浏览和聊天进度",
    discoverLabel: "今日推荐",
    discoverWindowLabel: "今日浏览",
    discoverEmptyTitle: "今天的新推荐先看到这里",
    discoverEmptyBody: "稍后再来看看，也可以先去消息里继续认识已经匹配的人。",
    discoverExhaustedBody: "今天的浏览次数已经用完了，晚一点再回来看看新的相遇。",
    likedLabel: "我喜欢的人",
    likedByLabel: "喜欢我的人",
    likedByEmpty: "暂时还没有新的喜欢，先去发现里看看今天的推荐。",
    messagesLabel: "消息",
    chatLabel: "对话",
    editProfileLabel: "编辑资料",
    myProfileLabel: "我的资料"
  };
}

function safeText(value, fallback = "") {
  return escapeHtml(value || fallback);
}

function safeImageAttr(value) {
  return escapeAttribute(sanitizeImageUrl(value));
}

function safeTagList(value) {
  return String(value || "")
    .split("/")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join("");
}

export function resolveApiPath(path, locationLike = typeof window !== "undefined" ? window.location : undefined) {
  if (typeof path !== "string" || !path.startsWith("/api/")) {
    return path;
  }

  const pathname = String(locationLike?.pathname || "/");
  if (pathname === "/meeting" || pathname.startsWith("/meeting/")) {
    return `/meeting${path}`;
  }

  return path;
}

async function apiFetch(path, options = {}) {
  const response = await fetch(resolveApiPath(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.method && options.method !== "GET" ? { "X-CSRF-Token": "same-origin" } : {}),
      ...(options.headers || {})
    }
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || "request_failed");
  }

  return payload;
}

export async function requestAiIcebreakers(viewerProfile, candidateProfile, recentMessages) {
  const payload = buildAiIcebreakerPayload(viewerProfile, candidateProfile, recentMessages);
  const response = await apiFetch("/api/ai/icebreakers", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return resolveIcebreakerSuggestions(candidateProfile, response);
}

export async function recordIcebreakerClick({ matchId, suggestionId, action, stage, intent }) {
  return apiFetch("/api/ai/icebreaker-click", {
    method: "POST",
    body: JSON.stringify({
      match_id: Number(matchId),
      suggestion_id: suggestionId,
      action,
      stage,
      intent
    })
  });
}

export function shouldRenderGuestLikeModal(state) {
  return Boolean(!state.auth.authenticated && state.ui.guestModalOpen);
}

export function canSendMessages(state) {
  return Boolean(state.appData?.profile?.profile_completed);
}

export function openMatchProfile(state, userId) {
  return {
    ...state,
    ui: {
      ...state.ui,
      selectedProfileUserId: Number(userId)
    }
  };
}

export function shouldRenderGlobalLoading(state) {
  if (state.auth.checkingSession || !state.auth.authenticated) {
    return false;
  }

  if (!state.appData) {
    return true;
  }

  return state.loading && state.ui.activeTab !== "messages";
}

export function updateMatchMessagesLocally(state, matchId, messages) {
  if (!state.appData) {
    return state;
  }

  const normalizedMatchId = String(matchId);
  let didUpdateMatch = false;
  const nextMatches = (state.appData.matches || []).map((match) => {
    if (String(match?.match_id) !== normalizedMatchId) {
      return match;
    }

    didUpdateMatch = true;
    return {
      ...match,
      messages
    };
  });

  if (!didUpdateMatch) {
    return state;
  }

  return {
    ...state,
    draftMessage: "",
    appData: {
      ...state.appData,
      matches: nextMatches
    },
    ui: {
      ...state.ui,
      messageError: ""
    }
  };
}

export function mergeLatestMessagesIntoAppData(currentAppData, incomingAppData) {
  if (!currentAppData || !incomingAppData) {
    return incomingAppData || currentAppData;
  }

  const currentMatches = Array.isArray(currentAppData.matches) ? currentAppData.matches : [];
  const incomingMatches = Array.isArray(incomingAppData.matches) ? incomingAppData.matches : [];
  const currentMatchesById = new Map(currentMatches.map((match) => [String(match?.match_id), match]));

  return {
    ...incomingAppData,
    matches: incomingMatches.map((incomingMatch) => {
      const currentMatch = currentMatchesById.get(String(incomingMatch?.match_id));
      const currentMessages = Array.isArray(currentMatch?.messages) ? currentMatch.messages : [];
      const incomingMessages = Array.isArray(incomingMatch?.messages) ? incomingMatch.messages : [];
      return currentMessages.length > incomingMessages.length
        ? {
            ...incomingMatch,
            messages: currentMessages
          }
        : incomingMatch;
    })
  };
}

export function getScrollRestorePlan({
  pageScrollY = 0,
  pageScrollBaseline,
  threadScrollHeight = 0,
  threadScrollTop = 0,
  threadClientHeight = 0,
  forceChatToBottom = false
} = {}) {
  return {
    pageScrollY: Number.isFinite(pageScrollBaseline) ? pageScrollBaseline : pageScrollY,
    shouldStickToBottom:
      Boolean(forceChatToBottom) || (threadScrollHeight - threadScrollTop - threadClientHeight < 48)
  };
}

export function applyMessagesRerender({
  root,
  state,
  getLaunchCopy,
  getActiveMatch,
  renderChat,
  bindEvents,
  syncChatScroll,
  windowObject,
  forceChatToBottom = false,
  pageScrollBaseline
}) {
  const chatRegion = root.querySelector("[data-chat-region]");
  const messagesPanel = root.querySelector("[data-messages-panel]");
  if (!chatRegion || !messagesPanel) {
    return false;
  }

  const previousThread = root.querySelector(".embedded-thread");
  const scrollPlan = getScrollRestorePlan({
    pageScrollY: windowObject.scrollY,
    pageScrollBaseline,
    threadScrollHeight: previousThread?.scrollHeight || 0,
    threadScrollTop: previousThread?.scrollTop || 0,
    threadClientHeight: previousThread?.clientHeight || 0,
    forceChatToBottom
  });
  const nextMessagesMarkup = getMessagesPanelMarkup(state, {
    getLaunchCopy,
    getActiveMatch,
    renderChat
  });
  const splitToken = "<section data-chat-region>";
  const [nextMessagesPanelMarkup, nextChatMarkupWithSuffix = "</section>"] = nextMessagesMarkup.trim().split(splitToken);

  messagesPanel.outerHTML = nextMessagesPanelMarkup;
  chatRegion.outerHTML = `${splitToken}${nextChatMarkupWithSuffix}`;

  const nextMessagesPanel = root.querySelector("[data-messages-panel]");
  if (nextMessagesPanel?.classList?.remove) {
    nextMessagesPanel.classList.remove("app-card");
  }

  const nextChatPanel = root.querySelector("[data-chat-region] .chat-panel");
  if (nextChatPanel?.classList?.remove) {
    nextChatPanel.classList.remove("app-card");
  }

  bindEvents();
  windowObject.scrollTo(0, scrollPlan.pageScrollY);
  syncChatScroll(scrollPlan.shouldStickToBottom);
  return true;
}

export function getChatRegionMarkup(state, helpers = {}) {
  const activeMatch = helpers.getActiveMatch?.(state) || null;
  if (!activeMatch) {
    return "";
  }

  const renderChat = helpers.renderChat;
  return typeof renderChat === "function" ? renderChat(activeMatch, state) : "";
}

export function getMessagesPanelMarkup(state, helpers = {}) {
  const copy = typeof helpers.getLaunchCopy === "function" ? helpers.getLaunchCopy() : getLaunchCopy();
  const matches = state.appData?.matches || [];
  const activeMatch = helpers.getActiveMatch?.(state) || null;
  const renderChatMarkup = getChatRegionMarkup(state, helpers);

  return `
      <div class="messages-shell">
        <section class="panel app-card messages-panel" data-messages-panel>
          <div class="section-label">${copy.messagesLabel}</div>
          <h2>消息</h2>
          ${
            matches.length
              ? `<div class="mini-list">
                  ${matches
                    .map(
                      (match) => `
                        <button class="mini-profile chat-row ${String(match.match_id) === String(activeMatch?.match_id) ? "selected" : ""}" data-action="open-match" data-match-id="${match.match_id}" data-user-id="${match.other.user_id}">
                          <img src="${safeImageAttr(match.other.avatar_url)}" alt="${escapeAttribute(match.other.name)}">
                          <div>
                            <strong>${safeText(match.other.name)}</strong>
                            <span>${safeText(match.other.company, "未填公司")} · ${safeText(match.other.role, "未填职业")}</span>
                          </div>
                          <span class="section-label">查看资料</span>
                        </button>
                      `
                    )
                    .join("")}
                </div>`
              : `<p class="panel-copy">还没有形成匹配，会话列表会在互相喜欢后出现。</p>`
          }
        </section>
        <section data-chat-region>${renderChatMarkup}</section>
      </div>
    `;
}

export function switchActiveMatch(state, matchId) {
  return {
    ...state,
    draftMessage: "",
    ui: {
      ...state.ui,
      activeMatchId: matchId,
      messageError: ""
    }
  };
}

export function mountApp(root) {
  let state = loadState(createInitialState());
  let authDraft = createAuthDraft();

  function getActiveMatchId(match) {
    return String(match?.match_id || "");
  }

  function getAiIcebreakerState(match) {
    const matchId = getActiveMatchId(match);
    return state.aiIcebreakers[matchId] || resolveIcebreakerSuggestions(match?.other || {}, null);
  }

  function persist() {
    saveState(state);
  }

  function setState(nextState) {
    state = nextState;
    persist();
    renderApp();
  }

  function syncAuthDraftFromState() {
    authDraft = {
      username: state.ui.usernameInput,
      password: state.ui.passwordInput
    };
  }

  function syncStateUiFromAuthDraft() {
    state = {
      ...state,
      ui: {
        ...state.ui,
        usernameInput: authDraft.username,
        passwordInput: authDraft.password
      }
    };
  }

  async function refreshAppData() {
    if (!state.auth.checkingSession && !state.auth.authenticated) {
      return;
    }

    setState({
      ...state,
      loading: true,
      ui: {
        ...state.ui,
        usernameError: "",
        profileError: "",
        messageError: ""
      }
    });

    try {
      const appData = mergeLatestMessagesIntoAppData(state.appData, await apiFetch("/api/state"));
      setState({
        ...state,
        appData,
        loading: false,
        auth: {
          ...state.auth,
          userId: appData.profile?.user_id ?? state.auth.userId,
          authenticated: true,
          checkingSession: false,
          username: appData.profile?.username || state.auth.username
        },
        ui: {
          ...state.ui,
          usernameInput: appData.profile?.username || state.ui.usernameInput,
          passwordInput: "",
          activeMatchId:
            state.ui.activeMatchId ||
            (appData.matches[0] ? String(appData.matches[0].match_id) : null)
        }
      });
      syncAuthDraftFromState();
    } catch (error) {
      if (error.message === "unauthorized") {
        setState({
          ...createInitialState(),
          ui: {
            ...createInitialState().ui,
            activeTab: state.ui.activeTab,
            activeMatchId: state.ui.activeMatchId,
            usernameInput: state.ui.usernameInput
          },
          local: state.local,
          draftMessage: state.draftMessage,
          auth: {
            ...createInitialState().auth,
            userId: null,
            checkingSession: false
          }
        });
        syncAuthDraftFromState();
        return;
      }

      setState({
        ...state,
        loading: false,
        auth: {
          ...state.auth,
          checkingSession: false
        },
        ui: {
          ...state.ui,
          messageError: "加载数据失败"
        }
      });
    }
  }

  function getRemainingCount() {
    return Math.max(0, DAILY_LIMIT - state.local.viewedCount);
  }

  function getDiscoverProfiles() {
    if (!state.appData) {
      return [];
    }

    const skipped = new Set(state.local.skippedIds);
    return state.appData.discover.filter((profile) => !skipped.has(profile.user_id));
  }

  function getCurrentDiscoverProfile() {
    return getDiscoverProfiles()[0] || null;
  }

  function getProfileByUserId(userId) {
    const normalizedId = Number(userId);
    if (!normalizedId || !state.appData) {
      return null;
    }

    const collections = [
      state.appData.discover || [],
      state.appData.liked || [],
      state.appData.liked_by || [],
      (state.appData.matches || []).map((match) => match.other).filter(Boolean)
    ];
    for (const items of collections) {
      const found = items.find((profile) => Number(profile.user_id) === normalizedId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function getActiveMatch() {
    if (!state.appData || !state.appData.matches.length) {
      return null;
    }

    return (
      state.appData.matches.find(
        (match) => String(match.match_id) === String(state.ui.activeMatchId)
      ) || state.appData.matches[0]
    );
  }

  function renderHero() {
    const copy = getLaunchCopy();
    return `
      <section class="hero">
        <div class="eyebrow">${copy.heroEyebrow}</div>
        <div class="hero-grid">
          <div>
            <h1>${copy.heroTitle}</h1>
            <p>${copy.heroBody}</p>
          </div>
          <div class="hero-note">
            <div class="section-label">${copy.heroNoteLabel}</div>
            <strong>${copy.heroNoteTitle}</strong>
            <p>${copy.heroNoteBody}</p>
          </div>
        </div>
      </section>
    `;
  }

  function renderAuth() {
    const isLogin = state.ui.authMode === "login";
    const copy = getLaunchCopy();

    return `
      <section class="panel onboarding app-card">
        <div class="panel-head">
          <div>
            <div class="section-label">${copy.authStepLabel}</div>
            <h2>${isLogin ? copy.authLoginTitle : copy.authRegisterTitle}</h2>
            <p class="panel-copy">${isLogin ? copy.authLoginBody : copy.authRegisterBody}</p>
          </div>
          <div class="pill">${copy.authPill}</div>
        </div>
        <div class="auth-toggle-row">
          <button type="button" class="ghost-button ${isLogin ? "" : "active"}" data-action="set-auth-mode" data-auth-mode="register">注册</button>
          <button type="button" class="ghost-button ${isLogin ? "active" : ""}" data-action="set-auth-mode" data-auth-mode="login">登录</button>
        </div>
        <form id="auth-form" class="username-form">
          <label>
            用户名
            <input
              id="username-input"
              name="username"
              value="${escapeAttribute(authDraft.username)}"
              placeholder="例如：shenzhen-aze"
              autocomplete="off"
              required
            >
          </label>
          <label>
            密码
            <input
              id="password-input"
              name="password"
              type="password"
              value="${escapeAttribute(authDraft.password)}"
              placeholder="至少 6 位"
              minlength="6"
              autocomplete="${isLogin ? "current-password" : "new-password"}"
              required
            >
          </label>
          <div class="status-row">
            <span class="status-text">${safeText(
              state.ui.usernameStatus,
              isLogin ? copy.authStatusLogin : copy.authStatusRegister
            )}</span>
            ${state.ui.usernameError ? `<span class="error-text">${escapeHtml(state.ui.usernameError)}</span>` : ""}
          </div>
          <div class="form-actions">
            ${
              isLogin
                ? ""
                : `<button type="button" class="ghost-button" data-action="check-username">${copy.authAvailabilityAction}</button>`
            }
            <button type="submit" class="primary-button">${isLogin ? copy.authLoginAction : copy.authRegisterAction}</button>
          </div>
        </form>
      </section>
    `;
  }

  function renderNav() {
    const tabs = [
      { id: "discover", label: "发现" },
      { id: "liked", label: "喜欢" },
      { id: "messages", label: "消息" },
      { id: "profile", label: "我的" }
    ];

    return `
      <nav class="app-nav">
        ${tabs
          .map(
            (tab) => `
              <button
                type="button"
                class="nav-item ${state.ui.activeTab === tab.id ? "active" : ""}"
                data-action="switch-tab"
                data-tab="${tab.id}"
              >
                ${tab.label}
              </button>
            `
          )
          .join("")}
      </nav>
    `;
  }

  function renderDiscover() {
    const copy = getLaunchCopy();
    const profile = getCurrentDiscoverProfile();
    const remaining = getRemainingCount();
    const ratio = `${Math.min(100, (state.local.viewedCount / DAILY_LIMIT) * 100)}%`;

    if (!profile) {
      return `
        <section class="panel app-card">
          <div class="section-label">${copy.discoverLabel}</div>
          <h2>${copy.discoverEmptyTitle}</h2>
          <p class="panel-copy">
            ${remaining === 0 ? copy.discoverExhaustedBody : copy.discoverEmptyBody}
          </p>
        </section>
      `;
    }

    return `
      <section class="quota-panel app-card">
        <div class="quota-top">
          <div>
            <div class="section-label">${copy.discoverWindowLabel}</div>
            <h3>今天还可以看 ${remaining} 份资料</h3>
          </div>
          <strong>${state.local.viewedCount} / ${DAILY_LIMIT}</strong>
        </div>
        <div class="progress-track"><span style="width:${ratio}"></span></div>
      </section>
      <section class="panel swipe-card app-card">
        <div class="swipe-card-top">
          <div class="swipe-copy">
            <div class="section-label">${copy.discoverLabel}</div>
            <h2>${safeText(profile.name)}，${safeText(profile.age, "--")}</h2>
            <p>${safeText(profile.company, "公司未填")} · ${safeText(profile.role, "职业未填")} · ${safeText(profile.city, "城市未填")}</p>
          </div>
        </div>
        <div class="detail-block">
          <div class="section-label">为什么值得聊</div>
          <ul>
            ${buildRecommendationReasons(state.appData?.profile || {}, profile)
              .map((reason) => `<li>${escapeHtml(reason)}</li>`)
              .join("")}
          </ul>
        </div>
        <div class="swipe-visual">
          <div class="swipe-photo" style="background-image:url('${safeImageAttr(profile.avatar_url)}')"></div>
          <div class="swipe-floating-card">
            <div class="mini-stat">学校</div>
            <strong>${safeText(profile.school, "未填写")}</strong>
            <div class="mini-stat">关键词</div>
            <div class="tag-row compact">
              ${safeTagList(profile.tags)}
            </div>
          </div>
        </div>
        <div class="detail-block">
          <div class="section-label">自我介绍</div>
          <p>${safeText(profile.bio, "这个人还没有写自我介绍。")}</p>
        </div>
        <div class="actions">
          <button type="button" class="ghost-button" data-action="skip-user" data-user-id="${profile.user_id}">先划过</button>
          <button type="button" class="primary-button" data-action="like-user" data-user-id="${profile.user_id}">喜欢</button>
        </div>
      </section>
    `;
  }

  function renderLiked() {
    const copy = getLaunchCopy();
    const liked = state.appData?.liked || [];
    const likedBy = state.appData?.liked_by || [];

    return `
      <section class="panel app-card">
        <div class="section-label">${copy.likedLabel}</div>
        <h2>我喜欢的人</h2>
        ${
          liked.length
            ? `<div class="mini-list">
                ${liked
                  .map(
                    (profile) => `
                      <div class="mini-profile static-card">
                        <img src="${safeImageAttr(profile.avatar_url)}" alt="${escapeAttribute(profile.name)}">
                        <div>
                          <strong>${safeText(profile.name)}</strong>
                          <span>${safeText(profile.company, "未填公司")} · ${safeText(profile.role, "未填职业")}</span>
                        </div>
                      </div>
                    `
                  )
                  .join("")}
              </div>`
            : `<p class="panel-copy">你还没有主动喜欢过任何人。</p>`
        }
      </section>
      <section class="panel app-card">
        <div class="section-label">${copy.likedByLabel}</div>
        <h2>喜欢我的人</h2>
        ${
          likedBy.length
            ? `<div class="mini-list">
                ${likedBy
                  .map(
                    (profile) => `
                      <div class="mini-profile static-card">
                        <img src="${safeImageAttr(profile.avatar_url)}" alt="${escapeAttribute(profile.name)}">
                        <div>
                          <strong>${safeText(profile.name)}</strong>
                          <span>${safeText(profile.company, "未填公司")} · ${safeText(profile.role, "未填职业")}</span>
                        </div>
                        <button class="primary-button small-button" data-action="like-user" data-user-id="${profile.user_id}">回赞</button>
                      </div>
                    `
                  )
                  .join("")}
              </div>`
            : `<p class="panel-copy">${copy.likedByEmpty}</p>`
        }
      </section>
    `;
  }

  function renderMessages() {
    return getMessagesPanelMarkup(state, {
      getLaunchCopy,
      getActiveMatch,
      renderChat
    });
  }

  function renderChat(match, currentState = state) {
    const copy = getLaunchCopy();
    const profileCompleted = canSendMessages(currentState);
    const safeMessages = Array.isArray(match?.messages) ? match.messages : [];
    const otherProfile = match?.other || {};
    const matchId = getActiveMatchId(match);
    const icebreakerState = currentState.aiIcebreakers[matchId] || resolveIcebreakerSuggestions(match?.other || {}, null);
    const loadingAi = currentState.aiIcebreakerStatus[matchId] === "loading";
    const selectedSuggestionId = currentState.selectedSuggestionByMatch[matchId];
    const clickState = currentState.icebreakerClicksByMatch[matchId] || {};
    const demoCopy = match?.demo_mode_copy || getDemoModeCopy();
    const assistantTitle = match?.assistant?.title || buildAssistantCardTitle();

    return `
      <section class="panel chat-panel app-card">
        <div class="chat-header compact-header">
          <button type="button" class="mini-profile" data-action="open-profile" data-user-id="${otherProfile.user_id}">
            <img src="${safeImageAttr(otherProfile.avatar_url)}" alt="${escapeAttribute(otherProfile.name)}">
            <div>
              <div class="section-label">${copy.chatLabel}</div>
              <strong>${safeText(otherProfile?.name)}</strong>
              <p>${profileCompleted ? "现在可以继续聊天。" : "再补几项资料就能开始聊天。"}</p>
            </div>
          </button>
        </div>
        <div class="detail-block">
          <div class="section-label">轻缘分解读</div>
          <p>${escapeHtml(buildCompatibilitySummary(currentState.appData?.profile || {}, otherProfile))}</p>
        </div>
        ${match?.demo_mode ? `
          <div class="detail-block demo-mode-card">
            <div class="section-label">${escapeHtml(demoCopy.badge || "演示模式")}</div>
            <p>${escapeHtml(demoCopy.description || "这里展示的是样板对话，不是真人在线即时回复。")}</p>
          </div>
        ` : ""}
        <div class="detail-block">
          <div class="chat-header compact-header">
            <div>
              <div class="section-label">${escapeHtml(assistantTitle)}</div>
              <p>${icebreakerState.source === "ai" ? "AI 正在帮你判断当前聊天阶段" : "先用默认建议帮你起步"}</p>
            </div>
            <button type="button" class="ghost-button small-button" data-action="refresh-icebreakers" data-match-id="${match.match_id}">换一组</button>
          </div>
          <div class="icebreaker-situation-card">
            <div class="icebreaker-situation-top">
              <span class="pill">${escapeHtml(icebreakerState.situation.label)}</span>
              <span class="panel-copy">${escapeHtml(icebreakerState.summary)}</span>
            </div>
            <p>${escapeHtml(icebreakerState.situation.why)}</p>
            <div class="icebreaker-situation-grid">
              <div>
                <div class="section-label">现在最该做</div>
                <p>${escapeHtml(icebreakerState.situation.nextMove)}</p>
              </div>
              <div>
                <div class="section-label">先别这样做</div>
                <p>${escapeHtml(icebreakerState.situation.avoid)}</p>
              </div>
            </div>
          </div>
          ${loadingAi ? '<p class="panel-copy">AI 正在想更自然的开场...</p>' : ""}
          <div class="mini-list icebreaker-list">
            ${icebreakerState.suggestions
              .map((item) => {
                const safeId = escapeAttribute(item.id);
                const safeTextValue = escapeAttribute(item.text);
                const isSelected = selectedSuggestionId === item.id;
                const lastAction = clickState[item.id];
                return `
                    <div class="icebreaker-row ${isSelected ? "selected" : ""}">
                      <div class="icebreaker-copy">
                        <button type="button" class="ghost-button" data-icebreaker-id="${safeId}" data-icebreaker="${safeTextValue}" data-match-id="${matchId}">${escapeHtml(item.text)}</button>
                        <p class="panel-copy">${escapeHtml(item.why)} · 目标：${escapeHtml(item.goal)}</p>
                        ${lastAction ? `<span class="section-label">最近操作：${escapeHtml(lastAction)}</span>` : ""}
                      </div>
                      <button type="button" class="primary-button small-button" data-send-icebreaker-id="${safeId}" data-send-icebreaker="${safeTextValue}" data-match-id="${matchId}" data-stage="${escapeAttribute(icebreakerState.situation.stage)}">直接发</button>
                    </div>
                  `;
              })
              .join("")}
          </div>
        </div>
        <div class="chat-thread embedded-thread">
          ${safeMessages
            .map(
              (message) => `
                <div class="bubble ${message.sender_id === null ? "mine" : Number(message.sender_id) === Number(currentState.appData?.profile?.user_id) ? "mine" : "theirs"}">
                  ${safeText(message.content)}
                </div>
              `
            )
            .join("")}
        </div>
        ${
          profileCompleted
            ? `
              <form id="chat-form" class="chat-composer" data-match-id="${match.match_id}">
                <input id="chat-input" name="message" value="${escapeAttribute(currentState.draftMessage)}" placeholder="发一句消息..." autocomplete="off">
                <button type="submit" class="primary-button">发送</button>
              </form>
            `
            : `
              <div class="detail-block">
                <p class="error-text">${safeText(currentState.ui.messageError, "先去“我的”里补完整资料，再回来发第一条消息。")}</p>
                <button class="primary-button small-button" data-action="switch-tab" data-tab="profile">去补资料</button>
              </div>
            `
        }
      </section>
    `;
  }

  function renderProfile() {
    const copy = getLaunchCopy();
    const profile = state.appData?.profile;
    if (!profile) {
      return "";
    }

    if (state.ui.editingProfile) {
      return `
        <section class="panel onboarding app-card">
          <div class="panel-head">
            <div>
              <div class="section-label">${copy.editProfileLabel}</div>
              <h2>完善你的资料</h2>
              <p class="panel-copy">只有完整资料后，聊天功能才会真正解锁。</p>
            </div>
          </div>
          <form id="profile-form" class="profile-form">
            <label>性别
              <select name="gender">
                <option value="male" ${profile.gender === "male" ? "selected" : ""}>男生</option>
                <option value="female" ${profile.gender === "female" ? "selected" : ""}>女生</option>
              </select>
            </label>
            <label>昵称<input name="name" value="${escapeAttribute(profile.name || "")}" required></label>
            <label>年龄<input name="age" value="${escapeAttribute(profile.age || "")}" required></label>
            <label>城市<input name="city" value="${escapeAttribute(profile.city || "")}" required></label>
            <label>公司<input name="company" value="${escapeAttribute(profile.company || "")}" required></label>
            <label>职业<input name="role" value="${escapeAttribute(profile.role || "")}" required></label>
            <label>学校<input name="school" value="${escapeAttribute(profile.school || "")}" required></label>
            <label class="full">标签<input name="tags" value="${escapeAttribute(profile.tags || "")}" placeholder="徒步 / 看展 / 羽毛球" required></label>
            <label class="full">自我介绍<textarea name="bio" rows="4" required>${escapeHtml(profile.bio || "")}</textarea></label>
            ${state.ui.profileError ? `<p class="error-text">${escapeHtml(state.ui.profileError)}</p>` : ""}
            <div class="form-actions">
              <button type="button" class="ghost-button" data-action="cancel-profile">取消</button>
              <button type="submit" class="primary-button">保存资料</button>
            </div>
          </form>
        </section>
      `;
    }

    return `
      <section class="panel profile-view app-card">
        <div class="profile-header-row">
          <div>
            <div class="section-label">${copy.myProfileLabel}</div>
            <h2>${safeText(profile.name || state.auth.username)}</h2>
            <p class="panel-copy">${safeText(profile.company, "未填写公司")} · ${safeText(profile.role, "未填写职业")} · ${safeText(profile.city, "未填写城市")}</p>
          </div>
          <div class="form-actions">
            <button type="button" class="ghost-button small-button" data-action="logout">退出</button>
            <button type="button" class="primary-button small-button" data-action="edit-profile">编辑资料</button>
          </div>
        </div>
        <div class="meta-grid">
          <span>${profile.gender === "female" ? "女生" : "男生"}</span>
          <span>${safeText(profile.school, "学校未填写")}</span>
          <span>${profile.profile_completed ? "资料已完整" : "资料待完善"}</span>
        </div>
        <div class="detail-block">
          <div class="section-label">自我介绍</div>
          <p>${safeText(profile.bio, "还没有填写自我介绍。")}</p>
        </div>
      </section>
    `;
  }

  function renderGuestModal() {
    if (!shouldRenderGuestLikeModal(state)) {
      return "";
    }

    return `
      <div class="modal-backdrop">
        <section class="match-modal">
          <div class="section-label">第一次喜欢之前</div>
          <h2>先留一个轻量身份</h2>
          <p>只需要性别和昵称。等你想真正开始聊天时，再补完整资料。</p>
          <form id="guest-start-form" class="profile-form">
            <label>性别
              <select name="gender">
                <option value="female" ${state.guestDraft.gender === "female" ? "selected" : ""}>女生</option>
                <option value="male" ${state.guestDraft.gender === "male" ? "selected" : ""}>男生</option>
              </select>
            </label>
            <label>昵称<input name="name" value="${escapeAttribute(state.guestDraft.name || "")}" required></label>
            ${state.ui.guestError ? `<p class="error-text full">${escapeHtml(state.ui.guestError)}</p>` : ""}
            <div class="form-actions full">
              <button type="button" class="ghost-button" data-action="close-guest-modal">稍后再说</button>
              <button type="submit" class="primary-button">继续喜欢</button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function renderProfileDrawer() {
    const profile = getProfileByUserId(state.ui.selectedProfileUserId);
    if (!profile) {
      return "";
    }

    return `
      <div class="drawer-backdrop" data-action="close-profile-drawer">
        <aside class="profile-drawer" aria-label="资料详情">
          <div class="drawer-head">
            <div>
              <div class="section-label">资料详情</div>
              <h2>${safeText(profile.name)}</h2>
              <p>${safeText(profile.company, "未填写公司")} · ${safeText(profile.role, "未填写职业")} · ${safeText(profile.city, "未填写城市")}</p>
            </div>
            <button type="button" class="ghost-button small-button" data-action="close-profile-drawer">关闭</button>
          </div>
          <img class="drawer-photo" src="${safeImageAttr(profile.avatar_url)}" alt="${escapeAttribute(profile.name)}">
          <div class="meta-grid">
            <span>${profile.gender === "female" ? "女生" : "男生"}</span>
            <span>${safeText(profile.age, "年龄未填")}</span>
            <span>${safeText(profile.school, "学校未填")}</span>
          </div>
          <div class="tag-row">${safeTagList(profile.tags)}</div>
          <div class="detail-block">
            <div class="section-label">自我介绍</div>
            <p class="bio">${safeText(profile.bio, "还没有填写自我介绍。")}</p>
          </div>
        </aside>
      </div>
    `;
  }

  function renderContent() {
    if (state.auth.checkingSession) {
      return `<section class="panel app-card"><p>正在确认登录状态...</p></section>`;
    }

    if (shouldRenderGlobalLoading(state)) {
      return `<section class="panel app-card"><p>正在加载数据...</p></section>`;
    }

    if (state.ui.activeTab === "discover") {
      return renderDiscover();
    }

    if (!state.auth.authenticated) {
      return renderAuth();
    }

    if (state.ui.activeTab === "liked") {
      return renderLiked();
    }

    if (state.ui.activeTab === "messages") {
      return renderMessages();
    }

    return renderProfile();
  }

  function renderApp() {
    root.innerHTML = `
      <div class="app-shell">
        ${renderHero()}
        ${renderNav()}
        ${renderContent()}
        ${renderProfileDrawer()}
        ${renderGuestModal()}
      </div>
    `;
    bindEvents();
    syncChatScroll();
  }

  function rerenderMessagesView(options = {}) {
    if (state.ui.activeTab !== "messages") {
      renderApp();
      return;
    }

    const changed = applyMessagesRerender({
      root,
      state,
      getLaunchCopy,
      getActiveMatch,
      renderChat,
      bindEvents,
      syncChatScroll,
      windowObject: window,
      forceChatToBottom: options.forceChatToBottom,
      pageScrollBaseline: options.pageScrollBaseline
    });

    if (!changed) {
      renderApp();
    }
  }

  function syncChatScroll(forceToBottom = false) {
    const thread = root.querySelector(".embedded-thread");
    if (!thread) {
      return;
    }
    const distanceFromBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    if (forceToBottom || distanceFromBottom < 48) {
      thread.scrollTop = thread.scrollHeight;
    }
  }

  async function checkUsername() {
    const username = authDraft.username.trim();
    if (!username) {
      setState({
        ...state,
        ui: {
          ...state.ui,
          usernameStatus: "",
          usernameError: "请输入用户名"
        }
      });
      return false;
    }

    try {
      await apiFetch(`/api/check-username?username=${encodeURIComponent(username)}`);
      setState({
        ...state,
        ui: {
          ...state.ui,
          usernameStatus: "用户名已填写，可继续注册",
          usernameError: ""
        }
      });
      return true;
    } catch (error) {
      setState({
        ...state,
        ui: {
          ...state.ui,
          usernameError:
            error.message === "username_taken"
              ? "用户名已存在"
              : "检查用户名失败"
        }
      });
      return false;
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    if (state.ui.authMode === "login") {
      return handleLogin();
    }

    return handleRegister();
  }

  async function handleRegister() {
    const available = await checkUsername();
    if (!available) {
      return;
    }

    const { state: nextState, authDraft: nextAuthDraft, credentials } = submitAuthDraft(state, authDraft, {
      preservePassword: true
    });
    state = nextState;
    authDraft = nextAuthDraft;
    const password = credentials.password;

    try {
      const result = await apiFetch("/api/register", {
        method: "POST",
        body: JSON.stringify({
          username: credentials.username,
          password
        })
      });

      state = {
        ...state,
        auth: {
          ...state.auth,
          username: result.username || credentials.username,
          authenticated: true,
          checkingSession: false
        },
        ui: {
          ...state.ui,
          usernameInput: credentials.username,
          passwordInput: "",
          usernameError: "",
          usernameStatus: "",
          authMode: "login"
        }
      };
      authDraft = resetAuthDraftPassword(authDraft);
      persist();
      await refreshAppData();
    } catch (error) {
      setState({
        ...state,
        auth: {
          ...state.auth,
          checkingSession: false
        },
        ui: {
          ...state.ui,
          usernameInput: credentials.username,
          passwordInput: password,
          usernameError:
            error.message === "username_taken"
              ? "用户名已存在"
              : error.message === "password_too_short"
                ? "密码至少 6 位"
                : "注册失败"
        }
      });
      syncAuthDraftFromState();
    }
  }

  async function handleLogin() {
    const { state: nextState, authDraft: nextAuthDraft, credentials } = submitAuthDraft(state, authDraft, {
      preservePassword: true
    });
    state = nextState;
    authDraft = nextAuthDraft;
    const username = credentials.username;
    const password = credentials.password;
    if (!username) {
      setState({
        ...state,
        auth: {
          ...state.auth,
          checkingSession: false
        },
        ui: {
          ...state.ui,
          usernameInput: username,
          passwordInput: password,
          usernameStatus: "",
          usernameError: "请输入用户名"
        }
      });
      syncAuthDraftFromState();
      return;
    }

    if (!password) {
      setState({
        ...state,
        auth: {
          ...state.auth,
          checkingSession: false
        },
        ui: {
          ...state.ui,
          usernameInput: username,
          passwordInput: password,
          usernameStatus: "",
          usernameError: "请输入密码"
        }
      });
      syncAuthDraftFromState();
      return;
    }

    try {
      const result = await apiFetch("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });

      state = {
        ...state,
        auth: {
          ...state.auth,
          username: result.username || username,
          authenticated: true,
          checkingSession: false
        },
        ui: {
          ...state.ui,
          usernameInput: username,
          passwordInput: "",
          usernameError: "",
          usernameStatus: "已登录"
        }
      };
      authDraft = resetAuthDraftPassword(authDraft);
      persist();
      await refreshAppData();
    } catch (error) {
      setState({
        ...state,
        auth: {
          ...state.auth,
          checkingSession: false
        },
        ui: {
          ...state.ui,
          usernameInput: username,
          passwordInput: password,
          usernameError:
            error.message === "invalid_credentials"
              ? "用户名或密码错误"
              : error.message === "password_required"
                ? "请输入密码"
                : "登录失败"
        }
      });
      syncAuthDraftFromState();
    }
  }

  async function handleLike(userId) {
    if (!state.auth.authenticated) {
      setState({
        ...state,
        pendingLikeUserId: Number(userId),
        ui: {
          ...state.ui,
          guestModalOpen: true,
          guestError: ""
        }
      });
      return;
    }

    await apiFetch("/api/like", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: Number(userId)
      })
    });

    state = {
      ...state,
      local: {
        ...state.local,
        viewedCount: state.local.viewedCount + 1
      }
    };
    persist();
    await refreshAppData();
  }

  async function handleGuestStart(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const gender = String(formData.get("gender") || "");
    const name = String(formData.get("name") || "").trim();
    try {
      await apiFetch("/api/guest/start", {
        method: "POST",
        body: JSON.stringify({ gender, name })
      });
      const pendingLikeUserId = state.pendingLikeUserId;
      state = {
        ...state,
        ui: {
          ...state.ui,
          guestModalOpen: false,
          guestError: ""
        },
        auth: {
          ...state.auth,
          authenticated: true,
          checkingSession: false,
          isGuest: true,
          status: "partial"
        },
        guestDraft: { gender, name }
      };
      persist();
      await refreshAppData();
      if (pendingLikeUserId) {
        await handleLike(pendingLikeUserId);
        state = {
          ...state,
          pendingLikeUserId: null
        };
        persist();
      }
    } catch (error) {
      setState({
        ...state,
        guestDraft: { gender, name },
        ui: {
          ...state.ui,
          guestError:
            error.message === "gender_required"
              ? "请选择性别"
              : error.message === "name_required"
                ? "请输入昵称"
                : "创建身份失败"
        }
      });
    }
  }

  async function handleSendMessage(event) {
    event.preventDefault();
    const pageScrollBaseline = window.scrollY;
    const matchId = Number(event.currentTarget.dataset.matchId);
    try {
      await sendMatchMessage(matchId, state.draftMessage, { pageScrollBaseline });
    } catch (error) {
      setState({
        ...state,
        ui: {
          ...state.ui,
          messageError:
            error.message === "profile_incomplete"
              ? "先补完整资料，再发送第一条消息。"
              : "发送失败"
        }
      });
    }
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          gender: String(formData.get("gender")),
          avatar_url: "",
          name: String(formData.get("name")),
          age: String(formData.get("age")),
          city: String(formData.get("city")),
          company: String(formData.get("company")),
          role: String(formData.get("role")),
          school: String(formData.get("school")),
          tags: String(formData.get("tags")),
          bio: String(formData.get("bio"))
        })
      });

      state = {
        ...state,
        ui: {
          ...state.ui,
          editingProfile: false,
          profileError: ""
        }
      };
      persist();
      await refreshAppData();
    } catch {
      setState({
        ...state,
        ui: {
          ...state.ui,
          profileError: "保存资料失败"
        }
      });
    }
  }

  async function handleLogout() {
    try {
      await apiFetch("/api/logout", { method: "POST" });
    } catch {
      // ignore logout failure and still clear local state
    }

    setState({
      ...createInitialState(),
      ui: {
        ...createInitialState().ui,
        activeTab: state.ui.activeTab,
        activeMatchId: null,
        authMode: "login",
        usernameInput: state.ui.usernameInput
      },
      local: state.local,
      draftMessage: "",
      auth: {
        ...createInitialState().auth,
        userId: null,
        checkingSession: false
      }
    });
    syncAuthDraftFromState();
  }

  async function sendMatchMessage(matchId, content, options = {}) {
    const pageScrollBaseline = Number.isFinite(options.pageScrollBaseline)
      ? options.pageScrollBaseline
      : window.scrollY;
    const response = await apiFetch("/api/message", {
      method: "POST",
      body: JSON.stringify({
        match_id: Number(matchId),
        content
      })
    });

    state = updateMatchMessagesLocally(state, matchId, response.messages || []);
    persist();
    rerenderMessagesView({ forceChatToBottom: true, pageScrollBaseline });
  }

  async function trackIcebreakerAction(matchId, suggestion, action, intent = "") {
    if (!matchId || !suggestion?.id) {
      return;
    }

    state = {
      ...state,
      selectedSuggestionByMatch: {
        ...state.selectedSuggestionByMatch,
        [String(matchId)]: suggestion.id
      },
      icebreakerClicksByMatch: {
        ...state.icebreakerClicksByMatch,
        [String(matchId)]: {
          ...(state.icebreakerClicksByMatch[String(matchId)] || {}),
          [suggestion.id]: action
        }
      }
    };
    persist();

    try {
      await recordIcebreakerClick({
        matchId,
        suggestionId: suggestion.id,
        action,
        stage: state.aiIcebreakers[String(matchId)]?.situation?.stage,
        intent
      });
    } catch {
      // keep local state as the resilient fallback
    }
  }

  async function loadAiIcebreakers(match, forceRefresh = false) {
    const matchId = String(match?.match_id || "");
    const otherProfile = match?.other;
    if (!matchId || !otherProfile) {
      return;
    }

    if (!forceRefresh && state.aiIcebreakers[matchId]?.source === "ai") {
      return;
    }

    const requestSeq = (state.aiIcebreakerRequestSeq[matchId] || 0) + 1;
    state = {
      ...state,
      aiIcebreakers: {
        ...state.aiIcebreakers,
        [matchId]: state.aiIcebreakers[matchId] || resolveIcebreakerSuggestions(otherProfile)
      },
      aiIcebreakerStatus: {
        ...state.aiIcebreakerStatus,
        [matchId]: "loading"
      },
      aiIcebreakerRequestSeq: {
        ...state.aiIcebreakerRequestSeq,
        [matchId]: requestSeq
      }
    };
    renderApp();

    try {
      const nextIcebreakers = await requestAiIcebreakers(
        state.appData?.profile || {},
        otherProfile,
        match.messages || []
      );

      if (state.aiIcebreakerRequestSeq[matchId] !== requestSeq) {
        return;
      }

      state = {
        ...state,
        aiIcebreakers: {
          ...state.aiIcebreakers,
          [matchId]: nextIcebreakers
        },
        aiIcebreakerStatus: {
          ...state.aiIcebreakerStatus,
          [matchId]: "idle"
        }
      };
    } catch {
      if (state.aiIcebreakerRequestSeq[matchId] !== requestSeq) {
        return;
      }

      state = {
        ...state,
        aiIcebreakers: {
          ...state.aiIcebreakers,
          [matchId]: resolveIcebreakerSuggestions(otherProfile)
        },
        aiIcebreakerStatus: {
          ...state.aiIcebreakerStatus,
          [matchId]: "idle"
        }
      };
    }

    persist();
    renderApp();
  }

  function bindEvents() {
    const authForm = root.querySelector("#auth-form");
    if (authForm) {
      authForm.addEventListener("submit", handleAuthSubmit);
    }

    const guestStartForm = root.querySelector("#guest-start-form");
    if (guestStartForm) {
      guestStartForm.addEventListener("submit", handleGuestStart);
    }

    const chatForm = root.querySelector("#chat-form");
    if (chatForm) {
      chatForm.addEventListener("submit", handleSendMessage);
    }

    const usernameInput = root.querySelector("#username-input");
    if (usernameInput) {
      usernameInput.addEventListener("input", (event) => {
        authDraft = setAuthDraftField(authDraft, "username", event.target.value);
        state = {
          ...state,
          ui: {
            ...state.ui,
            usernameError: "",
            usernameStatus: ""
          }
        };
      });
    }

    const passwordInput = root.querySelector("#password-input");
    if (passwordInput) {
      passwordInput.addEventListener("input", (event) => {
        authDraft = setAuthDraftField(authDraft, "password", event.target.value);
        state = {
          ...state,
          ui: {
            ...state.ui,
            usernameError: ""
          }
        };
      });
    }

    const chatInput = root.querySelector("#chat-input");
    if (chatInput) {
      chatInput.addEventListener("input", (event) => {
        state = {
          ...state,
          draftMessage: event.target.value
        };
        persist();
      });
    }

    root.querySelectorAll("[data-action='set-auth-mode']").forEach((button) => {
      button.addEventListener("click", () => {
        authDraft = resetAuthDraftPassword(authDraft);
        setState({
          ...state,
          ui: {
            ...state.ui,
            authMode: button.dataset.authMode,
            passwordInput: "",
            usernameError: "",
            usernameStatus: ""
          }
        });
      });
    });

    root.querySelectorAll("[data-action='check-username']").forEach((button) => {
      button.addEventListener("click", checkUsername);
    });

    root.querySelectorAll("[data-action='switch-tab']").forEach((button) => {
      button.addEventListener("click", () => {
        setState({
          ...state,
          ui: {
            ...state.ui,
            activeTab: button.dataset.tab,
            editingProfile: false
          }
        });
      });
    });

    root.querySelectorAll("[data-action='skip-user']").forEach((button) => {
      button.addEventListener("click", () => {
        const userId = Number(button.dataset.userId);
        setState({
          ...state,
          local: {
            viewedCount: state.local.viewedCount + 1,
            skippedIds: [...state.local.skippedIds, userId]
          }
        });
      });
    });

    root.querySelectorAll("[data-action='like-user']").forEach((button) => {
      button.addEventListener("click", () => {
        handleLike(button.dataset.userId);
      });
    });

    root.querySelectorAll("[data-action='open-match']").forEach((button) => {
      button.addEventListener("click", () => {
        const matchId = button.dataset.matchId;
        setState(switchActiveMatch(state, matchId));

        const nextMatch = (state.appData?.matches || []).find(
          (match) => String(match.match_id) === String(matchId)
        );
        if (nextMatch) {
          void loadAiIcebreakers(nextMatch);
        }
      });
    });

    root.querySelectorAll("[data-action='refresh-icebreakers']").forEach((button) => {
      button.addEventListener("click", () => {
        const match = (state.appData?.matches || []).find(
          (item) => String(item.match_id) === String(button.dataset.matchId)
        );
        if (match) {
          void loadAiIcebreakers(match, true);
        }
      });
    });

    root.querySelectorAll("[data-icebreaker-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const matchId = button.dataset.matchId;
        const currentState = state.aiIcebreakers[String(matchId)] || resolveIcebreakerSuggestions({}, null);
        const suggestion = currentState.suggestions.find((item) => item.id === button.dataset.icebreakerId);
        state = {
          ...state,
          draftMessage: button.dataset.icebreaker || ""
        };
        persist();
        renderApp();
        if (suggestion) {
          void trackIcebreakerAction(matchId, suggestion, "preview", "fill_input");
        }
      });
    });

    root.querySelectorAll("[data-send-icebreaker-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const content = String(button.dataset.sendIcebreaker || "").trim();
        const matchId = button.dataset.matchId;
        const currentState = state.aiIcebreakers[String(matchId)] || resolveIcebreakerSuggestions({}, null);
        const suggestion = currentState.suggestions.find((item) => item.id === button.dataset.sendIcebreakerId);
        if (!content || !matchId) {
          return;
        }

        try {
          await sendMatchMessage(matchId, content);
          if (suggestion) {
            await trackIcebreakerAction(matchId, suggestion, "send", "direct_send");
          }
        } catch (error) {
          setState({
            ...state,
            ui: {
              ...state.ui,
              messageError:
                error.message === "profile_incomplete"
                  ? "先补完整资料，再发送第一条消息。"
                  : "发送失败"
            }
          });
        }
      });
    });

    root.querySelectorAll("[data-action='open-profile']").forEach((button) => {
      button.addEventListener("click", () => {
        setState(openMatchProfile(state, button.dataset.userId));
      });
    });

    root.querySelectorAll("[data-action='close-profile-drawer']").forEach((button) => {
      button.addEventListener("click", (event) => {
        if (event.target !== button && event.currentTarget.dataset.action === "close-profile-drawer") {
          return;
        }
        setState({
          ...state,
          ui: {
            ...state.ui,
            selectedProfileUserId: null
          }
        });
      });
    });

    root.querySelectorAll("[data-action='close-guest-modal']").forEach((button) => {
      button.addEventListener("click", () => {
        setState({
          ...state,
          pendingLikeUserId: null,
          ui: {
            ...state.ui,
            guestModalOpen: false,
            guestError: ""
          }
        });
      });
    });

    root.querySelectorAll("[data-action='edit-profile']").forEach((button) => {
      button.addEventListener("click", () => {
        setState({
          ...state,
          ui: {
            ...state.ui,
            editingProfile: true
          }
        });
      });
    });

    root.querySelectorAll("[data-action='cancel-profile']").forEach((button) => {
      button.addEventListener("click", () => {
        setState({
          ...state,
          ui: {
            ...state.ui,
            editingProfile: false
          }
        });
      });
    });

    root.querySelectorAll("[data-action='logout']").forEach((button) => {
      button.addEventListener("click", handleLogout);
    });
  }

  renderApp();
  syncStateUiFromAuthDraft();
  refreshAppData();
}
