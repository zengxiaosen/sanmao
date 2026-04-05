# Growth Polish and Match Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add launch-facing growth polish to the current frontend-only Sanmao app by removing remaining demo product copy, de-templating the seed deck, deduplicating avatars, and adding recommendation reasons, icebreaker suggestions, and light compatibility copy that make users more willing to send a first message.

**Architecture:** Keep the current plain-JS single-file app structure in `src/app.js` and static seed data in `src/data.js`. Add a small pure-data enrichment layer for seed profiles, expose pure helper functions for recommendation reasons / icebreakers / compatibility copy so they can be tested without the DOM, and render those outputs inside the existing discover and match/chat panels with minimal structural change.

**Tech Stack:** Vanilla JavaScript ES modules, Node test runner, static frontend data model

---

## File Structure

- `src/data.js`
  - Keep the seed profile deck and demo thread fixtures.
  - Expand each profile with richer, less repetitive metadata used by recommendation and icebreaker generation.
  - Replace repeated avatar URLs with unique values across the visible seed deck.
- `src/app.js`
  - Add pure helper exports for launch copy, recommendation reasons, icebreaker suggestions, compatibility copy, and seed quality checks.
  - Update discover card rendering and match/chat rendering to show the new product-facing blocks.
  - Remove remaining demo/developer-facing product copy from hero, quota, empty states, and matches.
- `tests/app.test.js`
  - New file in this worktree.
  - Lock copy cleanup, avatar dedupe, recommendation generation, and icebreaker output.
- `tests/matchLogic.test.js`
  - Leave existing matching tests intact unless a helper import needs to be extended.

---

### Task 1: Add regression tests for growth polish helpers

**Files:**
- Create: `tests/app.test.js`
- Modify: `src/app.js`

- [ ] **Step 1: Write the failing test file**

Create `tests/app.test.js` with focused pure-function tests for the new growth layer.

```javascript
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCompatibilitySummary,
  buildIcebreakerSuggestions,
  buildRecommendationReasons,
  getLaunchCopy,
  getSeedQualityReport
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

test("seed quality report flags no duplicate avatars", () => {
  const report = getSeedQualityReport(seedProfiles);

  assert.deepEqual(report.duplicateAvatarUrls, []);
  assert.equal(report.totalProfiles >= 12, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/app.test.js`
Expected: FAIL with missing file and missing exports from `src/app.js`

- [ ] **Step 3: Add minimal exports in `src/app.js`**

Add placeholder exports so the test file can import real symbols before the richer implementation lands.

```javascript
export function getLaunchCopy() {
  return {};
}

export function buildRecommendationReasons() {
  return [];
}

export function buildIcebreakerSuggestions() {
  return [];
}

export function buildCompatibilitySummary() {
  return "";
}

export function getSeedQualityReport(seedProfiles) {
  return {
    totalProfiles: seedProfiles.length,
    duplicateAvatarUrls: []
  };
}
```

- [ ] **Step 4: Run test to verify it still fails for behavior**

Run: `npm test -- tests/app.test.js`
Expected: FAIL on assertions about copy content and array lengths

- [ ] **Step 5: Commit the red test scaffold**

```bash
git add tests/app.test.js src/app.js
git commit -m "test: add growth polish helper coverage"
```

---

### Task 2: Remove remaining demo-facing product copy

**Files:**
- Modify: `src/app.js`
- Test: `tests/app.test.js`

- [ ] **Step 1: Replace hero and onboarding copy with a launch-facing copy map**

In `src/app.js`, add a single copy source and route the current hard-coded product strings through it.

```javascript
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
    emptyMatchBody: "先去今日推荐里看看，也许下一次喜欢就会有回应。"
  };
}
```

Then update these rendering branches to consume it:
- `renderHero`
- `renderProfileForm`
- `renderQuota`
- the empty branch inside `renderCard`
- the empty branch inside `renderMatches`

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/app.test.js`
Expected: PASS for `launch copy excludes demo-only phrases`; other growth tests still FAIL

- [ ] **Step 3: Manually remove the leftover hard-coded demo labels**

Replace these current phrases in `src/app.js` with copy-map values or direct product-facing text:

```javascript
"假数据演示版，完整体验资料填写、刷卡、匹配和聊天闭环。"
"演示版资料只保存在你的浏览器"
"TODAY"
"TODAY COMPLETE"
"演示版会在明天自动重置，你也可以刷新页面看看已匹配聊天。"
"MATCHES"
"命中预设的双向喜欢后，这里会出现聊天入口。"
```

- [ ] **Step 4: Run all frontend tests**

Run: `npm test`
Expected: PASS for existing `tests/matchLogic.test.js` and the new copy test in `tests/app.test.js`

- [ ] **Step 5: Commit the copy cleanup**

```bash
git add src/app.js tests/app.test.js
git commit -m "feat: replace demo-facing product copy"
```

---

### Task 3: De-template the seed deck and remove duplicate avatars

**Files:**
- Modify: `src/data.js`
- Modify: `src/app.js`
- Test: `tests/app.test.js`

- [ ] **Step 1: Add a seed quality helper test for avatar duplication**

Extend `tests/app.test.js` with a direct fixture quality check.

```javascript
test("seed quality report counts duplicate avatar urls", () => {
  const report = getSeedQualityReport(seedProfiles);

  assert.equal(report.totalProfiles, seedProfiles.length);
  assert.deepEqual(report.duplicateAvatarUrls, []);
});
```

- [ ] **Step 2: Run the focused test to capture the current failure**

Run: `npm test -- tests/app.test.js`
Expected: FAIL because the current `seedProfiles` deck contains repeated avatar URLs

- [ ] **Step 3: Enrich `src/data.js` profiles and dedupe avatars**

For each visible profile in `seedProfiles`, make these data changes directly in `src/data.js`:
- replace repeated `avatar` values so each profile has a unique image URL
- vary repeated company / role / school combinations where they read too templated
- add metadata fields used by the recommendation layer

Use this shape for every profile object you touch:

```javascript
{
  id: "p-01",
  avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
  name: "林清禾",
  age: 25,
  city: "深圳",
  company: "腾讯",
  role: "产品经理",
  school: "中山大学",
  height: "165cm",
  tags: ["看展", "散步", "慢热"],
  bio: "在南山做产品，工作节奏快，但还是想把晚上的时间留给真实生活。熟一点之后会很愿意分享自己。",
  prompt: "比起热闹，我更喜欢两个人慢慢把一顿饭吃完。",
  vibe: "steady",
  openerStyle: "daily",
  idealFirstMove: "从最近的生活节奏聊起",
  conversationHooks: ["深圳湾散步", "周末看展", "下班后的安静时刻"]
}
```

- [ ] **Step 4: Implement the quality report helper in `src/app.js`**

Add a pure duplicate-avatar detector that the test can assert on.

```javascript
export function getSeedQualityReport(seedProfiles) {
  const avatarCounts = seedProfiles.reduce((counts, profile) => {
    counts[profile.avatar] = (counts[profile.avatar] || 0) + 1;
    return counts;
  }, {});

  return {
    totalProfiles: seedProfiles.length,
    duplicateAvatarUrls: Object.entries(avatarCounts)
      .filter(([, count]) => count > 1)
      .map(([avatar]) => avatar)
  };
}
```

- [ ] **Step 5: Run all tests and commit**

Run: `npm test`
Expected: PASS with zero duplicate avatar URLs reported

```bash
git add src/data.js src/app.js tests/app.test.js
git commit -m "feat: de-template seed deck and dedupe avatars"
```

---

### Task 4: Generate recommendation reasons for each discover card

**Files:**
- Modify: `src/app.js`
- Test: `tests/app.test.js`

- [ ] **Step 1: Add the recommendation helper implementation**

In `src/app.js`, implement a pure helper that returns exactly three human-readable reasons based on shared or complementary metadata.

```javascript
export function buildRecommendationReasons(viewer, profile) {
  const reasons = [];

  if (profile.conversationHooks?.length) {
    reasons.push(`她的生活线索很具体，像“${profile.conversationHooks[0]}”这种点很适合自然开场。`);
  }

  if (profile.vibe === "steady") {
    reasons.push("她的表达偏稳定慢热，更适合认真聊，而不是只停在一句招呼。);
  }

  if (profile.idealFirstMove) {
    reasons.push(`这类匹配更适合从“${profile.idealFirstMove}”切进去，不容易尬住。`);
  }

  return reasons.slice(0, 3);
}
```

- [ ] **Step 2: Fix the helper so the test passes with stable output**

Make the helper always return exactly three strings by adding fallback branches when metadata is sparse.

```javascript
while (reasons.length < 3) {
  reasons.push("她的资料信息比较完整，更容易找到自然的话题往下聊。");
}

return reasons.slice(0, 3);
```

- [ ] **Step 3: Render recommendation reasons inside discover cards**

Update `renderCard(profile)` in `src/app.js` to show the returned bullets below the bio and above the action buttons.

```javascript
const recommendationReasons = buildRecommendationReasons(state.profile, profile);

<div class="match-reason-block">
  <div class="section-label">为什么值得聊</div>
  <ul>
    ${recommendationReasons.map((reason) => `<li>${reason}</li>`).join("")}
  </ul>
</div>
```

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 5: Commit the recommendation card**

```bash
git add src/app.js tests/app.test.js
git commit -m "feat: add recommendation reasons to discover cards"
```

---

### Task 5: Generate three icebreaker suggestions for matched chats

**Files:**
- Modify: `src/app.js`
- Test: `tests/app.test.js`

- [ ] **Step 1: Add the icebreaker helper implementation**

In `src/app.js`, add a pure helper that generates exactly three first-message suggestions from the matched profile metadata.

```javascript
export function buildIcebreakerSuggestions(profile) {
  const hooks = profile.conversationHooks || [];

  return [
    `看到你提到${hooks[0] || "最近的生活节奏"}，这个点是怎么留下来的？`,
    `如果第一次聊天不想太有压力，你会更愿意先聊${profile.idealFirstMove || "最近的日常"}吗？`,
    `${profile.prompt || "你这句自我介绍"}，这背后通常是什么样的生活状态？`
  ];
}
```

- [ ] **Step 2: Render the suggestions in the chat panel before the message list**

Inside `renderChat()` in `src/app.js`, when `state.activeChatId` is present, render a compact suggestion block.

```javascript
const activeProfile = seedProfiles.find((profile) => profile.id === state.activeChatId);
const icebreakers = buildIcebreakerSuggestions(activeProfile);

<div class="icebreaker-block">
  <div class="section-label">开场建议</div>
  <div class="icebreaker-list">
    ${icebreakers.map((item) => `<button type="button" class="icebreaker-chip" data-icebreaker="${item}">${item}</button>`).join("")}
  </div>
</div>
```

- [ ] **Step 3: Wire the suggestion chips into the composer**

In the event-binding section of `mountApp`, add a click handler that copies the selected suggestion into `state.draftMessage` and rerenders.

```javascript
root.querySelectorAll("[data-icebreaker]").forEach((button) => {
  button.addEventListener("click", () => {
    state.draftMessage = button.dataset.icebreaker;
    render();
  });
});
```

- [ ] **Step 4: Run tests and manual verification**

Run: `npm test`
Expected: PASS

Then open a matched chat and verify:
- three suggestion chips are visible
- clicking one fills the composer
- the chip text reads like a human opener, not system instructions

- [ ] **Step 5: Commit the icebreaker flow**

```bash
git add src/app.js tests/app.test.js
 git commit -m "feat: add match icebreaker suggestions"
```

---

### Task 6: Add a light compatibility summary to the match experience

**Files:**
- Modify: `src/app.js`
- Test: `tests/app.test.js`

- [ ] **Step 1: Implement the compatibility summary helper**

Add a pure function in `src/app.js` that returns one short product-facing sentence.

```javascript
export function buildCompatibilitySummary(viewer, profile) {
  if (profile.vibe === "steady") {
    return "你们都更适合从轻一点的日常开场，慢慢把熟悉感聊出来。";
  }

  if (profile.vibe === "warm") {
    return "这组匹配更容易从情绪和生活感受切进去，开场可以稍微主动一点。";
  }

  return "先从一个具体的小话题开始，会比直接问很多问题更自然。";
}
```

- [ ] **Step 2: Render it in the match and chat view**

Use the helper in both places where a match is emphasized:
- the non-empty branch of `renderMatches()`
- the active branch of `renderChat()`

```javascript
<p class="compatibility-copy">${buildCompatibilitySummary(state.profile, activeProfile)}</p>
```

- [ ] **Step 3: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 4: Manual tone check**

Open the app and confirm the compatibility sentence:
- feels like guidance, not fortune telling
- does not mention algorithm, demo, system, or testing
- reads as one short product sentence

- [ ] **Step 5: Commit the compatibility polish**

```bash
git add src/app.js tests/app.test.js
 git commit -m "feat: add light compatibility summaries"
```

---

### Task 7: Run full verification and prepare execution handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-04-01-growth-polish-match-activation.md`

- [ ] **Step 1: Run the full frontend verification suite**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 2: Do a manual product walkthrough**

Verify these visible outcomes in the browser:
- hero and onboarding copy no longer mention demo or test framing
- discover cards show three recommendation reasons
- visible seed avatars are not repeated
- matched chat shows three clickable icebreaker suggestions
- match/chat view shows one light compatibility sentence

- [ ] **Step 3: Self-review the plan against the approved design**

Check that the plan covers all approved work:
- seed quality fix with avatar dedupe
- recommendation reasons
- icebreaker suggestions
- light compatibility copy
- demo-facing copy cleanup

- [ ] **Step 4: Commit the finished plan if it changed during review**

```bash
git add docs/superpowers/plans/2026-04-01-growth-polish-match-activation.md
git commit -m "docs: finalize growth polish implementation plan"
```
