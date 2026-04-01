import test from "node:test";
import assert from "node:assert/strict";

import {
  createAuthDraft,
  createInitialState,
  getLaunchCopy,
  resetAuthDraftPassword,
  setAuthDraftField,
  submitAuthDraft
} from "../src/app.js";

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
        userId: null,
        username: "alice",
        authenticated: false,
        checkingSession: true
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

test("createInitialState starts with stable empty app state", () => {
  assert.deepEqual(createInitialState(), {
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
  });
});

test("launch copy set excludes demo-only phrases", () => {
  const copy = getLaunchCopy();
  const serialized = JSON.stringify(copy);

  assert.equal(serialized.includes("SQLite MVP"), false);
  assert.equal(serialized.includes("CURRENT FLOW"), false);
  assert.equal(serialized.includes("演示账号统一测试密码"), false);
  assert.equal(serialized.includes("后端 session 会记住你的登录状态"), false);
  assert.equal(serialized.includes("等后端逻辑继续补完后"), false);
});
