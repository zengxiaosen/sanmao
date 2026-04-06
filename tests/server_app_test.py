import json
import os
import sys
import tempfile
import unittest
from urllib.parse import quote

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

import app as server_app
from db import ensure_db, get_conn


class StubHandler:
    def __init__(self, method="POST", path="/", payload=None, cookie_header=""):
        self.path = path
        self.command = method
        self.headers = {"Content-Length": "0"}
        if cookie_header:
            self.headers["Cookie"] = cookie_header
        body = json.dumps(payload or {}).encode("utf-8")
        self.headers["Content-Length"] = str(len(body))
        self.rfile = type("Reader", (), {"read": lambda _self, _n: body})()
        self.responses = []
        self.sent_headers = []
        self.wfile = type("Writer", (), {"write": lambda _self, data: self.responses.append(data)})()

    def send_response(self, status):
        self.status = status

    def send_header(self, key, value):
        self.sent_headers.append((key, value))

    def end_headers(self):
        pass

    def serve_static(self, path):
        return server_app.Handler.serve_static(self, path)


class AiReplyServerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        db_path = os.path.join(self.temp_dir.name, "test.db")
        os.environ["SANMAO_DB_PATH"] = db_path
        server_app.get_conn.__globals__["DB_PATH"] = db_path
        ensure_db.__globals__["DB_PATH"] = db_path
        conn = ensure_db()
        conn.close()
        server_app.ensure_seed_data()
        conn = get_conn()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, status) VALUES (?, ?, ?, 'complete')",
            (999001, "tester", server_app.hash_password("secret123")),
        )
        self.user_id = 999001
        conn.execute(
            "INSERT INTO profiles (user_id, gender, avatar_url, name, age, city, company, role, school, tags, bio, profile_completed) VALUES (?, 'male', '', 'Tester', '27', '深圳', 'ACME', '工程师', '中大', '散步/播客', 'bio', 1)",
            (self.user_id,),
        )
        conn.execute("INSERT INTO likes (from_user_id, to_user_id) VALUES (?, ?)", (1001, self.user_id))
        conn.execute("INSERT INTO likes (from_user_id, to_user_id) VALUES (?, ?)", (self.user_id, 1001))
        self.match_id = server_app.create_match_if_needed(conn, self.user_id, 1001)
        token, expires = server_app.create_session(conn, self.user_id)
        conn.commit()
        conn.close()
        self.cookie_header = f"{server_app.SESSION_COOKIE_NAME}={token}"

    def tearDown(self):
        self.temp_dir.cleanup()
        os.environ.pop("SANMAO_DB_PATH", None)

    def test_detect_situation_covers_cold_warming_and_invite(self):
        cold = server_app.detect_situation(recent_messages=[], viewer_id=self.user_id, candidate_id=1001)
        warming = server_app.detect_situation(
            recent_messages=[
                {"sender_id": self.user_id, "content": "你好呀"},
                {"sender_id": 1001, "content": "晚上好呀"},
                {"sender_id": self.user_id, "content": "你平时周末会做什么？"},
            ],
            viewer_id=self.user_id,
            candidate_id=1001,
        )
        invite_window = server_app.detect_situation(
            recent_messages=[
                {"sender_id": self.user_id, "content": "这周要不要一起喝咖啡？"},
                {"sender_id": 1001, "content": "可以呀，周末也行"},
            ],
            viewer_id=self.user_id,
            candidate_id=1001,
        )

        self.assertEqual(cold["stage"], "cold_start")
        self.assertEqual(warming["stage"], "warming")
        self.assertEqual(invite_window["stage"], "invite_window")

    def test_fallback_response_returns_three_structured_suggestions(self):
        candidate_profile = server_app.SEED_USERS_BY_ID[1001]
        situation = server_app.detect_situation(recent_messages=[], viewer_id=self.user_id, candidate_id=1001)
        response = server_app.build_ai_icebreaker_response(candidate_profile, situation)

        self.assertIn("summary", response)
        self.assertIn("situation", response)
        self.assertEqual(len(response["suggestions"]), 3)
        for item in response["suggestions"]:
            self.assertTrue(item["id"])
            self.assertTrue(item["why"])
            self.assertTrue(item["goal"])

    def test_message_endpoint_rejects_missing_csrf_header(self):
        handler = StubHandler(
            path="/api/message",
            payload={"match_id": self.match_id, "content": "你好"},
            cookie_header=self.cookie_header,
        )
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 403)

    def test_message_endpoint_accepts_same_origin_csrf_header(self):
        handler = StubHandler(
            path="/api/message",
            payload={"match_id": self.match_id, "content": "你好"},
            cookie_header=self.cookie_header,
        )
        handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 201)

    def test_click_endpoint_rejects_invalid_match_and_accepts_valid_match(self):
        forbidden_handler = StubHandler(
            path="/api/ai/icebreaker-click",
            payload={"match_id": 999999, "suggestion_id": "s1", "action": "send"},
            cookie_header=self.cookie_header,
        )
        forbidden_handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(forbidden_handler)
        self.assertEqual(forbidden_handler.status, 403)

        valid_handler = StubHandler(
            path="/api/ai/icebreaker-click",
            payload={"match_id": self.match_id, "suggestion_id": "s1", "action": "send", "stage": "warming"},
            cookie_header=self.cookie_header,
        )
        valid_handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(valid_handler)
        self.assertEqual(valid_handler.status, 201)

        conn = get_conn()
        row = conn.execute(
            "SELECT suggestion_id, action, stage FROM ai_suggestion_clicks WHERE match_id = ?",
            (self.match_id,),
        ).fetchone()
        conn.close()
        self.assertEqual(dict(row), {"suggestion_id": "s1", "action": "send", "stage": "warming"})

    def test_login_requires_csrf_header(self):
        handler = StubHandler(
            path="/api/login",
            payload={"username": "tester", "password": "secret123"},
        )
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 403)

    def test_seed_demo_account_cannot_log_in_with_shared_password(self):
        handler = StubHandler(
            path="/api/login",
            payload={"username": "linqinghe", "password": server_app.DEMO_PASSWORD},
        )
        handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 401)

        handler = StubHandler(
            path="/api/message",
            payload={"content": "你好"},
            cookie_header=self.cookie_header,
        )
        handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 400)

    def test_guest_start_requires_csrf_header(self):
        handler = StubHandler(
            path="/api/guest/start",
            payload={"gender": "female", "name": "GuestNoCsrf"},
        )
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 403)

    def test_register_requires_csrf_header(self):
        handler = StubHandler(
            path="/api/register",
            payload={"username": "freshuser", "password": "secret123"},
        )
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 403)

    def test_state_for_visitor_only_exposes_public_discover_fields(self):
        handler = StubHandler(method="GET", path="/api/state")
        server_app.Handler.do_GET(handler)
        self.assertEqual(handler.status, 200)
        payload = json.loads(handler.responses[-1].decode("utf-8"))
        self.assertFalse(payload["viewer"]["authenticated"])
        self.assertTrue(payload["discover"])
        discover_profile = payload["discover"][0]
        self.assertIn("name", discover_profile)
        self.assertNotIn("bio", discover_profile)
        self.assertNotIn("school", discover_profile)
        self.assertNotIn("status", discover_profile)
        self.assertNotIn("is_guest", discover_profile)

    def test_authenticated_discover_payload_hides_private_profile_fields(self):
        handler = StubHandler(method="GET", path="/api/state", cookie_header=self.cookie_header)
        server_app.Handler.do_GET(handler)
        self.assertEqual(handler.status, 200)
        payload = json.loads(handler.responses[-1].decode("utf-8"))

        discover_profile = payload["discover"][0]
        self.assertIn("name", discover_profile)
        self.assertNotIn("bio", discover_profile)
        self.assertNotIn("school", discover_profile)
        self.assertNotIn("status", discover_profile)
        self.assertNotIn("is_guest", discover_profile)

    def test_state_filters_discover_to_opposite_gender_for_authenticated_viewer(self):
        handler = StubHandler(method="GET", path="/api/state", cookie_header=self.cookie_header)
        server_app.Handler.do_GET(handler)
        self.assertEqual(handler.status, 200)
        payload = json.loads(handler.responses[-1].decode("utf-8"))

        self.assertTrue(payload["discover"])
        self.assertTrue(all(item["gender"] == "female" for item in payload["discover"]))
        discover_profile = payload["discover"][0]
        self.assertNotIn("bio", discover_profile)
        self.assertNotIn("school", discover_profile)
        self.assertNotIn("status", discover_profile)
        self.assertNotIn("is_guest", discover_profile)

    def test_state_filters_discover_to_opposite_gender_for_new_female_user(self):
        handler = StubHandler(
            path="/api/register",
            payload={"username": "femaleviewer", "password": "secret123"},
        )
        handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 201)
        cookie = [value for key, value in handler.sent_headers if key == "Set-Cookie"][0].split(";", 1)[0]

        profile_handler = StubHandler(
            method="PUT",
            path="/api/profile",
            payload={
                "gender": "female",
                "avatar_url": "",
                "name": "Female Viewer",
                "age": "26",
                "city": "深圳",
                "company": "ACME",
                "role": "设计师",
                "school": "深大",
                "tags": "散步/电影",
                "bio": "完整资料"
            },
            cookie_header=cookie,
        )
        profile_handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_PUT(profile_handler)
        self.assertEqual(profile_handler.status, 200)

        state_handler = StubHandler(method="GET", path="/api/state", cookie_header=cookie)
        server_app.Handler.do_GET(state_handler)
        self.assertEqual(state_handler.status, 200)
        payload = json.loads(state_handler.responses[-1].decode("utf-8"))

        self.assertTrue(payload["discover"])
        self.assertTrue(all(item["gender"] == "male" for item in payload["discover"]))

    def test_static_request_under_meeting_prefix_serves_app_shell(self):
        handler = StubHandler(method="GET", path="/meeting/")
        server_app.Handler.do_GET(handler)
        self.assertEqual(handler.status, 200)
        html = handler.responses[-1].decode("utf-8")
        self.assertIn('<script type="module" src="./src/main.js"></script>', html)
        self.assertIn('<link rel="stylesheet" href="./styles.css">', html)

    def test_guest_start_creates_partial_user_and_session(self):
        handler = StubHandler(
            path="/api/guest/start",
            payload={"gender": "female", "name": "GuestA"},
        )
        handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 201)
        cookie = [value for key, value in handler.sent_headers if key == "Set-Cookie"][0]
        self.assertIn(server_app.SESSION_COOKIE_NAME, cookie)

        conn = get_conn()
        row = conn.execute(
            "SELECT u.status, u.guest_token, p.name, p.gender, p.profile_completed FROM users u JOIN profiles p ON p.user_id = u.id WHERE p.name = ?",
            ("GuestA",),
        ).fetchone()
        conn.close()
        self.assertEqual(row["status"], "partial")
        self.assertTrue(row["guest_token"])
        self.assertEqual(row["gender"], "female")
        self.assertEqual(row["profile_completed"], 0)

    def test_like_requires_auth_even_with_guest_funnel(self):
        handler = StubHandler(
            path="/api/like",
            payload={"target_user_id": 1001},
        )
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 401)

    def test_partial_user_can_like_but_cannot_message_until_profile_complete(self):
        guest_handler = StubHandler(
            path="/api/guest/start",
            payload={"gender": "male", "name": "GuestB"},
        )
        guest_handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(guest_handler)
        guest_cookie = [value for key, value in guest_handler.sent_headers if key == "Set-Cookie"][0].split(";", 1)[0]

        like_handler = StubHandler(
            path="/api/like",
            payload={"target_user_id": 1001},
            cookie_header=guest_cookie,
        )
        like_handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(like_handler)
        self.assertEqual(like_handler.status, 200)

        conn = get_conn()
        guest_user = conn.execute("SELECT user_id FROM profiles WHERE name = ?", ("GuestB",)).fetchone()
        conn.execute("INSERT OR IGNORE INTO likes (from_user_id, to_user_id) VALUES (?, ?)", (1001, guest_user["user_id"]))
        match_id = server_app.create_match_if_needed(conn, guest_user["user_id"], 1001)
        conn.commit()
        conn.close()

        message_handler = StubHandler(
            path="/api/message",
            payload={"match_id": match_id, "content": "你好"},
            cookie_header=guest_cookie,
        )
        message_handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(message_handler)
        self.assertEqual(message_handler.status, 403)

        profile_handler = StubHandler(
            method="PUT",
            path="/api/profile",
            payload={
                "gender": "male",
                "avatar_url": "",
                "name": "GuestB",
                "age": "28",
                "city": "深圳",
                "company": "ACME",
                "role": "工程师",
                "school": "深大",
                "tags": "散步/咖啡",
                "bio": "完整资料"
            },
            cookie_header=guest_cookie,
        )
        profile_handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_PUT(profile_handler)
        self.assertEqual(profile_handler.status, 200)

        message_handler = StubHandler(
            path="/api/message",
            payload={"match_id": match_id, "content": "你好"},
            cookie_header=guest_cookie,
        )
        message_handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(message_handler)
        self.assertEqual(message_handler.status, 201)

    def test_state_marks_seed_match_as_demo_and_exposes_assistant_metadata(self):
        handler = StubHandler(method="GET", path="/api/state", cookie_header=self.cookie_header)
        server_app.Handler.do_GET(handler)
        self.assertEqual(handler.status, 200)

        payload = json.loads(handler.responses[-1].decode("utf-8"))
        match = next(item for item in payload["matches"] if item["match_id"] == self.match_id)

        self.assertTrue(match["demo_mode"])
        self.assertEqual(match["assistant_mode"], "dating_helper")
        self.assertIn("distance_hint", match)
        self.assertIn("demo_mode_copy", match)
        self.assertIn("assistant", match)
        self.assertEqual(match["assistant"]["title"], "AI 恋爱助手")

    def test_meeting_prefixed_api_routes_hit_existing_handlers(self):
        state_handler = StubHandler(method="GET", path="/meeting/api/state", cookie_header=self.cookie_header)
        server_app.Handler.do_GET(state_handler)
        self.assertEqual(state_handler.status, 200)
        state_payload = json.loads(state_handler.responses[-1].decode("utf-8"))
        self.assertIn("matches", state_payload)

        message_handler = StubHandler(
            path="/meeting/api/message",
            payload={"match_id": self.match_id, "content": "你好"},
            cookie_header=self.cookie_header,
        )
        message_handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(message_handler)
        self.assertEqual(message_handler.status, 201)

    def test_message_endpoint_does_not_inject_seed_reply_by_default(self):
        handler = StubHandler(
            path="/api/message",
            payload={"match_id": self.match_id, "content": "你好"},
            cookie_header=self.cookie_header,
        )
        handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 201)

        payload = json.loads(handler.responses[-1].decode("utf-8"))
        self.assertEqual(len(payload["messages"]), 1)
        self.assertEqual(payload["messages"][0]["content"], "你好")

    def test_demo_message_endpoint_requires_explicit_demo_flag_for_sample_reply(self):
        handler = StubHandler(
            path="/api/message?demo=1",
            payload={"match_id": self.match_id, "content": "你好"},
            cookie_header=self.cookie_header,
        )
        handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 201)

        payload = json.loads(handler.responses[-1].decode("utf-8"))
        self.assertEqual(len(payload["messages"]), 2)
        self.assertEqual(payload["messages"][1]["sender_id"], 1001)
        self.assertTrue(payload.get("demo_mode"))
        self.assertIn("演示", payload.get("demo_mode_copy", ""))

        original = os.environ.get("SANMAO_SECURE_COOKIE")
        os.environ.pop("SANMAO_SECURE_COOKIE", None)
        cookie_value = server_app.build_session_cookie("token123")
        if original is not None:
            os.environ["SANMAO_SECURE_COOKIE"] = original
        self.assertNotIn("Secure", cookie_value)

    def test_demo_flag_is_ignored_for_non_seed_match(self):
        conn = get_conn()
        conn.execute(
            "INSERT INTO users (id, username, password_hash, status) VALUES (?, ?, ?, 'complete')",
            (999002, "realmatch", server_app.hash_password("secret123")),
        )
        conn.execute(
            "INSERT INTO profiles (user_id, gender, avatar_url, name, age, city, company, role, school, tags, bio, profile_completed) VALUES (?, 'female', '', 'RealMatch', '26', '深圳', 'RealCo', '设计师', '深大', '展览/徒步', 'bio', 1)",
            (999002,),
        )
        conn.execute("INSERT INTO likes (from_user_id, to_user_id) VALUES (?, ?)", (999002, self.user_id))
        conn.execute("INSERT INTO likes (from_user_id, to_user_id) VALUES (?, ?)", (self.user_id, 999002))
        real_match_id = server_app.create_match_if_needed(conn, self.user_id, 999002)
        conn.commit()
        conn.close()

        handler = StubHandler(
            path="/api/message?demo=1",
            payload={"match_id": real_match_id, "content": "你好"},
            cookie_header=self.cookie_header,
        )
        handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 201)

        payload = json.loads(handler.responses[-1].decode("utf-8"))
        self.assertEqual(len(payload["messages"]), 1)
        self.assertNotIn("demo_mode", payload)

    def test_build_session_cookie_defaults_to_non_secure(self):
        original = os.environ.get("SANMAO_SECURE_COOKIE")
        os.environ["SANMAO_SECURE_COOKIE"] = "1"
        cookie_value = server_app.build_session_cookie("token123")
        if original is None:
            os.environ.pop("SANMAO_SECURE_COOKIE", None)
        else:
            os.environ["SANMAO_SECURE_COOKIE"] = original
        self.assertIn("Secure", cookie_value)

    def test_register_does_not_leak_taken_username(self):
        handler = StubHandler(
            path="/api/register",
            payload={"username": "linqinghe", "password": "secret123"},
        )
        handler.headers["X-CSRF-Token"] = "same-origin"
        server_app.Handler.do_POST(handler)
        self.assertEqual(handler.status, 400)


if __name__ == "__main__":
    unittest.main()
