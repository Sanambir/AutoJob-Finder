import os
import json
from dotenv import load_dotenv

load_dotenv()

# AI Configuration  (Gemini only — no Anthropic needed)
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

# Auth
SECRET_KEY                  = os.getenv("SECRET_KEY", "change-me-in-production-please")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 days

# Match Threshold (configurable at runtime)
MATCH_THRESHOLD = int(os.getenv("MATCH_THRESHOLD", "75"))

# SMTP Configuration
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

# Job Search Defaults
DEFAULT_LOCATION     = os.getenv("DEFAULT_LOCATION", "Remote")
DEFAULT_RESULTS_EACH = int(os.getenv("DEFAULT_RESULTS_EACH", "10"))  # per platform

# App settings
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ── Persistent config (survives restarts) ─────────────────────────────────────
_CONFIG_FILE = os.path.join(os.path.dirname(__file__), ".config_state.json")


def _load_persisted_config() -> dict:
    """Load config from the JSON state file if it exists."""
    try:
        with open(_CONFIG_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_config() -> None:
    """Persist the current app_config to disk."""
    try:
        with open(_CONFIG_FILE, "w") as f:
            json.dump(app_config, f)
    except Exception:
        pass  # Never crash the app over a config save failure


# In-memory config store — initialised from disk, then env default
_persisted = _load_persisted_config()
app_config = {
    "match_threshold": _persisted.get("match_threshold", MATCH_THRESHOLD),
}
