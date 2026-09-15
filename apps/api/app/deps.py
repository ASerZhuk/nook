from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import ClientAccount, Master
from app.security import SESSION_COOKIE, decode_session, hash_token

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def current_master(request: Request, session: SessionDep) -> Master:
    master_id = decode_session(request.cookies.get(SESSION_COOKIE, ""))
    master = await session.get(Master, master_id) if master_id else None
    if not master:
        raise HTTPException(401, "Требуется вход")
    return master


async def current_client(request: Request, session: SessionDep) -> ClientAccount:
    token = request.headers.get("x-client-token") or request.query_params.get("t")
    account = await session.scalar(select(ClientAccount).where(ClientAccount.token_hash == hash_token(token))) if token else None
    if not account:
        raise HTTPException(401, "Ссылка недействительна")
    return account


async def public_master(slug: str, session: SessionDep) -> Master:
    master = await session.scalar(select(Master).where(Master.slug == slug.lower(), Master.onboarded.is_(True)))
    if not master:
        raise HTTPException(404, "Мастер не найден")
    return master


MasterDep = Annotated[Master, Depends(current_master)]
ClientDep = Annotated[ClientAccount, Depends(current_client)]
PublicMasterDep = Annotated[Master, Depends(public_master)]
