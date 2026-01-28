import os
import json
import shutil
import mimetypes
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import FileResponse
from app.routes.auth_routes import get_username_from_token  # ✅ correct
from fastapi import Depends
router = APIRouter(prefix="/files", tags=["Files"])
from app.config import USERS_DIR
from datetime import datetime
os.makedirs(USERS_DIR, exist_ok=True)

def get_user_paths(username: str):
    user_root = os.path.join(USERS_DIR, username)
    uploads_dir = os.path.join(user_root, "uploads")
    trash_dir = os.path.join(user_root, "trash")
    index_file = os.path.join(user_root, "index.json")

    os.makedirs(uploads_dir, exist_ok=True)
    os.makedirs(trash_dir, exist_ok=True)


    if not os.path.exists(index_file):
        with open(index_file, "w", encoding="utf-8") as f:
            json.dump({"files": {}, "trash": {}, "favourites": {}}, f, indent=2)

    return uploads_dir, trash_dir, index_file



def load_index(index_file):
    if not os.path.exists(index_file):
        data = {"files": {}, "trash": {}, "favourites": {}}
        with open(index_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return data

    with open(index_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        data.setdefault("favourites", {})   # ✅ add this line
        return data


def save_index(index_file, data):
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def safe_join(base, rel_path: str):
    rel_path = rel_path.strip()
    if rel_path in ["", None]:
        return base

    # remove starting slashes
    rel_path = rel_path.replace("\\", "/").lstrip("/")

    # prevent traversal
    if ".." in rel_path.split("/"):
        raise HTTPException(status_code=400, detail="Invalid path")

    final = os.path.abspath(os.path.join(base, rel_path))
    if not final.startswith(os.path.abspath(base)):
        raise HTTPException(status_code=400, detail="Invalid path")

    return final


def list_dir(base_path: str):
    folders, files = [], []
    if not os.path.exists(base_path):
        os.makedirs(base_path, exist_ok=True)

    for name in os.listdir(base_path):
        full = os.path.join(base_path, name)
        if os.path.isdir(full):
            folders.append(name)
        else:
            files.append({
                "name": name,
                "size": os.path.getsize(full)
            })

    return folders, files


def get_type(filename: str):
    ext = filename.lower().split(".")[-1]
    if ext in ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]:
        return "image"
    if ext in ["mp4", "webm", "mkv", "mov", "avi"]:
        return "video"
    if ext in ["mp3", "wav", "ogg", "m4a", "aac", "flac"]:
        return "audio"
    if ext in ["pdf", "txt", "md", "json", "csv", "xml", "log"]:
        return "doc"   # treat as readable docs/text
    if ext in ["doc", "docx", "ppt", "pptx", "xls", "xlsx"]:
        return "office"
    return "file"

# -----------------------------
# Rename 
# -----------------------------

def validate_name(name: str):
    name = name.strip()

    if not name:
        raise HTTPException(status_code=400, detail="New name required")

    # block slashes and path tricks
    if "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Invalid name")

    if name in [".", ".."]:
        raise HTTPException(status_code=400, detail="Invalid name")

    return name

# -----------------------------
# LIST (Uploads)
# -----------------------------

def recursive_search(base_dir: str, query: str, uploads_dir: str):
    results_files = []
    results_folders = []
    q = query.lower()

    for root, dirs, files in os.walk(base_dir):
        rel_root = os.path.relpath(root, uploads_dir)
        rel_root = "" if rel_root == "." else rel_root.replace("\\", "/")

        # ✅ match folders
        for d in dirs:
            if q in d.lower():
                folder_path = f"{rel_root}/{d}".lstrip("/")
                results_folders.append(folder_path)

        # ✅ match files
        for f in files:
            if q in f.lower():
                full_path = os.path.join(root, f)
                results_files.append({
                    "name": f,
                    "size": os.path.getsize(full_path),
                    "type": get_type(f),
                    "path": rel_root   # folder where file exists
                })

    return results_folders, results_files


@router.get("/")
def list_items(
    path: str = Query(""),
    q: str = Query(""),
    sort_by: str = Query("name"),
    order: str = Query("asc"),
    username: str = Depends(get_username_from_token)
):
    uploads_dir, trash_dir, index_file = get_user_paths(username)

    full_path = safe_join(uploads_dir, path)

    # ✅ If user typed query -> do recursive search
      # ✅ If user typed query -> do recursive search
    if q.strip():
        found_folders, found_files = recursive_search(uploads_dir, q, uploads_dir)

        # ✅ Sorting
        order = order.lower()
        reverse = True if order == "desc" else False

        # sort folders by name
        found_folders = list(set(found_folders))
        found_folders.sort(key=lambda x: x.lower(), reverse=reverse)

        # sort files
        if sort_by == "name":
            found_files.sort(key=lambda x: x["name"].lower(), reverse=reverse)

        elif sort_by == "size":
            found_files.sort(key=lambda x: x["size"], reverse=reverse)

        elif sort_by == "type":
            found_files.sort(key=lambda x: x["type"], reverse=reverse)

        elif sort_by == "date":
            found_files.sort(
                key=lambda x: os.path.getctime(
                    safe_join(uploads_dir, f"{x.get('path','')}/{x['name']}".lstrip("/"))
                ),
                reverse=reverse
            )

        elif sort_by == "modified":
            found_files.sort(
                key=lambda x: os.path.getmtime(
                    safe_join(uploads_dir, f"{x.get('path','')}/{x['name']}".lstrip("/"))
                ),
                reverse=reverse
            )

        return {
            "path": path,
            "folders": found_folders,
            "files": found_files
        }


    # ✅ Normal listing (no search query)
    folders, files = list_dir(full_path)

    # ✅ Sorting normal listing
    order = order.lower()
    reverse = True if order == "desc" else False

    if sort_by == "name":
        folders.sort(key=lambda x: x.lower(), reverse=reverse)
        files.sort(key=lambda x: x["name"].lower(), reverse=reverse)

    elif sort_by == "size":
        folders.sort(key=lambda x: x.lower(), reverse=reverse)
        files.sort(key=lambda x: x["size"], reverse=reverse)

    elif sort_by == "type":
        folders.sort(key=lambda x: x.lower(), reverse=reverse)
        files.sort(key=lambda x: get_type(x["name"]), reverse=reverse)
    elif sort_by == "date":
        folders.sort(key=lambda x: x.lower(), reverse=reverse)
        files.sort(
        key=lambda x: os.path.getctime(os.path.join(full_path, x["name"])),
        reverse=reverse
    )
    elif sort_by == "modified":
        folders.sort(key=lambda x: x.lower(), reverse=reverse)
        files.sort(
            key=lambda x: os.path.getmtime(os.path.join(full_path, x["name"])),
            reverse=reverse
        )   
        
    else:
        folders.sort()
        files.sort(key=lambda x: x["name"].lower())

    return {
        "path": path,
        "folders": folders,
        "files": [
            {"name": f["name"], "size": f["size"], "type": get_type(f["name"])}
            for f in files
        ],
    }


# -----------------------------
# CREATE FOLDER
# -----------------------------


@router.post("/folder")
def create_folder(
    folder_name: str = Query(...),
    path: str = Query(""),
    username: str = Depends(get_username_from_token)
):
    if not folder_name.strip():
        raise HTTPException(status_code=400, detail="Folder name required")

    uploads_dir, trash_dir, index_file = get_user_paths(username)

    current_dir = safe_join(uploads_dir, path)
    new_folder = os.path.join(current_dir, folder_name.strip())

    if os.path.exists(new_folder):
        raise HTTPException(status_code=400, detail="Folder already exists")

    os.makedirs(new_folder, exist_ok=True)

    return {
        "message": "Folder created ✅",
        "folder": folder_name.strip(),
        "path": path
    }


# -----------------------------
# UPLOAD FILE
# -----------------------------


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    path: str = Query(""),
    username: str = Depends(get_username_from_token)
):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
    current_dir = safe_join(uploads_dir, path)
    os.makedirs(current_dir, exist_ok=True)

    save_path = os.path.join(current_dir, file.filename)

    with open(save_path, "wb") as f:
        f.write(await file.read())

    index = load_index(index_file)
    index["files"][f"{path}/{file.filename}".lstrip("/")] = {
        "name": file.filename,
        "path": path,
        "size": os.path.getsize(save_path),
        "type": get_type(file.filename)
    }
    save_index(index_file, index)

    return {"message": "Uploaded ✅", "filename": file.filename}

# -----------------------------
# DOWNLOAD / VIEW FILE
# -----------------------------
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import FileResponse
import mimetypes
import os

# (optional) add missing types if Windows doesn't guess them well
mimetypes.add_type("video/x-matroska", ".mkv")
mimetypes.add_type("audio/mp4", ".m4a")
mimetypes.add_type("audio/aac", ".aac")
mimetypes.add_type("video/quicktime", ".mov")
from fastapi import Request

@router.get("/download/{filename}")
def download_file(filename: str, path: str = Query(""),
    username: str = Depends(get_username_from_token)):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
    
    file_path = safe_join(uploads_dir, f"{path}/{filename}".lstrip("/"))
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    mime, _ = mimetypes.guess_type(file_path)
    if not mime:
        mime = "application/octet-stream"
    return FileResponse(
    file_path,
    filename=filename  # ✅ safe with unicode
)


@router.get("/trash/download/{filename}")
def download_trash_file(
    filename: str,
    username: str = Depends(get_username_from_token)
):
    uploads_dir, trash_dir, index_file = get_user_paths(username)

    file_path = safe_join(trash_dir, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Trash file not found")
    mime, _ = mimetypes.guess_type(file_path)
    if not mime:
        mime = "application/octet-stream"
    return FileResponse(
        file_path,
        media_type=mime,
        filename=filename,
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )

# -----------------------------
#  rename route
# -----------------------------
#
@router.patch("/rename")
def rename_item(
    old_name: str = Query(...),
    new_name: str = Query(...),
    path: str = Query(""),
    is_folder: bool = Query(False),
    username: str = Depends(get_username_from_token),
):
    uploads_dir, trash_dir, index_file = get_user_paths(username)

    new_name = validate_name(new_name)

    old_key = f"{path}/{old_name}".lstrip("/")
    new_key = f"{path}/{new_name}".lstrip("/")

    old_full = safe_join(uploads_dir, old_key)
    new_full = safe_join(uploads_dir, new_key)

    if not os.path.exists(old_full):
        raise HTTPException(status_code=404, detail="Item not found")

    if os.path.exists(new_full):
        raise HTTPException(status_code=400, detail="Name already exists")

    # ✅ rename on disk
    os.rename(old_full, new_full)

    # ✅ load index safely
    index = load_index(index_file)
    index.setdefault("files", {})
    index.setdefault("favourites", {})

    # ------------------------
    # FILE rename
    # ------------------------
    if not is_folder:
        if old_key in index["files"]:
            index["files"][new_key] = index["files"].pop(old_key)
            index["files"][new_key]["name"] = new_name
            index["files"][new_key]["path"] = path
            index["files"][new_key]["type"] = get_type(new_name)
            index["files"][new_key]["size"] = os.path.getsize(new_full)

        if old_key in index["favourites"]:
            index["favourites"][new_key] = index["favourites"].pop(old_key)
            index["favourites"][new_key]["name"] = new_name
            index["favourites"][new_key]["path"] = path
            index["favourites"][new_key]["type"] = get_type(new_name)
            index["favourites"][new_key]["is_folder"] = False

        save_index(index_file, index)
        return {"message": "Renamed ✅"}

    # ------------------------
    # FOLDER rename (Windows-like)
    # update ALL nested keys
    # ------------------------
    old_prefix = old_key.rstrip("/") + "/"
    new_prefix = new_key.rstrip("/") + "/"

    # update files keys under this folder
    new_files = {}
    for k, meta in index["files"].items():
        if k.startswith(old_prefix):
            nk = new_prefix + k[len(old_prefix):]
            meta = dict(meta)
            meta["path"] = os.path.dirname(nk).replace("\\", "/")
            if meta["path"] == ".":
                meta["path"] = ""
            new_files[nk] = meta
        else:
            new_files[k] = meta
    index["files"] = new_files

    # update favourites under this folder
    new_favs = {}
    for k, meta in index["favourites"].items():
        if k == old_key:
            nk = new_key
            meta = dict(meta)
            meta["name"] = new_name
            meta["path"] = path
            meta["type"] = "folder"
            meta["is_folder"] = True
            new_favs[nk] = meta
        elif k.startswith(old_prefix):
            nk = new_prefix + k[len(old_prefix):]
            meta = dict(meta)
            meta["path"] = os.path.dirname(nk).replace("\\", "/")
            if meta["path"] == ".":
                meta["path"] = ""
            new_favs[nk] = meta
        else:
            new_favs[k] = meta
    index["favourites"] = new_favs

    save_index(index_file, index)
    return {"message": "Renamed ✅"}




# -----------------------------
# DELETE FILE -> MOVE TO TRASH
# -----------------------------


@router.delete("/file/{filename}")
def delete_file(filename: str, path: str = Query(""),
                username: str = Depends(get_username_from_token) ):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
    file_path = safe_join(uploads_dir, f"{path}/{filename}".lstrip("/"))
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # move to trash
    trash_name = filename
    dest = os.path.join(trash_dir, trash_name)

    # prevent overwrite
    counter = 1
    while os.path.exists(dest):
        name, ext = os.path.splitext(filename)
        trash_name = f"{name}_{counter}{ext}"
        dest = os.path.join(trash_dir, trash_name)
        counter += 1

    shutil.move(file_path, dest)

    index = load_index(index_file)
    index["trash"][trash_name] = {
        "original_name": filename, "original_path": path}
    save_index(index_file, index)

    return {"message": "Moved to Trash ✅", "trash_name": trash_name}

# -----------------------------
# DELETE FOLDER -> MOVE TO TRASH
# -----------------------------


@router.delete("/folder")
def delete_folder(path: str = Query(...), username: str = Depends(get_username_from_token)):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
    folder_path = safe_join(uploads_dir, path)
    if not os.path.exists(folder_path):
        raise HTTPException(status_code=404, detail="Folder not found")

    base_name = os.path.basename(folder_path.rstrip("/"))
    trash_name = base_name
    dest = os.path.join(trash_dir, trash_name)

    counter = 1
    while os.path.exists(dest):
        trash_name = f"{base_name}_{counter}"
        dest = os.path.join(trash_dir, trash_name)
        counter += 1

    shutil.move(folder_path, dest)

    index = load_index(index_file)
    index["trash"][trash_name] = {
    "folder": True,
    "original_path": os.path.dirname(path.replace("\\", "/")),  # parent folder
    "original_name": base_name
}
    save_index(index_file, index)

    return {"message": "Folder moved to Trash ✅"}

# -----------------------------
# Favourite LIST
# -----------------------------

@router.post("/favourite/toggle")
def toggle_favourite(
    name: str = Query(...),
    path: str = Query(""),
    is_folder: bool = Query(False),
    username: str = Depends(get_username_from_token)
):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
    index = load_index(index_file)
    index.setdefault("favourites", {})

    key = f"{path}/{name}".lstrip("/")

    # ✅ If already favourite → remove
    if key in index["favourites"]:
        del index["favourites"][key]
        save_index(index_file, index)
        return {"message": "Removed from favourites ✅", "favourite": False}

    # ✅ Add favourite
    if is_folder:
        index["favourites"][key] = {
            "name": name,
            "path": path,
            "type": "folder",
            "size": 0,
            "is_folder": True
        }
    else:
        file_path = safe_join(uploads_dir, key)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")

        index["favourites"][key] = {
            "name": name,
            "path": path,
            "type": get_type(name),
            "size": os.path.getsize(file_path),
            "is_folder": False
        }

    save_index(index_file, index)
    return {"message": "Added to favourites ❤️", "favourite": True}

@router.get("/favourites")
def list_favourites(username: str = Depends(get_username_from_token)):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
    index = load_index(index_file)
    favs = index.get("favourites", {})

    folders = []
    files = []

    for key, item in favs.items():
        if item.get("is_folder"):
            folders.append({
                "name": item["name"],
                "path": item["path"]
            })
        else:
            files.append({
                "name": item["name"],
                "path": item["path"],
                "size": item["size"],
                "type": item["type"]
            })

    return {"folders": folders, "files": files}

# -----------------------------
# TRASH LIST
# -----------------------------

from fastapi import Depends

@router.get("/trash")
def list_trash(username: str = Depends(get_username_from_token)):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
   
    folders, files = list_dir(trash_dir)
    return {
        "folders": folders,
        "files": [
            {"name": f["name"], "size": f["size"], "type": get_type(f["name"])}
            for f in files
        ]
    }

# -----------------------------
# RESTORE FROM TRASH
# -----------------------------
from fastapi import Depends

@router.post("/trash/restore/{trash_name}")
@router.post("/trash/restore/{trash_name}")
def restore_trash_item(trash_name: str, username: str = Depends(get_username_from_token)):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
    index = load_index(index_file)

    meta = index["trash"].get(trash_name)
    if not meta:
        raise HTTPException(status_code=404, detail="Trash item not found")

    trash_path = safe_join(trash_dir, trash_name)
    if not os.path.exists(trash_path):
        raise HTTPException(status_code=404, detail="Trash file missing")

    # ✅ restore destination folder (parent)
    original_path = meta.get("original_path", "")
    dest_dir = safe_join(uploads_dir, original_path)
    os.makedirs(dest_dir, exist_ok=True)

    # ✅ decide final destination (file vs folder)
    if meta.get("folder") is True or os.path.isdir(trash_path):
        original_name = meta.get("original_name", trash_name)
        dest = os.path.join(dest_dir, original_name)

        counter = 1
        while os.path.exists(dest):
            dest = os.path.join(dest_dir, f"{original_name}_{counter}")
            counter += 1
    else:
        original_name = meta.get("original_name", trash_name)
        dest = os.path.join(dest_dir, original_name)

        counter = 1
        while os.path.exists(dest):
            name, ext = os.path.splitext(original_name)
            dest = os.path.join(dest_dir, f"{name}_{counter}{ext}")
            counter += 1

    # ✅ move happens ONLY ONCE
    shutil.move(trash_path, dest)

    del index["trash"][trash_name]
    save_index(index_file, index)

    return {"message": "Restored ✅"}


# -----------------------------
# PERMANENT DELETE (1)
# -----------------------------


@router.delete("/trash/delete/{trash_name}")
def delete_trash_item(trash_name: str,
    username: str = Depends(get_username_from_token)):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
    trash_path = safe_join(trash_dir, trash_name)
    if not os.path.exists(trash_path):
        raise HTTPException(status_code=404, detail="Trash item not found")

    if os.path.isdir(trash_path):
        shutil.rmtree(trash_path)
    else:
        os.remove(trash_path)

    index = load_index(index_file)
    if trash_name in index["trash"]:
        del index["trash"][trash_name]
        save_index(index_file, index)

    return {"message": "Deleted permanently ✅"}

# -----------------------------
# EMPTY TRASH (ALL)
# -----------------------------


@router.delete("/trash/empty")
def empty_trash(username: str = Depends(get_username_from_token)):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
    for name in os.listdir(trash_dir):
        full = os.path.join(trash_dir, name)
        if os.path.isdir(full):
            shutil.rmtree(full)
        else:
            os.remove(full)

    index = load_index(index_file)
    index["trash"] = {}
    save_index(index_file, index)

    return {"message": "Trash emptied ✅"}

# -----------------------------
# CUT
# -----------------------------

@router.post("/move")
def move_item(
    name: str = Query(...),
    from_path: str = Query(""),
    to_path: str = Query(""),
    is_folder: bool = Query(False),
    username: str = Depends(get_username_from_token),
):
    uploads_dir, trash_dir, index_file = get_user_paths(username)

    src_key = f"{from_path}/{name}".lstrip("/")
    dst_key = f"{to_path}/{name}".lstrip("/")

    src_full = safe_join(uploads_dir, src_key)
    dst_full = safe_join(uploads_dir, dst_key)

    if not os.path.exists(src_full):
        raise HTTPException(status_code=404, detail="Item not found")

    if os.path.exists(dst_full):
        raise HTTPException(status_code=400, detail="Destination already has same name")

    os.makedirs(os.path.dirname(dst_full), exist_ok=True)
    shutil.move(src_full, dst_full)

    # update index (minimal)
    index = load_index(index_file)
    index.setdefault("files", {})
    index.setdefault("favourites", {})

    if not is_folder:
        if src_key in index["files"]:
            meta = index["files"].pop(src_key)
            meta["path"] = to_path
            index["files"][dst_key] = meta

        if src_key in index["favourites"]:
            meta = index["favourites"].pop(src_key)
            meta["path"] = to_path
            index["favourites"][dst_key] = meta

        save_index(index_file, index)
        return {"message": "Moved ✅"}

    # folder move: update all nested keys
    old_prefix = src_key.rstrip("/") + "/"
    new_prefix = dst_key.rstrip("/") + "/"

    new_files = {}
    for k, meta in index["files"].items():
        if k.startswith(old_prefix):
            nk = new_prefix + k[len(old_prefix):]
            meta = dict(meta)
            meta["path"] = os.path.dirname(nk).replace("\\", "/")
            if meta["path"] == ".":
                meta["path"] = ""
            new_files[nk] = meta
        else:
            new_files[k] = meta
    index["files"] = new_files

    new_favs = {}
    for k, meta in index["favourites"].items():
        if k == src_key:
            nk = dst_key
            meta = dict(meta)
            meta["path"] = to_path
            new_favs[nk] = meta
        elif k.startswith(old_prefix):
            nk = new_prefix + k[len(old_prefix):]
            meta = dict(meta)
            meta["path"] = os.path.dirname(nk).replace("\\", "/")
            if meta["path"] == ".":
                meta["path"] = ""
            new_favs[nk] = meta
        else:
            new_favs[k] = meta
    index["favourites"] = new_favs

    save_index(index_file, index)
    return {"message": "Moved ✅"}

# -----------------------------
# Copy
# -----------------------------
@router.post("/copy")
def copy_item(
    name: str = Query(...),
    from_path: str = Query(""),
    to_path: str = Query(""),
    is_folder: bool = Query(False),
    username: str = Depends(get_username_from_token),
):
    uploads_dir, trash_dir, index_file = get_user_paths(username)

    src_key = f"{from_path}/{name}".lstrip("/")
    dst_key = f"{to_path}/{name}".lstrip("/")

    src_full = safe_join(uploads_dir, src_key)
    dst_full = safe_join(uploads_dir, dst_key)

    if not os.path.exists(src_full):
        raise HTTPException(status_code=404, detail="Item not found")

    if os.path.exists(dst_full):
        raise HTTPException(status_code=400, detail="Name already exists")

    os.makedirs(os.path.dirname(dst_full), exist_ok=True)

    # ✅ copy on disk
    if is_folder:
        shutil.copytree(src_full, dst_full)
    else:
        shutil.copy2(src_full, dst_full)

    # ✅ update index
    index = load_index(index_file)
    index.setdefault("files", {})
    index.setdefault("favourites", {})

    if not is_folder:
        # file meta
        index["files"][dst_key] = {
            "name": name,
            "path": to_path,
            "size": os.path.getsize(dst_full),
            "type": get_type(name)
        }
        save_index(index_file, index)
        return {"message": "Copied ✅"}

    # folder copy: add all nested files into index
    # easiest: scan copied folder and register files
    for root, _, files in os.walk(dst_full):
        rel_root = os.path.relpath(root, uploads_dir).replace("\\", "/")
        for f in files:
            fullp = os.path.join(root, f)
            key = f"{rel_root}/{f}".lstrip("/")
            index["files"][key] = {
                "name": f,
                "path": rel_root,
                "size": os.path.getsize(fullp),
                "type": get_type(f)
            }

    save_index(index_file, index)
    return {"message": "Copied ✅"}


# -----------------------------
# deatails
# -----------------------------


def iso_time(ts: float):
    return datetime.fromtimestamp(ts).isoformat(timespec="seconds")

def folder_stats(folder_path: str):
    total_size = 0
    files_count = 0
    folders_count = 0

    for root, dirs, files in os.walk(folder_path):
        folders_count += len(dirs)
        files_count += len(files)
        for f in files:
            fp = os.path.join(root, f)
            try:
                total_size += os.path.getsize(fp)
            except:
                pass

    return {
        "files_count": files_count,
        "folders_count": folders_count,
        "items_count": files_count + folders_count,
        "total_size": total_size
    }

@router.get("/details")
def get_item_details(
    name: str = Query(...),
    path: str = Query(""),
    is_folder: bool = Query(False),
    username: str = Depends(get_username_from_token),
):
    uploads_dir, trash_dir, index_file = get_user_paths(username)

    key = f"{path}/{name}".lstrip("/")
    full_path = safe_join(uploads_dir, key)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Item not found")

    st = os.stat(full_path)

    base = {
        "name": name,
        "path": path,
        "is_folder": is_folder,
        "created_at": iso_time(st.st_ctime),
        "modified_at": iso_time(st.st_mtime),
    }

    if is_folder:
        stats = folder_stats(full_path)
        base.update({
            "type": "folder",
            **stats
        })
        return base

    # file
    base.update({
        "type": get_type(name),
        "size": os.path.getsize(full_path)
    })
    return base



# -----------------------------
# storage usage
# -----------------------------

def dir_size_bytes(root_dir: str) -> int:
    total = 0
    for root, _, files in os.walk(root_dir):
        for f in files:
            fp = os.path.join(root, f)
            try:
                total += os.path.getsize(fp)
            except:
                pass
    return total


@router.get("/storage")
def get_storage_usage(username: str = Depends(get_username_from_token)):
    uploads_dir, trash_dir, index_file = get_user_paths(username)

    used_bytes = dir_size_bytes(uploads_dir)   # ✅ total drive usage
    return {"used_bytes": used_bytes}

# -----------------------------
# multi files upload
# -----------------------------


from typing import List

@router.post("/upload-multiple")
async def upload_multiple_files(
    files: List[UploadFile] = File(...),
    path: str = Query(""),
    username: str = Depends(get_username_from_token)
):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
    current_dir = safe_join(uploads_dir, path)
    os.makedirs(current_dir, exist_ok=True)

    index = load_index(index_file)

    uploaded = []
    failed = []

    for file in files:
        try:
            save_path = os.path.join(current_dir, file.filename)

            # ✅ save file
            with open(save_path, "wb") as f:
                f.write(await file.read())

            # ✅ update index
            key = f"{path}/{file.filename}".lstrip("/")
            index["files"][key] = {
                "name": file.filename,
                "path": path,
                "size": os.path.getsize(save_path),
                "type": get_type(file.filename)
            }

            uploaded.append(file.filename)

        except Exception as e:
            failed.append({"file": file.filename, "error": str(e)})

    save_index(index_file, index)

    return {
        "message": "Upload completed ✅",
        "uploaded": uploaded,
        "failed": failed
    }
# -----------------------------
# restore all from trash
# -----------------------------

@router.post("/trash/restore-all")
def restore_all_trash(username: str = Depends(get_username_from_token)):
    uploads_dir, trash_dir, index_file = get_user_paths(username)
    index = load_index(index_file)

    trash_map = index.get("trash", {})
    if not trash_map:
        return {"message": "Trash empty ✅", "restored": 0}

    restored = 0
    failed = []

    # loop over a COPY because we will delete keys
    for trash_name in list(trash_map.keys()):
        meta = trash_map.get(trash_name, {})

        trash_path = safe_join(trash_dir, trash_name)
        if not os.path.exists(trash_path):
            failed.append({"name": trash_name, "reason": "Missing in trash folder"})
            continue

        original_path = meta.get("original_path", "")
        dest_dir = safe_join(uploads_dir, original_path)
        os.makedirs(dest_dir, exist_ok=True)

        # decide destination name
        original_name = meta.get("original_name", trash_name)
        dest = os.path.join(dest_dir, original_name)

        # avoid overwrite
        counter = 1
        while os.path.exists(dest):
            if meta.get("folder") is True or os.path.isdir(trash_path):
                dest = os.path.join(dest_dir, f"{original_name}_{counter}")
            else:
                name, ext = os.path.splitext(original_name)
                dest = os.path.join(dest_dir, f"{name}_{counter}{ext}")
            counter += 1

        try:
            shutil.move(trash_path, dest)
            # remove from index only if move succeeded
            if trash_name in index["trash"]:
                del index["trash"][trash_name]
            restored += 1
        except Exception as e:
            failed.append({"name": trash_name, "reason": str(e)})

    save_index(index_file, index)

    return {
        "message": "Restore all finished ✅" if restored else "Nothing restored ❌",
        "restored": restored,
        "failed": failed
    }
