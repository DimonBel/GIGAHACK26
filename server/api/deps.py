"""Request dependencies: the store, the job runner, and who is signed in."""
import time

from fastapi import Depends, HTTPException, Request

from .db import Store
from .jobs import JobRunner
from .security import token_hash
from .settings import COOKIE, Settings


def get_store(request: Request) -> Store:
    return request.app.state.store


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_runner(request: Request) -> JobRunner:
    return request.app.state.runner


def get_mailer(request: Request):
    return request.app.state.mailer


def current_user(request: Request, store: Store = Depends(get_store),
                 settings: Settings = Depends(get_settings)) -> dict:
    token = request.cookies.get(COOKIE)
    user = token and store.session_user(token_hash(token), time.time() + settings.session_hours * 3600)
    if not user:
        raise HTTPException(401, "Not signed in")
    return user


def moderator(user: dict = Depends(current_user)) -> dict:
    if "moderator" not in user["cabinets"]:
        raise HTTPException(403, "Moderators only")
    return user
