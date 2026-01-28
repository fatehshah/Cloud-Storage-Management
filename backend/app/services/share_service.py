import secrets
from datetime import datetime, timedelta
from typing import Optional

from app.db import get_db
import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
USERS_DIR = os.path.join(STORAGE_DIR, "users")



def create_share_link(
    username: str,
    item_type: str,
    item_path: str,
    permission: str,
    expires_at: Optional[str] = None,
    expire_after_open_seconds: Optional[int] = None
):
    # validate
    if item_type not in ("file", "folder"):
        raise ValueError("item_type must be 'file' or 'folder'")

    if permission not in ("view", "download", "upload"):
        raise ValueError("permission must be view / download / upload")

    if permission == "upload" and item_type != "folder":
        raise ValueError("Upload permission is only allowed for folders")

    item_path = item_path.strip().lstrip("/")  # normalize

    token = secrets.token_urlsafe(32)

    conn = get_db()
    try:
        conn.execute("""
            INSERT INTO shares (
                owner_username, item_type, item_path,
                token, permission, is_active,
                expires_at, expire_after_open_seconds, first_opened_at
            )
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)
        """, (username, item_type, item_path, token, permission, expires_at, expire_after_open_seconds))

        conn.commit()
        return {
            "token": token,
            "owner_username": username,
            "item_type": item_type,
            "item_path": item_path,
            "permission": permission,
            "expires_at": expires_at,
            "expire_after_open_seconds": expire_after_open_seconds
        }
    finally:
        conn.close()


def validate_and_touch_share(token: str):
    """
    Validates:
    - token exists
    - active
    - fixed expiry
    - expire-after-open logic (start timer on first valid open)
    Returns share row (sqlite3.Row)
    """
    conn = get_db()
    try:
        share = conn.execute("SELECT * FROM shares WHERE token = ?", (token,)).fetchone()
        if not share:
            raise ValueError("Invalid link")

        if share["is_active"] != 1:
            raise ValueError("Link is disabled")

        now = datetime.utcnow()

        # Fixed expiry check
        if share["expires_at"]:
            exp = datetime.fromisoformat(share["expires_at"])
            if now > exp:
                raise ValueError("Link expired")

        # Expire-after-open
        if share["expire_after_open_seconds"]:
            seconds = int(share["expire_after_open_seconds"])

            # Start timer on first open
            if not share["first_opened_at"]:
                first = now.isoformat()
                conn.execute("UPDATE shares SET first_opened_at = ? WHERE token = ?", (first, token))
                conn.commit()
                share = conn.execute("SELECT * FROM shares WHERE token = ?", (token,)).fetchone()
            else:
                first = datetime.fromisoformat(share["first_opened_at"])
                exp2 = first + timedelta(seconds=seconds)
                if now > exp2:
                    raise ValueError("Link expired")

        return share
    finally:
        conn.close()


def revoke_share(username: str, token: str):
    conn = get_db()
    try:
        res = conn.execute(
            "UPDATE shares SET is_active = 0 WHERE token = ? AND owner_username = ?",
            (token, username)
        )
        conn.commit()
        if res.rowcount == 0:
            raise ValueError("Link not found or you are not the owner")
    finally:
        conn.close()


def extend_share(
    username: str,
    token: str,
    new_expires_at: Optional[str] = None,
    new_expire_after_open_seconds: Optional[int] = None
):
    """
    Owner can:
    - extend/reactivate fixed expiry
    - extend/reactivate expire-after-open seconds
    Also sets is_active=1.
    """
    conn = get_db()
    try:
        share = conn.execute(
            "SELECT * FROM shares WHERE token = ? AND owner_username = ?",
            (token, username)
        ).fetchone()

        if not share:
            raise ValueError("Link not found or you are not the owner")

        expires_at = new_expires_at if new_expires_at is not None else share["expires_at"]
        expire_after_open_seconds = (
            new_expire_after_open_seconds
            if new_expire_after_open_seconds is not None
            else share["expire_after_open_seconds"]
        )

        conn.execute("""
            UPDATE shares
            SET is_active = 1,
                expires_at = ?,
                expire_after_open_seconds = ?
            WHERE token = ? AND owner_username = ?
        """, (expires_at, expire_after_open_seconds, token, username))

        conn.commit()
    finally:
        conn.close()


