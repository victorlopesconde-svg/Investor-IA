"""
token_manager.py
Gerencia a contagem, reset e validação de limites de tokens de IA para cada plano de usuário.
"""
import sqlite3
import os
import logging
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Mapeamento padrão de limites de tokens por Role
ROLE_LIMITS = {
    "admin": 999999999,  # Sem limites práticos
    "elite": 15000000,   # 15M
    "pro": 5000000,      # 5M
    "free": 50000,       # 50k
    "viewer": 0,
}

def get_db_connection():
    # Caminho absoluto para o banco central
    db_path = os.path.join(os.path.dirname(__file__), "notifications.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def check_and_reset_tokens(client_id: str) -> dict:
    """
    Verifica se a cota do usuário deve ser resetada.
    Retorna o registro atualizado do usuário.
    """
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE client_id = ?", (client_id,)).fetchone()
        if not row:
            return None
            
        user = dict(row)
        reset_date_str = user.get("token_reset_date")
        now = datetime.now(timezone.utc)
        
        should_reset = False
        if not reset_date_str:
            should_reset = True
        else:
            try:
                # Trata timezone se presente, senão adiciona UTC
                reset_date = datetime.fromisoformat(reset_date_str)
                if reset_date.tzinfo is None:
                    reset_date = reset_date.replace(tzinfo=timezone.utc)
                if now >= reset_date:
                    should_reset = True
            except Exception as e:
                logger.error(f"[TokenManager] Erro ao parsear data de reset: {e}")
                should_reset = True
                
        if should_reset:
            # Próximo reset é daqui a 30 dias
            next_reset = (now + timedelta(days=30)).isoformat()
            role = user.get("role") or "free"
            limit = ROLE_LIMITS.get(role, 50000)
            
            conn.execute(
                "UPDATE users SET tokens_used = 0, token_limit = ?, token_reset_date = ? WHERE client_id = ?",
                (limit, next_reset, client_id)
            )
            conn.commit()
            logger.info(f"[TokenManager] Cota de tokens do usuário {client_id} resetada para o limite original do plano: {limit}. Novo reset em {next_reset}.")
            
            # Recarrega dados atualizados
            row = conn.execute("SELECT * FROM users WHERE client_id = ?", (client_id,)).fetchone()
            user = dict(row) if row else None
            
        return user
    finally:
        conn.close()

def has_enough_tokens(client_id: str) -> bool:
    """
    Verifica se o usuário possui cota disponível para requisições de IA.
    """
    user = check_and_reset_tokens(client_id)
    if not user:
        return False
        
    limit = user.get("token_limit") or 0
    used = user.get("tokens_used") or 0
    
    return used < limit

def verify_user_tokens(client_id: str):
    """
    FastAPI Helper: Lança HTTPException 403 se o usuário ultrapassou seu limite de tokens.
    """
    user = check_and_reset_tokens(client_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        
    limit = user.get("token_limit") or 0
    used = user.get("tokens_used") or 0
    
    if used >= limit:
        role_label = (user.get("role") or "free").capitalize()
        raise HTTPException(
            status_code=403,
            detail=f"Limite de tokens esgotado para o seu plano ({role_label}). Limite mensal: {limit:,} tokens. Consumido: {used:,} tokens."
        )

def consume_tokens(client_id: str, tokens: int):
    """
    Debita/Soma os tokens utilizados no banco de dados para o usuário.
    """
    if tokens <= 0:
        return
        
    conn = get_db_connection()
    try:
        conn.execute(
            "UPDATE users SET tokens_used = COALESCE(tokens_used, 0) + ? WHERE client_id = ?",
            (tokens, client_id)
        )
        conn.commit()
        logger.info(f"[TokenManager] Usuário {client_id} consumiu {tokens} tokens.")
    except Exception as e:
        logger.error(f"[TokenManager] Falha ao registrar consumo de tokens: {e}")
    finally:
        conn.close()
