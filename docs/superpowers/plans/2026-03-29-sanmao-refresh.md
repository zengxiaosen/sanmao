# Sanmao Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Sanmao into a more polished, product-like dating demo with a profile drawer, liked list, stronger match panel, and refined visual system.

**Architecture:** Keep the app static and browser-only, but split responsibilities more clearly: pure logic helpers for list derivation and UI state, then a render layer for hero, swipe card, drawer, liked list, matches, and chat. Preserve the existing persistence model in local storage so the deployed server stays simple.

**Tech Stack:** HTML, CSS, vanilla JavaScript ES modules, Node test runner, systemd-hosted static deployment

---

## Chunk 1: Extended Logic Coverage

### Task 1: Add failing tests for the upgraded product panels

**Files:**
- Modify: `tests/matchLogic.test.js`
- Modify: `src/matchLogic.js`

- [ ] **Step 1: Write the failing test**

Add tests for:
- `getCurrentCandidate` returning the first card or `null`
- `getProfilesByIds` preserving the requested order

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with missing exports

- [ ] **Step 3: Write minimal implementation**

Implement the two pure helpers without changing existing behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

## Chunk 2: UI Structure Refactor

### Task 2: Rebuild the single-page layout

**Files:**
- Modify: `src/app.js`
- Modify: `src/data.js`
- Modify: `styles.css`

- [ ] **Step 1: Refactor render structure**

Separate render helpers for hero, quota, swipe card, profile drawer, liked list, match list, and chat.

- [ ] **Step 2: Add richer product modules**

Introduce the detail drawer, liked list panel, better quota progress, and stronger empty states.

- [ ] **Step 3: Rework visual system**

Apply a younger, lighter product aesthetic with stronger hierarchy and motion.

- [ ] **Step 4: Manually verify the new structure**

Check onboarding, drawer open/close, like/pass flow, match modal, and chat open/close.

## Chunk 3: Verification And Redeploy

### Task 3: Ship the refreshed version

**Files:**
- Modify: `scripts/build.mjs` (only if needed)

- [ ] **Step 1: Run full verification**

Run:
- `npm test`
- `npm run build`

- [ ] **Step 2: Deploy refreshed build to the server**

Upload the `dist/` files to `/tmp/sanmao-dist` and execute `/opt/sanmao/deploy.sh`.

- [ ] **Step 3: Verify production URL**

Run `curl -I http://120.24.144.153` and confirm `HTTP 200`.
