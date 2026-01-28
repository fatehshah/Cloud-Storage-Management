from fastapi import FastAPI
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routes.file_routes import router as file_router
from app.routes.auth_routes import router as auth_router
from app.routes.share_routes import router as share_router
from app.routes.users_routes import router as users_router
from app.db import init_db

app = FastAPI(title="CloudDrive API", version="1.0")

# ✅ Serve uploaded files (avatars etc.)
BASE_DIR = Path(__file__).resolve().parent.parent  # backend/app -> backend
STORAGE_DIR = BASE_DIR / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(STORAGE_DIR)), name="uploads")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

app.include_router(auth_router)
app.include_router(file_router)
app.include_router(share_router)
app.include_router(users_router)


@app.get("/")
def root():
    return {"message": "CloudDrive API is running ✅"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
