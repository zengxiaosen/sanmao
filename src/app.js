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

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function createInitialState() {
  return {
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
    activeChatId: null
  };
}

export function mountApp(root) {
  let state = loadState(createInitialState());
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
        <div class="eyebrow">Sanmao</div>
        <h1>给刚毕业、在深圳打拼的人，做一个干净一点的相遇入口。</h1>
        <p>假数据演示版，完整体验资料填写、刷卡、匹配和聊天闭环。</p>
      </section>
    `;
  }

  function renderProfileForm() {
    const profile = state.profile;

    return `
      <section class="panel onboarding">
        <div class="panel-head">
          <div>
            <div class="section-label">STEP 1</div>
            <h2>先填一份自己的资料</h2>
          </div>
          <div class="pill">演示版资料只保存在你的浏览器</div>
        </div>
        <form id="profile-form" class="profile-form">
          <label>昵称<input name="name" value="${profile.name}" placeholder="例如：阿泽" required></label>
          <label>年龄<input name="age" type="number" min="18" max="40" value="${profile.age}" placeholder="23" required></label>
          <label>性别
            <select name="gender">
              <option value="male" ${profile.gender === "male" ? "selected" : ""}>男生</option>
              <option value="female" ${profile.gender === "female" ? "selected" : ""}>女生</option>
            </select>
          </label>
          <label>城市<input name="city" value="${profile.city}" placeholder="深圳" required></label>
          <label>公司<input name="company" value="${profile.company}" placeholder="例如：腾讯" required></label>
          <label>职业<input name="role" value="${profile.role}" placeholder="例如：后端工程师" required></label>
          <label>学校<input name="school" value="${profile.school}" placeholder="例如：南方科技大学" required></label>
          <label>标签<input name="tags" value="${profile.tags}" placeholder="徒步 / 看展 / 羽毛球" required></label>
          <label class="full">自我介绍<textarea name="bio" rows="4" placeholder="说一点你的生活方式、关系观和想认识的人" required>${profile.bio}</textarea></label>
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
          <div class="section-label">TODAY</div>
          <strong>还可以看 ${remaining} 份异性资料</strong>
        </div>
        <span>${state.daily.viewed} / ${DAILY_LIMIT}</span>
      </div>
    `;
  }

  function renderCard(profile) {
    if (!profile) {
      return `
        <section class="panel empty-state">
          <div class="section-label">TODAY COMPLETE</div>
          <h2>今天的 30 份资料已经看完了</h2>
          <p>演示版会在明天自动重置，你也可以刷新页面看看已匹配聊天。</p>
        </section>
      `;
    }

    return `
      <section class="panel card-panel">
        <div class="card-photo" style="background-image:url('${profile.avatar}')"></div>
        <div class="card-body">
          <div class="card-main">
            <div>
              <h2>${profile.name}，${profile.age}</h2>
              <p>${profile.company} · ${profile.role}</p>
            </div>
            <div class="mini-meta">${profile.city}</div>
          </div>
          <div class="meta-grid">
            <span>${profile.school}</span>
            <span>${profile.height}</span>
          </div>
          <div class="tag-row">
            ${profile.tags.map((tag) => `<span>${tag}</span>`).join("")}
          </div>
          <p class="bio">${profile.bio}</p>
          <div class="prompt-block">
            <div class="section-label">TA 的一句话</div>
            <p>${profile.prompt}</p>
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
          <div class="section-label">MATCHES</div>
          <h3>还没有匹配</h3>
          <p>命中预设的双向喜欢后，这里会出现聊天入口。</p>
        </section>
      `;
    }

    const items = seedProfiles.filter((profile) => state.matchedIds.includes(profile.id));

    return `
      <section class="panel match-list">
        <div class="section-label">MATCHES</div>
        <h3>已经互相喜欢的人</h3>
        <div class="match-items">
          ${items
            .map(
              (item) => `
                <button class="match-item" data-chat-id="${item.id}">
                  <img src="${item.avatar}" alt="${item.name}">
                  <div>
                    <strong>${item.name}</strong>
                    <span>${item.company} · ${item.role}</span>
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
    const thread = getChatThread(state.activeChatId, chatThreads);

    return `
      <section class="chat-screen">
        <div class="chat-header">
          <button type="button" class="text-button" data-action="back-chat">返回</button>
          <div>
            <strong>${profile.name}</strong>
            <p>演示聊天</p>
          </div>
        </div>
        <div class="chat-thread">
          ${thread
            .map(
              (message) => `
                <div class="bubble ${message.from === state.profile.id ? "mine" : "theirs"}">
                  ${message.text}
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

    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="match-modal" onclick="event.stopPropagation()">
          <div class="section-label">IT'S A MATCH</div>
          <h2>你和 ${match.name} 互相喜欢</h2>
          <p>这是演示版，会进入预设聊天内容。</p>
          <div class="modal-actions">
            <button type="button" class="ghost-button" data-action="close-modal">继续刷卡</button>
            <button type="button" class="primary-button" data-action="open-chat" data-chat-id="${match.id}">去聊天</button>
          </div>
        </div>
      </div>
    `;
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

  function bindEvents() {
    const profileForm = root.querySelector("#profile-form");
    if (profileForm) {
      profileForm.addEventListener("submit", handleProfileSubmit);
    }

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

    root.querySelectorAll("[data-chat-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state = {
          ...state,
          activeChatId: button.dataset.chatId,
          latestMatchId: null
        };
        persist();
        renderApp();
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

  renderApp();
}
