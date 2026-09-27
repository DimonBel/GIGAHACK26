"""Search the ICD-10 dictionary (Romanian, Russian and English names) for the codes block of the minutes."""
from fastapi import APIRouter, Depends, Query

from mom.medical.dictionary import search

from ..deps import current_user
from ..schemas import Code

router = APIRouter(prefix="/codes", tags=["codes"])


@router.get("", response_model=list[Code])
def find_codes(q: str = Query("", max_length=100), limit: int = Query(8, ge=1, le=30),
               _: dict = Depends(current_user)):
    """By code prefix ("I21", "j96.0") or words in any of the three languages ("infarct", "инфаркт", "infarction")."""
    return search(q, limit)
