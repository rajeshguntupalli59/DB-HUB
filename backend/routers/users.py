import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models import User, Role
from auth import hash_password, get_current_user, require_admin

router = APIRouter(prefix="/api/users", tags=["users"])


class InviteRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "viewer"


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_active: bool
    created_at: datetime.datetime

    class Config:
        from_attributes = True


@router.get("", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(User).order_by(User.created_at).all()


@router.post("", response_model=UserResponse)
def invite_user(
    body: InviteRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if body.role not in ("admin", "editor", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already exists")
    user = User(
        email=body.email,
        name=body.name,
        role=Role(body.role),
        hashed_password=hash_password(body.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    body: UpdateUserRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.name is not None:
        user.name = body.name
    if body.role is not None:
        if body.role not in ("admin", "editor", "viewer"):
            raise HTTPException(status_code=400, detail="Invalid role")
        user.role = Role(body.role)
    if body.is_active is not None:
        user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"ok": True}
