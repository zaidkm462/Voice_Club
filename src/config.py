import os


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE = os.path.join(BASE_DIR, "competition.db")

STORAGE_DIR = os.path.join(BASE_DIR, "storage")

PDF_DIR = os.path.join(STORAGE_DIR, "pdfs")

RECORDING_DIR = os.path.join(STORAGE_DIR, "recordings")

# Maximum number of recordings a contestant may upload.
MAX_RECORDS_UPLOADS = 4

SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-key")
