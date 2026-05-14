from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from database import get_db
from models import User, Role
from auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SetupRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


@router.get("/setup-required")
def setup_required(db: Session = Depends(get_db)):
    has_users = db.query(User).first() is not None
    return {"setup_required": not has_users}


@router.post("/setup", response_model=TokenResponse)
def setup(body: SetupRequest, db: Session = Depends(get_db)):
    if db.query(User).first() is not None:
        raise HTTPException(status_code=400, detail="Setup already complete")
    user = User(
        email=body.email,
        name=body.name,
        role=Role.admin,
        hashed_password=hash_password(body.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_access_token(user.id)}


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email, User.is_active == True).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return {"access_token": create_access_token(user.id)}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user
