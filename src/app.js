import { loadState, saveState } from "./storage.js";

const DAILY_LIMIT = 30;

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
      checkingSession: true
    },
    ui: {
      activeTab: "discover",
      editingProfile: false,
      activeMatchId: null,
      usernameInput: "",
      passwordInput: "",
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
    loading: false
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

export function getLaunchCopy() {
  return {
    heroEyebrow: "Sanmao",
    heroTitle: "认真认识一个人，不用把开始变得太重。",
    heroBody: "先留下名字，合适的时候再慢慢补完整资料，轻一点开始，真一点聊天。",
    heroNoteLabel: "轻一点开始",
    heroNoteTitle: "先进入看看，再决定怎么介绍自己。",
    heroNoteBody: "发现、喜欢、消息和我的四个页签，会陪你把认识一个人的过程慢慢走完。",
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

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
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

export function mountApp(root) {
  let state = loadState(createInitialState());
  let authDraft = createAuthDraft();

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
      const appData = await apiFetch("/api/state");
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
              autocomplete="current-password"
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
    const copy = getLaunchCopy();
    const matches = state.appData?.matches || [];
    const activeMatch = getActiveMatch();

    return `
      <section class="panel app-card">
        <div class="section-label">${copy.messagesLabel}</div>
        <h2>消息</h2>
        ${
          matches.length
            ? `<div class="mini-list">
                ${matches
                  .map(
                    (match) => `
                      <button class="mini-profile chat-row ${String(match.match_id) === String(activeMatch?.match_id) ? "selected" : ""}" data-action="open-match" data-match-id="${match.match_id}">
                        <img src="${safeImageAttr(match.other.avatar_url)}" alt="${escapeAttribute(match.other.name)}">
                        <div>
                          <strong>${safeText(match.other.name)}</strong>
                          <span>${safeText(match.other.company, "未填公司")} · ${safeText(match.other.role, "未填职业")}</span>
                        </div>
                      </button>
                    `
                  )
                  .join("")}
              </div>`
            : `<p class="panel-copy">还没有形成匹配，会话列表会在互相喜欢后出现。</p>`
        }
      </section>
      ${
        activeMatch
          ? renderChat(activeMatch)
          : ""
      }
    `;
  }

  function renderChat(match) {
    const copy = getLaunchCopy();
    const profileCompleted = Boolean(state.appData?.profile?.profile_completed);
    const safeMessages = Array.isArray(match?.messages) ? match.messages : [];

    return `
      <section class="panel chat-panel app-card">
        <div class="chat-header compact-header">
          <div>
            <div class="section-label">${copy.chatLabel}</div>
            <strong>${safeText(match.other?.name)}</strong>
            <p>${profileCompleted ? "现在可以继续聊天。" : "发送消息前需要先补完整资料。"}</p>
          </div>
        </div>
        <div class="chat-thread embedded-thread">
          ${safeMessages
            .map(
              (message) => `
                <div class="bubble ${message.sender_id === null ? "mine" : Number(message.sender_id) === Number(state.appData?.profile?.user_id) ? "mine" : "theirs"}">
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
                <input id="chat-input" name="message" value="${escapeAttribute(state.draftMessage)}" placeholder="发一句消息..." autocomplete="off">
                <button type="submit" class="primary-button">发送</button>
              </form>
            `
            : `
              <div class="detail-block">
                <p class="error-text">${safeText(state.ui.messageError, "先去“我的”里补完整资料，再回来发第一条消息。")}</p>
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

  function renderContent() {
    if (state.auth.checkingSession) {
      return `<section class="panel app-card"><p>正在确认登录状态...</p></section>`;
    }

    if (!state.auth.authenticated) {
      return renderAuth();
    }

    if (state.loading || !state.appData) {
      return `<section class="panel app-card"><p>正在加载数据...</p></section>`;
    }

    if (state.ui.activeTab === "discover") {
      return renderDiscover();
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
        ${state.auth.authenticated ? renderNav() : ""}
        ${renderContent()}
      </div>
    `;
    bindEvents();
    syncChatScroll();
  }

  function syncChatScroll() {
    const thread = root.querySelector(".embedded-thread");
    if (thread) {
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
    } catch {
      setState({
        ...state,
        ui: {
          ...state.ui,
          usernameError: "检查用户名失败"
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

    const { state: nextState, authDraft: nextAuthDraft, credentials } = submitAuthDraft(state, authDraft);
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
          passwordInput: "",
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
    const { state: nextState, authDraft: nextAuthDraft, credentials } = submitAuthDraft(state, authDraft);
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
          passwordInput: "",
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
          passwordInput: "",
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
          passwordInput: "",
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

  async function handleSendMessage(event) {
    event.preventDefault();
    const matchId = Number(event.currentTarget.dataset.matchId);
    try {
      await apiFetch("/api/message", {
        method: "POST",
        body: JSON.stringify({
          match_id: matchId,
          content: state.draftMessage
        })
      });

      state = {
        ...state,
        draftMessage: "",
        ui: {
          ...state.ui,
          messageError: ""
        }
      };
      persist();
      await refreshAppData();
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

  function bindEvents() {
    const authForm = root.querySelector("#auth-form");
    if (authForm) {
      authForm.addEventListener("submit", handleAuthSubmit);
    }

    const profileForm = root.querySelector("#profile-form");
    if (profileForm) {
      profileForm.addEventListener("submit", handleProfileSave);
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
        setState({
          ...state,
          ui: {
            ...state.ui,
            activeMatchId: button.dataset.matchId
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
