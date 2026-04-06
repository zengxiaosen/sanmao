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
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

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
SITUATION_STAGE_COPY = {
    "cold_start": {
        "label": "刚破冰",
        "nextMove": "先从资料里的具体线索切进去，让对方更容易接话。",
        "avoid": "别一上来就过度热情或直接推进见面。",
    },
    "warming": {
        "label": "正在升温",
        "nextMove": "顺着已有来回继续展开，把聊天往具体生活感推进。",
        "avoid": "别突然跳到太私密或太重的话题。",
    },
    "engaged": {
        "label": "有来有回",
        "nextMove": "可以开始试探相处节奏和更具体的偏好。",
        "avoid": "别重复问泛泛问题，把节奏聊散。",
    },
    "invite_window": {
        "label": "适合轻邀约",
        "nextMove": "把见面意向落到轻量场景或时间选择上。",
        "avoid": "别一下子把安排定得太满太重。",
    },
    "stalled": {
        "label": "需要重启节奏",
        "nextMove": "先把问题变轻，重新建立低压力回应窗口。",
        "avoid": "别继续追问或连续输出太多。",
    },
}
SEED_USERS_BY_ID = {user["id"]: user for user in SEED_USERS}


def get_demo_mode_copy(seed_user=None):
    name = seed_user.get("name") if isinstance(seed_user, dict) else "这位推荐对象"
    return {
        "badge": "演示模式",
        "description": f"当前与{name}的回复属于演示模式下的冷启动样板对话，用来展示聊天节奏，不是真人在线即时回复。",
    }


def build_distance_hint(viewer_profile, candidate_profile):
    viewer_city = str((viewer_profile or {}).get("city") or "").strip()
    candidate_city = str((candidate_profile or {}).get("city") or "").strip()
    if viewer_city and candidate_city and viewer_city == candidate_city:
        return f"你们都在{candidate_city}，同城见面成本更低，先从生活节奏聊起会更自然。"
    if viewer_city and candidate_city:
        return f"你在{viewer_city}，她在{candidate_city}，先把聊天聊深一点，再考虑跨城见面更稳。"
    if candidate_city:
        return f"她现在在{candidate_city}，先从城市节奏和日常安排切进去更容易接话。"
    return "先从彼此日常节奏聊起，确认是不是同一路人。"


def build_assistant_payload(seed_user=None):
    return {
        "title": "AI 恋爱助手",
        "mode": "dating_helper",
        "description": "帮你判断现在聊到哪一步、下一句怎么发更自然。",
        "demo_mode_copy": get_demo_mode_copy(seed_user),
    }


def is_seed_user_id(user_id):
    return user_id in SEED_USERS_BY_ID


def get_match_demo_mode(other_user_id):
    return is_seed_user_id(other_user_id)


def strip_mount_prefix(path):
    if path == "/meeting":
        return "/"
    if path.startswith("/meeting/api/"):
        return path[len("/meeting") :]
    return path


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
    secure_cookie = os.environ.get("SANMAO_SECURE_COOKIE", "0") == "1"
    parts = [f"{SESSION_COOKIE_NAME}={token}", "Path=/", "HttpOnly", "SameSite=Lax"]
    if secure_cookie:
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
        SELECT u.id, u.username, u.status, u.guest_token
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


def require_csrf(handler):
    token = handler.headers.get("X-CSRF-Token", "")
    if token != "same-origin":
        json_response(handler, 403, {"error": "csrf_invalid"})
        return False
    return True


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
        "status": row["status"] if "status" in row.keys() else ("complete" if row["profile_completed"] else "partial"),
        "is_guest": bool(row["guest_token"]) if "guest_token" in row.keys() else False,
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


def row_to_public_discover_profile(row):
    return {
        "user_id": row["user_id"],
        "avatar_url": row["avatar_url"],
        "name": row["name"],
        "age": row["age"],
        "city": row["city"],
        "company": row["company"],
        "role": row["role"],
        "tags": row["tags"],
    }


def canonical_pair(a, b):
    return (a, b) if a < b else (b, a)


def ensure_seed_data():
    conn = get_conn()
    demo_password_hash = hash_password(DEMO_PASSWORD)
    for user in SEED_USERS:
        conn.execute(
            "INSERT OR IGNORE INTO users (id, username, password_hash, status) VALUES (?, ?, ?, 'complete')",
            (user["id"], user["username"], demo_password_hash),
        )
        conn.execute(
            "UPDATE users SET password_hash = ?, status = 'complete' WHERE id = ? AND (password_hash = '' OR password_hash IS NULL OR status != 'complete')",
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


def normalize_recent_messages(recent_messages, viewer_id, candidate_id):
    normalized = []
    for message in recent_messages or []:
        sender_id = message.get("sender_id")
        if sender_id is None:
            sender_id = message.get("from")
        content = str(message.get("content") or message.get("text") or "").strip()
        if not content:
            continue
        normalized.append(
            {
                "sender_id": sender_id,
                "content": content,
                "is_viewer": str(sender_id) == str(viewer_id),
                "is_candidate": str(sender_id) == str(candidate_id),
            }
        )
    return normalized[-6:]


def detect_situation(match=None, recent_messages=None, viewer_id=None, candidate_id=None):
    normalized_messages = normalize_recent_messages(recent_messages or [], viewer_id, candidate_id)
    last_message = normalized_messages[-1] if normalized_messages else None
    total_messages = len(normalized_messages)
    viewer_messages = [message for message in normalized_messages if message["is_viewer"]]
    candidate_messages = [message for message in normalized_messages if message["is_candidate"]]
    combined_text = " ".join(message["content"].lower() for message in normalized_messages)
    invite_keywords = MESSAGE_CATEGORY_KEYWORDS["invite"]
    has_invite_signal = any(keyword in combined_text for keyword in invite_keywords)

    if has_invite_signal:
        stage = "invite_window"
        why = "最近聊天里已经出现见面、时间安排或线下活动信号，可以轻一点往邀约推进。"
    elif total_messages <= 1:
        stage = "cold_start"
        why = "现在还处在刚开始接触的阶段，聊天样本很少，先让对方容易接话最重要。"
    elif len(viewer_messages) >= 2 and not candidate_messages:
        stage = "stalled"
        why = "你这边已经连续抛出内容，但对方还没真正接住，适合先把节奏放轻。"
    elif total_messages >= 6 and len(viewer_messages) >= 2 and len(candidate_messages) >= 2:
        stage = "engaged"
        why = "双方已经形成多轮稳定来回，对话不只是在礼貌回应，说明投入度不错。"
    elif total_messages >= 3 and len(viewer_messages) >= 1 and len(candidate_messages) >= 1:
        stage = "warming"
        why = "已经有初步往返，但还没推进到明确邀约或更深层的熟悉阶段。"
    elif last_message and last_message["is_viewer"] and total_messages >= 2:
        stage = "stalled"
        why = "上一轮由你收尾，局面暂时停在你这边，适合换个更容易回应的话题。"
    else:
        stage = "cold_start"
        why = "当前聊天信息还不够多，先按轻量破冰处理更稳。"

    copy = SITUATION_STAGE_COPY[stage]
    return {
        "stage": stage,
        "label": copy["label"],
        "why": why,
        "nextMove": copy["nextMove"],
        "avoid": copy["avoid"],
    }


def build_fallback_suggestions(candidate_profile, situation):
    tags = candidate_profile.get("tags") or ""
    tag_list = [tag.strip() for tag in str(tags).replace("/", "、").split("、") if tag.strip()]
    first_tag = tag_list[0] if tag_list else "最近的兴趣"
    prompt = str(candidate_profile.get("prompt") or "最近让你开心的一件小事").rstrip("。")
    city = candidate_profile.get("city") or "你现在的城市"
    stage = situation["stage"]

    suggestion_sets = {
        "cold_start": [
            {
                "id": "cold_start_interest_probe",
                "text": f"你资料里提到{first_tag}，最近一次让你特别开心的是什么？",
                "why": "先从资料里的具体线索开口，降低接话成本。",
                "goal": "建立第一轮自然来回",
            },
            {
                "id": "cold_start_prompt_expand",
                "text": f"看到你说“{prompt}”，这通常会是你理想周末的样子吗？",
                "why": "把资料里的表达展开成轻问题，不会显得像审问。",
                "goal": "让对方多说一点自己的节奏",
            },
            {
                "id": "cold_start_city_scene",
                "text": f"如果第一次见面安排在{city}，你会想选咖啡还是散步呢？",
                "why": "先轻轻试探相处场景，比直接推进见面更自然。",
                "goal": "观察见面接受度",
            },
        ],
        "warming": [
            {
                "id": "warming_follow_hook",
                "text": f"你刚刚提到{first_tag}，通常你会怎么开始这件事？",
                "why": "顺着已有聊天线索继续，不会突然跳话题。",
                "goal": "把聊天从点头变成展开",
            },
            {
                "id": "warming_daily_rhythm",
                "text": "感觉你平时节奏应该挺有自己的一套，最近让你最放松的一个晚上是怎么过的？",
                "why": "从生活节奏切入，容易带出更真实的日常感。",
                "goal": "增加熟悉感",
            },
            {
                "id": "warming_soft_preference",
                "text": "如果周末想轻松一点，你一般会更偏向出去走走还是待着充电？",
                "why": "这个问题轻，但能让对方给出明确偏好。",
                "goal": "为后续邀约积累信息",
            },
        ],
        "engaged": [
            {
                "id": "engaged_personalize_mood",
                "text": "感觉我们现在已经不是只在走流程聊天了，你通常会对什么样的相处节奏更有好感？",
                "why": "在对话已有温度时，适合轻一点聊相处偏好。",
                "goal": "确认关系推进方式",
            },
            {
                "id": "engaged_scene_build",
                "text": "如果把这段聊天延续到线下，你会更想从咖啡、散步，还是找个安静地方慢慢聊开始？",
                "why": "把线上默契自然过渡到线下场景。",
                "goal": "测试见面意愿",
            },
            {
                "id": "engaged_open_loop",
                "text": "我发现你说话挺让人想继续接下去的，你最近有没有一件还挺想分享、但别人不一定会问到的小事？",
                "why": "给她一个被认真听见的感觉，容易拉近距离。",
                "goal": "制造更深一点的来回",
            },
        ],
        "invite_window": [
            {
                "id": "invite_window_soft_lock",
                "text": "感觉我们已经聊到可以见面也不会尴尬的程度了，如果这周找个轻松一点的时间，你会更偏向咖啡还是散步？",
                "why": "局面已经接近邀约窗口，直接但不压迫。",
                "goal": "把见面意向落到具体形式",
            },
            {
                "id": "invite_window_time_probe",
                "text": "你最近哪天会相对轻松一点？如果节奏合适，我们可以找个不折腾的方式见一面。",
                "why": "从时间切入，比直接定地点更容易获得回应。",
                "goal": "确认可执行时间",
            },
            {
                "id": "invite_window_low_pressure",
                "text": "我们先把第一次见面想得轻一点也可以，找个顺路的地方坐一会儿，你会比较舒服。",
                "why": "降低见面心理压力，减少她顾虑。",
                "goal": "提高答应见面的概率",
            },
        ],
        "stalled": [
            {
                "id": "stalled_reset_light",
                "text": f"换个轻一点的话题，如果今天下班后只能留一个小确幸，你会选{first_tag}、好吃的，还是发呆？",
                "why": "当聊天发力过头时，先把氛围拉回轻松。",
                "goal": "重新打开回应窗口",
            },
            {
                "id": "stalled_reduce_pressure",
                "text": "感觉前面的话题有点用力了，我换个简单的问法：你最近过得最像自己的一天是什么样？",
                "why": "先承认节奏需要放松，降低对方心理负担。",
                "goal": "恢复自然交流",
            },
            {
                "id": "stalled_easy_choice",
                "text": "不认真答也行，最近你会更想早点回家、出去走走，还是找家店坐一下？",
                "why": "给出低门槛选择题，比开放式更容易回。",
                "goal": "换回一条容易接的话",
            },
        ],
    }
    return suggestion_sets.get(stage, suggestion_sets["cold_start"])


def build_ai_icebreaker_response(candidate_profile, situation, source="fallback", fallback_used=True, suggestions=None):
    final_suggestions = suggestions or build_fallback_suggestions(candidate_profile, situation)
    return {
        "summary": f"现在更适合走“{situation['label']}”这条线，先把聊天推进到下一步。",
        "situation": situation,
        "suggestions": final_suggestions[:3],
        "source": source,
        "fallbackUsed": fallback_used,
    }


def sanitize_ai_suggestions(raw_suggestions, fallback_suggestions):
    cleaned = []
    seen = set()
    for index, item in enumerate(raw_suggestions or []):
        if isinstance(item, str):
            text = item.strip()
            why = fallback_suggestions[index]["why"] if index < len(fallback_suggestions) else "这句更容易让对方自然接住。"
            goal = fallback_suggestions[index]["goal"] if index < len(fallback_suggestions) else "推进聊天继续往下走"
            suggestion_id = fallback_suggestions[index]["id"] if index < len(fallback_suggestions) else f"ai_suggestion_{index + 1}"
        elif isinstance(item, dict):
            text = str(item.get("text") or "").strip()
            why = str(item.get("why") or "").strip() or (
                fallback_suggestions[index]["why"] if index < len(fallback_suggestions) else "这句更容易让对方自然接住。"
            )
            goal = str(item.get("goal") or "").strip() or (
                fallback_suggestions[index]["goal"] if index < len(fallback_suggestions) else "推进聊天继续往下走"
            )
            suggestion_id = str(item.get("id") or "").strip() or (
                fallback_suggestions[index]["id"] if index < len(fallback_suggestions) else f"ai_suggestion_{index + 1}"
            )
        else:
            continue

        if not text or text in seen:
            continue
        seen.add(text)
        cleaned.append(
            {
                "id": suggestion_id,
                "text": text,
                "why": why,
                "goal": goal,
            }
        )
        if len(cleaned) == 3:
            break
    return cleaned


def build_ai_request_prompt(viewer_profile, candidate_profile, recent_messages, situation):
    return (
        "你是恋爱聊天助手。基于双方资料和最近聊天，输出 JSON，帮助用户发出更自然的下一句。"
        "只返回 JSON，不要解释。JSON 格式必须是 "
        '{"summary":"...","suggestions":[{"id":"...","text":"...","why":"...","goal":"..."}]}'
        "。suggestions 必须正好 3 条，语气自然、轻盈、像真人，不要油腻。"
        f"\n当前局面：{json.dumps(situation, ensure_ascii=False)}"
        f"\n我的资料：{json.dumps(viewer_profile, ensure_ascii=False)}"
        f"\n对方资料：{json.dumps(candidate_profile, ensure_ascii=False)}"
        f"\n最近聊天：{json.dumps(recent_messages, ensure_ascii=False)}"
    )


def call_ai_icebreaker_provider(viewer_profile, candidate_profile, recent_messages, situation):
    api_url = os.environ.get("YXAI_API_URL") or os.environ.get("VISION_API_URL")
    api_key = os.environ.get("YXAI_API_KEY") or os.environ.get("VISION_API_KEY")
    if not api_url or not api_key:
        return None

    prompt = build_ai_request_prompt(viewer_profile, candidate_profile, recent_messages, situation)
    payload = {
        "temperature": 0.8,
        "messages": [{"role": "user", "content": prompt}],
    }
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        api_url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError, OSError):
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None

    if isinstance(parsed, dict) and isinstance(parsed.get("content"), str):
        try:
            parsed = json.loads(parsed["content"])
        except json.JSONDecodeError:
            return None

    choices = parsed.get("choices") if isinstance(parsed, dict) else None
    if isinstance(choices, list) and choices:
        message = choices[0].get("message", {})
        content = message.get("content")
        if isinstance(content, str):
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                return None

    return parsed if isinstance(parsed, dict) else None


def bootstrap_likes_for_new_user(conn, user_id):
    for seed_id in (1001, 1003):
        conn.execute(
            "INSERT OR IGNORE INTO likes (from_user_id, to_user_id) VALUES (?, ?)",
            (seed_id, user_id),
        )


def get_profile(conn, user_id):
    row = conn.execute(
        """
        SELECT p.*, u.username, u.status, u.guest_token
        FROM profiles p
        JOIN users u ON u.id = p.user_id
        WHERE p.user_id = ?
        """,
        (user_id,),
    ).fetchone()
    return row_to_profile(row) if row else None


def get_state_payload(conn, user_id=None):
    profile = get_profile(conn, user_id) if user_id else None
    viewer_id = user_id or -1
    preferred_gender = None
    if profile and profile.get("gender") in ("male", "female"):
        preferred_gender = "female" if profile["gender"] == "male" else "male"
    discover_rows = conn.execute(
        """
        SELECT p.*, u.username, u.status, u.guest_token
        FROM profiles p
        JOIN users u ON u.id = p.user_id
        WHERE p.user_id != ?
          AND (
            ? < 0 OR p.user_id NOT IN (
              SELECT to_user_id FROM likes WHERE from_user_id = ?
            )
          )
          AND (? IS NULL OR p.gender = ?)
        ORDER BY p.user_id
        """,
        (viewer_id, viewer_id, viewer_id, preferred_gender, preferred_gender),
    ).fetchall()

    liked_rows = []
    liked_by_rows = []
    matches = []

    if user_id:
        liked_rows = conn.execute(
            """
            SELECT p.*, u.username, u.status, u.guest_token
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
            SELECT p.*, u.username, u.status, u.guest_token
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

        for row in match_rows:
            other_profile = get_profile(conn, row["other_user_id"])
            seed_user = SEED_USERS_BY_ID.get(row["other_user_id"])
            demo_mode = get_match_demo_mode(row["other_user_id"])
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
                    "demo_mode": demo_mode,
                    "assistant_mode": "dating_helper",
                    "distance_hint": build_distance_hint(profile or {}, other_profile or {}),
                    "demo_mode_copy": get_demo_mode_copy(seed_user),
                    "assistant": build_assistant_payload(seed_user),
                }
            )

    discover_payload = [row_to_profile(row) for row in discover_rows] if user_id else [row_to_public_discover_profile(row) for row in discover_rows]

    return {
        "viewer": {
            "authenticated": bool(user_id),
            "status": profile["status"] if profile else "visitor",
            "is_guest": bool(profile["is_guest"]) if profile else False,
        },
        "profile": profile,
        "discover": discover_payload,
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
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token")
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
        normalized_path = strip_mount_prefix(parsed.path)

        if normalized_path == "/api/health":
            return json_response(self, 200, {"ok": True})

        if normalized_path == "/api/check-username":
            username = parse_qs(parsed.query).get("username", [""])[0].strip()
            if not username:
                return json_response(self, 400, {"error": "username_required"})
            conn = get_conn()
            exists = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
            conn.close()
            if exists:
                return json_response(self, 409, {"error": "username_taken"})
            return json_response(self, 200, {"ok": True})

        if normalized_path == "/api/me":
            conn = get_conn()
            session_user = get_session_user(self, conn)
            if not session_user:
                payload = {"authenticated": False, "status": "visitor", "is_guest": False}
                conn.close()
                return json_response(self, 200, payload)
            payload = {
                "authenticated": True,
                "user_id": session_user["id"],
                "username": session_user["username"],
                "status": session_user["status"],
                "is_guest": bool(session_user.get("guest_token")),
            }
            conn.close()
            return json_response(self, 200, payload)

        if normalized_path == "/api/state":
            conn = get_conn()
            session_user = get_session_user(self, conn)
            payload = get_state_payload(conn, session_user["id"] if session_user else None)
            conn.close()
            return json_response(self, 200, payload)

        return self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        normalized_path = strip_mount_prefix(parsed.path)
        if normalized_path == "/api/guest/start":
            if not require_csrf(self):
                return None
            payload = load_json(self)
            gender = str(payload.get("gender", "")).strip()
            name = str(payload.get("name", "")).strip()
            if gender not in ("male", "female"):
                return json_response(self, 400, {"error": "gender_required"})
            if not name:
                return json_response(self, 400, {"error": "name_required"})

            conn = get_conn()
            guest_token = secrets.token_hex(24)
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, guest_token, status) VALUES (?, '', ?, 'partial')",
                (None, guest_token),
            )
            user_id = cursor.lastrowid
            conn.execute(
                """
                INSERT INTO profiles
                (user_id, gender, avatar_url, name, city, tags, profile_completed)
                VALUES (?, ?, '', ?, '', '', 0)
                """,
                (user_id, gender, name),
            )
            bootstrap_likes_for_new_user(conn, user_id)
            token, cookie_expires = create_session(conn, user_id)
            conn.commit()
            conn.close()
            return json_response(
                self,
                201,
                {"user_id": user_id, "name": name, "status": "partial", "is_guest": True},
                headers=[("Set-Cookie", build_session_cookie(token, cookie_expires))],
            )

        if normalized_path == "/api/register":
            if not require_csrf(self):
                return None
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
                return json_response(self, 400, {"error": "username_taken"})

            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, status) VALUES (?, ?, 'partial')",
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

        if normalized_path == "/api/login":
            if not require_csrf(self):
                return None
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
            if not user or is_seed_user_id(user["id"]) or not verify_password(password, user["password_hash"]):
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

        if normalized_path == "/api/logout":
            conn, session_user = require_auth(self)
            if not session_user:
                return None
            if not require_csrf(self):
                conn.close()
                return None
            expired_cookie = clear_session(conn, self)
            conn.commit()
            conn.close()
            return json_response(self, 200, {"ok": True}, headers=[("Set-Cookie", expired_cookie)])

        if normalized_path == "/api/like":
            payload = load_json(self)
            conn, session_user = require_auth(self)
            if not session_user:
                return None
            if not require_csrf(self):
                conn.close()
                return None
            user_id = session_user["id"]
            try:
                target_user_id = int(payload.get("target_user_id"))
            except (TypeError, ValueError):
                conn.close()
                return json_response(self, 400, {"error": "target_user_id_required"})
            if target_user_id == user_id:
                conn.close()
                return json_response(self, 400, {"error": "target_user_id_invalid"})
            target_user = conn.execute("SELECT id FROM users WHERE id = ?", (target_user_id,)).fetchone()
            if not target_user:
                conn.close()
                return json_response(self, 404, {"error": "target_user_not_found"})
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

        if normalized_path == "/api/ai/icebreakers":
            payload = load_json(self)
            conn, session_user = require_auth(self)
            if not session_user:
                return None
            if not require_csrf(self):
                conn.close()
                return None

            viewer_profile = payload.get("viewerProfile") or get_profile(conn, session_user["id"]) or {}
            candidate_profile = payload.get("candidateProfile") or {}
            recent_messages = payload.get("recentMessages") or []
            candidate_id = candidate_profile.get("id")
            situation = detect_situation(
                recent_messages=recent_messages,
                viewer_id=session_user["id"],
                candidate_id=candidate_id,
            )
            fallback_suggestions = build_fallback_suggestions(candidate_profile, situation)
            ai_payload = call_ai_icebreaker_provider(viewer_profile, candidate_profile, recent_messages, situation)
            ai_suggestions = sanitize_ai_suggestions(
                ai_payload.get("suggestions") if isinstance(ai_payload, dict) else [],
                fallback_suggestions,
            )
            summary = str(ai_payload.get("summary") or "").strip() if isinstance(ai_payload, dict) else ""
            conn.close()

            if len(ai_suggestions) >= 3:
                return json_response(
                    self,
                    200,
                    {
                        "summary": summary or f"现在更适合走“{situation['label']}”这条线，先把聊天推进到下一步。",
                        "situation": situation,
                        "suggestions": ai_suggestions[:3],
                        "source": "ai",
                        "fallbackUsed": False,
                    },
                )

            return json_response(
                self,
                200,
                build_ai_icebreaker_response(candidate_profile, situation, source="fallback", fallback_used=True),
            )

        if normalized_path == "/api/ai/icebreaker-click":
            payload = load_json(self)
            conn, session_user = require_auth(self)
            if not session_user:
                return None
            if not require_csrf(self):
                conn.close()
                return None
            user_id = session_user["id"]
            try:
                match_id = int(payload.get("match_id"))
            except (TypeError, ValueError):
                conn.close()
                return json_response(self, 400, {"error": "match_id_required"})

            suggestion_id = str(payload.get("suggestion_id", "")).strip()
            action = str(payload.get("action", "")).strip() or "send"
            if not suggestion_id:
                conn.close()
                return json_response(self, 400, {"error": "suggestion_id_required"})
            if action not in ("preview", "send", "choose"):
                conn.close()
                return json_response(self, 400, {"error": "invalid_action"})

            owned_match = conn.execute(
                "SELECT id FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?)",
                (match_id, user_id, user_id),
            ).fetchone()
            if not owned_match:
                conn.close()
                return json_response(self, 403, {"error": "match_forbidden"})

            conn.execute(
                """
                INSERT INTO ai_suggestion_clicks (user_id, match_id, suggestion_id, action, stage, intent)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    match_id,
                    suggestion_id,
                    action,
                    str(payload.get("stage", "")).strip() or None,
                    str(payload.get("intent", "")).strip() or None,
                ),
            )
            conn.commit()
            conn.close()
            return json_response(self, 201, {"ok": True})

        if normalized_path == "/api/message":
            payload = load_json(self)
            conn, session_user = require_auth(self)
            if not session_user:
                return None
            if not require_csrf(self):
                conn.close()
                return None
            user_id = session_user["id"]
            try:
                match_id = int(payload.get("match_id"))
            except (TypeError, ValueError):
                conn.close()
                return json_response(self, 400, {"error": "match_id_required"})
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
            demo_requested = parse_qs(parsed.query).get("demo", [""])[0] == "1"
            seed_profile = get_seed_profile_for_match(conn, match_id, user_id)
            allow_demo_mode = demo_requested and bool(seed_profile)
            seed_reply = build_seed_reply(conn, match_id, user_id, content) if allow_demo_mode else None
            demo_mode = False
            demo_mode_copy = None
            if seed_reply:
                conn.execute(
                    "INSERT INTO messages (match_id, sender_id, content) VALUES (?, ?, ?)",
                    (match_id, seed_reply["sender_id"], seed_reply["content"]),
                )
                demo_mode = True
                demo_mode_copy = get_demo_mode_copy(SEED_USERS_BY_ID.get(seed_reply["sender_id"]))["description"]
            conn.commit()
            messages = conn.execute(
                "SELECT sender_id, content, created_at FROM messages WHERE match_id = ? ORDER BY created_at ASC, id ASC",
                (match_id,),
            ).fetchall()
            conn.close()
            response_payload = {
                "ok": True,
                "messages": [
                    {
                        "sender_id": message["sender_id"],
                        "content": message["content"],
                        "created_at": message["created_at"],
                    }
                    for message in messages
                ],
            }
            if demo_mode:
                response_payload["demo_mode"] = True
                response_payload["demo_mode_copy"] = demo_mode_copy
            return json_response(self, 201, response_payload)

        return json_response(self, 404, {"error": "not_found"})

    def do_PUT(self):
        parsed = urlparse(self.path)
        normalized_path = strip_mount_prefix(parsed.path)
        if normalized_path == "/api/profile":
            payload = load_json(self)
            conn, session_user = require_auth(self)
            if not session_user:
                return None
            if not require_csrf(self):
                conn.close()
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
            conn.execute(
                "UPDATE users SET status = ? WHERE id = ?",
                ("complete" if profile_completed else "partial", user_id),
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
