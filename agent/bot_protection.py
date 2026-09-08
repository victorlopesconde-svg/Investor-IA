"""
bot_protection.py
Proteção contra bots em rotas públicas sensíveis (registro, login).

Duas camadas, ambas com graceful degradation (nunca derrubam o app):
1. Honeypot — campo invisível que só um bot preencheria. Grátis, sem config.
2. Cloudflare Turnstile (opcional) — validação real de CAPTCHA server-side,
   ativada automaticamente se TURNSTILE_SECRET_KEY estiver definido no .env.
"""
import os
import logging
import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "")
_TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def check_honeypot(value: str | None) -> None:
    """
    Verifica o campo-armadilha (honeypot). Formulários legítimos preenchidos
    por humanos deixam esse campo vazio; bots que preenchem tudo caem nele.
    Lança 400 com mensagem genérica para não revelar a armadilha.
    """
    if value:
        logger.warning("[BotProtection] Honeypot preenchido — requisição bloqueada como bot.")
        raise HTTPException(status_code=400, detail="Não foi possível processar a solicitação.")


async def verify_captcha(token: str | None, remote_ip: str = "") -> None:
    """
    Valida um token do Cloudflare Turnstile contra a API da Cloudflare.
    Se TURNSTILE_SECRET_KEY não estiver configurada, a verificação é
    ignorada (graceful degradation) — permite operar sem CAPTCHA até a
    chave ser configurada em produção.
    """
    if not TURNSTILE_SECRET_KEY:
        return

    if not token:
        raise HTTPException(status_code=400, detail="Verificação anti-robô ausente.")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                _TURNSTILE_VERIFY_URL,
                data={"secret": TURNSTILE_SECRET_KEY, "response": token, "remoteip": remote_ip},
            )
            result = resp.json()
    except Exception as exc:
        logger.error("[BotProtection] Falha ao consultar Turnstile: %s", exc)
        # Falha na verificação externa não deve travar o login/registro legítimo
        return

    if not result.get("success"):
        logger.warning("[BotProtection] Turnstile rejeitou o token: %s", result.get("error-codes"))
        raise HTTPException(status_code=403, detail="Verificação anti-robô falhou. Tente novamente.")
