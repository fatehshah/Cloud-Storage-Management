import os
import sqlite3
from datetime import datetime, timedelta
from app.auth.jwt_config import SECRET_KEY, ALGORITHM

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import jwt
from app.db import get_db
import hashlib

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
USERS_DIR = os.path.join(STORAGE_DIR, "users")


def normalize_password(p: str) -> str:
    p = (p or "").strip()
    b = p.encode("utf-8")

    # bcrypt limit is 72 bytes
    if len(b) <= 72:
        return p

    # if longer than 72 bytes, convert to fixed length
    return hashlib.sha256(b).hexdigest()



router = APIRouter(prefix="/auth", tags=["Auth"])

# ✅ password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ✅ JWT settings
# SECRET_KEY = "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_KEY"
# ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

# ✅ storage per user
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
USERS_DIR = os.path.join(STORAGE_DIR, "users")
os.makedirs(USERS_DIR, exist_ok=True)


class SignupRequest(BaseModel):
    username: str
    password: str
    drive_mode: str = "private"

class LoginRequest(BaseModel):
    username: str
    password: str


def create_user_folders(username: str):
    user_root = os.path.join(USERS_DIR, username)
    uploads = os.path.join(user_root, "uploads")
    trash = os.path.join(user_root, "trash")
    index_json = os.path.join(user_root, "index.json")

    os.makedirs(uploads, exist_ok=True)
    os.makedirs(trash, exist_ok=True)

    if not os.path.exists(index_json):
        with open(index_json, "w", encoding="utf-8") as f:
            f.write('{"files": {}, "trash": {}, "favourites": {}}')


def create_access_token(username: str):
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/signup")
def signup(data: SignupRequest):
    username = data.username.strip().lower()
    password = normalize_password(data.password)
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password too long (max 72 characters)")

    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")

    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")

    if len(password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    password_hash = pwd_context.hash(password)

    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, password_hash)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists")
    finally:
        conn.close()

    # ✅ create user folders
    create_user_folders(username)

    return {"message": "Account created ✅"}


@router.post("/login")
def login(data: LoginRequest):
    
    username = data.username.strip().lower()
    password = normalize_password(data.password)
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password too long (max 72 characters)")
    
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not pwd_context.verify(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

     # ✅ ADD THESE 2 LINES HERE
    print("✅ AUTH USING SECRET_KEY:", SECRET_KEY)
    print("✅ AUTH USING ALGORITHM:", ALGORITHM)
    
    token = create_access_token(username)
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": username
    }

from jose import JWTError
from fastapi import Header

def get_username_from_token(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing token")

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token format")

    token = authorization.replace("Bearer ", "")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expired or invalid")
