import { chatThreads, defaultProfile, mutualLikes, seedProfiles } from "./data.js";
import {
  getCandidatesForViewer,
  getChatThread,
  getDailyState,
  incrementViews,
  registerLike
} from "./matchLogic.js";
import { loadState, saveState } from "./storage.js";

const DAILY_LIMIT = 30;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getLaunchCopy() {
  return {
    heroEyebrow: "Sanmao",
    heroTitle: "认真认识一个人，先从一句自然的开场开始。",
    heroBody: "把资料写清楚一点，浏览合适的人，遇到聊得来的人就慢慢认识。",
    profileStepLabel: "完善资料",
    profileTitle: "先写一份会让人想回复的资料",
    profilePill: "资料越真实，越容易遇到愿意认真聊的人",
    quotaLabel: "今日推荐",
    quotaTitle: "今天还可以再看看",
    emptyDeckLabel: "今日推荐",
    emptyDeckTitle: "今天的新推荐先看到这里",
    emptyDeckBody: "可以先回到消息页，继续和已经匹配的人慢慢聊。",
    emptyMatchLabel: "消息",
    emptyMatchTitle: "还没有新的匹配",
    emptyMatchBody: "先去今日推荐里看看，也许下一次喜欢就会有回应。",
    chatStatus: "慢慢聊，看看你们会不会越聊越顺。",
    matchBadge: "互相喜欢",
    matchModalBody: "不如就从一句自然的问候开始。",
    keepBrowsingAction: "继续看看",
    openChatAction: "去聊天"
  };
}

export function buildRecommendationReasons(viewerProfile, candidateProfile) {
  const viewerTags = Array.isArray(viewerProfile.tags)
    ? viewerProfile.tags
    : String(viewerProfile.tags || "")
        .split(/[、,/]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
  const candidateTags = Array.isArray(candidateProfile.tags) ? candidateProfile.tags : [];
  const sharedTag = viewerTags.find((tag) => candidateTags.includes(tag));

  return [
    sharedTag
      ? `你们都对${sharedTag}有兴趣，第一句就比较容易接上。`
      : `${candidateProfile.name}的资料很具体，聊起来不太容易冷场。`,
    `${candidateProfile.city}生活和${candidateProfile.company}的工作节奏，和你现在的状态比较接近。`,
    `${candidateProfile.prompt.replace(/。$/, "")}，很适合顺着展开一段自然对话。`
  ];
}

export function buildIcebreakerSuggestions(candidateProfile) {
  const firstTag = Array.isArray(candidateProfile.tags) ? candidateProfile.tags[0] : "最近的兴趣";

  return [
    `你资料里提到${firstTag}，最近一次让你特别开心的是什么？`,
    `看到你说“${candidateProfile.prompt.replace(/。$/, "")}”，这通常会是你理想周末的样子吗？`,
    `如果第一次见面安排在${candidateProfile.city}，你会想选咖啡还是散步呢？`
  ];
}

export function buildAiIcebreakerPayload(viewerProfile, candidateProfile, recentMessages) {
  return {
    viewerProfile: {
      id: viewerProfile.id,
      city: viewerProfile.city,
      company: viewerProfile.company,
      role: viewerProfile.role,
      school: viewerProfile.school,
      tags: viewerProfile.tags,
      bio: viewerProfile.bio
    },
    candidateProfile: {
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
    },
    recentMessages: Array.isArray(recentMessages) ? recentMessages.slice(-6) : []
  };
}

export function resolveIcebreakerSuggestions(candidateProfile, responsePayload) {
  const fallbackSuggestions = buildIcebreakerSuggestions(candidateProfile);
  const suggestions = Array.isArray(responsePayload?.suggestions)
    ? responsePayload.suggestions.filter((item) => typeof item === "string" && item.trim())
    : [];

  if (suggestions.length >= 3) {
    return {
      suggestions: suggestions.slice(0, 3),
      source: responsePayload?.source === "ai" ? "ai" : "fallback",
      fallbackUsed: Boolean(responsePayload?.fallbackUsed)
    };
  }

  return {
    suggestions: fallbackSuggestions,
    source: "fallback",
    fallbackUsed: true
  };
}

export function buildCompatibilitySummary(viewerProfile, candidateProfile) {
  if (!candidateProfile) {
    return "先回到消息列表看看新的匹配吧。";
  }

  const viewerCity = viewerProfile.city || "同一座城市";
  return `${candidateProfile.name}的节奏真诚放松，和你在${viewerCity}想认真认识一个人的期待很合拍。`;
}

export function getSeedQualityReport(profiles) {
  const avatarCounts = new Map();

  profiles.forEach((profile) => {
    avatarCounts.set(profile.avatar, (avatarCounts.get(profile.avatar) || 0) + 1);
  });

  return {
    totalProfiles: profiles.length,
    duplicateAvatarUrls: Array.from(avatarCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([avatar]) => avatar)
  };
}


function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export function createAuthDraft() {
  return {
    username: "",
    password: ""
  };
}

export function setAuthDraftField(authDraft, field, value) {
  if (authDraft[field] === value) {
    return authDraft;
  }

  return {
    ...authDraft,
    [field]: value
  };
}

export function createInitialState() {
  return {
    auth: {
      userId: null,
      username: "",
      authenticated: false,
      checkingSession: true
    },
    ui: {
      activeTab: "discover",
      editingProfile: false,
      activeMatchId: null,
      usernameStatus: "",
      usernameError: "",
      authMode: "register",
      profileError: "",
      messageError: ""
    },
    local: {
      viewedCount: 0,
      skippedIds: []
    },
    draftMessage: "",
    appData: null,
    loading: false,
    profile: { ...defaultProfile },
    completedProfile: false,
    daily: {
      date: getToday(),
      viewed: 0
    },
    currentIndex: 0,
    passedIds: [],
    likedIds: [],
    matchedIds: [],
    activeChatId: null,
    aiIcebreakers: {},
    aiIcebreakerStatus: {}
  };
}

export function submitAuthDraft(state, authDraft) {
  const username = authDraft.username.trim();

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
      password: ""
    },
    credentials: {
      username,
      password: authDraft.password
    }
  };
}

export async function apiFetchJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || "request_failed");
  }

  return payload;
}

export async function requestAiIcebreakers(viewerProfile, candidateProfile, recentMessages) {
  const payload = buildAiIcebreakerPayload(viewerProfile, candidateProfile, recentMessages);
  const response = await apiFetchJson("/api/ai/icebreakers", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return resolveIcebreakerSuggestions(candidateProfile, response);
}

export function mountApp(root) {
  const copy = getLaunchCopy();
  let state = loadState(createInitialState());
  let authDraft = createAuthDraft();
  state.daily = getDailyState(state.daily, getToday());

  function persist() {
    saveState(state);
  }

  function getViewer() {
    return {
      id: state.profile.id,
      gender: state.profile.gender
    };
  }

  function getDeck() {
    const excludedIds = new Set([...state.passedIds, ...state.likedIds]);
    return getCandidatesForViewer(getViewer(), seedProfiles).filter(
      (profile) => !excludedIds.has(profile.id)
    );
  }

  function getCurrentCard() {
    const deck = getDeck();
    return deck[0] || null;
  }

  function renderHero() {
    return `
      <section class="hero">
        <div class="eyebrow">${copy.heroEyebrow}</div>
        <h1>${copy.heroTitle}</h1>
        <p>${copy.heroBody}</p>
      </section>
    `;
  }

  function renderProfileForm() {
    const profile = state.profile;

    return `
      <section class="panel onboarding">
        <div class="panel-head">
          <div>
            <div class="section-label">${escapeHtml(copy.profileStepLabel)}</div>
            <h2>${escapeHtml(copy.profileTitle)}</h2>
          </div>
          <div class="pill">${escapeHtml(copy.profilePill)}</div>
        </div>
        <form id="profile-form" class="profile-form">
          <label>昵称<input name="name" value="${escapeHtml(profile.name)}" placeholder="例如：阿泽" required></label>
          <label>年龄<input name="age" type="number" min="18" max="40" value="${escapeHtml(profile.age)}" placeholder="23" required></label>
          <label>性别
            <select name="gender">
              <option value="male" ${profile.gender === "male" ? "selected" : ""}>男生</option>
              <option value="female" ${profile.gender === "female" ? "selected" : ""}>女生</option>
            </select>
          </label>
          <label>城市<input name="city" value="${escapeHtml(profile.city)}" placeholder="深圳" required></label>
          <label>公司<input name="company" value="${escapeHtml(profile.company)}" placeholder="例如：腾讯" required></label>
          <label>职业<input name="role" value="${escapeHtml(profile.role)}" placeholder="例如：后端工程师" required></label>
          <label>学校<input name="school" value="${escapeHtml(profile.school)}" placeholder="例如：南方科技大学" required></label>
          <label>标签<input name="tags" value="${escapeHtml(profile.tags)}" placeholder="徒步 / 看展 / 羽毛球" required></label>
          <label class="full">自我介绍<textarea name="bio" rows="4" placeholder="说一点你的生活方式、关系观和想认识的人" required>${escapeHtml(profile.bio)}</textarea></label>
          <button type="submit" class="primary-button">保存并开始刷卡</button>
        </form>
      </section>
    `;
  }

  function renderQuota() {
    const remaining = Math.max(0, DAILY_LIMIT - state.daily.viewed);
    return `
      <div class="quota-card">
        <div>
          <div class="section-label">${copy.quotaLabel}</div>
          <strong>${copy.quotaTitle} ${remaining} 份资料</strong>
        </div>
        <span>${state.daily.viewed} / ${DAILY_LIMIT}</span>
      </div>
    `;
  }

  function renderCard(profile) {
    if (!profile) {
      return `
        <section class="panel empty-state">
          <div class="section-label">${escapeHtml(copy.emptyDeckLabel)}</div>
          <h2>${escapeHtml(copy.emptyDeckTitle)}</h2>
          <p>${escapeHtml(copy.emptyDeckBody)}</p>
        </section>
      `;
    }

    const recommendationReasons = buildRecommendationReasons(state.profile, profile);

    return `
      <section class="panel card-panel">
        <div class="card-photo" style="background-image:url('${escapeHtml(profile.avatar)}')"></div>
        <div class="card-body">
          <div class="card-main">
            <div>
              <h2>${escapeHtml(profile.name)}，${escapeHtml(profile.age)}</h2>
              <p>${escapeHtml(profile.company)} · ${escapeHtml(profile.role)}</p>
            </div>
            <div class="mini-meta">${escapeHtml(profile.city)}</div>
          </div>
          <div class="meta-grid">
            <span>${escapeHtml(profile.school)}</span>
            <span>${escapeHtml(profile.height)}</span>
          </div>
          <div class="tag-row">
            ${profile.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
          <p class="bio">${escapeHtml(profile.bio)}</p>
          <div class="prompt-block">
            <div class="section-label">TA 的一句话</div>
            <p>${escapeHtml(profile.prompt)}</p>
          </div>
          <div class="prompt-block match-reason-block">
            <div class="section-label">为什么值得聊</div>
            <ul>
              ${recommendationReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
            </ul>
          </div>
          <div class="actions">
            <button type="button" class="ghost-button" data-action="pass">跳过</button>
            <button type="button" class="primary-button" data-action="like">喜欢</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderMatches() {
    if (!state.matchedIds.length) {
      return `
        <section class="panel match-list">
          <div class="section-label">${escapeHtml(copy.emptyMatchLabel)}</div>
          <h3>${escapeHtml(copy.emptyMatchTitle)}</h3>
          <p>${escapeHtml(copy.emptyMatchBody)}</p>
        </section>
      `;
    }

    const items = seedProfiles.filter((profile) => state.matchedIds.includes(profile.id));

    return `
      <section class="panel match-list">
        <div class="section-label">${escapeHtml(copy.matchBadge)}</div>
        <h3>已经互相喜欢的人</h3>
        <div class="match-items">
          ${items
            .map(
              (item) => `
                <button class="match-item" data-chat-id="${escapeHtml(item.id)}">
                  <img src="${escapeHtml(item.avatar)}" alt="${escapeHtml(item.name)}">
                  <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>${escapeHtml(item.company)} · ${escapeHtml(item.role)}</span>
                  </div>
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderChat() {
    if (!state.activeChatId) {
      return "";
    }

    const profile = seedProfiles.find((item) => item.id === state.activeChatId);
    if (!profile) {
      return "";
    }
    const thread = getChatThread(state.activeChatId, chatThreads);
    const compatibilitySummary = buildCompatibilitySummary(state.profile, profile);
    const icebreakerState = state.aiIcebreakers[state.activeChatId] || {
      suggestions: buildIcebreakerSuggestions(profile),
      source: "fallback",
      fallbackUsed: true
    };
    const loadingAi = state.aiIcebreakerStatus[state.activeChatId] === "loading";

    return `
      <section class="chat-screen">
        <div class="chat-header">
          <button type="button" class="text-button" data-action="back-chat">返回</button>
          <div>
            <strong>${escapeHtml(profile.name)}</strong>
            <p>${escapeHtml(copy.chatStatus)}</p>
          </div>
        </div>
        <div class="prompt-block compatibility-block">
          <div class="section-label">轻缘分解读</div>
          <p>${escapeHtml(compatibilitySummary)}</p>
        </div>
        <div class="prompt-block icebreaker-block">
          <div class="section-label">开场建议</div>
          <div class="card-main">
            <p class="mini-meta">${icebreakerState.source === "ai" ? "AI 灵感" : "默认建议"}</p>
            <button type="button" class="ghost-button" data-action="refresh-icebreakers">换一组</button>
          </div>
          ${loadingAi ? '<p class="mini-meta">AI 正在想更自然的开场…</p>' : ""}
          <div class="tag-row">
            ${icebreakerState.suggestions
              .map(
                (item) => {
                  const safeItem = escapeHtml(item);
                  return `
                    <div class="icebreaker-row">
                      <button type="button" class="ghost-button icebreaker-chip" data-icebreaker="${safeItem}">${safeItem}</button>
                      <button type="button" class="primary-button" data-send-icebreaker="${safeItem}">直接发</button>
                    </div>
                  `;
                }
              )
              .join("")}
          </div>
        </div>
        <div class="chat-thread">
          ${thread
            .map(
              (message) => `
                <div class="bubble ${message.from === state.profile.id ? "mine" : "theirs"}">
                  ${escapeHtml(message.text)}
                </div>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderMatchModal() {
    const latestMatchId = state.latestMatchId;
    if (!latestMatchId) {
      return "";
    }

    const match = seedProfiles.find((profile) => profile.id === latestMatchId);
    if (!match) {
      return "";
    }

    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="match-modal" onclick="event.stopPropagation()">
          <div class="section-label">${escapeHtml(copy.matchBadge)}</div>
          <h2>你和 ${escapeHtml(match.name)} 互相喜欢</h2>
          <p>${escapeHtml(copy.matchModalBody)}</p>
          <div class="modal-actions">
            <button type="button" class="ghost-button" data-action="close-modal">${escapeHtml(copy.keepBrowsingAction)}</button>
            <button type="button" class="primary-button" data-action="open-chat" data-chat-id="${escapeHtml(match.id)}">${escapeHtml(copy.openChatAction)}</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    const profileForm = root.querySelector("#profile-form");
    if (profileForm) {
      profileForm.addEventListener("submit", handleProfileSubmit);
    }

    root.querySelectorAll("[data-auth-field]").forEach((input) => {
      input.addEventListener("input", (event) => {
        authDraft = setAuthDraftField(authDraft, event.currentTarget.dataset.authField, event.currentTarget.value);
      });
    });

    root.querySelectorAll("[data-action='pass']").forEach((button) => {
      button.addEventListener("click", () => {
        const currentCard = getCurrentCard();
        if (currentCard) {
          moveNext("passedIds", currentCard.id);
        }
      });
    });

    root.querySelectorAll("[data-action='like']").forEach((button) => {
      button.addEventListener("click", () => {
        const currentCard = getCurrentCard();
        if (currentCard) {
          handleLike(currentCard.id);
        }
      });
    });

    root.querySelectorAll("[data-send-icebreaker]").forEach((button) => {
      button.addEventListener("click", () => {
        const profile = seedProfiles.find((item) => item.id === state.activeChatId);
        const message = button.dataset.sendIcebreaker;
        const nextThread = [...getChatThread(state.activeChatId, chatThreads), { from: state.profile.id, text: message }];

        if (profile) {
          nextThread.push({
            from: profile.id,
            text: `这句开场我愿意接。${profile.conversationHooks?.[0] || profile.prompt}`
          });
        }

        chatThreads[state.activeChatId] = nextThread;
        state = {
          ...state,
          draftMessage: ""
        };
        persist();
        renderApp();
      });
    });

    root.querySelectorAll("[data-icebreaker]").forEach((button) => {
      button.addEventListener("click", () => {
        state = {
          ...state,
          draftMessage: button.dataset.icebreaker
        };
        persist();
        renderApp();
      });
    });

    root.querySelectorAll("[data-chat-id]").forEach((button) => {
      button.addEventListener("click", () => {
        openChat(button.dataset.chatId);
      });
    });

    root.querySelectorAll("[data-action='refresh-icebreakers']").forEach((button) => {
      button.addEventListener("click", () => {
        void loadAiIcebreakers(state.activeChatId, true);
      });
    });

    root.querySelectorAll("[data-action='close-modal']").forEach((button) => {
      button.addEventListener("click", () => {
        state = {
          ...state,
          latestMatchId: null
        };
        persist();
        renderApp();
      });
    });

    root.querySelectorAll("[data-action='back-chat']").forEach((button) => {
      button.addEventListener("click", () => {
        state = {
          ...state,
          activeChatId: null
        };
        persist();
        renderApp();
      });
    });
  }

  async function loadAiIcebreakers(chatId, forceRefresh = false) {
    const profile = seedProfiles.find((item) => item.id === chatId);
    if (!profile) {
      return;
    }

    if (!forceRefresh && state.aiIcebreakers[chatId]?.source === "ai") {
      return;
    }

    state = {
      ...state,
      aiIcebreakers: {
        ...state.aiIcebreakers,
        [chatId]: state.aiIcebreakers[chatId] || resolveIcebreakerSuggestions(profile)
      },
      aiIcebreakerStatus: {
        ...state.aiIcebreakerStatus,
        [chatId]: "loading"
      }
    };
    renderApp();

    try {
      const nextIcebreakers = await requestAiIcebreakers(
        state.profile,
        profile,
        getChatThread(chatId, chatThreads)
      );

      state = {
        ...state,
        aiIcebreakers: {
          ...state.aiIcebreakers,
          [chatId]: nextIcebreakers
        },
        aiIcebreakerStatus: {
          ...state.aiIcebreakerStatus,
          [chatId]: "idle"
        }
      };
    } catch {
      state = {
        ...state,
        aiIcebreakers: {
          ...state.aiIcebreakers,
          [chatId]: resolveIcebreakerSuggestions(profile)
        },
        aiIcebreakerStatus: {
          ...state.aiIcebreakerStatus,
          [chatId]: "idle"
        }
      };
    }

    persist();
    renderApp();
  }

  function openChat(chatId) {
    const profile = seedProfiles.find((item) => item.id === chatId);
    if (!profile) {
      return;
    }

    state = {
      ...state,
      activeChatId: chatId,
      latestMatchId: null,
      aiIcebreakers: {
        ...state.aiIcebreakers,
        [chatId]: state.aiIcebreakers[chatId] || resolveIcebreakerSuggestions(profile)
      }
    };
    persist();
    renderApp();
    void loadAiIcebreakers(chatId);
  }

  function renderApp() {
    const currentCard = state.daily.viewed >= DAILY_LIMIT ? null : getCurrentCard();

    root.innerHTML = `
      <div class="app-shell">
        ${renderHero()}
        ${
          state.completedProfile
            ? `
              <section class="dashboard">
                <div class="left-column">
                  ${renderQuota()}
                  ${renderCard(currentCard)}
                </div>
                <div class="right-column">
                  ${renderMatches()}
                </div>
              </section>
              ${renderChat()}
            `
            : renderProfileForm()
        }
      </div>
      ${renderMatchModal()}
    `;

    bindEvents();
  }

  function handleProfileSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    state = {
      ...state,
      profile: {
        ...state.profile,
        name: String(formData.get("name")).trim(),
        age: String(formData.get("age")).trim(),
        gender: String(formData.get("gender")),
        city: String(formData.get("city")).trim(),
        company: String(formData.get("company")).trim(),
        role: String(formData.get("role")).trim(),
        school: String(formData.get("school")).trim(),
        tags: String(formData.get("tags")).trim(),
        bio: String(formData.get("bio")).trim()
      },
      completedProfile: true
    };
    persist();
    renderApp();
  }

  function moveNext(collectionKey, candidateId) {
    state = {
      ...state,
      daily: incrementViews(state.daily),
      [collectionKey]: [...state[collectionKey], candidateId]
    };
    persist();
    renderApp();
  }

  function handleLike(candidateId) {
    const result = registerLike({
      viewerId: state.profile.id,
      candidateId,
      likesMap: mutualLikes,
      likedIds: state.likedIds
    });

    state = {
      ...state,
      daily: incrementViews(state.daily),
      likedIds: result.likedIds,
      matchedIds: Array.from(new Set([...state.matchedIds, ...result.matches])),
      latestMatchId: result.matched ? candidateId : null
    };
    persist();
    renderApp();
  }

  renderApp();
}
