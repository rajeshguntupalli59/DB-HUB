"""
License validation via Lemon Squeezy API.

Flow:
  1. Buyer enters their key from receipt email.
  2. Backend calls LS /licenses/activate — consumes one activation slot.
  3. Key + instance_id stored in SQLite app_settings table.
  4. Every subsequent start reads from SQLite only — no internet needed.

DEV bypass: set LICENSE_KEY=DEV in backend/.env
"""
import os
import socket
import requests
from sqlalchemy.orm import Session
from models import AppSettings

_LS_ACTIVATE = "https://api.lemonsqueezy.com/v1/licenses/activate"


def _call_ls_activate(key: str) -> tuple[bool, str, str]:
    try:
        hostname = socket.gethostname() or "dbhub"
        resp = requests.post(
            _LS_ACTIVATE,
            data={"license_key": key, "instance_name": hostname},
            headers={"Accept": "application/json"},
            timeout=15,
        )
        data = resp.json()
        if data.get("activated"):
            instance_id = (data.get("instance") or {}).get("id", "")
            return True, instance_id, ""
        error = data.get("error") or "Key is invalid or has already reached its activation limit."
        return False, "", error
    except requests.Timeout:
        return False, "", "Connection timed out. Check your internet and try again."
    except Exception:
        return False, "", "Could not reach the license server. Please try again in a few minutes."


def _get_setting(db: Session, key: str) -> str:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    return row.value if row else ""


def _set_setting(db: Session, key: str, value: str):
    existing = db.query(AppSettings).filter(AppSettings.key == key).first()
    if existing:
        existing.value = value
    else:
        db.add(AppSettings(key=key, value=value))
    db.commit()


def get_license_status(db: Session) -> dict:
    env_key = os.getenv("LICENSE_KEY", "").strip()
    if env_key:
        return {"activated": True, "key": env_key, "dev": env_key == "DEV"}

    stored = _get_setting(db, "license_key")
    return {"activated": bool(stored), "key": stored, "dev": False}


def activate_license(key: str, db: Session) -> dict:
    key = key.upper().strip()
    if not key:
        return {"activated": False, "error": "Please enter your license key."}

    # DEV bypass
    if key == "DEV":
        _set_setting(db, "license_key", "DEV")
        return {"activated": True, "key": "DEV"}

    success, instance_id, error = _call_ls_activate(key)
    if not success:
        return {"activated": False, "error": error}

    _set_setting(db, "license_key", key)
    if instance_id:
        _set_setting(db, "license_instance_id", instance_id)
    return {"activated": True, "key": key}
