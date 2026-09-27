"""Runtime settings (admin only)."""
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request

from ..config import is_local_host
from ..db import Db, audit
from ..schemas import SettingsIn
from ..security import Admin
from ..settings import check_asr, load_settings, save_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings(_: Admin, db: Db) -> dict:
    return load_settings(db)


@router.put("")
def put_settings(body: SettingsIn, request: Request, user: Admin, db: Db) -> dict:
    """Changes the settings given (any subset); 400 if the result couldn't work on this machine."""
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    old = load_settings(db)
    new = {**old, **changes}
    try:
        if {"asr_engine", "asr_model"} & changes.keys():
            check_asr(new["asr_engine"], new["asr_model"])
    except ValueError as e:
        raise HTTPException(400, str(e)) from None
    if not request.app.state.config.allow_remote_delivery:
        hosts = {"n8n_webhook_url": urlsplit(new["n8n_webhook_url"]).hostname or "", "smtp_host": new["smtp_host"]}
        for key in changes.keys() & hosts.keys():
            if not is_local_host(hosts[key]):
                raise HTTPException(400, f"{key} must point to this machine (127.0.0.1 or localhost); "
                                         "set SECURE_MOM_ALLOW_REMOTE_DELIVERY=1 to allow another host")
    save_settings(db, changes)
    diff = [f"{key}: {old[key]} -> {value}" for key, value in changes.items() if old[key] != value]
    audit(db, "settings", user, detail="; ".join(diff) or "no changes")
    db.commit()
    return load_settings(db)
