import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/app -> backend
DB_PATH = BASE_DIR / "storage" / "users.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        first_name TEXT DEFAULT '',
        last_name TEXT DEFAULT '',
        email TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        dob TEXT DEFAULT '',
        gender TEXT DEFAULT '',
        drive_mode TEXT DEFAULT 'private',   -- 'private' or 'share'
        avatar_path TEXT DEFAULT '',        -- saved file path
        two_fa_enabled INTEGER DEFAULT 0,
        two_fa_method TEXT DEFAULT 'sms',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(username) REFERENCES users(username)
    )
    """)


    cur.execute("""
    CREATE TABLE IF NOT EXISTS shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_username TEXT NOT NULL,
        item_type TEXT NOT NULL,
        item_path TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        permission TEXT NOT NULL DEFAULT 'view',
        is_active INTEGER NOT NULL DEFAULT 1,
        expires_at DATETIME DEFAULT NULL,
        expire_after_open_seconds INTEGER DEFAULT NULL,
        first_opened_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Safe indexes (you can enable now)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_shares_owner_username ON shares(owner_username)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_shares_item ON shares(item_type, item_path)")

    conn.commit()
    conn.close()
