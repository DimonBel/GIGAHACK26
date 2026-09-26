"""Sign in with email + password; the session is an HttpOnly cookie, so a reload stays signed in."""
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from ..db import Store
from ..deps import current_user, get_settings, get_store
from ..schemas import LoginIn, User
from ..security import new_token, token_hash, verify_password
from ..settings import COOKIE, Settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=User)
def login(body: LoginIn, response: Response, store: Store = Depends(get_store),
          settings: Settings = Depends(get_settings)):
    user = store.user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Wrong email or password")
    token, max_age = new_token(), int(settings.session_hours * 3600)
    store.add_session(token_hash(token), user["id"], time.time() + max_age)
    response.set_cookie(COOKIE, token, max_age=max_age, httponly=True, samesite="lax", path="/")
    return user


@router.get("/me", response_model=User)
def me(user: dict = Depends(current_user)):
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, store: Store = Depends(get_store)):
    token = request.cookies.get(COOKIE)
    if token:
        store.delete_session(token_hash(token))
    response.delete_cookie(COOKIE, path="/")
