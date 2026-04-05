# Password Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add password-based authentication to the matching chat MVP so existing accounts cannot be taken over by anyone who only knows a username.

**Architecture:** Extend the existing SQLite + Python HTTP server auth model by adding password hashes to users, validating credentials on register/login, and keeping the current opaque session-cookie flow for authenticated endpoints. Update the plain JS frontend auth form to collect password input in both register and login modes while preserving the rest of the app flow unchanged.

**Tech Stack:** Python HTTPServer, SQLite, plain JavaScript, Node test runner, existing npm build script

---

## File map

- Modify: `server/schema.sql`
  - Add `password_hash` column to `users`
- Modify: `server/app.py`
  - Add password hashing/verification helpers
  - Update seed user bootstrapping to include a shared demo password hash
  - Update register/login validation and tighten cookie/CORS handling
- Modify: `src/app.js`
  - Add password input state and submit it in register/login flows
  - Show minimal seed-account password hint if desired
- Modify: `tests/app.test.js`
  - Update `createInitialState()` expectations for new auth form state
- Modify: `scripts/build.mjs` only if build breaks after frontend changes
- Verification only: run Python syntax check, `npm test`, `npm run build`, and the API end-to-end script with password credentials

### Task 1: Add password storage to schema

**Files:**
- Modify: `server/schema.sql`
- Test: runtime DB bootstrap via `python3 /Users/wumin/match-demo/server/app.py`

- [ ] **Step 1: Add `password_hash` to the users table definition**

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: Keep all other tables unchanged**

```sql
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

- [ ] **Step 3: Start the server once to verify schema bootstrap still works**

Run:
```bash
python3 /Users/wumin/match-demo/server/app.py
```
Expected: server starts without SQLite schema errors (stop it manually after confirming startup)

- [ ] **Step 4: Commit**

```bash
git add server/schema.sql
git commit -m "feat: add password hash storage"
```

### Task 2: Add password hashing and secure backend auth checks

**Files:**
- Modify: `server/app.py`
- Test: `python3 -m py_compile /Users/wumin/match-demo/server/app.py`

- [ ] **Step 1: Add the failing credential test scenario to your manual verification checklist before coding**

```python
# Manual backend expectations to implement:
# 1. register({username, password}) succeeds and sets session cookie
# 2. login({username, wrong_password}) returns auth error
# 3. login({username, correct_password}) succeeds
```

- [ ] **Step 2: Add password hashing helpers near the cookie/session helpers**

```python
import hashlib
import hmac
import secrets


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"{salt}${digest.hex()}"


def verify_password(password, password_hash):
    if not password_hash or "$" not in password_hash:
        return False
    salt, expected = password_hash.split("$", 1)
    actual = hash_password(password, salt).split("$", 1)[1]
    return hmac.compare_digest(actual, expected)
```

- [ ] **Step 3: Tighten cookie construction for production-safe sessions**

```python
def build_session_cookie(token, expires=""):
    parts = [f"{SESSION_COOKIE_NAME}={token}", "Path=/", "HttpOnly", "SameSite=Lax"]
    if os.environ.get("SANMAO_SECURE_COOKIE") == "1":
        parts.append("Secure")
    if expires:
        parts.append(f"Expires={expires}")
    return "; ".join(parts)
```

- [ ] **Step 4: Remove permissive wildcard CORS from JSON responses**

```python
def json_response(handler, status, payload, headers=None):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    if headers:
        for key, value in headers:
            handler.send_header(key, value)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)
```

- [ ] **Step 5: Update seed user creation to include a shared demo password hash**

```python
DEMO_PASSWORD = os.environ.get("SANMAO_DEMO_PASSWORD", "demo123456")


def ensure_seed_data():
    conn = get_conn()
    demo_password_hash = hash_password(DEMO_PASSWORD)
    for user in SEED_USERS:
        conn.execute(
            "INSERT OR IGNORE INTO users (id, username, password_hash) VALUES (?, ?, ?)",
            (user["id"], user["username"], demo_password_hash),
        )
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ? AND (password_hash = '' OR password_hash IS NULL)",
            (demo_password_hash, user["id"]),
        )
```

- [ ] **Step 6: Update register to require password and store hash**

```python
if self.path == "/api/register":
    payload = load_json(self)
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    if not username:
        return json_response(self, 400, {"error": "username_required"})
    if len(password) < 6:
        return json_response(self, 400, {"error": "password_too_short"})

    conn = get_conn()
    exists = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if exists:
        conn.close()
        return json_response(self, 409, {"error": "username_taken"})

    cursor = conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, hash_password(password)),
    )
```

- [ ] **Step 7: Update login to verify password before creating a session**

```python
if self.path == "/api/login":
    payload = load_json(self)
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    if not username:
        return json_response(self, 400, {"error": "username_required"})
    if not password:
        return json_response(self, 400, {"error": "password_required"})

    conn = get_conn()
    user = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if not user or not verify_password(password, user["password_hash"]):
        conn.close()
        return json_response(self, 401, {"error": "invalid_credentials"})
```

- [ ] **Step 8: Run Python syntax verification**

Run:
```bash
python3 -m py_compile /Users/wumin/match-demo/server/app.py
```
Expected: no output, exit code 0

- [ ] **Step 9: Commit**

```bash
git add server/app.py
git commit -m "feat: require password auth for sessions"
```

### Task 3: Add password input to frontend auth flows

**Files:**
- Modify: `src/app.js`
- Test: `tests/app.test.js`

- [ ] **Step 1: Extend initial state with password input and hint state**

```javascript
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
```

- [ ] **Step 2: Update the auth form to render a password field in both modes**

```javascript
<form id="auth-form" class="username-form">
  <label>
    用户名
    <input id="username-input" name="username" value="${escapeAttribute(state.ui.usernameInput)}" required>
  </label>
  <label>
    密码
    <input id="password-input" name="password" type="password" value="${escapeAttribute(state.ui.passwordInput)}" minlength="6" required>
  </label>
  <div class="status-row">
    <span class="status-text">${safeText(state.ui.usernameStatus, isLogin ? "输入用户名和密码后登录" : "设置用户名和密码后注册")}</span>
    ${state.ui.usernameError ? `<span class="error-text">${escapeHtml(state.ui.usernameError)}</span>` : ""}
  </div>
</form>
```

- [ ] **Step 3: Submit password on register/login requests**

```javascript
const password = state.ui.passwordInput;

const result = await apiFetch("/api/register", {
  method: "POST",
  body: JSON.stringify({
    username: state.ui.usernameInput.trim(),
    password
  })
});
```

```javascript
const result = await apiFetch("/api/login", {
  method: "POST",
  body: JSON.stringify({
    username,
    password: state.ui.passwordInput
  })
});
```

- [ ] **Step 4: Reset password input and handle new backend auth errors**

```javascript
ui: {
  ...state.ui,
  passwordInput: "",
  usernameError:
    error.message === "invalid_credentials"
      ? "用户名或密码错误"
      : error.message === "password_too_short"
        ? "密码至少 6 位"
        : "登录失败"
}
```

- [ ] **Step 5: Bind the password input field to state**

```javascript
const passwordInput = root.querySelector("#password-input");
if (passwordInput) {
  passwordInput.addEventListener("input", (event) => {
    setState({
      ...state,
      ui: {
        ...state.ui,
        passwordInput: event.target.value,
        usernameError: ""
      }
    });
  });
}
```

- [ ] **Step 6: Add optional demo password note under the auth form**

```javascript
<p class="panel-copy">演示账号可使用统一测试密码：demo123456</p>
```

- [ ] **Step 7: Update the app state unit test to match the new auth form shape**

```javascript
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
```

- [ ] **Step 8: Run the frontend-focused unit tests**

Run:
```bash
npm test -- --test-name-pattern="createInitialState|escapeHtml|sanitizeImageUrl"
```
Expected: PASS for the targeted `tests/app.test.js` checks

- [ ] **Step 9: Commit**

```bash
git add src/app.js tests/app.test.js
git commit -m "feat: add password fields to auth flow"
```

### Task 4: Verify end-to-end password auth behavior

**Files:**
- Verify: `server/app.py`
- Verify: `src/app.js`
- Verify: `tests/app.test.js`

- [ ] **Step 1: Run Python syntax verification again after all edits**

Run:
```bash
python3 -m py_compile /Users/wumin/match-demo/server/app.py
```
Expected: no output, exit code 0

- [ ] **Step 2: Run the full JS test suite**

Run:
```bash
npm test
```
Expected: all tests pass, 0 failures

- [ ] **Step 3: Run the production build**

Run:
```bash
npm run build
```
Expected: build exits 0

- [ ] **Step 4: Run API end-to-end verification with password auth**

Run:
```bash
python3 - <<'PY'
import os, subprocess, tempfile, time, json, urllib.request, urllib.error, http.cookiejar

db_fd, db_path = tempfile.mkstemp(suffix='.db')
os.close(db_fd)
port = '8124'
env = os.environ.copy()
env['SANMAO_API_PORT'] = port
env['SANMAO_DB_PATH'] = db_path
proc = subprocess.Popen(['python3', '/Users/wumin/match-demo/server/app.py'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
base = f'http://127.0.0.1:{port}'
for _ in range(50):
    try:
        urllib.request.urlopen(base + '/api/health', timeout=1)
        break
    except Exception:
        time.sleep(0.1)
else:
    proc.kill()
    raise SystemExit('server_failed_to_start')
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def request(path, method='GET', data=None):
    payload = None
    headers = {}
    if data is not None:
        payload = json.dumps(data).encode()
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(base + path, data=payload, headers=headers, method=method)
    try:
        with opener.open(req, timeout=3) as resp:
            return resp.status, json.loads(resp.read().decode() or '{}')
    except urllib.error.HTTPError as exc:
        body = exc.read().decode() or '{}'
        return exc.code, json.loads(body)

try:
    username = f'pw_user_{int(time.time())}'
    password = 'strongpass123'

    status, payload = request('/api/register', 'POST', {'username': username, 'password': password})
    assert status == 201
    status, payload = request('/api/logout', 'POST', {})
    assert status == 200
    status, payload = request('/api/login', 'POST', {'username': username, 'password': 'wrongpass'})
    assert status == 401 and payload['error'] == 'invalid_credentials'
    status, payload = request('/api/login', 'POST', {'username': username, 'password': password})
    assert status == 200
    status, payload = request('/api/state')
    assert status == 200 and 'profile' in payload
    print('Password auth verification passed')
finally:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    if os.path.exists(db_path):
        os.remove(db_path)
PY
```
Expected: script prints `Password auth verification passed`

- [ ] **Step 5: Commit final verification-safe state**

```bash
git add server/schema.sql server/app.py src/app.js tests/app.test.js
git commit -m "fix: harden trial auth with passwords"
```

## Self-review

- Spec coverage check:
  - Password-based register/login: covered in Task 2 + Task 3
  - Password hash storage: covered in Task 1 + Task 2
  - Existing session flow retained: covered in Task 2
  - Frontend auth field updates: covered in Task 3
  - Verification requirements: covered in Task 4
- Placeholder scan: no TODO/TBD placeholders remain
- Type consistency:
  - Backend request keys use `username` and `password`
  - Frontend state uses `ui.passwordInput`
  - Invalid login error uses `invalid_credentials`

Plan complete and saved to `docs/superpowers/plans/2026-03-30-password-auth-hardening.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
