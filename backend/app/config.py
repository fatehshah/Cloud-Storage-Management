import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))   # backend/app
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
USERS_DIR = os.path.join(STORAGE_DIR, "users")
