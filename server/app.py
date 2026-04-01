import hashlib
import hmac
import json
import mimetypes
import os
import posixpath
import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from db import ensure_db, get_conn
from seed_data import REPLY_TEMPLATES, SEED_USERS, STARTER_MESSAGES


HOST = "0.0.0.0"
PORT = int(os.environ.get("SANMAO_API_PORT", "80"))
STATIC_ROOT = os.environ.get(
    "SANMAO_STATIC_ROOT",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..")),
)
STATIC_ROOT_ABS = os.path.abspath(STATIC_ROOT)
SESSION_COOKIE_NAME = "sanmao_session"
SESSION_TTL_SECONDS = int(os.environ.get("SANMAO_SESSION_TTL_SECONDS", str(60 * 60 * 24 * 14)))
PASSWORD_HASH_ITERATIONS = int(os.environ.get("SANMAO_PASSWORD_HASH_ITERATIONS", "600000"))
DEMO_PASSWORD = os.environ.get("SANMAO_DEMO_PASSWORD", "demo123456")
MESSAGE_CATEGORY_KEYWORDS = {
    "greeting": ["你好", "嗨", "哈喽", "hello", "hi", "hey"],
    "work_school": ["工作", "上班", "学校", "专业", "公司", "加班", "职业"],
    "interest": ["喜欢", "平时", "周末", "爱好", "兴趣", "下班", "休息"],
    "compliment": ["感觉你", "可爱", "真诚", "加分", "温柔", "有趣", "好看"],
    "invite": ["见面", "喝咖啡", "吃饭", "出来", "约", "散步"],
}
SEED_USERS_BY_ID = {user["id"]: user for user in SEED_USERS}




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


def load_json(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if not length:
        return {}
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8"))


def parse_cookies(handler):
    cookie_header = handler.headers.get("Cookie", "")
    cookies = SimpleCookie()
    if cookie_header:
        cookies.load(cookie_header)
    return cookies


def build_session_cookie(token, expires=""):
    parts = [f"{SESSION_COOKIE_NAME}={token}", "Path=/", "HttpOnly", "SameSite=Lax"]
    if os.environ.get("SANMAO_SECURE_COOKIE") == "1":
        parts.append("Secure")
    if expires:
        parts.append(f"Expires={expires}")
    return "; ".join(parts)


def utc_now():
    return datetime.now(timezone.utc)


def format_cookie_expires(timestamp):
    return timestamp.astimezone(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")


def session_expiry_timestamp():
    return utc_now() + timedelta(seconds=SESSION_TTL_SECONDS)


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_HASH_ITERATIONS,
    )
    return f"{salt}${digest.hex()}"


def verify_password(password, password_hash):
    if not password_hash or "$" not in password_hash:
        return False
    salt, expected = password_hash.split("$", 1)
    actual = hash_password(password, salt).split("$", 1)[1]
    return hmac.compare_digest(actual, expected)


def create_session(conn, user_id):
    token = secrets.token_hex(24)
    expires_at = session_expiry_timestamp()
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        (token, user_id, expires_at.isoformat()),
    )
    return token, format_cookie_expires(expires_at)


def get_session_user(handler, conn):
    token = parse_cookies(handler).get(SESSION_COOKIE_NAME)
    if not token:
        return None

    cleanup_expired_sessions(conn)
    now = utc_now().isoformat()
    row = conn.execute(
        """
        SELECT u.id, u.username
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
          AND s.expires_at > ?
        """,
        (token.value, now),
    ).fetchone()
    return dict(row) if row else None


def clear_session(conn, handler):
    token = parse_cookies(handler).get(SESSION_COOKIE_NAME)
    if token:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token.value,))
    return build_session_cookie("", "Thu, 01 Jan 1970 00:00:00 GMT")


def cleanup_expired_sessions(conn):
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (utc_now().isoformat(),))


def require_auth(handler):
    conn = get_conn()
    session_user = get_session_user(handler, conn)
    if not session_user:
        conn.close()
        json_response(handler, 401, {"error": "unauthorized"})
        return None, None
    return conn, session_user


def row_to_profile(row):
    return {
        "user_id": row["user_id"],
        "username": row["username"],
        "gender": row["gender"],
        "avatar_url": row["avatar_url"],
        "name": row["name"],
        "age": row["age"],
        "city": row["city"],
        "company": row["company"],
        "role": row["role"],
        "school": row["school"],
        "tags": row["tags"],
        "bio": row["bio"],
        "profile_completed": bool(row["profile_completed"]),
    }


def canonical_pair(a, b):
    return (a, b) if a < b else (b, a)


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
        conn.execute(
            """
            INSERT OR IGNORE INTO profiles
            (user_id, gender, avatar_url, name, age, city, company, role, school, tags, bio, profile_completed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                user["id"],
                user["gender"],
                user["avatar_url"],
                user["name"],
                user["age"],
                user["city"],
                user["company"],
                user["role"],
                user["school"],
                user["tags"],
                user["bio"],
            ),
        )
    conn.commit()
    conn.close()


def create_match_if_needed(conn, from_user_id, to_user_id):
    reciprocal = conn.execute(
        "SELECT id FROM likes WHERE from_user_id = ? AND to_user_id = ?",
        (to_user_id, from_user_id),
    ).fetchone()
    if not reciprocal:
        return None

    user_a, user_b = canonical_pair(from_user_id, to_user_id)
    conn.execute(
        "INSERT OR IGNORE INTO matches (user_a, user_b) VALUES (?, ?)",
        (user_a, user_b),
    )
    match = conn.execute(
        "SELECT id FROM matches WHERE user_a = ? AND user_b = ?",
        (user_a, user_b),
    ).fetchone()
    return match["id"]


def get_seed_profile_for_match(conn, match_id, user_id):
    row = conn.execute(
        """
        SELECT user_a, user_b
        FROM matches
        WHERE id = ? AND (user_a = ? OR user_b = ?)
        """,
        (match_id, user_id, user_id),
    ).fetchone()
    if not row:
        return None

    other_user_id = row["user_b"] if row["user_a"] == user_id else row["user_a"]
    return SEED_USERS_BY_ID.get(other_user_id)


def classify_message(content):
    lowered = content.lower()
    for category, keywords in MESSAGE_CATEGORY_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return category
    return "generic"


def select_seed_reply(seed_user, category, last_seed_reply):
    persona_type = seed_user.get("persona_type")
    persona_templates = REPLY_TEMPLATES.get(persona_type, {})
    options = persona_templates.get(category) or persona_templates.get("generic") or []
    if not options:
        return None

    for option in options:
        if option != last_seed_reply:
            return option
    return options[0]


def build_seed_reply(conn, match_id, user_id, content):
    seed_user = get_seed_profile_for_match(conn, match_id, user_id)
    if not seed_user:
        return None

    last_seed_message = conn.execute(
        """
        SELECT content
        FROM messages
        WHERE match_id = ? AND sender_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (match_id, seed_user["id"]),
    ).fetchone()
    reply_content = select_seed_reply(
        seed_user,
        classify_message(content),
        last_seed_message["content"] if last_seed_message else None,
    )
    if not reply_content:
        return None

    return {
        "sender_id": seed_user["id"],
        "content": reply_content,
    }


def bootstrap_likes_for_new_user(conn, user_id):
    for seed_id in (1001, 1003):
        conn.execute(
            "INSERT OR IGNORE INTO likes (from_user_id, to_user_id) VALUES (?, ?)",
            (seed_id, user_id),
        )


def get_profile(conn, user_id):
    row = conn.execute(
        """
        SELECT p.*, u.username
        FROM profiles p
        JOIN users u ON u.id = p.user_id
        WHERE p.user_id = ?
        """,
        (user_id,),
    ).fetchone()
    return row_to_profile(row) if row else None


def get_state_payload(conn, user_id):
    profile = get_profile(conn, user_id)
    discover_rows = conn.execute(
        """
        SELECT p.*, u.username
        FROM profiles p
        JOIN users u ON u.id = p.user_id
        WHERE p.user_id != ?
          AND p.user_id NOT IN (
            SELECT to_user_id FROM likes WHERE from_user_id = ?
          )
        ORDER BY p.user_id
        """,
        (user_id, user_id),
    ).fetchall()

    liked_rows = conn.execute(
        """
        SELECT p.*, u.username
        FROM likes l
        JOIN profiles p ON p.user_id = l.to_user_id
        JOIN users u ON u.id = p.user_id
        WHERE l.from_user_id = ?
        ORDER BY l.created_at DESC
        """,
        (user_id,),
    ).fetchall()

    liked_by_rows = conn.execute(
        """
        SELECT p.*, u.username
        FROM likes l
        JOIN profiles p ON p.user_id = l.from_user_id
        JOIN users u ON u.id = p.user_id
        WHERE l.to_user_id = ?
          AND l.from_user_id NOT IN (
            SELECT to_user_id FROM likes WHERE from_user_id = ?
          )
        ORDER BY l.created_at DESC
        """,
        (user_id, user_id),
    ).fetchall()

    match_rows = conn.execute(
        """
        SELECT m.id AS match_id,
               CASE WHEN m.user_a = ? THEN m.user_b ELSE m.user_a END AS other_user_id
        FROM matches m
        WHERE m.user_a = ? OR m.user_b = ?
        ORDER BY m.created_at DESC
        """,
        (user_id, user_id, user_id),
    ).fetchall()

    matches = []
    for row in match_rows:
        other_profile = get_profile(conn, row["other_user_id"])
        messages = conn.execute(
            """
            SELECT sender_id, content, created_at
            FROM messages
            WHERE match_id = ?
            ORDER BY created_at ASC, id ASC
            """,
            (row["match_id"],),
        ).fetchall()
        matches.append(
            {
                "match_id": row["match_id"],
                "other": other_profile,
                "messages": [
                    {
                        "sender_id": message["sender_id"],
                        "content": message["content"],
                        "created_at": message["created_at"],
                    }
                    for message in messages
                ],
            }
        )

    return {
        "profile": profile,
        "discover": [row_to_profile(row) for row in discover_rows],
        "liked": [row_to_profile(row) for row in liked_rows],
        "liked_by": [row_to_profile(row) for row in liked_by_rows],
        "matches": matches,
    }


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        if self.path.startswith("/api/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            return

        self.send_response(200)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
        self.end_headers()

    def serve_static(self, path):
        path = path.split("?", 1)[0].split("#", 1)[0]
        decoded_path = urllib.parse.unquote(path)
        normalized_path = posixpath.normpath(decoded_path)
        raw_parts = [part for part in decoded_path.split("/") if part]
        if any(part in (".", "..") for part in raw_parts):
            return json_response(self, 404, {"error": "not_found"})

        parts = [part for part in normalized_path.split("/") if part and part not in (".", "..")]
        resolved = STATIC_ROOT_ABS
        for part in parts:
            resolved = os.path.join(resolved, part)
        resolved = os.path.abspath(resolved)

        if not resolved.startswith(STATIC_ROOT_ABS + os.sep) and resolved != STATIC_ROOT_ABS:
            return json_response(self, 404, {"error": "not_found"})

        if os.path.isdir(resolved) or not os.path.exists(resolved):
            resolved = os.path.join(STATIC_ROOT_ABS, "index.html")

        with open(resolved, "rb") as file_handle:
            body = file_handle.read()

        content_type, _ = mimetypes.guess_type(resolved)
        self.send_response(200)
        self.send_header("Content-Type", content_type or "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            return json_response(self, 200, {"ok": True})

        if parsed.path == "/api/check-username":
            username = parse_qs(parsed.query).get("username", [""])[0].strip()
            if not username:
                return json_response(self, 400, {"error": "username_required"})
            return json_response(self, 200, {"ok": True})

        if parsed.path == "/api/me":
            conn, session_user = require_auth(self)
            if not session_user:
                return None
            payload = {
                "user_id": session_user["id"],
                "username": session_user["username"],
            }
            conn.close()
            return json_response(self, 200, payload)

        if parsed.path == "/api/state":
            conn, session_user = require_auth(self)
            if not session_user:
                return None
            payload = get_state_payload(conn, session_user["id"])
            conn.close()
            return json_response(self, 200, payload)

        return self.serve_static(parsed.path)

    def do_POST(self):
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
            user_id = cursor.lastrowid
            conn.execute(
                """
                INSERT INTO profiles
                (user_id, gender, avatar_url, name, city, tags, profile_completed)
                VALUES (?, 'male', '', ?, '深圳', '', 0)
                """,
                (user_id, username),
            )
            bootstrap_likes_for_new_user(conn, user_id)
            token, cookie_expires = create_session(conn, user_id)
            conn.commit()
            conn.close()
            return json_response(
                self,
                201,
                {"user_id": user_id, "username": username},
                headers=[("Set-Cookie", build_session_cookie(token, cookie_expires))],
            )

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

            token, cookie_expires = create_session(conn, user["id"])
            conn.commit()
            conn.close()
            return json_response(
                self,
                200,
                {"user_id": user["id"], "username": user["username"]},
                headers=[("Set-Cookie", build_session_cookie(token, cookie_expires))],
            )

        if self.path == "/api/logout":
            conn = get_conn()
            expired_cookie = clear_session(conn, self)
            conn.commit()
            conn.close()
            return json_response(self, 200, {"ok": True}, headers=[("Set-Cookie", expired_cookie)])

        if self.path == "/api/like":
            payload = load_json(self)
            conn, session_user = require_auth(self)
            if not session_user:
                return None
            user_id = session_user["id"]
            try:
                target_user_id = int(payload.get("target_user_id"))
            except (TypeError, ValueError):
                conn.close()
                return json_response(self, 400, {"error": "target_user_id_required"})
            conn.execute(
                "INSERT OR IGNORE INTO likes (from_user_id, to_user_id) VALUES (?, ?)",
                (user_id, target_user_id),
            )
            match_id = create_match_if_needed(conn, user_id, target_user_id)
            if match_id and target_user_id in STARTER_MESSAGES:
                existing = conn.execute("SELECT id FROM messages WHERE match_id = ?", (match_id,)).fetchone()
                if not existing:
                    for content in STARTER_MESSAGES[target_user_id]:
                        conn.execute(
                            "INSERT INTO messages (match_id, sender_id, content) VALUES (?, ?, ?)",
                            (match_id, target_user_id, content),
                        )
            conn.commit()
            conn.close()
            return json_response(self, 200, {"matched": bool(match_id), "match_id": match_id})

        if self.path == "/api/message":
            payload = load_json(self)
            conn, session_user = require_auth(self)
            if not session_user:
                return None
            user_id = session_user["id"]
            match_id = int(payload["match_id"])
            content = str(payload.get("content", "")).strip()
            if not content:
                conn.close()
                return json_response(self, 400, {"error": "content_required"})

            profile = conn.execute(
                "SELECT profile_completed FROM profiles WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if not profile or not profile["profile_completed"]:
                conn.close()
                return json_response(self, 403, {"error": "profile_incomplete"})

            owned_match = conn.execute(
                "SELECT id FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?)",
                (match_id, user_id, user_id),
            ).fetchone()
            if not owned_match:
                conn.close()
                return json_response(self, 403, {"error": "match_forbidden"})

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
            conn.commit()
            conn.close()
            return json_response(self, 201, {"ok": True})

        return json_response(self, 404, {"error": "not_found"})

    def do_PUT(self):
        if self.path == "/api/profile":
            payload = load_json(self)
            conn, session_user = require_auth(self)
            if not session_user:
                return None
            user_id = session_user["id"]
            fields = {
                "gender": str(payload.get("gender", "")).strip(),
                "avatar_url": str(payload.get("avatar_url", "")).strip(),
                "name": str(payload.get("name", "")).strip(),
                "age": str(payload.get("age", "")).strip(),
                "city": str(payload.get("city", "")).strip(),
                "company": str(payload.get("company", "")).strip(),
                "role": str(payload.get("role", "")).strip(),
                "school": str(payload.get("school", "")).strip(),
                "tags": str(payload.get("tags", "")).strip(),
                "bio": str(payload.get("bio", "")).strip(),
            }
            profile_completed = int(
                all(
                    fields[key]
                    for key in ("gender", "name", "age", "city", "company", "role", "school", "tags", "bio")
                )
            )

            conn.execute(
                """
                UPDATE profiles
                SET gender = ?, avatar_url = ?, name = ?, age = ?, city = ?, company = ?,
                    role = ?, school = ?, tags = ?, bio = ?, profile_completed = ?
                WHERE user_id = ?
                """,
                (
                    fields["gender"],
                    fields["avatar_url"],
                    fields["name"],
                    fields["age"],
                    fields["city"],
                    fields["company"],
                    fields["role"],
                    fields["school"],
                    fields["tags"],
                    fields["bio"],
                    profile_completed,
                    user_id,
                ),
            )
            conn.commit()
            conn.close()
            return json_response(self, 200, {"ok": True, "profile_completed": bool(profile_completed)})

        return json_response(self, 404, {"error": "not_found"})


if __name__ == "__main__":
    ensure_db()
    ensure_seed_data()
    server = HTTPServer((HOST, PORT), Handler)
    server.serve_forever()
