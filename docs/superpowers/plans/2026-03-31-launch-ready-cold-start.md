# Launch-Ready Cold Start and Chat Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sanmao feel launch-ready by fixing the auth password input rerender bug, replacing demo-flavored copy, expanding cold-start seed profiles to about 100 realistic users, and adding rule-based auto replies for seeded matches.

**Architecture:** Keep the current lightweight split: plain-JS frontend in the worktree and Python/SQLite backend in `server/`. Fix the password issue by minimizing auth-form rerenders in the frontend session app, move large seed/persona configuration into a dedicated backend module, and extend the existing `/api/like` + `/api/message` flow so seeded matches get starter messages and one-step rule-based replies without introducing async jobs or LLM dependencies.

**Tech Stack:** Vanilla JavaScript ES modules, Node test runner, Python `http.server`, SQLite

---

### Task 1: Map the real auth UI bug in the session frontend

**Files:**
- Modify: `tests/app.test.js`
- Modify: `src/app.js`

- [ ] **Step 1: Write the failing test**

Add a focused regression test in `tests/app.test.js` that locks in the auth-screen state shape and the bug-prone password update path. Extend the file with a pure helper-level assertion instead of trying to mount DOM UI.

```javascript
import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialState,
  createAuthDraftState,
  updateAuthDraft
} from "../src/app.js";

test("createAuthDraftState starts from current ui inputs", () => {
  const state = createInitialState();
  state.ui.usernameInput = "alice";
  state.ui.passwordInput = "secret123";

  assert.deepEqual(createAuthDraftState(state), {
    usernameInput: "alice",
    passwordInput: "secret123",
    authMode: "register"
  });
});

test("updateAuthDraft only changes the targeted auth field", () => {
  const draft = {
    usernameInput: "alice",
    passwordInput: "secret123",
    authMode: "login"
  };

  assert.deepEqual(updateAuthDraft(draft, "passwordInput", "secret1234"), {
    usernameInput: "alice",
    passwordInput: "secret1234",
    authMode: "login"
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/app.test.js`
Expected: FAIL with missing exports from `src/app.js`

- [ ] **Step 3: Write minimal implementation**

In `src/app.js`, export two small helpers that let the auth form keep a local draft during typing instead of forcing a full app-state rewrite on every keystroke.

```javascript
export function createAuthDraftState(state) {
  return {
    usernameInput: state.ui.usernameInput,
    passwordInput: state.ui.passwordInput,
    authMode: state.ui.authMode
  };
}

export function updateAuthDraft(draft, key, value) {
  return {
    ...draft,
    [key]: value
  };
}
```

Then refactor the auth rendering path to use a local draft object plus submit-time commit, instead of calling the full rerender path on every password input event.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/app.test.js`
Expected: PASS

- [ ] **Step 5: Verify the browser symptom is gone**

Run the app, type continuously in the password field, and verify:
- the page does not flash
- the input keeps focus
- typed characters are not lost


### Task 2: Replace launch-blocking demo copy in the frontend

**Files:**
- Modify: `src/app.js`
- Test: `tests/app.test.js`

- [ ] **Step 1: Write the failing test**

Add a string-level copy regression test for the highest-risk phrases that must disappear.

```javascript
test("launch copy set excludes demo-only phrases", () => {
  const copy = getLaunchCopy();

  assert.equal(JSON.stringify(copy).includes("SQLite MVP"), false);
  assert.equal(JSON.stringify(copy).includes("CURRENT FLOW"), false);
  assert.equal(JSON.stringify(copy).includes("演示账号统一测试密码"), false);
  assert.equal(JSON.stringify(copy).includes("后端 session 会记住你的登录状态"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/app.test.js`
Expected: FAIL because `getLaunchCopy` does not exist yet

- [ ] **Step 3: Write minimal implementation**

Add a small exported copy map in `src/app.js` and route the hero/auth/empty-state/match-chat labels through it.

```javascript
export function getLaunchCopy() {
  return {
    heroEyebrow: "Sanmao",
    heroTitle: "认真认识一个人，不用把开始变得太重。",
    heroBody: "先留下用户名，合适的时候再慢慢补完整资料，轻一点开始，真一点聊天。",
    authRegisterTitle: "创建你的 Sanmao 账号",
    authLoginTitle: "欢迎回来",
    authRegisterBody: "先进入看看，再决定想怎么介绍自己。",
    authLoginBody: "继续上次的浏览、匹配和聊天。",
    emptyDiscoverTitle: "今天的新推荐先看到这里",
    emptyDiscoverBody: "稍后再来看看，也可以先去消息里继续认识已经匹配的人。",
    matchTitle: "你和对方互相感兴趣",
    matchBody: "不如从一句自然的问候开始。"
  };
}
```

Update the current hard-coded strings in `renderHero`, auth-panel rendering, discover empty state, and match modal to consume this copy map.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/app.test.js`
Expected: PASS

- [ ] **Step 5: Manually verify product tone**

Open the app and confirm the homepage, auth area, empty state, and match modal no longer read like a test/demo build.


### Task 3: Extract and expand seed profile data to a dedicated backend module

**Files:**
- Create: `server/seed_data.py`
- Modify: `server/app.py`

- [ ] **Step 1: Write the data module**

Create `server/seed_data.py` and move seed definitions out of `server/app.py`. Keep starter-message compatibility, but add persona metadata for rule-based replies.

```python
SEED_USERS = [
    {
        "id": 1001,
        "username": "linqinghe",
        "gender": "female",
        "avatar_url": "...",
        "name": "林清禾",
        "age": "23",
        "city": "深圳",
        "company": "腾讯",
        "role": "产品经理",
        "school": "中山大学",
        "tags": "工作日十点半前睡 / 周末会去深圳湾骑车 / 能接受稳定关系慢慢来",
        "bio": "...",
        "persona_type": "steady_listener",
        "reply_style": "温和认真",
        "opener_style": "daily_life",
        "active_window": "evening",
        "conversation_topics": ["海边散步", "下班节奏", "认真恋爱"]
    },
]

STARTER_MESSAGES = {
    1001: [
        "看到你也在深圳，平时会去海边散步吗？",
        "我一般周末傍晚会去深圳湾走一圈。"
    ]
}
```

Populate this file up to roughly 100 profiles with varied company/role/school/city/tag/bio combinations and at least 3 clearly different persona groups.

- [ ] **Step 2: Rewire the backend import**

In `server/app.py`, replace inline seed constants with imports.

```python
from seed_data import SEED_USERS, STARTER_MESSAGES
```

Keep `ensure_seed_data()` behavior the same except for reading from the new module.

- [ ] **Step 3: Make discover use the expanded seed pool cleanly**

Confirm `ensure_seed_data()` still inserts all seeds idempotently and that `get_state_payload()` surfaces the expanded pool through the existing discover query.

- [ ] **Step 4: Verify cold-start volume manually**

Start the backend and confirm a fresh account can browse far beyond the current tiny pool without immediately exhausting discover results.


### Task 4: Add rule-based seeded auto replies to message flow

**Files:**
- Modify: `server/seed_data.py`
- Modify: `server/app.py`

- [ ] **Step 1: Add reply configuration helpers**

In `server/seed_data.py`, add persona-driven reply templates and a tiny classifier vocabulary.

```python
REPLY_TEMPLATES = {
    "steady_listener": {
        "greeting": [
            "嗨，我刚下班，看到你的消息了。",
            "你好呀，你开场比很多人自然。"
        ],
        "work_school": [
            "我现在做产品，平时节奏会紧一点，不过下班后我会尽量把时间留给生活。"
        ],
        "interest": [
            "我最近还是最常去海边散步，脑子会安静很多。"
        ],
        "compliment": [
            "你这样说会让我比较想继续聊下去。"
        ],
        "invite": [
            "如果再多聊两句感觉对，我会愿意出来喝杯咖啡。"
        ],
        "generic": [
            "这个话题我能接住，你平时也会这样想吗？"
        ]
    }
}
```

- [ ] **Step 2: Add minimal reply engine functions in `server/app.py`**

Implement small helpers that:
- find the seed profile for the other side of a match
- classify the latest user message into one of the six design categories
- choose a reply template from that seed’s persona
- avoid repeating the exact previous seeded reply

```python
def classify_message(content):
    text = content.lower()
    if any(word in text for word in ["你好", "嗨", "hello", "hi"]):
        return "greeting"
    if any(word in text for word in ["工作", "上班", "学校", "专业"]):
        return "work_school"
    if any(word in text for word in ["喜欢", "平时", "周末", "爱好", "兴趣"]):
        return "interest"
    if any(word in text for word in ["感觉你", "可爱", "真诚", "加分"]):
        return "compliment"
    if any(word in text for word in ["见面", "喝咖啡", "吃饭", "出来"]):
        return "invite"
    return "generic"
```

- [ ] **Step 3: Hook auto reply into `/api/message`**

After the user message is inserted in `server/app.py`, detect whether the other participant is a seeded user. If yes, insert exactly one immediate reply.

```python
conn.execute(
    "INSERT INTO messages (match_id, sender_id, content) VALUES (?, ?, ?)",
    (match_id, user_id, content),
)

seed_reply = build_seed_reply(conn, match_id, user_id, content)
if seed_reply:
    conn.execute(
        "INSERT INTO messages (match_id, sender_id, content) VALUES (?, ?, ?)",
        (match_id, seed_reply["sender_id"], seed_reply["content"]),
    )
```

Keep the constraints from the spec:
- one user message → at most one seeded reply
- no reply loops
- no async queue

- [ ] **Step 4: Verify persona contrast manually**

Send messages to at least three different seeded matches and confirm their reply tone is observably different across persona types.


### Task 5: Run full verification for launch-polish scope

**Files:**
- Test: `tests/app.test.js`
- Test: `tests/matchLogic.test.js`
- Modify if needed: `src/app.js`
- Modify if needed: `server/app.py`
- Modify if needed: `server/seed_data.py`

- [ ] **Step 1: Run frontend tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Run backend manual checklist**

Verify all of the following with the running app:
- password typing does not rerender or drop focus
- key launch screens no longer contain demo/test/dev wording
- a fresh account sees about 100 realistic candidates instead of a nearly empty pool
- liking a seeded user can still create a match and starter messages still appear
- sending one message to a seeded match creates one seeded reply
- no infinite reply chain happens after refresh or repeat sends

- [ ] **Step 4: Record any final fixups and rerun verification**

If any item fails, make the smallest fix necessary, then rerun:
- `npm test`
- `npm run build`
- the manual checklist above
