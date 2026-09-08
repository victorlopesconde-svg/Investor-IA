"""
audit_log.py
Módulo de Trilha de Auditoria (Pilar 6 — Ciber).
Registra ações do sistema com estrutura obrigatória:
timestamp, actor_id, action, resource_id, ip_address, status, old_value, new_value.
Gravação assíncrona via BackgroundTasks do FastAPI.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def log_action(
    actor_id: str,
    action: str,
    resource_id: str = "",
    ip_address: str = "",
    status: str = "success",
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
) -> None:
    """
    Registra uma ação no audit log.
    Projetado para ser chamado via BackgroundTasks (assíncrono).

    Parâmetros:
        actor_id:    Quem executou a ação (client_id do JWT)
        action:      O que foi feito (ex: LOGIN, UPDATE_PROFILE, DELETE_DOCUMENT)
        resource_id: Em qual recurso (ex: user_123, document_abc)
        ip_address:  IP de origem
        status:      "success" ou "failure"
        old_value:   Valor anterior (para reversões)
        new_value:   Valor novo
    """
    try:
        import notifications_db
        notifications_db.insert_audit_log(
            actor_id=actor_id,
            action=action,
            resource_id=resource_id,
            ip_address=ip_address,
            status=status,
            old_value=old_value,
            new_value=new_value,
        )
        logger.info(
            "[AuditLog] %s | actor=%s | action=%s | resource=%s | status=%s",
            datetime.now(timezone.utc).isoformat(),
            actor_id, action, resource_id, status,
        )
    except Exception as exc:
        # Audit log NUNCA deve derrubar a requisição principal
        logger.error("[AuditLog] Falha ao gravar audit log: %s", exc)


def get_client_ip(request) -> str:
    """Extrai o IP real do cliente, considerando proxies (X-Forwarded-For)."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if hasattr(request, "client") and request.client:
        return request.client.host
    return "unknown"
