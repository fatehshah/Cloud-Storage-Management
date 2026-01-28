import os
import shutil
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from app.db import get_db
from app.auth.security import get_current_username
from passlib.context import CryptContext
from app.auth.jwt_config import SECRET_KEY, ALGORITHM
from app.routes.auth_routes import normalize_password
BASE_DIR = Path(__file__).resolve().parents[2]   # backend folder
UPLOADS_DIR = BASE_DIR / "storage" / "avatars"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
router = APIRouter(prefix="/users", tags=["Users"])

class ProfileUpdate(BaseModel):
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""
    dob: str = ""          # "YYYY-MM-DD"
    gender: str = ""       # male/female
    drive_mode: str = "private"  # private/share

@router.get("/me")
def get_me(username: str = Depends(get_current_username)):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT username FROM users WHERE username=?", (username,))
    u = cur.fetchone()
    if not u:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    cur.execute("SELECT * FROM user_profiles WHERE username=?", (username,))
    p = cur.fetchone()

    if not p:
        # create default profile if missing
        cur.execute("INSERT INTO user_profiles (username) VALUES (?)", (username,))
        conn.commit()
        cur.execute("SELECT * FROM user_profiles WHERE username=?", (username,))
        p = cur.fetchone()

    conn.close()

    avatar_url = ""
    if p["avatar_path"]:
        avatar_url = f"/uploads/avatars/{os.path.basename(p['avatar_path'])}"

    return {
        "username": username,
        "first_name": p["first_name"],
        "last_name": p["last_name"],
        "email": p["email"],
        "phone": p["phone"],
        "dob": p["dob"],
        "gender": p["gender"],
        "drive_mode": p["drive_mode"],
        "two_fa_enabled": bool(p["two_fa_enabled"]),
        "two_fa_method": p["two_fa_method"],
        "avatar_url": avatar_url,
    }

@router.put("/me")
def update_me(payload: ProfileUpdate, username: str = Depends(get_current_username)):
    # basic validations
    if payload.gender and payload.gender not in ("male", "female"):
        raise HTTPException(status_code=400, detail="Invalid gender")

    if payload.drive_mode not in ("private", "share"):
        raise HTTPException(status_code=400, detail="Invalid drive_mode")

    if payload.email and "@" not in payload.email:
        raise HTTPException(status_code=400, detail="Invalid email")

    if payload.phone:
        digits = "".join([c for c in payload.phone if c.isdigit()])
        if len(digits) < 10:
            raise HTTPException(status_code=400, detail="Invalid phone")

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT * FROM user_profiles WHERE username=?", (username,))
    p = cur.fetchone()
    if not p:
        cur.execute("INSERT INTO user_profiles (username) VALUES (?)", (username,))
        conn.commit()

    cur.execute("""
        UPDATE user_profiles
        SET first_name=?, last_name=?, email=?, phone=?, dob=?, gender=?, drive_mode=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE username=?
    """, (
        payload.first_name.strip(),
        payload.last_name.strip(),
        payload.email.strip(),
        payload.phone.strip(),
        payload.dob.strip(),
        payload.gender.strip(),
        payload.drive_mode.strip(),
        username
    ))

    conn.commit()
    conn.close()
    return {"message": "Profile updated ✅"}

@router.post("/me/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    username: str = Depends(get_current_username)
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files allowed")

    # save as username.ext
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
        raise HTTPException(status_code=400, detail="Allowed: png/jpg/jpeg/webp")

    save_name = f"{username}{ext}"
    save_path = UPLOADS_DIR / save_name

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # update DB
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT * FROM user_profiles WHERE username=?", (username,))
    p = cur.fetchone()
    if not p:
        cur.execute("INSERT INTO user_profiles (username) VALUES (?)", (username,))
        conn.commit()

    cur.execute("UPDATE user_profiles SET avatar_path=?, updated_at=CURRENT_TIMESTAMP WHERE username=?",
                (str(save_path), username))
    conn.commit()
    conn.close()

    return {"message": "Avatar uploaded ✅", "avatar_url": f"/uploads/avatars/{save_name}"}


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.post("/me/password")
def change_password(
    payload: PasswordChange,
    username: str = Depends(get_current_username)
):
    cur_pass = normalize_password(payload.current_password)
    new_pass = normalize_password(payload.new_password)

    if len(new_pass) < 4:
        raise HTTPException(status_code=400, detail="New password must be at least 4 characters")

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT password_hash FROM users WHERE username=?", (username,))
    row = cur.fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    # verify old password
    if not pwd_context.verify(cur_pass, row["password_hash"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    # update password
    new_hash = pwd_context.hash(new_pass)
    cur.execute(
        "UPDATE users SET password_hash=? WHERE username=?",
        (new_hash, username)
    )

    conn.commit()
    conn.close()

    return {"message": "Password changed successfully ✅"}
