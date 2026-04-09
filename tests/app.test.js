import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  buildAiIcebreakerPayload,
  buildCompatibilitySummary,
  buildIcebreakerSuggestions,
  buildRecommendationReasons,
  canSendMessages,
  createAuthDraft,
  createInitialState,
  escapeHtml,
  getLaunchCopy,
  getMessagesPanelMarkup,
  getScrollRestorePlan,
  getSeedQualityReport,
  handleLikeAction,
  hydrateAuthFromAppData,
  mergeLatestMessagesIntoAppData,
  mountApp,
  openMatchProfile,
  recordIcebreakerClick,
  renderLikedMarkup,
  resetAuthDraftPassword,
  resolveIcebreakerSuggestions,
  setAuthDraftField,
  shouldRenderGlobalLoading,
  shouldRenderGuestLikeModal,
  submitAuthDraft,
  switchActiveMatch,
  updateMatchMessagesLocally,
  buildDistanceHint,
  applyMessagesRerender,
  buildAssistantCardTitle,
  getDemoModeCopy,
  resolveApiPath
} from "../src/app.js";
import { defaultProfile, seedProfiles } from "../src/data.js";

test("resolveApiPath keeps root api paths at root when app runs at domain root", () => {
  assert.equal(resolveApiPath("/api/state", { pathname: "/index.html" }), "/api/state");
});

test("resolveApiPath prefixes api paths when app runs under /meeting", () => {
  assert.equal(resolveApiPath("/api/state", { pathname: "/meeting/" }), "/meeting/api/state");
  assert.equal(resolveApiPath("/api/message", { pathname: "/meeting/index.html" }), "/meeting/api/message");
});

test("resolveApiPath leaves non-root paths unchanged", () => {
  assert.equal(resolveApiPath("https://example.com/api/state", { pathname: "/meeting/" }), "https://example.com/api/state");
  assert.equal(resolveApiPath("./local.json", { pathname: "/meeting/" }), "./local.json");
});

test("createAuthDraft starts with empty auth fields", () => {
  assert.deepEqual(createAuthDraft(), {
    username: "",
    password: ""
  });
});

test("setAuthDraftField returns same draft when value is unchanged", () => {
  const draft = createAuthDraft();
  const nextDraft = setAuthDraftField(draft, "password", "");

  assert.equal(nextDraft, draft);
});

test("setAuthDraftField only updates the targeted field", () => {
  const draft = {
    username: "alice",
    password: "secret"
  };

  const nextDraft = setAuthDraftField(draft, "password", "new-secret");

  assert.deepEqual(nextDraft, {
    username: "alice",
    password: "new-secret"
  });
  assert.equal(nextDraft.username, draft.username);
  assert.notEqual(nextDraft, draft);
});

test("submitAuthDraft trims username and clears password input state", () => {
  const state = createInitialState();
  const authDraft = {
    username: "  alice  ",
    password: "secret"
  };

  assert.deepEqual(submitAuthDraft(state, authDraft), {
    state: {
      ...state,
      auth: {
        ...state.auth,
        username: "alice"
      }
    },
    authDraft: {
      username: "alice",
      password: ""
    },
    credentials: {
      username: "alice",
      password: "secret"
    }
  });
});

test("auth helpers can preserve password for retry flows", () => {
  const state = createInitialState();
  const authDraft = {
    username: "  alice  ",
    password: "secret123"
  };

  assert.deepEqual(submitAuthDraft(state, authDraft, { preservePassword: true }), {
    state: {
      ...state,
      auth: {
        ...state.auth,
        username: "alice"
      }
    },
    authDraft: {
      username: "alice",
      password: "secret123"
    },
    credentials: {
      username: "alice",
      password: "secret123"
    }
  });
});

test("resetAuthDraftPassword preserves username while clearing password", () => {
  assert.deepEqual(
    resetAuthDraftPassword({
      username: "alice",
      password: "secret"
    }),
    {
      username: "alice",
      password: ""
    }
  );
});

test("createInitialState starts with stable empty app state plus guest and ai state", () => {
  assert.deepEqual(createInitialState(), {
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
  });
});

test("messages panel markup should show mutual-like state instead of repeat like action", () => {
  const state = {
    ...createInitialState(),
    ui: {
      ...createInitialState().ui,
      activeTab: "liked"
    },
    appData: {
      profile: { user_id: 2001, profile_completed: true },
      discover: [],
      liked: [],
      liked_by: [
        {
          user_id: 1001,
          name: "林清禾",
          company: "腾讯",
          role: "产品经理",
          avatar_url: "https://example.com/a.jpg"
        }
      ],
      matches: [
        {
          match_id: 3001,
          other: {
            user_id: 1001,
            name: "林清禾",
            company: "腾讯",
            role: "产品经理",
            avatar_url: "https://example.com/a.jpg"
          },
          messages: []
        }
      ]
    }
  };

  const markup = renderLikedMarkup(state);

  assert.equal(markup.includes("回赞"), false);
  assert.equal(markup.includes("已经互相喜欢") || markup.includes("已互相喜欢"), true);
});

test("guest onboarding copy asks for gender before browsing recommendations", () => {
  const copy = getLaunchCopy();
  const serialized = JSON.stringify(copy);

  assert.equal(serialized.includes("先选你的性别"), true);
  assert.equal(serialized.includes("我是男生") || serialized.includes("我是女生"), true);
});

test("recommendation reasons reflect opposite-gender matching baseline for guests", () => {
  assert.equal(seedProfiles.every((profile) => profile.gender === "female"), true);
  assert.equal(defaultProfile.gender, "male");
});

test("discover like increments viewed count and skips matched card after success", async () => {
  const persistCalls = [];
  let refreshCalls = 0;
  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      authenticated: true,
      checkingSession: false
    },
    appData: {
      profile: { user_id: 2001, gender: "male", profile_completed: true },
      discover: [
        { user_id: 1001, name: "林清禾", gender: "female" },
        { user_id: 1002, name: "周以宁", gender: "female" }
      ],
      liked: [],
      liked_by: [],
      matches: []
    }
  };

  const nextState = await handleLikeAction({
    state,
    userId: 1001,
    source: "discover",
    likeRequest: async () => {},
    refreshAppData: async () => {
      refreshCalls += 1;
    },
    persist: (next) => {
      persistCalls.push(next);
    }
  });

  assert.equal(refreshCalls, 1);
  assert.equal(persistCalls.length, 1);
  assert.equal(nextState.local.viewedCount, 1);
  assert.deepEqual(nextState.local.skippedIds, [1001]);
});

test("liked-by callback should not consume discover quota or skip current card", async () => {
  const persistCalls = [];
  let refreshCalls = 0;
  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      authenticated: true,
      checkingSession: false
    },
    appData: {
      profile: { user_id: 2001, gender: "male", profile_completed: true },
      discover: [
        { user_id: 1001, name: "林清禾", gender: "female" },
        { user_id: 1002, name: "周以宁", gender: "female" }
      ],
      liked: [],
      liked_by: [{ user_id: 1003, name: "陈星野", gender: "female" }],
      matches: []
    }
  };

  const nextState = await handleLikeAction({
    state,
    userId: 1003,
    source: "liked_by",
    likeRequest: async () => {},
    refreshAppData: async () => {
      refreshCalls += 1;
    },
    persist: (next) => {
      persistCalls.push(next);
    }
  });

  assert.equal(refreshCalls, 1);
  assert.equal(persistCalls.length, 1);
  assert.equal(nextState.local.viewedCount, 0);
  assert.deepEqual(nextState.local.skippedIds, []);
});

test("hydrateAuthFromAppData keeps visitor sessions unauthenticated", () => {
  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      checkingSession: true,
      authenticated: false,
      username: ""
    },
    ui: {
      ...createInitialState().ui,
      usernameInput: ""
    }
  };
  const appData = {
    viewer: {
      authenticated: false,
      status: "visitor",
      is_guest: false
    },
    profile: null,
    discover: [],
    liked: [],
    liked_by: [],
    matches: []
  };

  const nextAuth = hydrateAuthFromAppData(state, appData);

  assert.equal(nextAuth.authenticated, false);
  assert.equal(nextAuth.checkingSession, false);
  assert.equal(nextAuth.userId, null);
});

test("guest like modal stays hidden for authenticated users with stale modal flag", () => {
  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      authenticated: true,
      checkingSession: false
    },
    ui: {
      ...createInitialState().ui,
      guestModalOpen: true
    }
  };

  assert.equal(shouldRenderGuestLikeModal(state), false);
});

test("guest like modal opens when like receives unauthorized", async () => {
  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      authenticated: true,
      checkingSession: false
    },
    ui: {
      ...createInitialState().ui,
      guestModalOpen: false,
      guestError: "old"
    }
  };

  const nextState = await handleLikeAction({
    state,
    userId: 1001,
    likeRequest: async () => {
      throw new Error("unauthorized");
    },
    refreshAppData: async () => {
      throw new Error("should_not_refresh");
    },
    persist: () => {}
  });

  assert.equal(nextState.pendingLikeUserId, 1001);
  assert.equal(nextState.ui.guestModalOpen, true);
  assert.equal(nextState.ui.guestError, "");
  assert.equal(nextState.auth.authenticated, true);
  assert.equal(shouldRenderGuestLikeModal(nextState), false);
});

test("guest like modal opens immediately for unauthenticated viewers", async () => {
  const state = createInitialState();

  const nextState = await handleLikeAction({
    state,
    userId: 1002,
    likeRequest: async () => {
      throw new Error("should_not_call_like_api");
    },
    refreshAppData: async () => {
      throw new Error("should_not_refresh");
    },
    persist: () => {}
  });

  assert.equal(nextState.pendingLikeUserId, 1002);
  assert.equal(nextState.ui.guestModalOpen, true);
  assert.equal(nextState.ui.guestError, "");
});

test("canSendMessages requires completed profile", () => {
  const state = createInitialState();
  assert.equal(canSendMessages(state), false);
  assert.equal(
    canSendMessages({
      ...state,
      appData: { profile: { profile_completed: true } }
    }),
    true
  );
});

test("openMatchProfile stores selected profile id", () => {
  const state = createInitialState();
  assert.equal(openMatchProfile(state, 1001).ui.selectedProfileUserId, 1001);
});

test("switching tabs should clear selected profile drawer state", () => {
  const state = {
    ...createInitialState(),
    ui: {
      ...createInitialState().ui,
      activeTab: "messages",
      selectedProfileUserId: 1001,
      editingProfile: true
    }
  };

  const nextState = {
    ...state,
    ui: {
      ...state.ui,
      activeTab: "discover",
      editingProfile: false,
      selectedProfileUserId: null
    }
  };

  assert.equal(nextState.ui.activeTab, "discover");
  assert.equal(nextState.ui.editingProfile, false);
  assert.equal(nextState.ui.selectedProfileUserId, null);
});

test("launch copy presents demo helpers honestly", () => {
  const copy = getLaunchCopy();
  const serialized = JSON.stringify(copy);

  assert.equal(serialized.includes("假数据演示版"), false);
  assert.equal(serialized.includes("演示版资料只保存在你的浏览器"), false);
  assert.equal(serialized.includes("demo"), true);
  assert.equal(serialized.includes("示意") || serialized.includes("体验") || serialized.includes("仅用于展示"), true);
  assert.equal(serialized.includes("不会") || serialized.includes("当前不会") || serialized.includes("暂不"), true);
});

test("recommendation reasons include concrete why-chat and city realism cues", () => {
  const reasons = buildRecommendationReasons(defaultProfile, seedProfiles[0]);

  assert.equal(Array.isArray(reasons), true);
  assert.equal(reasons.length, 3);
  assert.equal(reasons[0].includes("为什么现在适合开口") || reasons[0].includes("第一句为什么容易接住"), true);
  assert.equal(reasons[1].includes("深圳") && (reasons[1].includes("同城") || reasons[1].includes("通勤") || reasons[1].includes("距离")), true);
  assert.equal(reasons[2].includes("资料") || reasons[2].includes("线索"), true);
  reasons.forEach((reason) => {
    assert.equal(typeof reason, "string");
    assert.equal(reason.length > 8, true);
  });
});

test("icebreaker suggestions return three non-empty structured prompts", () => {
  const suggestions = buildIcebreakerSuggestions(seedProfiles[0]);

  assert.equal(suggestions.length, 3);
  suggestions.forEach((suggestion) => {
    assert.equal(typeof suggestion, "object");
    assert.equal(typeof suggestion.id, "string");
    assert.equal(typeof suggestion.text, "string");
    assert.equal(typeof suggestion.why, "string");
    assert.equal(typeof suggestion.goal, "string");
    assert.equal(suggestion.text.includes("？") || suggestion.text.includes("吗"), true);
  });
});

test("compatibility summary stays light and product-facing", () => {
  const summary = buildCompatibilitySummary(defaultProfile, seedProfiles[0]);

  assert.equal(typeof summary, "string");
  assert.equal(summary.length > 12, true);
  assert.equal(summary.includes("算法"), false);
  assert.equal(summary.includes("测试"), false);
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

test("resolveIcebreakerSuggestions preserves structured ai suggestions when response is complete", () => {
  const candidateProfile = seedProfiles[0];
  const result = resolveIcebreakerSuggestions(candidateProfile, {
    summary: "适合轻推下一轮",
    situation: {
      stage: "warming",
      label: "正在升温",
      why: "已经有往返",
      nextMove: "继续展开",
      avoid: "不要太重"
    },
    suggestions: [
      { id: "s1", text: "第一句", why: "原因一", goal: "目标一" },
      { id: "s2", text: "第二句", why: "原因二", goal: "目标二" },
      { id: "s3", text: "第三句", why: "原因三", goal: "目标三" }
    ],
    source: "ai",
    fallbackUsed: false
  });

  assert.deepEqual(result, {
    summary: "适合轻推下一轮",
    situation: {
      stage: "warming",
      label: "正在升温",
      why: "已经有往返",
      nextMove: "继续展开",
      avoid: "不要太重"
    },
    suggestions: [
      { id: "s1", text: "第一句", why: "原因一", goal: "目标一" },
      { id: "s2", text: "第二句", why: "原因二", goal: "目标二" },
      { id: "s3", text: "第三句", why: "原因三", goal: "目标三" }
    ],
    source: "ai",
    fallbackUsed: false
  });
});

test("resolveIcebreakerSuggestions keeps backward compatibility for string arrays", () => {
  const candidateProfile = seedProfiles[0];
  const result = resolveIcebreakerSuggestions(candidateProfile, {
    suggestions: ["第一句", "第二句", "第三句"],
    source: "ai",
    fallbackUsed: false
  });

  assert.equal(result.suggestions.length, 3);
  assert.deepEqual(
    result.suggestions.map((item) => item.text),
    ["第一句", "第二句", "第三句"]
  );
  result.suggestions.forEach((item) => {
    assert.equal(typeof item.id, "string");
    assert.equal(typeof item.why, "string");
    assert.equal(typeof item.goal, "string");
  });
  assert.equal(result.source, "ai");
  assert.equal(result.fallbackUsed, false);
});

test("resolveIcebreakerSuggestions falls back to structured suggestions when ai response is malformed", () => {
  const candidateProfile = seedProfiles[1];
  const result = resolveIcebreakerSuggestions(candidateProfile, {
    suggestions: ["只有一句"],
    source: "ai",
    fallbackUsed: false
  });

  assert.equal(result.suggestions.length, 3);
  result.suggestions.forEach((item) => {
    assert.equal(typeof item.id, "string");
    assert.equal(typeof item.text, "string");
    assert.equal(typeof item.why, "string");
    assert.equal(typeof item.goal, "string");
  });
  assert.equal(result.source, "fallback");
  assert.equal(result.fallbackUsed, true);
});

test("switchActiveMatch clears stale draft when changing threads", () => {
  const state = {
    ...createInitialState(),
    draftMessage: "这句原本是发给 A 的",
    ui: {
      ...createInitialState().ui,
      activeMatchId: "12",
      messageError: "发送失败"
    }
  };

  const nextState = switchActiveMatch(state, 13);

  assert.equal(nextState.ui.activeMatchId, 13);
  assert.equal(nextState.draftMessage, "");
  assert.equal(nextState.ui.messageError, "");
});

test("resolveIcebreakerSuggestions exposes stage helper surface with next move and avoid guidance", () => {
  const candidateProfile = seedProfiles[0];
  const result = resolveIcebreakerSuggestions(candidateProfile, {
    summary: "适合轻推下一轮",
    situation: {
      stage: "warming",
      label: "正在升温",
      why: "当前已经有来回，适合顺着对方给出的线索继续推进。",
      nextMove: "继续展开对方刚提到的生活细节，再决定要不要推进到见面话题。",
      avoid: "不要突然切成面试式追问，也别过早默认对方会答应邀约。"
    },
    suggestions: [
      { id: "s1", text: "第一句", why: "原因一", goal: "目标一" },
      { id: "s2", text: "第二句", why: "原因二", goal: "目标二" },
      { id: "s3", text: "第三句", why: "原因三", goal: "目标三" }
    ],
    source: "ai",
    fallbackUsed: false
  });

  assert.equal(result.situation.stage, "warming");
  assert.equal(result.situation.label, "正在升温");
  assert.equal(result.situation.why.includes("适合") || result.situation.why.includes("当前"), true);
  assert.equal(result.situation.nextMove.includes("继续") || result.situation.nextMove.includes("下一步"), true);
  assert.equal(result.situation.avoid.includes("不要") || result.situation.avoid.includes("别"), true);
});

test("messages panel markup keeps chat region outside the list panel", () => {
  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      authenticated: true,
      checkingSession: false
    },
    ui: {
      ...createInitialState().ui,
      activeTab: "messages",
      activeMatchId: "12"
    },
    appData: {
      profile: defaultProfile,
      discover: [],
      liked: [],
      liked_by: [],
      matches: [
        {
          match_id: 12,
          other: { user_id: 1001, name: "小雨", avatar_url: "", company: "A", role: "B" },
          messages: [{ sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" }]
        }
      ]
    },
    aiIcebreakers: {
      12: resolveIcebreakerSuggestions(seedProfiles[0], null)
    },
    aiIcebreakerStatus: {},
    selectedSuggestionByMatch: {},
    icebreakerClicksByMatch: {}
  };

  const markup = getMessagesPanelMarkup(state, {
    getLaunchCopy,
    getActiveMatch: (currentState) => currentState.appData.matches[0],
    renderChat: (match) => `<article data-chat-id="${match.match_id}">chat</article>`
  });

  assert.equal(markup.includes('data-messages-panel'), true);
  assert.equal(markup.includes('<section data-chat-region><article data-chat-id="12">chat</article></section>'), true);
  assert.equal(markup.indexOf('data-messages-panel') < markup.indexOf('data-chat-region'), true);
});

test("mergeLatestMessagesIntoAppData keeps newer local thread when background refresh is stale", () => {
  const currentAppData = {
    profile: { user_id: 99, profile_completed: true },
    discover: [],
    liked: [],
    liked_by: [],
    matches: [
      {
        match_id: 12,
        other: { user_id: 1001, name: "小雨" },
        messages: [
          { sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" },
          { sender_id: 99, content: "你好呀", created_at: "2026-04-05T00:00:01" }
        ]
      }
    ]
  };
  const incomingAppData = {
    profile: { user_id: 99, profile_completed: true },
    discover: [],
    liked: [],
    liked_by: [],
    matches: [
      {
        match_id: 12,
        other: { user_id: 1001, name: "小雨" },
        messages: [{ sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" }]
      }
    ]
  };

  const merged = mergeLatestMessagesIntoAppData(currentAppData, incomingAppData);

  assert.equal(merged.matches[0].messages.length, 2);
  assert.equal(merged.matches[0].messages[1].content, "你好呀");
  assert.equal(merged.matches[0].other, incomingAppData.matches[0].other);
});

test("updateMatchMessagesLocally only updates active match thread without rebuilding unrelated app state", () => {
  const state = {
    ...createInitialState(),
    draftMessage: "你好呀",
    ui: {
      ...createInitialState().ui,
      activeMatchId: "12"
    },
    appData: {
      profile: { user_id: 99, profile_completed: true },
      discover: [{ user_id: 1, name: "A" }],
      liked: [],
      liked_by: [],
      matches: [
        {
          match_id: 12,
          other: { user_id: 1001, name: "小雨" },
          messages: [{ sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" }]
        },
        {
          match_id: 13,
          other: { user_id: 1002, name: "小青" },
          messages: [{ sender_id: 1002, content: "hello", created_at: "2026-04-05T00:00:00" }]
        }
      ]
    }
  };

  const nextState = updateMatchMessagesLocally(state, 12, [
    { sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" },
    { sender_id: 99, content: "你好呀", created_at: "2026-04-05T00:00:01" }
  ]);

  assert.equal(nextState.draftMessage, "");
  assert.equal(nextState.ui.messageError, "");
  assert.equal(nextState.ui.activeMatchId, "12");
  assert.equal(nextState.appData.discover, state.appData.discover);
  assert.equal(nextState.appData.liked, state.appData.liked);
  assert.equal(nextState.appData.liked_by, state.appData.liked_by);
  assert.equal(nextState.appData.matches[1], state.appData.matches[1]);
  assert.equal(nextState.appData.matches[0].other, state.appData.matches[0].other);
  assert.equal(nextState.appData.matches[0].messages.length, 2);
  assert.equal(nextState.appData.matches[0].messages[1].content, "你好呀");
});

test("updateMatchMessagesLocally keeps messages tab and active match stable after send", () => {
  const state = {
    ...createInitialState(),
    ui: {
      ...createInitialState().ui,
      activeTab: "messages",
      activeMatchId: "12",
      messageError: "发送失败"
    },
    draftMessage: "继续聊聊",
    loading: false,
    appData: {
      profile: { user_id: 99, profile_completed: true },
      discover: [{ user_id: 1, name: "A" }],
      liked: [],
      liked_by: [],
      matches: [
        {
          match_id: 12,
          other: { user_id: 1001, name: "小雨" },
          messages: [{ sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" }]
        }
      ]
    }
  };

  const nextState = updateMatchMessagesLocally(state, 12, [
    { sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" },
    { sender_id: 99, content: "继续聊聊", created_at: "2026-04-05T00:00:01" }
  ]);

  assert.equal(nextState.ui.activeTab, "messages");
  assert.equal(nextState.ui.activeMatchId, "12");
  assert.equal(nextState.loading, false);
  assert.equal(nextState.draftMessage, "");
  assert.equal(nextState.ui.messageError, "");
});

test("getScrollRestorePlan can honor an explicit page scroll baseline", () => {
  assert.deepEqual(
    getScrollRestorePlan({
      pageScrollY: 1395,
      pageScrollBaseline: 900,
      threadScrollHeight: 1200,
      threadScrollTop: 700,
      threadClientHeight: 460,
      forceChatToBottom: true
    }),
    {
      pageScrollY: 900,
      shouldStickToBottom: true
    }
  );
});

test("getScrollRestorePlan preserves page scroll and sticks chat to bottom when requested", () => {
  assert.deepEqual(
    getScrollRestorePlan({
      pageScrollY: 920,
      threadScrollHeight: 1200,
      threadScrollTop: 700,
      threadClientHeight: 460,
      forceChatToBottom: true
    }),
    {
      pageScrollY: 920,
      shouldStickToBottom: true
    }
  );
});

test("applyMessagesRerender works against real DOM nodes and restores scroll position", () => {
  const dom = new JSDOM(`
    <div id="root">
      <section class="panel app-card messages-panel" data-messages-panel><h2>旧消息</h2></section>
      <section data-chat-region>
        <div class="chat-thread embedded-thread"><div>old</div></div>
      </section>
    </div>
  `);
  const { document } = dom.window;
  const root = document.querySelector("#root");
  const thread = root.querySelector(".embedded-thread");

  Object.defineProperty(thread, "scrollHeight", { value: 1200, configurable: true });
  Object.defineProperty(thread, "scrollTop", { value: 700, writable: true, configurable: true });
  Object.defineProperty(thread, "clientHeight", { value: 460, configurable: true });

  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      authenticated: true,
      checkingSession: false
    },
    ui: {
      ...createInitialState().ui,
      activeTab: "messages",
      activeMatchId: "12"
    },
    appData: {
      profile: defaultProfile,
      discover: [],
      liked: [],
      liked_by: [],
      matches: [
        {
          match_id: 12,
          other: { user_id: 1001, name: "小雨", avatar_url: "", company: "A", role: "B" },
          messages: [
            { sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" },
            { sender_id: 99, content: "你好呀", created_at: "2026-04-05T00:00:01" }
          ]
        }
      ]
    },
    aiIcebreakers: {
      12: resolveIcebreakerSuggestions(seedProfiles[0], null)
    },
    aiIcebreakerStatus: {},
    selectedSuggestionByMatch: {},
    icebreakerClicksByMatch: {}
  };

  const calls = [];
  const windowObject = {
    scrollY: 920,
    scrollTo(x, y) {
      calls.push(["scrollTo", x, y]);
    }
  };

  const changed = applyMessagesRerender({
    root,
    state,
    getLaunchCopy,
    getActiveMatch: (currentState) => currentState.appData.matches[0],
    renderChat: (match) => `<article data-chat-id="${match.match_id}">chat</article>`,
    bindEvents: () => calls.push(["bindEvents"]),
    syncChatScroll: (value) => calls.push(["syncChatScroll", value]),
    windowObject,
    forceChatToBottom: false
  });

  assert.equal(changed, true);
  assert.equal(root.querySelector("[data-messages-panel]").textContent.includes("消息"), true);
  assert.equal(root.querySelector("[data-chat-region]").innerHTML.includes('data-chat-id="12"'), true);
  assert.deepEqual(calls, [
    ["bindEvents"],
    ["scrollTo", 0, 920],
    ["syncChatScroll", true]
  ]);
});

test("applyMessagesRerender strips page-enter animation classes from replaced message surfaces", () => {
  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      authenticated: true,
      checkingSession: false
    },
    ui: {
      ...createInitialState().ui,
      activeTab: "messages",
      activeMatchId: "12"
    },
    appData: {
      profile: defaultProfile,
      discover: [],
      liked: [],
      liked_by: [],
      matches: [
        {
          match_id: 12,
          other: { user_id: 1001, name: "小雨", avatar_url: "", company: "A", role: "B" },
          messages: [
            { sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" },
            { sender_id: 99, content: "你好呀", created_at: "2026-04-05T00:00:01" }
          ]
        }
      ]
    },
    aiIcebreakers: {
      12: resolveIcebreakerSuggestions(seedProfiles[0], null)
    },
    aiIcebreakerStatus: {},
    selectedSuggestionByMatch: {},
    icebreakerClicksByMatch: {}
  };

  const dom = new JSDOM(`
    <div id="root">
      <section class="panel app-card messages-panel" data-messages-panel><h2>旧消息</h2></section>
      <section data-chat-region>
        <section class="panel chat-panel app-card"><div class="chat-thread embedded-thread"><div>old</div></div></section>
      </section>
    </div>
  `);
  const { document } = dom.window;
  const root = document.querySelector("#root");
  const thread = root.querySelector(".embedded-thread");

  Object.defineProperty(thread, "scrollHeight", { value: 1200, configurable: true });
  Object.defineProperty(thread, "scrollTop", { value: 700, writable: true, configurable: true });
  Object.defineProperty(thread, "clientHeight", { value: 460, configurable: true });

  const calls = [];
  const windowObject = {
    scrollY: 920,
    scrollTo(x, y) {
      calls.push(["scrollTo", x, y]);
    }
  };

  const changed = applyMessagesRerender({
    root,
    state,
    getLaunchCopy,
    getActiveMatch: (currentState) => currentState.appData.matches[0],
    renderChat: (match) => `
      <section class="panel chat-panel app-card" data-chat-id="${match.match_id}">
        <div class="chat-thread embedded-thread"><div>chat</div></div>
      </section>
    `,
    bindEvents: () => calls.push(["bindEvents"]),
    syncChatScroll: (value) => calls.push(["syncChatScroll", value]),
    windowObject,
    forceChatToBottom: false
  });

  assert.equal(changed, true);
  assert.equal(root.querySelector("[data-messages-panel]").classList.contains("app-card"), false);
  assert.equal(root.querySelector("[data-chat-region] .chat-panel").classList.contains("app-card"), false);
  assert.deepEqual(calls, [
    ["bindEvents"],
    ["scrollTo", 0, 920],
    ["syncChatScroll", true]
  ]);
});

test("applyMessagesRerender restores page scroll and updates chat region separately", () => {
  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      authenticated: true,
      checkingSession: false
    },
    ui: {
      ...createInitialState().ui,
      activeTab: "messages",
      activeMatchId: "12"
    },
    appData: {
      profile: defaultProfile,
      discover: [],
      liked: [],
      liked_by: [],
      matches: [
        {
          match_id: 12,
          other: { user_id: 1001, name: "小雨", avatar_url: "", company: "A", role: "B" },
          messages: [
            { sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" },
            { sender_id: 99, content: "你好呀", created_at: "2026-04-05T00:00:01" }
          ]
        }
      ]
    },
    aiIcebreakers: {
      12: resolveIcebreakerSuggestions(seedProfiles[0], null)
    },
    aiIcebreakerStatus: {},
    selectedSuggestionByMatch: {},
    icebreakerClicksByMatch: {}
  };

  const calls = [];
  const messagesPanel = { outerHTML: '<section data-messages-panel>old panel</section>' };
  const chatRegion = { outerHTML: '<section data-chat-region>old chat</section>' };
  const root = {
    querySelector(selector) {
      if (selector === "[data-messages-panel]") {
        return messagesPanel;
      }
      if (selector === "[data-chat-region]") {
        return chatRegion;
      }
      if (selector === ".embedded-thread") {
        return {
          scrollHeight: 1200,
          scrollTop: 700,
          clientHeight: 460
        };
      }
      return null;
    }
  };
  const windowObject = {
    scrollY: 920,
    scrollTo(x, y) {
      calls.push(["scrollTo", x, y]);
    }
  };

  const changed = applyMessagesRerender({
    root,
    state,
    getLaunchCopy,
    getActiveMatch: (currentState) => currentState.appData.matches[0],
    renderChat: (match) => `<article data-chat-id="${match.match_id}">chat</article>`,
    bindEvents: () => calls.push(["bindEvents"]),
    syncChatScroll: (value) => calls.push(["syncChatScroll", value]),
    windowObject,
    forceChatToBottom: false
  });

  assert.equal(changed, true);
  assert.equal(messagesPanel.outerHTML.includes('data-messages-panel'), true);
  assert.equal(chatRegion.outerHTML.includes('data-chat-region'), true);
  assert.deepEqual(calls, [
    ["bindEvents"],
    ["scrollTo", 0, 920],
    ["syncChatScroll", true]
  ]);
});

test("chat send should preserve page scroll during messages rerender", () => {
  const pageScrollY = 920;
  const originalChatMarkup = '<section data-chat-region><div class="chat-thread embedded-thread">old</div></section>';
  const nextChatMarkup = '<section data-chat-region><div class="chat-thread embedded-thread">new</div></section>';
  const originalPanelMarkup = '<section class="panel app-card messages-panel" data-messages-panel><h2>消息</h2></section>';
  const nextPanelMarkup = '<section class="panel app-card messages-panel" data-messages-panel><h2>新消息</h2></section>';

  const calls = [];
  const root = {
    querySelector(selector) {
      if (selector === ".embedded-thread") {
        return {
          scrollHeight: 1200,
          scrollTop: 700,
          clientHeight: 460
        };
      }
      if (selector === "[data-chat-region]") {
        return {
          outerHTML: originalChatMarkup
        };
      }
      if (selector === "[data-messages-panel]") {
        return {
          outerHTML: originalPanelMarkup
        };
      }
      return null;
    }
  };

  const scrollPlan = getScrollRestorePlan({
    pageScrollY,
    threadScrollHeight: 1200,
    threadScrollTop: 700,
    threadClientHeight: 460,
    forceChatToBottom: false
  });

  assert.deepEqual(scrollPlan, {
    pageScrollY,
    shouldStickToBottom: true
  });
  assert.equal(originalPanelMarkup.includes('data-messages-panel'), true);
  assert.equal(nextPanelMarkup.includes('data-messages-panel'), true);
  assert.equal(originalChatMarkup.includes('data-chat-region'), true);
  assert.equal(nextChatMarkup.includes('data-chat-region'), true);
});

test("shouldRenderGlobalLoading stays false on messages tab during background refresh", () => {
  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      authenticated: true,
      checkingSession: false
    },
    ui: {
      ...createInitialState().ui,
      activeTab: "messages"
    },
    appData: {
      profile: defaultProfile,
      discover: [{ user_id: 1, name: "A" }],
      liked: [],
      liked_by: [],
      matches: [
        {
          match_id: 12,
          other: { user_id: 1001, name: "小雨" },
          messages: [{ sender_id: 1001, content: "hi", created_at: "2026-04-05T00:00:00" }]
        }
      ]
    },
    loading: true
  };

  assert.equal(shouldRenderGlobalLoading(state), false);
});

test("global loading hides when authenticated content is already available", () => {
  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      authenticated: true,
      checkingSession: false
    },
    ui: {
      ...createInitialState().ui,
      activeTab: "messages"
    },
    appData: {
      profile: defaultProfile,
      discover: [],
      liked: [],
      liked_by: [],
      matches: []
    },
    loading: true
  };

  assert.equal(shouldRenderGlobalLoading(state), false);
});


test("global loading still shows before first authenticated app data load", () => {
  const state = {
    ...createInitialState(),
    auth: {
      ...createInitialState().auth,
      authenticated: true,
      checkingSession: false
    },
    loading: true
  };

  assert.equal(shouldRenderGlobalLoading(state), true);
});
