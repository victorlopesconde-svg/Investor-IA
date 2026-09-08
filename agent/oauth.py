"""
oauth.py
Módulo SSO — Google OAuth (Pilar 2 — Ciber).
Valida tokens do Google Identity Services e cria/vincula usuários.
"""
import os
import logging
from typing import Optional, Dict

import httpx

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo"


async def verify_google_token(id_token: str) -> Optional[Dict]:
    """
    Valida um id_token do Google usando a API tokeninfo.
    Retorna o payload do token (email, name, picture, etc.) ou None se inválido.
    """
    if not GOOGLE_CLIENT_ID:
        logger.error("[OAuth] GOOGLE_CLIENT_ID não configurado.")
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                GOOGLE_TOKEN_INFO_URL,
                params={"id_token": id_token},
            )

        if response.status_code != 200:
            logger.warning("[OAuth] Google tokeninfo retornou %d", response.status_code)
            return None

        payload = response.json()

        # Verifica se o token foi emitido para o nosso client_id
        if payload.get("aud") != GOOGLE_CLIENT_ID:
            logger.warning("[OAuth] Token não corresponde ao GOOGLE_CLIENT_ID esperado.")
            return None

        # Verifica se o email foi verificado
        if payload.get("email_verified") != "true":
            logger.warning("[OAuth] Email não verificado pelo Google.")
            return None

        return {
            "email": payload.get("email"),
            "name": payload.get("name", payload.get("email", "").split("@")[0]),
            "picture": payload.get("picture"),
            "google_sub": payload.get("sub"),
        }

    except Exception as exc:
        logger.error("[OAuth] Erro ao validar token do Google: %s", exc)
        return None


def get_or_create_user_from_google(google_payload: Dict) -> Dict:
    """
    Busca ou cria um usuário com base no payload do Google.
    Se o email já existe no banco, vincula. Caso contrário, cria um novo.
    Retorna o dict do usuário do banco.
    """
    import uuid
    import notifications_db

    email = google_payload["email"]
    existing = notifications_db.get_user_by_email(email)

    if existing:
        # Atualiza foto se ainda não tiver
        if not existing.get("photo_url") and google_payload.get("picture"):
            notifications_db.save_user_profile(existing["client_id"], {
                "name": existing.get("name") or google_payload["name"],
                "email": email,
                "role": existing.get("role", "pro"),
                "photo_url": google_payload["picture"],
                "settings": existing.get("settings", {}),
            })
            existing["photo_url"] = google_payload["picture"]
        return existing

    # Criar novo usuário via Google (sem password_hash)
    client_id = str(uuid.uuid4())
    with notifications_db._lock:
        conn = notifications_db._connect()
        try:
            conn.execute(
                """INSERT INTO users (client_id, name, email, password_hash, role, photo_url)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    client_id,
                    google_payload["name"],
                    email,
                    "",  # sem senha — login exclusivamente via Google
                    "pro",
                    google_payload.get("picture", ""),
                ),
            )
            conn.commit()
        finally:
            conn.close()

    return notifications_db.get_user_by_email(email)
