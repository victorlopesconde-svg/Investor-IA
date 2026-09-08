"""
rbac.py
Módulo RBAC — Role-Based Access Control (Pilar 4 — Ciber).
Define roles, permissões e middleware FastAPI para autorização.
"""
from fastapi import HTTPException, Depends, Request
from typing import Callable
import logging

logger = logging.getLogger(__name__)

# ── Definição de Roles e Permissões ───────────────────────────────────────────
# Cada role mapeia para uma lista de permissões.
# "*" = acesso total (wildcard).
ROLES: dict[str, list[str]] = {
    "admin": ["*"],
    "elite": [
        "chat", "analysis", "backtesting", "research",
        "alerts", "settings", "pages", "compare", "magic_formula", "api"
    ],
    "pro": [
        "chat", "analysis", "backtesting", "research",
        "alerts", "settings", "pages", "compare", "magic_formula",
    ],
    "free": ["chat", "analysis", "settings"],
    "viewer": ["chat"],
}

DEFAULT_ROLE = "free"


def check_permission(role: str, permission: str) -> bool:
    """
    Verifica se uma role possui a permissão solicitada.
    Retorna True se autorizado, False caso contrário.
    """
    perms = ROLES.get(role, [])
    if "*" in perms:
        return True
    return permission in perms


def require_permission(permission: str) -> Callable:
    """
    FastAPI Dependency factory.
    Uso: Depends(require_permission("chat"))

    Lê o usuário autenticado (já injetado por get_current_user)
    e verifica se a role dele tem a permissão solicitada.
    """
    def _check(request: Request):
        # O get_current_user já deve ter sido executado e populado request.state
        # Mas como usamos Depends em cadeia, recebemos o user como estado
        user = getattr(request.state, "current_user", None)
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não autenticado.")

        role = user.get("role") or DEFAULT_ROLE
        if not check_permission(role, permission):
            logger.warning(
                "[RBAC] Acesso NEGADO: user=%s role=%s permission=%s",
                user.get("client_id", "?"), role, permission,
            )
            raise HTTPException(
                status_code=403,
                detail=f"Acesso negado. Sua role '{role}' não possui permissão para '{permission}'.",
            )
        return user

    return _check
