import os
import sqlite3

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.environ.get("SANMAO_DB_PATH", os.path.join(DATA_DIR, "sanmao.db"))
SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")


def ensure_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    with open(SCHEMA_PATH, "r", encoding="utf-8") as schema_file:
        conn.executescript(schema_file.read())
    conn.commit()
    return conn


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
