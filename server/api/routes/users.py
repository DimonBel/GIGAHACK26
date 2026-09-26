"""The hospital directory, for choosing who attended a meeting."""
from fastapi import APIRouter, Depends

from ..db import Store
from ..deps import get_store, moderator
from ..schemas import User

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[User])
def list_users(_: dict = Depends(moderator), store: Store = Depends(get_store)):
    return store.users()
