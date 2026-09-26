"""Distribution lists: admins write them, moderators pick recipients from them."""
from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import Db, DistributionList, ListMember, User, audit
from ..schemas import ListIn, ListPatch, MeetingType, MemberIn
from ..security import Admin, Manager
from ..serialize import list_json
from ..settings import check_recipient_domains, load_settings

router = APIRouter(prefix="/lists", tags=["lists"])


@router.get("")
def lists(_: Manager, db: Db, meeting_type: MeetingType | None = None) -> list[dict]:
    """All lists; with meeting_type, the lists for that type and those for any type."""
    query = select(DistributionList).order_by(func.lower(DistributionList.name))
    if meeting_type:
        query = query.where(or_(DistributionList.meeting_type == meeting_type,
                                DistributionList.meeting_type.is_(None)))
    return [list_json(d) for d in db.scalars(query)]


@router.post("", status_code=201)
def create_list(body: ListIn, user: Admin, db: Db) -> dict:
    _unique_name(db, body.name)
    dist = DistributionList(name=body.name, meeting_type=body.meeting_type, members=_members(db, body.members))
    db.add(dist)
    db.flush()
    audit(db, "list_create", user, detail=f"{dist.name} ({len(dist.members)} members)")
    db.commit()
    return list_json(dist)


@router.patch("/{list_id}")
def update_list(list_id: int, body: ListPatch, user: Admin, db: Db) -> dict:
    dist = _list(db, list_id)
    if body.name is not None and body.name != dist.name:
        _unique_name(db, body.name)
        dist.name = body.name
    if "meeting_type" in body.model_fields_set:
        dist.meeting_type = body.meeting_type
    if body.members is not None:
        dist.members = _members(db, body.members)
    audit(db, "list_update", user, detail=f"{dist.name}: {', '.join(sorted(body.model_fields_set))}")
    db.commit()
    return list_json(dist)


@router.delete("/{list_id}", status_code=204)
def delete_list(list_id: int, user: Admin, db: Db) -> Response:
    dist = _list(db, list_id)
    db.delete(dist)
    audit(db, "list_delete", user, detail=dist.name)
    db.commit()
    return Response(status_code=204)


def _list(db: Session, list_id: int) -> DistributionList:
    dist = db.get(DistributionList, list_id)
    if dist is None:
        raise HTTPException(404, "No such list")
    return dist


def _unique_name(db: Session, name: str):
    if db.scalar(select(DistributionList.id).where(DistributionList.name == name)) is not None:
        raise HTTPException(409, "A list with this name already exists")


def _members(db: Session, members: list[MemberIn]) -> list[ListMember]:
    """The members as rows, each address once; 400 for an unknown user or an address outside the allowed
    recipient domains."""
    try:
        check_recipient_domains([m.email for m in members if m.email], load_settings(db)["allowed_recipient_domains"])
    except ValueError as e:
        raise HTTPException(400, str(e)) from None
    rows, seen = [], set()
    for member in members:
        email = member.email
        if member.user_id is not None:
            user = db.get(User, member.user_id)
            if user is None:
                raise HTTPException(400, f"No user with id {member.user_id}")
            email = user.email
        if email not in seen:
            seen.add(email)
            rows.append(ListMember(user_id=member.user_id, email=member.email, kind=member.kind))
    return rows
