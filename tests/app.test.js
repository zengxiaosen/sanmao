import test from "node:test";
import assert from "node:assert/strict";

import { createInitialState, escapeAttribute, escapeHtml, sanitizeImageUrl } from "../src/app.js";

test("escapeHtml escapes dangerous HTML characters", () => {
  const value = '<img src=x onerror="alert(1)">\'&';
  assert.equal(
    escapeHtml(value),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;"
  );
});

test("escapeAttribute reuses HTML escaping for attribute contexts", () => {
  assert.equal(escapeAttribute('a"b<c'), "a&quot;b&lt;c");
});

test("sanitizeImageUrl only allows http and https urls", () => {
  assert.equal(sanitizeImageUrl("https://example.com/a.png"), "https://example.com/a.png");
  assert.equal(sanitizeImageUrl("javascript:alert(1)"), "");
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
