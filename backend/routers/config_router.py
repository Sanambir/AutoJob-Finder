from fastapi import APIRouter
from pydantic import BaseModel
from config import app_config, save_config

router = APIRouter()


class ConfigResponse(BaseModel):
    match_threshold: int


class ConfigUpdate(BaseModel):
    match_threshold: int


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    return ConfigResponse(match_threshold=app_config["match_threshold"])


@router.patch("/config", response_model=ConfigResponse)
async def update_config(payload: ConfigUpdate):
    app_config["match_threshold"] = max(0, min(100, payload.match_threshold))
    save_config()  # Persist to disk so it survives restarts
    return ConfigResponse(match_threshold=app_config["match_threshold"])

