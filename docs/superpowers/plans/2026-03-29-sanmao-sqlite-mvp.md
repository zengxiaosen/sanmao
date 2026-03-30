# Sanmao SQLite MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Sanmao from a static demo into a lightweight server-backed product using SQLite for real usernames, profiles, likes, matches, and messages.

**Architecture:** Add a small Python backend using the standard library plus SQLite on the remote server. Keep the frontend app-style UI, but replace fake local-only flows with API-driven registration, profile state, likes, matches, and messages.

**Tech Stack:** HTML, CSS, vanilla JavaScript ES modules, Python standard library HTTP server, SQLite, systemd

---

## Chunk 1: Backend Foundation

### Task 1: Build SQLite-backed API server

**Files:**
- Create: `server/app.py`
- Create: `server/db.py`
- Create: `server/schema.sql`

- [ ] Define schema and init flow
- [ ] Implement username registration and uniqueness check
- [ ] Implement profile, likes, matches, and messages APIs

## Chunk 2: Frontend Flow Rewrite

### Task 2: Replace local-only onboarding with API-driven flow

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`

- [ ] Change onboarding to username-first
- [ ] Gate message sending on completed profile
- [ ] Split tabs cleanly into discover / liked / messages / profile
- [ ] Fix today-complete timing

## Chunk 3: Deployment

### Task 3: Deploy backend and frontend together on the server

**Files:**
- Modify deployment/service configuration

- [ ] Copy backend files to server
- [ ] Start API and static service together
- [ ] Verify public site and API
