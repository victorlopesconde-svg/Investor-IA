"""
notifications_db.py
SQLite local unificado atuando como Banco de Dados Central do InvestorIA.
Persiste:
  - alerts (regras sincronizadas do frontend)
  - notification_history (histórico de alertas disparados)
  - alert_cooldowns (evitar re-disparo em 60 min)
  - users (perfil e configurações do usuário)
  - documents (conteúdos extraídos do módulo Páginas para chat RAG)
  - conversations (sessões de chat assistido por IA)
  - messages (histórico de mensagens do chat)
"""
import sqlite3
import json
import os
import threading
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any

# DATA_DIR aponta para um disco persistente em produção (Render); por padrão
# usa agent/, mantendo o comportamento local inalterado.
DATA_DIR = os.getenv("DATA_DIR", os.path.dirname(__file__))
DB_PATH = os.path.join(DATA_DIR, "notifications.db")

_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Cria as tabelas se não existirem. Chamado no startup da API."""
    with _lock:
        conn = _connect()
        try:
            conn.executescript("""
                -- Tabelas Legadas de Alertas
                CREATE TABLE IF NOT EXISTS alerts (
                    id          TEXT PRIMARY KEY,
                    client_id   TEXT NOT NULL,
                    ticker      TEXT NOT NULL,
                    condition   TEXT NOT NULL,
                    threshold   REAL NOT NULL,
                    active      INTEGER DEFAULT 1,
                    created_at  TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS notification_history (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    client_id   TEXT NOT NULL,
                    ticker      TEXT NOT NULL,
                    title       TEXT NOT NULL,
                    body        TEXT NOT NULL,
                    severity    TEXT DEFAULT 'info',
                    condition   TEXT,
                    value       REAL,
                    price       REAL,
                    sent_at     TEXT DEFAULT (datetime('now')),
                    read        INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS alert_cooldowns (
                    alert_id    TEXT PRIMARY KEY,
                    last_fired  TEXT NOT NULL
                );

                -- Novas Tabelas: Usuários / Perfil
                CREATE TABLE IF NOT EXISTS users (
                    client_id     TEXT PRIMARY KEY,
                    name          TEXT,
                    email         TEXT UNIQUE,
                    password_hash TEXT,
                    role          TEXT,
                    photo_url     TEXT,
                    settings      TEXT,
                    created_at    TEXT DEFAULT (datetime('now'))
                );

                -- Nova Tabela: Filas de IA (Task Queue)
                CREATE TABLE IF NOT EXISTS ai_tasks (
                    task_id       TEXT PRIMARY KEY,
                    client_id     TEXT NOT NULL,
                    status        TEXT DEFAULT 'processing',
                    result        TEXT,
                    error         TEXT,
                    created_at    TEXT DEFAULT (datetime('now')),
                    updated_at    TEXT DEFAULT (datetime('now'))
                );

                -- Novas Tabelas: Documentos (Páginas RAG)
                CREATE TABLE IF NOT EXISTS documents (
                    session_id   TEXT PRIMARY KEY,
                    client_id    TEXT NOT NULL,
                    filename     TEXT NOT NULL,
                    info         TEXT,
                    content_text TEXT NOT NULL,
                    uploaded_at  TEXT DEFAULT (datetime('now'))
                );

                -- Chunks com embeddings para RAG
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id   TEXT NOT NULL,
                    chunk_index  INTEGER NOT NULL,
                    chunk_text   TEXT NOT NULL,
                    embedding    TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES documents(session_id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_chunks_session ON document_chunks(session_id);

                -- Novas Tabelas: Chat
                CREATE TABLE IF NOT EXISTS conversations (
                    id          TEXT PRIMARY KEY,
                    client_id   TEXT NOT NULL,
                    title       TEXT NOT NULL,
                    updated_at  INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id              TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role            TEXT NOT NULL,
                    text            TEXT NOT NULL,
                    tickers         TEXT,
                    timestamp       INTEGER NOT NULL,
                    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                );

                -- Tabela Ciber: Refresh Tokens (Pilar 3)
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    token_id    TEXT PRIMARY KEY,
                    client_id   TEXT NOT NULL,
                    token_hash  TEXT NOT NULL,
                    expires_at  TEXT NOT NULL,
                    revoked     INTEGER DEFAULT 0,
                    created_at  TEXT DEFAULT (datetime('now'))
                );

                -- Tabela Ciber: Audit Logs (Pilar 6)
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp   TEXT DEFAULT (datetime('now')),
                    actor_id    TEXT NOT NULL,
                    action      TEXT NOT NULL,
                    resource_id TEXT,
                    ip_address  TEXT,
                    status      TEXT NOT NULL,
                    old_value   TEXT,
                    new_value   TEXT
                );

                -- Índices Otimizados
                CREATE INDEX IF NOT EXISTS idx_alerts_client ON alerts(client_id);
                CREATE INDEX IF NOT EXISTS idx_history_client ON notification_history(client_id);
                CREATE INDEX IF NOT EXISTS idx_docs_client ON documents(client_id);
                CREATE INDEX IF NOT EXISTS idx_conv_client ON conversations(client_id);
                CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
                CREATE INDEX IF NOT EXISTS idx_refresh_client ON refresh_tokens(client_id);
                CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
                CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
                CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
            """)
            # Migrações incrementais seguras para colunas de tokens
            for col, col_type in [("token_limit", "INTEGER DEFAULT 0"),
                                  ("tokens_used", "INTEGER DEFAULT 0"),
                                  ("token_reset_date", "TEXT")]:
                try:
                    conn.execute(f"ALTER TABLE users ADD COLUMN {col} {col_type}")
                except sqlite3.OperationalError:
                    pass  # Coluna já existe
            conn.commit()
        finally:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# FUNÇÕES DE ALERTAS E NOTIFICAÇÕES (LEGADO MANTIDO INTACTO)
# ══════════════════════════════════════════════════════════════════════════════

def sync_alerts(client_id: str, alerts: List[Dict]) -> None:
    """Substitui todos os alertas de um client_id pelos dados do frontend."""
    with _lock:
        conn = _connect()
        try:
            conn.execute("DELETE FROM alerts WHERE client_id = ?", (client_id,))
            for a in alerts:
                conn.execute(
                    """INSERT OR REPLACE INTO alerts
                       (id, client_id, ticker, condition, threshold, active)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        str(a.get("id", "")),
                        client_id,
                        a.get("ticker", "").upper(),
                        a.get("condition", "price_drop"),
                        float(a.get("threshold", 5)),
                        1 if a.get("active", True) else 0,
                    ),
                )
            conn.commit()
        finally:
            conn.close()


def get_all_active_alerts() -> List[Dict]:
    """Retorna todos os alertas ativos de todos os clients."""
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute("SELECT * FROM alerts WHERE active = 1").fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def is_on_cooldown(alert_id: str, cooldown_minutes: int = 60) -> bool:
    """Retorna True se o alerta foi disparado nos últimos cooldown_minutes min."""
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT last_fired FROM alert_cooldowns WHERE alert_id = ?",
                (alert_id,),
            ).fetchone()
            if not row:
                return False
            last_fired = datetime.fromisoformat(row["last_fired"])
            return datetime.utcnow() - last_fired < timedelta(minutes=cooldown_minutes)
        finally:
            conn.close()


def set_cooldown(alert_id: str) -> None:
    """Marca o alerta como disparado agora."""
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                """INSERT OR REPLACE INTO alert_cooldowns (alert_id, last_fired)
                   VALUES (?, ?)""",
                (alert_id, datetime.utcnow().isoformat()),
            )
            conn.commit()
        finally:
            conn.close()


def save_notification(notification: dict) -> None:
    """Persiste a notificação no histórico."""
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                """INSERT INTO notification_history
                   (client_id, ticker, title, body, severity, condition, value, price)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    notification.get("client_id", ""),
                    notification.get("ticker", ""),
                    notification.get("title", ""),
                    notification.get("body", ""),
                    notification.get("severity", "info"),
                    notification.get("condition", ""),
                    notification.get("value", 0),
                    notification.get("price", 0),
                ),
            )
            conn.commit()
        finally:
            conn.close()


def get_history(client_id: str, limit: int = 30) -> List[Dict]:
    """Retorna as últimas notificações de um client."""
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """SELECT * FROM notification_history
                   WHERE client_id = ?
                   ORDER BY sent_at DESC LIMIT ?""",
                (client_id, limit),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def mark_all_read(client_id: str) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                "UPDATE notification_history SET read = 1 WHERE client_id = ?",
                (client_id,),
            )
            conn.commit()
        finally:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# NOVAS FUNÇÕES CRUD: USUÁRIOS / PERFIL
# ══════════════════════════════════════════════════════════════════════════════

def get_user_profile(client_id: str) -> Optional[Dict]:
    with _lock:
        conn = _connect()
        try:
            row = conn.execute("SELECT * FROM users WHERE client_id = ?", (client_id,)).fetchone()
            if not row:
                return None
            res = dict(row)
            # Decripta e decodifica JSON de settings se existir (Pilar 5 — AES-256)
            if res.get("settings"):
                try:
                    from encryption import decrypt_field, is_encrypted
                    raw = res["settings"]
                    if is_encrypted(raw):
                        raw = decrypt_field(raw)
                    res["settings"] = json.loads(raw)
                except Exception:
                    try:
                        res["settings"] = json.loads(res["settings"])
                    except Exception:
                        pass
            return res
        finally:
            conn.close()


def save_user_profile(client_id: str, profile_data: dict) -> None:
    with _lock:
        conn = _connect()
        try:
            settings_str = json.dumps(profile_data.get("settings", {}))
            # Encripta settings com AES-256-GCM (Pilar 5 — Ciber)
            try:
                from encryption import encrypt_field
                settings_str = encrypt_field(settings_str)
            except Exception:
                pass  # Se encriptação falhar, salva em texto (graceful degradation)
            conn.execute(
                """INSERT OR REPLACE INTO users
                   (client_id, name, email, role, photo_url, settings, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM users WHERE client_id = ?), datetime('now')))""",
                (
                    client_id,
                    profile_data.get("name", ""),
                    profile_data.get("email", ""),
                    profile_data.get("role", "pro"),
                    profile_data.get("photo_url") or profile_data.get("photo"),
                    settings_str,
                    client_id,
                ),
            )
            conn.commit()
        finally:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# NOVAS FUNÇÕES CRUD: DOCUMENTOS / PÁGINAS RAG
# ══════════════════════════════════════════════════════════════════════════════

def save_document_session(session_id: str, client_id: str, filename: str, info: str, content_text: str) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                """INSERT OR REPLACE INTO documents
                   (session_id, client_id, filename, info, content_text)
                   VALUES (?, ?, ?, ?, ?)""",
                (session_id, client_id, filename, info, content_text),
            )
            conn.commit()
        finally:
            conn.close()


def get_document_session(session_id: str) -> Optional[Dict]:
    with _lock:
        conn = _connect()
        try:
            row = conn.execute("SELECT * FROM documents WHERE session_id = ?", (session_id,)).fetchone()
            if not row:
                return None
            return dict(row)
        finally:
            conn.close()


def get_user_documents(client_id: str) -> List[Dict]:
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT session_id, filename, info, uploaded_at FROM documents WHERE client_id = ? ORDER BY uploaded_at DESC",
                (client_id,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def delete_document_session(session_id: str) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute("DELETE FROM documents WHERE session_id = ?", (session_id,))
            conn.execute("DELETE FROM document_chunks WHERE session_id = ?", (session_id,))
            conn.commit()
        finally:
            conn.close()


# ── RAG: Chunks e Embeddings ──────────────────────────────────────────────────

def save_document_chunks(session_id: str, chunks: list) -> None:
    """Persiste lista de (chunk_text, embedding_list) para um documento."""
    with _lock:
        conn = _connect()
        try:
            conn.execute("DELETE FROM document_chunks WHERE session_id = ?", (session_id,))
            for i, (text, embedding) in enumerate(chunks):
                conn.execute(
                    "INSERT INTO document_chunks (session_id, chunk_index, chunk_text, embedding) VALUES (?, ?, ?, ?)",
                    (session_id, i, text, json.dumps(embedding)),
                )
            conn.commit()
        finally:
            conn.close()


def get_document_chunks(session_id: str) -> list:
    """Retorna lista de (chunk_text, embedding_list) para busca por similaridade."""
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT chunk_text, embedding FROM document_chunks WHERE session_id = ? ORDER BY chunk_index",
                (session_id,),
            ).fetchall()
            return [(r["chunk_text"], json.loads(r["embedding"])) for r in rows]
        finally:
            conn.close()


def has_chunks(session_id: str) -> bool:
    """Verifica se o documento já tem chunks indexados."""
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM document_chunks WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            return (row["cnt"] if row else 0) > 0
        finally:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# NOVAS FUNÇÕES CRUD: CONVERSAS E MENSAGENS DO CHAT
# ══════════════════════════════════════════════════════════════════════════════

def get_user_conversations(client_id: str) -> List[Dict]:
    """Retorna todas as conversas de um usuário, com suas mensagens aninhadas."""
    with _lock:
        conn = _connect()
        try:
            conv_rows = conn.execute(
                "SELECT * FROM conversations WHERE client_id = ? ORDER BY updated_at DESC",
                (client_id,),
            ).fetchall()
            
            conversations = []
            for crow in conv_rows:
                conv = dict(crow)
                # Resgata mensagens
                msg_rows = conn.execute(
                    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC",
                    (conv["id"],),
                ).fetchall()
                
                msgs = []
                for mrow in msg_rows:
                    m = dict(mrow)
                    try:
                        m["tickers"] = json.loads(m["tickers"]) if m["tickers"] else []
                    except Exception:
                        m["tickers"] = []
                    msgs.append(m)
                
                conv["messages"] = msgs
                conv["createdAt"] = conv["updated_at"] # mapeamento para o frontend
                conv["updatedAt"] = conv["updated_at"]
                conversations.append(conv)
                
            return conversations
        finally:
            conn.close()


def save_conversation_full(conv: dict, client_id: str) -> None:
    """Salva/atualiza a conversa e todas as suas mensagens em lote."""
    with _lock:
        conn = _connect()
        try:
            conv_id = conv.get("id", "")
            title = conv.get("title", "Conversa")
            updated_at = conv.get("updatedAt") or conv.get("updated_at") or int(datetime.utcnow().timestamp() * 1000)
            
            conn.execute(
                """INSERT OR REPLACE INTO conversations (id, client_id, title, updated_at)
                   VALUES (?, ?, ?, ?)""",
                (conv_id, client_id, title, updated_at),
            )
            
            # Deleta mensagens antigas para re-inserir atualizadas de forma simples
            conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
            
            messages = conv.get("messages", [])
            for msg in messages:
                raw_id = str(msg.get("id", ""))
                msg_id = f"{conv_id}_{raw_id}" if not raw_id.startswith(conv_id) else raw_id
                
                tickers_str = json.dumps(msg.get("tickers", []))
                conn.execute(
                    """INSERT OR REPLACE INTO messages (id, conversation_id, role, text, tickers, timestamp)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        msg_id,
                        conv_id,
                        msg.get("role", "user"),
                        msg.get("text", ""),
                        tickers_str,
                        int(msg.get("timestamp") or updated_at),
                    ),
                )
                
            conn.commit()
        finally:
            conn.close()


def delete_conversation(conv_id: str) -> None:
    with _lock:
        conn = _connect()
        try:
            # O cascade delete remove as mensagens automaticamente
            conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
            conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,)) # garantia adicional
            conn.commit()
        finally:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# FUNÇÕES DE AUTENTICAÇÃO E TAREFAS DA IA
# ══════════════════════════════════════════════════════════════════════════════

def get_user_by_email(email: str) -> Optional[Dict]:
    with _lock:
        conn = _connect()
        try:
            row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()


def update_user_password(client_id: str, password_hash: str) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute("UPDATE users SET password_hash = ? WHERE client_id = ?", (password_hash, client_id))
            conn.commit()
        finally:
            conn.close()


def create_ai_task(task_id: str, client_id: str) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                "INSERT INTO ai_tasks (task_id, client_id, status) VALUES (?, ?, ?)",
                (task_id, client_id, "processing")
            )
            conn.commit()
        finally:
            conn.close()


def complete_ai_task(task_id: str, result: str, status: str = "completed", error: str = None) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                """UPDATE ai_tasks 
                   SET status = ?, result = ?, error = ?, updated_at = datetime('now') 
                   WHERE task_id = ?""",
                (status, result, error, task_id)
            )
            conn.commit()
        finally:
            conn.close()


def get_ai_task(task_id: str) -> Optional[Dict]:
    with _lock:
        conn = _connect()
        try:
            row = conn.execute("SELECT * FROM ai_tasks WHERE task_id = ?", (task_id,)).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# CIBER — REFRESH TOKENS (Pilar 3)
# ══════════════════════════════════════════════════════════════════════════════

def save_refresh_token(token_id: str, client_id: str, token_hash: str, expires_at: str) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                """INSERT INTO refresh_tokens (token_id, client_id, token_hash, expires_at)
                   VALUES (?, ?, ?, ?)""",
                (token_id, client_id, token_hash, expires_at),
            )
            conn.commit()
        finally:
            conn.close()


def get_refresh_token(token_id: str) -> Optional[Dict]:
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT * FROM refresh_tokens WHERE token_id = ?", (token_id,)
            ).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()


def revoke_refresh_token(token_id: str) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                "UPDATE refresh_tokens SET revoked = 1 WHERE token_id = ?", (token_id,)
            )
            conn.commit()
        finally:
            conn.close()


def revoke_all_user_tokens(client_id: str) -> None:
    """Revoga todos os refresh tokens de um usuário (logout global)."""
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                "UPDATE refresh_tokens SET revoked = 1 WHERE client_id = ?", (client_id,)
            )
            conn.commit()
        finally:
            conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# CIBER — AUDIT LOGS (Pilar 6)
# ══════════════════════════════════════════════════════════════════════════════

def insert_audit_log(
    actor_id: str,
    action: str,
    resource_id: str = "",
    ip_address: str = "",
    status: str = "success",
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
) -> None:
    with _lock:
        conn = _connect()
        try:
            conn.execute(
                """INSERT INTO audit_logs
                   (actor_id, action, resource_id, ip_address, status, old_value, new_value)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (actor_id, action, resource_id, ip_address, status, old_value, new_value),
            )
            conn.commit()
        finally:
            conn.close()


def get_audit_logs(
    actor_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict]:
    with _lock:
        conn = _connect()
        try:
            query = "SELECT * FROM audit_logs WHERE 1=1"
            params: list = []

            if actor_id:
                query += " AND actor_id = ?"
                params.append(actor_id)
            if action:
                query += " AND action = ?"
                params.append(action)

            query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])

            rows = conn.execute(query, params).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()
