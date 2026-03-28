# Sanmao Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static dating-demo web app with profile onboarding, swipe cards, a 30-profile daily quota, fake mutual matches, and scripted chats.

**Architecture:** Use a dependency-free static frontend with focused modules for seed data, state persistence, matching rules, and view rendering. Keep business rules separately testable in a pure logic module, then wire that module into a mobile-first single-page interface.

**Tech Stack:** HTML, CSS, vanilla JavaScript ES modules, Node test runner, Vercel static hosting

---

## Chunk 1: Project Skeleton And Testable Logic

### Task 1: Create project metadata and failing logic tests

**Files:**
- Create: `package.json`
- Create: `tests/matchLogic.test.js`
- Create: `src/matchLogic.js`

- [ ] **Step 1: Write the failing test**

Write tests for:
- daily quota reset and counting
- opposite-gender candidate filtering
- like result returning `matched: true` for seeded mutual candidates
- chat thread retrieval for matched ids

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because `src/matchLogic.js` does not yet implement required exports

- [ ] **Step 3: Write minimal implementation**

Implement pure functions:
- `getDailyState`
- `incrementViews`
- `getCandidatesForViewer`
- `registerLike`
- `getChatThread`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

## Chunk 2: Static App UI

### Task 2: Build the page shell and onboarding flow

**Files:**
- Create: `index.html`
- Create: `src/main.js`
- Create: `src/data.js`
- Create: `src/storage.js`
- Create: `src/app.js`
- Create: `styles.css`

- [ ] **Step 1: Write a failing integration-oriented test if practical**

Keep logic covered in unit tests; UI will be verified manually.

- [ ] **Step 2: Implement page structure**

Create a single-page mobile-first app shell with sections for hero, onboarding, swipe deck, quota state, match modal, and chat screen.

- [ ] **Step 3: Wire local storage and rendering**

Persist profile form, progress, likes, matches, and daily quota state.

- [ ] **Step 4: Manually verify onboarding**

Open the page locally and confirm onboarding gates access to swipe deck.

## Chunk 3: Swipe Flow, Match Flow, And Visual Polish

### Task 3: Implement swipe interactions and fake chat handoff

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`

- [ ] **Step 1: Implement swipe/decision controls**

Add like/pass buttons and card motion for mobile-style progression.

- [ ] **Step 2: Implement quota exhaustion and match modal**

Show remaining daily count and a terminal empty state at 30 views.

- [ ] **Step 3: Implement fake chat screen**

Render a scripted thread for matched profiles and support back navigation.

- [ ] **Step 4: Manually verify end-to-end**

Confirm profile submit -> swipe -> match -> chat -> refresh persistence.

## Chunk 4: Deployment Verification

### Task 4: Build and deploy

**Files:**
- Create: `vercel.json` (if needed)

- [ ] **Step 1: Run full verification**

Run:
- `npm test`
- `npm run build`

Expected: both succeed

- [ ] **Step 2: Deploy to Vercel**

Use Vercel CLI with token or existing login.

- [ ] **Step 3: Capture final URL**

Return the production URL and note any token/login requirement if deployment blocks.
