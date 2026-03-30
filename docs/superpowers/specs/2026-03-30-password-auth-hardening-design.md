# Password Auth Hardening Design

## Goal
Add the minimum authentication hardening needed to stop username-only account takeover while preserving the existing lightweight matching/chat MVP architecture.

## Scope
- Add password-based registration and login
- Store password hashes on the server
- Keep the existing SQLite-backed session cookie model
- Keep current product flow unchanged after login
- Do not add password reset, email, SMS, OAuth, or account recovery

## Design

### Data model
- Extend `users` with `password_hash`
- New users must always register with a password
- Seed/demo users get a shared test password so they remain usable in trial/demo flows

### Backend API
- `POST /api/register`
  - Request: `{ username, password }`
  - Validate username/password presence
  - Hash password server-side before storing
  - Create session on success and set cookie
- `POST /api/login`
  - Request: `{ username, password }`
  - Verify password against stored hash before creating session
  - Return a generic auth failure for invalid credentials
- `POST /api/logout`
  - Keep existing behavior
- `GET /api/me`, `GET /api/state`, `POST /api/like`, `POST /api/message`, `PUT /api/profile`
  - Remain session-based only

### Security tightening
- Keep `HttpOnly` and `SameSite=Lax` on the session cookie
- Add `Secure` when running in HTTPS/non-local production contexts
- Remove permissive `Access-Control-Allow-Origin: *` behavior and treat the app as same-origin
- Keep current server-side match ownership check for messaging

### Frontend UX
- Auth screen uses two fields in both modes:
  - username
  - password
- Keep the current register/login toggle
- Register success still logs the user in immediately
- Login restores the existing account
- No password recovery flow
- Optional small note for demo/seed accounts that they use a shared test password

### Validation and errors
- Registration errors:
  - username exists
  - missing/invalid password
- Login errors:
  - invalid username/password
- Avoid overly specific login errors that expose account enumeration details

### Verification
- Register requires password
- Login requires correct password
- Wrong password is rejected
- Session survives refresh
- Logout requires re-login
- Existing discover → like → match → profile → message loop still works
- Run `npm test`
- Run `npm run build`
- Re-run API end-to-end verification with password auth

## Non-goals
- Password reset
- Email or SMS verification
- Multi-device security management
- Rate limiting / lockouts
- CSRF token system beyond current same-site posture
