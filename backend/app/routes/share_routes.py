import token
from urllib import request
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timedelta
from app.config import USERS_DIR
from fastapi.responses import FileResponse
from app.auth.security import get_current_username
from app.services.share_service import create_share_link, validate_and_touch_share, revoke_share, extend_share
from fastapi import Request

from fastapi.responses import FileResponse



router = APIRouter(tags=["Share"])
import os 



@router.get("/s/{token}/download")
def download_shared_file(token: str):
    try:
        share = validate_and_touch_share(token)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    if share["item_type"] != "file":
        raise HTTPException(status_code=400, detail="Not a file share")

    owner = share["owner_username"]
    item_path = share["item_path"]

    file_path = os.path.join(USERS_DIR, owner, "uploads", item_path)

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(file_path, filename=os.path.basename(file_path))

# Keep ping for testing ✅
@router.get("/share/ping")
def ping():
    return {"message": "Share router works ✅"}

# ---------------------------
# Owner: Create share link
# ---------------------------
@router.post("/share/create")
def create_share(
    item_type: str = Query(...),        # "file" or "folder"
    item_path: str = Query(""),         # e.g. "docs" or "docs/a.pdf"
    permission: str = Query("view"),    # view/download/upload
    expires_in_minutes: int | None = Query(None),
    expire_after_open_minutes: int | None = Query(None),
    username: str = Depends(get_current_username),
):
    # convert expiry settings
    expires_at = None
    if expires_in_minutes is not None:
        expires_at = (datetime.utcnow() + timedelta(minutes=expires_in_minutes)).isoformat()

    expire_after_open_seconds = None
    if expire_after_open_minutes is not None:
        expire_after_open_seconds = int(expire_after_open_minutes) * 60

    try:
        data = create_share_link(
            username=username,
            item_type=item_type,
            item_path=item_path.strip().lstrip("/"),
            permission=permission,
            expires_at=expires_at,
            expire_after_open_seconds=expire_after_open_seconds
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    base = str(request.base_url).rstrip("/")
    share_url = f"{base}/shared.html?token={['token']}"
    return {"share_url": share_url}
# ---------------------------
# Public: Open link (starts timer if needed)
# ---------------------------
@router.get("/s/{token}")
def open_share(token: str):
    try:
        share = validate_and_touch_share(token)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../frontend"))
    shared_html = os.path.join(frontend_dir, "shared.html")
    return FileResponse(shared_html)

# ---------------------------
# Owner: Revoke link
# ---------------------------
@router.post("/share/{token}/revoke")
def revoke(token: str, username: str = Depends(get_current_username)):
    try:
        revoke_share(username, token)
        return {"message": "Share link revoked ✅"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ---------------------------
# Owner: Extend / Reactivate link
# ---------------------------
@router.post("/share/{token}/extend")
def extend(
    token: str,
    expires_in_minutes: int | None = Query(None),
    expire_after_open_minutes: int | None = Query(None),
    username: str = Depends(get_current_username),
):
    new_expires_at = None
    if expires_in_minutes is not None:
        new_expires_at = (datetime.utcnow() + timedelta(minutes=expires_in_minutes)).isoformat()

    extra_seconds_after_open = None
    if expire_after_open_minutes is not None:
        extra_seconds_after_open = int(expire_after_open_minutes) * 60

    try:
        extend_share(username, token, new_expires_at, extra_seconds_after_open)
        return {"message": "Share link extended/reactivated ✅"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/s/{token}/list")
def list_shared(token: str, path: str = Query("")):
    """
    Public: List items inside a shared folder (or show shared file info).
    Example:
      /s/<token>/list?path=        -> list shared root
      /s/<token>/list?path=subdir  -> list inside a subfolder (optional later)
    """
    try:
        share = validate_and_touch_share(token)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    owner = share["owner_username"]
    item_type = share["item_type"]
    item_path = share["item_path"]

    # Owner root uploads directory
    owner_uploads = os.path.join(USERS_DIR, owner, "uploads")

    # shared target base (file or folder)
    shared_base = os.path.join(owner_uploads, item_path)

    # If it's a shared FILE, just return file details
    if item_type == "file":
        if not os.path.isfile(shared_base):
            raise HTTPException(status_code=404, detail="Shared file not found")
        return {
            "type": "file",
            "name": os.path.basename(shared_base),
            "owner_username": owner,
            "permission": share["permission"],
        }

    # If it's a shared FOLDER, list items
    if not os.path.isdir(shared_base):
        raise HTTPException(status_code=404, detail="Shared folder not found")

    # Optional: allow browsing inside shared folder
    safe_rel = (path or "").strip().lstrip("/")

    target_dir = os.path.normpath(os.path.join(shared_base, safe_rel))

    # Security: prevent escaping outside shared folder
    if not target_dir.startswith(os.path.normpath(shared_base)):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not os.path.isdir(target_dir):
        raise HTTPException(status_code=404, detail="Folder not found")

    items = []
    for name in os.listdir(target_dir):
        full = os.path.join(target_dir, name)
        items.append({
            "name": name,
            "type": "folder" if os.path.isdir(full) else "file"
        })

    return {
        "type": "folder",
        "owner_username": owner,
        "permission": share["permission"],
        "shared_root": item_path,
        "path": safe_rel,
        "items": items
    }


@router.get("/s/{token}/list")
def list_shared(token: str, path: str = Query("")):
    try:
        share = validate_and_touch_share(token)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))

    owner = share["owner_username"]
    item_type = share["item_type"]
    item_path = share["item_path"]

    owner_uploads = os.path.join(USERS_DIR, owner, "uploads")
    shared_base = os.path.join(owner_uploads, item_path)

    # Shared file
    if item_type == "file":
        if not os.path.isfile(shared_base):
            raise HTTPException(status_code=404, detail="Shared file not found")
        return {
            "type": "file",
            "owner_username": owner,
            "permission": share["permission"],
            "name": os.path.basename(shared_base),
            "path": item_path,
        }

    # Shared folder
    if not os.path.isdir(shared_base):
        raise HTTPException(status_code=404, detail="Shared folder not found")

    safe_rel = (path or "").strip().lstrip("/")
    target_dir = os.path.normpath(os.path.join(shared_base, safe_rel))

    # Prevent escaping outside shared folder
    if not target_dir.startswith(os.path.normpath(shared_base)):
        raise HTTPException(status_code=400, detail="Invalid path")

    if not os.path.isdir(target_dir):
        raise HTTPException(status_code=404, detail="Folder not found")

    items = []
    for name in os.listdir(target_dir):
        full = os.path.join(target_dir, name)
        items.append({
            "name": name,
            "type": "folder" if os.path.isdir(full) else "file"
        })

    return {
        "type": "folder",
        "owner_username": owner,
        "permission": share["permission"],
        "shared_root": item_path,
        "path": safe_rel,
        "items": items
    }
