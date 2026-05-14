from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from license import get_license_status, activate_license
from pydantic import BaseModel

router = APIRouter(prefix="/api/license", tags=["license"])


class ActivateRequest(BaseModel):
    key: str


@router.get("")
def check_license(db: Session = Depends(get_db)):
    return get_license_status(db)


@router.post("/activate")
def activate(req: ActivateRequest, db: Session = Depends(get_db)):
    return activate_license(req.key, db)
