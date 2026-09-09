"""
InvestorIA — FastAPI Backend
Expõe o agente Agno e dados do yfinance como API HTTP para o frontend React.
"""

import os
import re
import json
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, HTTPException, Request, Response, UploadFile, File, BackgroundTasks, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import yfinance as yf
from dotenv import load_dotenv

# Security Imports
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from config import validate_environment
from security_logger import setup_security_logger
from ai_firewall import protect_ai_route
from audit_log import log_action, get_client_ip
from rbac import require_permission, DEFAULT_ROLE
from bot_protection import check_honeypot, verify_captcha

logging.basicConfig(level=logging.INFO)

load_dotenv()

# ── Lifespan (scheduler + DB) ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_security_logger()
    validate_environment()
    
    from notifications_db import init_db
    from scheduler import create_scheduler
    init_db()
    _scheduler = create_scheduler()
    _scheduler.start()
    logging.getLogger(__name__).info("[API] Scheduler iniciado.")
    yield
    # Shutdown
    _scheduler.shutdown(wait=False)
    logging.getLogger(__name__).info("[API] Scheduler encerrado.")

# ── App & Security Setup ───────────────────────────────────────────────────────
app = FastAPI(title="InvestorIA API", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None)

# Rate Limiter Configuration
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Restrictive CORS
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security Headers Middleware (Pilar 1 — Ciber)
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com https://challenges.cloudflare.com https://cdn.tailwindcss.com; "
        "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https://*.googleusercontent.com; "
        "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com; "
        "frame-src https://accounts.google.com https://challenges.cloudflare.com"
    )
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    return response

executor = ThreadPoolExecutor(max_workers=4)

# ── Cookies de sessão (Pilar 3 — Ciber) ────────────────────────────────────────
# O Refresh Token (de longa duração, 7 dias) passa a viver num cookie
# httpOnly + Secure + SameSite, em vez de localStorage — assim um XSS no
# frontend não consegue mais roubá-lo via JavaScript. O Access Token (curto,
# 15 min) continua indo no header Authorization, controlado pelo frontend.
REFRESH_COOKIE_NAME = "investoria_refresh_token"
REFRESH_COOKIE_ID_NAME = "investoria_refresh_token_id"
REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 dias, espelha REFRESH_TOKEN_EXPIRE_DAYS em auth.py
# Em produção (HTTPS) mantenha o padrão (secure=True). Em dev local via HTTP,
# defina COOKIE_SECURE=false no .env para o navegador aceitar o cookie.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "true").lower() != "false"


def _set_refresh_cookies(response: Response, refresh_token: str, refresh_token_id: str) -> None:
    cookie_kwargs = dict(
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/api/auth",
        max_age=REFRESH_COOKIE_MAX_AGE,
    )
    response.set_cookie(REFRESH_COOKIE_NAME, refresh_token, **cookie_kwargs)
    response.set_cookie(REFRESH_COOKIE_ID_NAME, refresh_token_id, **cookie_kwargs)


def _clear_refresh_cookies(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/api/auth")
    response.delete_cookie(REFRESH_COOKIE_ID_NAME, path="/api/auth")

# ── Agente carregado de forma lazy (inicializa só na 1ª requisição) ────────────
_agent = None


def _get_agent():
    global _agent
    if _agent is not None:
        return _agent
    try:
        from agent import agent as agno_agent
        _agent = agno_agent
        return _agent
    except Exception as e:
        # NÃO faz cache do erro — permite retry na próxima requisição
        logging.getLogger(__name__).error(f"[API] Falha ao inicializar o agente: {e}")
        raise RuntimeError(f"Falha ao inicializar o agente: {e}")


# ── Regex para detectar tickers brasileiros ───────────────────────────────────
TICKER_RE = re.compile(r'\b([A-Z]{3,5}[0-9]{1,2})\b')
FALSE_POS = {
    "P/L", "P/VP", "EV", "ROE", "ROA", "DY", "API", "SQL", "PDF",
    "URL", "HTTP", "CEO", "CFO", "CPF", "CVM", "B3", "PIB", "CDI",
    "IPO", "ETF", "FII", "BDR",
}


def extract_tickers(text: str) -> list:
    matches = TICKER_RE.findall(text)
    seen, result = set(), []
    for m in matches:
        if m not in seen and m not in FALSE_POS:
            seen.add(m)
            result.append(m)
    return result


# ── Modelos ───────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    hp: Optional[str] = ""                    # honeypot — deve chegar vazio
    captcha_token: Optional[str] = None        # Cloudflare Turnstile (opcional)

class LoginRequest(BaseModel):
    email: str
    password: str
    hp: Optional[str] = ""
    captcha_token: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = "default"

class WebhookCreateUserRequest(BaseModel):
    email: str
    document: str
    name: Optional[str] = "Novo Usuário"


# ── Auth Dependency ───────────────────────────────────────────────────────────
security = HTTPBearer()

def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    from auth import decode_access_token
    import notifications_db
    
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
    
    email = payload.get("sub")
    user = notifications_db.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    
    # Injeta no request.state para o RBAC middleware poder ler (Pilar 4 — Ciber)
    request.state.current_user = user
    return user


# ── Endpoints de Auth ─────────────────────────────────────────────────────────

@app.post("/api/auth/register")
@limiter.limit("5/minute")
async def register(request: Request, req: RegisterRequest, background_tasks: BackgroundTasks):
    import notifications_db
    import uuid
    from auth import get_password_hash

    # Proteção anti-bot (Pilar 7 — Ciber)
    check_honeypot(req.hp)
    await verify_captcha(req.captcha_token, get_client_ip(request))

    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="A senha deve ter no mínimo 8 caracteres.")
    if not any(c.isdigit() for c in req.password):
        raise HTTPException(status_code=400, detail="A senha deve conter pelo menos 1 número.")

    import re as _re
    if not _re.match(r'^[\w\.-]+@[\w\.-]+\.\w{2,}$', req.email):
        raise HTTPException(status_code=400, detail="Formato de e-mail inválido.")

    if notifications_db.get_user_by_email(req.email):
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    client_id = str(uuid.uuid4())
    pwd_hash = get_password_hash(req.password)

    from token_manager import ROLE_LIMITS
    from datetime import datetime, timedelta, timezone
    limit = ROLE_LIMITS.get(DEFAULT_ROLE, 50000)
    reset_date = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    with notifications_db._lock:
        conn = notifications_db._connect()
        try:
            conn.execute(
                "INSERT INTO users (client_id, name, email, password_hash, role, token_limit, tokens_used, token_reset_date) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
                (client_id, req.name, req.email, pwd_hash, DEFAULT_ROLE, limit, reset_date)
            )
            conn.commit()
        finally:
            conn.close()

    # Audit Log (Pilar 6 — Ciber)
    background_tasks.add_task(
        log_action, actor_id=client_id, action="REGISTER",
        resource_id=client_id, ip_address=get_client_ip(request), status="success",
    )
    return {"message": "Conta criada com sucesso"}


@app.post("/api/webhooks/create-user")
@limiter.limit("20/minute")
async def webhook_create_user(request: Request, background_tasks: BackgroundTasks):
    import notifications_db
    import uuid
    from auth import get_password_hash
    from token_manager import ROLE_LIMITS
    from datetime import datetime, timedelta, timezone

    try:
        payload = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Verifica token de segurança (Pilar 3 — Ciber: nunca hardcoded no código)
    expected_token = os.getenv("KIWIFY_WEBHOOK_TOKEN", "")
    if not expected_token:
        logging.error("[Webhook] KIWIFY_WEBHOOK_TOKEN não configurada — recusando todas as chamadas.")
        raise HTTPException(status_code=503, detail="Webhook não configurado.")

    token = request.query_params.get("token") or request.headers.get("x-webhook-token")
    if token != expected_token:
        if isinstance(payload, dict) and payload.get("token") == expected_token:
            pass
        else:
            raise HTTPException(status_code=401, detail="Token de segurança inválido")

    # Extração de dados do cliente (formato Kiwify)
    customer = payload.get("Customer", {})
    email = customer.get("email")

    if not email:
        raise HTTPException(status_code=400, detail="Faltam dados do cliente (email)")

    event_type = payload.get("webhook_event_type")

    # Trata eventos de cancelamento ou atraso de assinatura
    if event_type in ["subscription_canceled", "subscription_late"]:
        existing_user = notifications_db.get_user_by_email(email)
        if existing_user:
            client_id = existing_user["client_id"]
            with notifications_db._lock:
                conn = notifications_db._connect()
                try:
                    conn.execute(
                        "UPDATE users SET role = ?, token_limit = 0 WHERE email = ?",
                        ("viewer", email)
                    )
                    conn.commit()
                finally:
                    conn.close()
            
            # Audit Log
            background_tasks.add_task(
                log_action, actor_id=client_id, action="WEBHOOK_SUBSCRIPTION_BLOCKED",
                resource_id=client_id, ip_address=get_client_ip(request), status="success",
            )
            return {"message": "Assinatura cancelada ou atrasada. Acesso suspenso.", "email": email, "new_role": "viewer"}
        else:
            return {"message": "Evento de cancelamento/atraso recebido, mas usuário não encontrado no banco.", "email": email}

    # Para outros eventos (como order_approved e subscription_renewed), verifica status da compra (só criamos/atualizamos se estiver paga)
    status = payload.get("order_status")
    if status != "paid":
        return {"message": f"Webhook ignorado: order_status={status}"}

    document = customer.get("CPF") or customer.get("CNPJ")
    name = customer.get("full_name") or customer.get("first_name") or "Novo Usuário"

    if not document:
        raise HTTPException(status_code=400, detail="Faltam dados do cliente (documento)")

    # Define o plano com base no nome do produto ou valor cobrado (em centavos)
    product_name = (payload.get("product_name") or "").lower()
    charge_amount = payload.get("Commissions", {}).get("charge_amount", 0)
    role = "free"
    if "elite" in product_name:
        role = "elite"
    elif "pro" in product_name:
        role = "pro"
    else:
        # Fallback por valor cobrado (novos e antigos valores mensais/anuais/promocionais)
        if charge_amount in [4990, 990, 6990, 41990, 41919, 47904, 67104]:
            role = "pro"
        elif charge_amount in [5990, 1990, 9790, 9890, 49990, 57504, 93984]:
            role = "elite"

    # Se o usuário já existe, atualizamos o plano (re-ativação, renovação ou upgrade)
    existing_user = notifications_db.get_user_by_email(email)
    if existing_user:
        client_id = existing_user["client_id"]
        with notifications_db._lock:
            conn = notifications_db._connect()
            try:
                limit = ROLE_LIMITS.get(role, ROLE_LIMITS["free"])
                reset_date = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                conn.execute(
                    "UPDATE users SET role = ?, token_limit = ?, tokens_used = 0, token_reset_date = ? WHERE email = ?",
                    (role, limit, reset_date, email)
                )
                conn.commit()
            finally:
                conn.close()
        
        # Log de Auditoria específico
        action_name = "WEBHOOK_SUBSCRIPTION_RENEWED" if event_type == "subscription_renewed" else "WEBHOOK_SUBSCRIPTION_UPDATED"
        background_tasks.add_task(
            log_action, actor_id=client_id, action=action_name,
            resource_id=client_id, ip_address=get_client_ip(request), status="success",
        )
        return {"message": f"Usuário reativado/renovado. Plano: {role}.", "email": email, "new_role": role}

    # Caso não exista, criamos a conta com senha temporária (documento)
    pwd_hash = get_password_hash(document)
    client_id = str(uuid.uuid4())
    limit = ROLE_LIMITS.get(role, ROLE_LIMITS["free"])
    reset_date = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    with notifications_db._lock:
        conn = notifications_db._connect()
        try:
            conn.execute(
                "INSERT INTO users (client_id, name, email, password_hash, role, token_limit, tokens_used, token_reset_date) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
                (client_id, name, email, pwd_hash, role, limit, reset_date)
            )
            conn.commit()
        finally:
            conn.close()

    # Audit Log
    action_name = "WEBHOOK_SUBSCRIPTION_RENEWED" if event_type == "subscription_renewed" else "WEBHOOK_REGISTER"
    background_tasks.add_task(
        log_action, actor_id=client_id, action=action_name,
        resource_id=client_id, ip_address=get_client_ip(request), status="success",
    )
    return {"message": "Conta criada com sucesso a partir do webhook", "client_id": client_id, "role": role}


@app.post("/api/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, req: LoginRequest, response: Response, background_tasks: BackgroundTasks):
    import notifications_db
    from auth import verify_password, create_access_token, create_refresh_token

    # Proteção anti-bot (Pilar 7 — Ciber)
    check_honeypot(req.hp)
    await verify_captcha(req.captcha_token, get_client_ip(request))

    user = notifications_db.get_user_by_email(req.email)
    if not user or not verify_password(req.password, user["password_hash"]):
        # Audit Log — login falhou
        background_tasks.add_task(
            log_action, actor_id=req.email, action="LOGIN",
            ip_address=get_client_ip(request), status="failure",
        )
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    role = user.get("role") or DEFAULT_ROLE
    token = create_access_token({"sub": user["email"], "client_id": user["client_id"], "role": role})
    refresh_raw, refresh_id = create_refresh_token(user["client_id"])
    _set_refresh_cookies(response, refresh_raw, refresh_id)

    # Audit Log (Pilar 6 — Ciber)
    background_tasks.add_task(
        log_action, actor_id=user["client_id"], action="LOGIN",
        resource_id=user["client_id"], ip_address=get_client_ip(request), status="success",
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "client_id": user["client_id"],
        "name": user["name"],
    }


# ── Google OAuth (Pilar 2 — Ciber) ───────────────────────────────────────────
class GoogleLoginRequest(BaseModel):
    id_token: str

@app.post("/api/auth/google")
@limiter.limit("10/minute")
async def google_login(request: Request, req: GoogleLoginRequest, response: Response, background_tasks: BackgroundTasks):
    """Login via Google SSO (Pilar 2 — Ciber)."""
    from oauth import verify_google_token, get_or_create_user_from_google
    from auth import create_access_token, create_refresh_token

    google_payload = await verify_google_token(req.id_token)
    if not google_payload:
        background_tasks.add_task(
            log_action, actor_id="google_unknown", action="LOGIN_GOOGLE",
            ip_address=get_client_ip(request), status="failure",
        )
        raise HTTPException(status_code=401, detail="Token do Google inválido.")

    user = get_or_create_user_from_google(google_payload)
    if not user:
        raise HTTPException(status_code=500, detail="Erro ao criar/vincular usuário Google.")

    role = user.get("role") or DEFAULT_ROLE
    token = create_access_token({"sub": user["email"], "client_id": user["client_id"], "role": role})
    refresh_raw, refresh_id = create_refresh_token(user["client_id"])
    _set_refresh_cookies(response, refresh_raw, refresh_id)

    background_tasks.add_task(
        log_action, actor_id=user["client_id"], action="LOGIN_GOOGLE",
        resource_id=user["client_id"], ip_address=get_client_ip(request), status="success",
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "client_id": user["client_id"],
        "name": user.get("name", ""),
    }


# ── Refresh Token (Pilar 3 — Ciber) ──────────────────────────────────────────
class RefreshRequest(BaseModel):
    # Mantidos como fallback (ex.: clientes não-browser); o fluxo padrão do
    # navegador lê o refresh token do cookie httpOnly, não do corpo da requisição.
    refresh_token: Optional[str] = None
    refresh_token_id: Optional[str] = None

@app.post("/api/auth/refresh")
@limiter.limit("20/minute")
def refresh_endpoint(request: Request, req: RefreshRequest):
    """Renova o Access Token usando um Refresh Token válido (lido do cookie httpOnly)."""
    from auth import validate_refresh_token, create_access_token
    import notifications_db

    refresh_raw = request.cookies.get(REFRESH_COOKIE_NAME) or req.refresh_token
    refresh_id = request.cookies.get(REFRESH_COOKIE_ID_NAME) or req.refresh_token_id
    if not refresh_raw or not refresh_id:
        raise HTTPException(status_code=401, detail="Refresh token ausente.")

    client_id = validate_refresh_token(refresh_raw, refresh_id)
    if not client_id:
        raise HTTPException(status_code=401, detail="Refresh token inválido ou expirado.")

    user = None
    with notifications_db._lock:
        conn = notifications_db._connect()
        try:
            row = conn.execute("SELECT * FROM users WHERE client_id = ?", (client_id,)).fetchone()
            user = dict(row) if row else None
        finally:
            conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.")

    role = user.get("role") or DEFAULT_ROLE
    new_token = create_access_token({"sub": user["email"], "client_id": user["client_id"], "role": role})
    return {"access_token": new_token, "token_type": "bearer"}


@app.post("/api/auth/logout")
@limiter.limit("20/minute")
def logout(request: Request, response: Response, background_tasks: BackgroundTasks):
    """
    Encerra a sessão do lado do servidor (Pilar 3/6 — Ciber): revoga o
    Refresh Token no banco (não fica só "esquecido" no navegador — um
    token roubado antes do logout deixa de funcionar) e limpa o cookie.
    """
    from auth import revoke_refresh_token

    refresh_id = request.cookies.get(REFRESH_COOKIE_ID_NAME)
    if refresh_id:
        revoke_refresh_token(refresh_id)
        background_tasks.add_task(
            log_action, actor_id=refresh_id, action="LOGOUT",
            ip_address=get_client_ip(request), status="success",
        )

    _clear_refresh_cookies(response)
    return {"message": "Sessão encerrada com sucesso."}


# ── Endpoints Gerais ──────────────────────────────────────────────────────────
@app.get("/api/status")
def root():
    return {"status": "InvestorIA API online 🚀", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/chat/conversas/validate-token")
async def validate_token(current_user: dict = Depends(get_current_user)):
    """Endpoint leve para o frontend verificar se o token ainda é válido."""
    import notifications_db
    user = notifications_db.get_user_by_email(current_user["email"])
    return {
        "valid": True,
        "email": user.get("email"),
        "name": user.get("name"),
        "role": user.get("role"),
        "token_limit": user.get("token_limit", 0),
        "tokens_used": user.get("tokens_used", 0)
    }

class ChangePlanRequest(BaseModel):
    role: str

@app.post("/api/user/change-plan")
@limiter.limit("10/minute")
async def change_plan(request: Request, req: ChangePlanRequest, current_user: dict = Depends(get_current_user)):
    """Troca/Simula o plano do usuário (para testes do sistema de tokens)."""
    import notifications_db
    from token_manager import ROLE_LIMITS
    
    new_role = req.role.lower()
    if new_role not in ROLE_LIMITS:
        raise HTTPException(status_code=400, detail="Plano/Role inválido")
        
    limit = ROLE_LIMITS[new_role]
    
    with notifications_db._lock:
        conn = notifications_db._connect()
        try:
            conn.execute(
                "UPDATE users SET role = ?, token_limit = ? WHERE client_id = ?",
                (new_role, limit, current_user["client_id"])
            )
            conn.commit()
        finally:
            conn.close()
            
    return {"status": "success", "new_role": new_role, "new_limit": limit}

@app.post("/api/user/cancel-subscription")
@limiter.limit("10/minute")
async def cancel_subscription(request: Request, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Cancela a assinatura do usuário atual, mudando para 'viewer' com limite 0."""
    import notifications_db
    
    client_id = current_user["client_id"]
    with notifications_db._lock:
        conn = notifications_db._connect()
        try:
            conn.execute(
                "UPDATE users SET role = ?, token_limit = 0 WHERE client_id = ?",
                ("viewer", client_id)
            )
            conn.commit()
        finally:
            conn.close()
            
    # Audit Log
    background_tasks.add_task(
        log_action, actor_id=client_id, action="USER_CANCEL_SUBSCRIPTION",
        resource_id=client_id, ip_address=get_client_ip(request), status="success",
    )
    return {"status": "success", "message": "Assinatura cancelada com sucesso"}


def process_chat_task(task_id: str, message: str, client_id: str):
    import notifications_db
    import time
    from token_manager import consume_tokens

    MAX_RETRIES = 3
    RETRY_CODES = ("429", "500", "502", "503", "rate_limit", "overloaded", "tool_use_failed")

    # Sufixo adicionado na re-tentativa quando o modelo tenta usar ferramentas inexistentes
    TOOL_HALLUCINATION_HINT = (
        "\n\n[INSTRUÇÃO DO SISTEMA: Use APENAS as ferramentas YFinance e DuckDuckGo que estão disponíveis. "
        "NÃO tente usar web_browser, open_url, browse ou qualquer ferramenta não listada. "
        "Se precisar de informações de uma URL ou PDF, pesquise o assunto via DuckDuckGo.]"
    )

    last_error = None
    current_message = message
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            agent = _get_agent()
            response = agent.run(current_message, stream=False)
            text = _extract_final_text(response)
            tickers = extract_tickers(text)

            # Debita tokens reais do agente Agno
            tokens = 0
            if hasattr(response, "metrics") and response.metrics:
                tokens = response.metrics.total_tokens
            if tokens > 0:
                consume_tokens(client_id, tokens)

            result_json = json.dumps({"response": text, "tickers": tickers})
            notifications_db.complete_ai_task(task_id, result=result_json, status="completed")
            return  # Sucesso — sai do loop
        except Exception as e:
            last_error = e
            error_str = str(e).lower()

            # Verifica se é um erro transiente que vale a pena tentar novamente
            is_retryable = any(code in error_str for code in RETRY_CODES)

            if is_retryable and attempt < MAX_RETRIES:
                wait_time = 2 ** attempt  # 2s, 4s, 8s

                # Se o erro for de tool hallucination, adiciona instrução extra na mensagem
                if "tool_use_failed" in error_str or "not in request.tools" in error_str:
                    current_message = message + TOOL_HALLUCINATION_HINT
                    logging.getLogger(__name__).warning(
                        f"[Chat] Tentativa {attempt}/{MAX_RETRIES} falhou por alucinação de ferramenta ({e}). "
                        f"Re-tentando com instrução de correção em {wait_time}s..."
                    )
                else:
                    logging.getLogger(__name__).warning(
                        f"[Chat] Tentativa {attempt}/{MAX_RETRIES} falhou ({e}). "
                        f"Aguardando {wait_time}s antes de tentar novamente..."
                    )
                time.sleep(wait_time)
            else:
                break  # Erro não-retryable ou tentativas esgotadas

    # Todas as tentativas falharam
    notifications_db.complete_ai_task(task_id, result="", status="error", error=str(last_error))


@app.post("/api/chat")
@limiter.limit("10/minute")
async def chat_endpoint(request: Request, req: ChatRequest, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user), _rbac=Depends(require_permission("chat"))):
    """Enfileira a mensagem para o agente Agno e retorna um task_id."""
    protect_ai_route(req.message)
    
    # Valida tokens antes de chamar o agente
    from token_manager import verify_user_tokens
    verify_user_tokens(current_user["client_id"])
    
    import uuid
    import notifications_db
    
    task_id = str(uuid.uuid4())
    client_id = current_user["client_id"]
    
    notifications_db.create_ai_task(task_id, client_id)
    background_tasks.add_task(process_chat_task, task_id, req.message, client_id)
    
    # Audit Log (Pilar 6 — Ciber)
    background_tasks.add_task(
        log_action, actor_id=client_id, action="CHAT_MESSAGE",
        resource_id=task_id, ip_address=get_client_ip(request), status="success",
    )
    return {"task_id": task_id, "status": "processing"}


@app.get("/api/chat/status/{task_id}")
async def chat_status(task_id: str, current_user: dict = Depends(get_current_user)):
    """Retorna o status da tarefa de IA."""
    import notifications_db
    
    task = notifications_db.get_ai_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
        
    if task["client_id"] != current_user["client_id"]:
        raise HTTPException(status_code=403, detail="Acesso negado à tarefa")
        
    if task["status"] == "completed":
        result_data = json.loads(task["result"])
        return {"status": "completed", "response": result_data["response"], "tickers": result_data["tickers"]}
    elif task["status"] == "error":
        return {"status": "error", "error": task["error"]}
    else:
        return {"status": "processing"}


def _extract_final_text(response) -> str:
    """
    Extrai apenas a resposta FINAL do agente (após execução das ferramentas).

    O Agno pode retornar em response.content o texto do 1º passo do LLM
    ("Vou buscar os dados... Aguarde"), que é gerado ANTES das ferramentas rodarem.
    A resposta real fica na última mensagem de role='assistant' em response.messages.
    """
    final_text = None

    # 1. Tenta pegar a última mensagem 'assistant' dos messages (após tool calls)
    messages = getattr(response, "messages", None) or []
    for msg in reversed(messages):
        role    = getattr(msg, "role", "")
        content = getattr(msg, "content", None)

        if role != "assistant" or not content:
            continue

        # Content pode ser string ou lista de blocos
        if isinstance(content, str):
            text = content.strip()
        elif isinstance(content, list):
            text = " ".join(
                b.get("text", "") if isinstance(b, dict) else str(b)
                for b in content
            ).strip()
        else:
            continue

        # Ignora mensagens que são só planejamento sem dados reais
        # (muito curtas ou claramente apenas "Aguarde...")
        if len(text) > 100:
            final_text = text
            break

    # 2. Fallback: response.content
    if not final_text:
        final_text = getattr(response, "content", None) or str(response)

    return final_text or "Não foi possível obter uma resposta."


@app.get("/api/admin/system_dump")
async def admin_honeypot(request: Request):
    """Honeypot Endpoint - Ninguém legítimo deveria acessar isso."""
    logging.critical(f"[HONEYPOT TRIGGERED] Varredura maliciosa detectada do IP: {get_remote_address(request)}")
    raise HTTPException(status_code=403, detail="Forbidden: Unauthorized Access Logged.")


@app.get("/api/acao/{ticker}")
@limiter.limit("30/minute")
async def get_stock_data(request: Request, ticker: str, current_user: dict = Depends(get_current_user), _rbac=Depends(require_permission("analysis"))):
    """Retorna indicadores fundamentalistas e últimas notícias da ação."""
    ticker_upper = ticker.upper()
    ticker_sa = f"{ticker_upper}.SA"

    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(
            executor,
            lambda: _fetch_stock_data(ticker_sa, ticker_upper),
        )
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao buscar dados para {ticker_upper}: {str(e)}",
        )


# ── Busca de dados de ação (síncrona, roda no executor) ──────────────────────
def _fetch_stock_data(ticker_sa: str, ticker: str) -> dict:
    stock = yf.Ticker(ticker_sa)
    info = stock.info

    if not info or info.get("quoteType") is None:
        raise ValueError(f"Ticker '{ticker}' não encontrado. Verifique se é um ticker da B3 válido.")

    # ─── Formatadores ──────────────────────────────────────────────────────
    def fmt_brl(val):
        if val is None:
            return "—"
        try:
            v = float(val)
            if abs(v) >= 1e12:
                return f"R$ {v/1e12:.2f}T"
            if abs(v) >= 1e9:
                return f"R$ {v/1e9:.2f}B"
            if abs(v) >= 1e6:
                return f"R$ {v/1e6:.2f}M"
            return f"R$ {v:,.2f}"
        except Exception:
            return "—"

    def fmt_pct(val):
        if val is None:
            return "—"
        try:
            return f"{float(val) * 100:.2f}%"
        except Exception:
            return "—"

    def fmt_x(val):
        if val is None:
            return "—"
        try:
            return f"{float(val):.2f}x"
        except Exception:
            return "—"

    def fmt_num(val):
        if val is None:
            return "—"
        try:
            return f"{float(val):.2f}"
        except Exception:
            return "—"

    # ─── Variação do dia ───────────────────────────────────────────────────
    current = info.get("currentPrice") or info.get("regularMarketPrice")
    prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
    if current and prev and float(prev) != 0:
        change_pct = ((float(current) - float(prev)) / float(prev)) * 100
        variacao = f"{change_pct:+.2f}%"
        variacao_positiva = change_pct >= 0
    else:
        variacao = "—"
        variacao_positiva = None

    indicadores = {
        "nome":               info.get("longName") or info.get("shortName") or ticker,
        "preco_atual":        fmt_brl(current),
        "variacao_dia":       variacao,
        "variacao_positiva":  variacao_positiva,
        "pl":                 fmt_x(info.get("trailingPE")),
        "pvp":                fmt_x(info.get("priceToBook")),
        "ev_ebitda":          fmt_x(info.get("enterpriseToEbitda")),
        "roe":                fmt_pct(info.get("returnOnEquity")),
        "roa":                fmt_pct(info.get("returnOnAssets")),
        "dividend_yield":     fmt_pct(info.get("dividendYield")),
        "margem_liquida":     fmt_pct(info.get("profitMargins")),
        "margem_bruta":       fmt_pct(info.get("grossMargins")),
        "market_cap":         fmt_brl(info.get("marketCap")),
        "ebitda":             fmt_brl(info.get("ebitda")),
        "receita":            fmt_brl(info.get("totalRevenue")),
        "lucro_liquido":      fmt_brl(info.get("netIncomeToCommon")),
        "divida_bruta":       fmt_brl(info.get("totalDebt")),
        "caixa":              fmt_brl(info.get("totalCash")),
        "beta":               fmt_num(info.get("beta")),
        "setor":              info.get("sector", "—"),
        "industria":          info.get("industry", "—"),
    }

    # ─── Últimas notícias ──────────────────────────────────────────────────
    fatos = []
    try:
        for item in (stock.news or [])[:2]:
            content = item.get("content", {})
            if isinstance(content, dict) and content:
                titulo = content.get("title", "Sem título")
                pub_date = content.get("pubDate", "")
                canonical = content.get("canonicalUrl", {})
                url = canonical.get("url", "#") if isinstance(canonical, dict) else "#"
                provider = content.get("provider", {})
                fonte = (
                    provider.get("displayName", "Yahoo Finance")
                    if isinstance(provider, dict)
                    else "Yahoo Finance"
                )
            else:
                titulo = item.get("title", "Sem título")
                ts = item.get("providerPublishTime")
                pub_date = (
                    datetime.fromtimestamp(ts).strftime("%Y-%m-%dT%H:%M:%S")
                    if ts
                    else ""
                )
                url = item.get("link", "#")
                fonte = item.get("publisher", "Yahoo Finance")

            fatos.append({"titulo": titulo, "data": pub_date, "url": url, "fonte": fonte})
    except Exception:
        pass

    return {"indicadores": indicadores, "fatos_relevantes": fatos}


@app.get("/api/analise-tecnica/{ticker}")
@limiter.limit("20/minute")
async def get_technical_analysis(request: Request, ticker: str, period: str = "3mo", current_user: dict = Depends(get_current_user), _rbac=Depends(require_permission("analysis"))):
    """
    Retorna dados OHLCV + análise técnica computada:
    suporte/resistência, Fibonacci, linhas de tendência e padrões de candles.
    period: 1mo | 3mo | 6mo | 1y
    """
    ticker_upper = ticker.upper()
    ticker_sa    = f"{ticker_upper}.SA"
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(
            executor,
            lambda: _compute_technical_analysis(ticker_sa, ticker_upper, period),
        )
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na análise técnica: {str(e)}")


def _compute_technical_analysis(ticker_sa: str, ticker: str, period: str) -> dict:
    import math

    stock = yf.Ticker(ticker_sa)
    hist  = stock.history(period=period, interval="1d")

    if hist.empty:
        raise ValueError(f"Sem dados históricos para '{ticker}'.")

    hist = hist.reset_index()

    # ── Candles (OHLCV) ────────────────────────────────────────────────────────
    candles = []
    for _, row in hist.iterrows():
        dt = row["Date"]
        date_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
        candles.append({
            "date":   date_str,
            "open":   round(float(row["Open"]),  2),
            "high":   round(float(row["High"]),  2),
            "low":    round(float(row["Low"]),   2),
            "close":  round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
        })

    closes = [c["close"] for c in candles]
    highs  = [c["high"]  for c in candles]
    lows   = [c["low"]   for c in candles]

    # ── Médias Móveis ──────────────────────────────────────────────────────────
    def sma(data, n):
        result = []
        for i in range(len(data)):
            if i < n - 1:
                result.append(None)
            else:
                result.append(round(sum(data[i-n+1:i+1]) / n, 2))
        return result

    sma20  = sma(closes, 20)
    sma50  = sma(closes, 50)
    sma200 = sma(closes, min(200, len(closes)))

    for i, c in enumerate(candles):
        c["sma20"]  = sma20[i]
        c["sma50"]  = sma50[i]
        c["sma200"] = sma200[i]

    # ── RSI (14) ───────────────────────────────────────────────────────────────
    def compute_rsi(data, period=14):
        result = [None] * len(data)
        if len(data) <= period:
            return result
        gains, losses = [], []
        for i in range(1, period + 1):
            diff = data[i] - data[i - 1]
            gains.append(max(diff, 0))
            losses.append(max(-diff, 0))
        avg_gain = sum(gains) / period
        avg_loss = sum(losses) / period
        for i in range(period, len(data)):
            diff   = data[i] - data[i - 1]
            gain   = max(diff, 0)
            loss   = max(-diff, 0)
            avg_gain = (avg_gain * (period - 1) + gain) / period
            avg_loss = (avg_loss * (period - 1) + loss) / period
            rs     = avg_gain / avg_loss if avg_loss != 0 else 100
            result[i] = round(100 - (100 / (1 + rs)), 2)
        return result

    rsi_values = compute_rsi(closes)
    for i, c in enumerate(candles):
        c["rsi"] = rsi_values[i]

    # ── MACD ───────────────────────────────────────────────────────────────────
    def ema(data, n):
        result = [None] * len(data)
        k = 2 / (n + 1)
        for i in range(len(data)):
            if i < n - 1:
                continue
            if i == n - 1:
                result[i] = sum(data[:n]) / n
            else:
                result[i] = data[i] * k + result[i-1] * (1 - k)
        return result

    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    macd_line = [
        round(a - b, 4) if a is not None and b is not None else None
        for a, b in zip(ema12, ema26)
    ]
    macd_vals = [v for v in macd_line if v is not None]
    signal_raw = ema(macd_vals, 9)
    signal_padded = [None] * (len(macd_line) - len(macd_vals)) + [None] * (len(macd_vals) - len(signal_raw)) + signal_raw
    # align properly
    signal_line = [None] * len(macd_line)
    offset = len(macd_line) - len(signal_raw)
    for i, v in enumerate(signal_raw):
        signal_line[offset + i] = round(v, 4) if v is not None else None

    for i, c in enumerate(candles):
        c["macd"]   = macd_line[i]
        c["signal"] = signal_line[i]
        c["histogram"] = (
            round(macd_line[i] - signal_line[i], 4)
            if macd_line[i] is not None and signal_line[i] is not None
            else None
        )

    # ── Bollinger Bands (20, 2σ) ───────────────────────────────────────────────
    for i, c in enumerate(candles):
        if i < 19:
            c["bb_upper"] = c["bb_lower"] = c["bb_mid"] = None
            continue
        window = closes[i-19:i+1]
        mid    = sum(window) / 20
        std    = math.sqrt(sum((x - mid) ** 2 for x in window) / 20)
        c["bb_upper"] = round(mid + 2 * std, 2)
        c["bb_mid"]   = round(mid, 2)
        c["bb_lower"] = round(mid - 2 * std, 2)

    # ── Suporte & Resistência (pivot de swing) ─────────────────────────────────
    def find_pivots(data_list, field, window=5, is_high=True):
        pivots = []
        for i in range(window, len(data_list) - window):
            val = data_list[i][field]
            neighbors = [data_list[j][field] for j in range(i - window, i + window + 1) if j != i]
            if is_high and all(val >= n for n in neighbors):
                pivots.append({"index": i, "price": val, "date": data_list[i]["date"]})
            elif not is_high and all(val <= n for n in neighbors):
                pivots.append({"index": i, "price": val, "date": data_list[i]["date"]})
        return pivots

    resistance_pivots = find_pivots(candles, "high", window=5, is_high=True)
    support_pivots    = find_pivots(candles, "low",  window=5, is_high=False)

    # Agrupa níveis próximos (dentro de 1.5%)
    def cluster_levels(pivots, tolerance=0.015):
        if not pivots:
            return []
        prices  = sorted(set(p["price"] for p in pivots))
        clusters = []
        current  = [prices[0]]
        for p in prices[1:]:
            if (p - current[-1]) / current[-1] < tolerance:
                current.append(p)
            else:
                clusters.append(round(sum(current) / len(current), 2))
                current = [p]
        clusters.append(round(sum(current) / len(current), 2))
        return clusters

    support_levels    = cluster_levels(support_pivots)
    resistance_levels = cluster_levels(resistance_pivots)

    # ── Fibonacci (sobre janela recente de ~60 dias) ───────────────────────────
    window_candles = candles[-min(60, len(candles)):]
    fib_high = max(c["high"] for c in window_candles)
    fib_low  = min(c["low"]  for c in window_candles)
    fib_diff = fib_high - fib_low
    fib_ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
    fibonacci_levels = {
        f"{int(r*100)}%": round(fib_high - fib_diff * r, 2)
        for r in fib_ratios
    }

    # ── Linha de Tendência (regressão linear sobre fechamentos) ───────────────
    def linear_regression(y_list):
        n = len(y_list)
        x_list = list(range(n))
        sx = sum(x_list); sy = sum(y_list)
        sxy = sum(x * y for x, y in zip(x_list, y_list))
        sxx = sum(x * x for x in x_list)
        denom = n * sxx - sx * sx
        if denom == 0:
            return None, None, None
        slope     = (n * sxy - sx * sy) / denom
        intercept = (sy - slope * sx) / n
        y_pred    = [round(intercept + slope * x, 2) for x in x_list]
        return slope, intercept, y_pred

    slope, intercept, trend_values = linear_regression(closes)
    trend_direction = "alta" if slope and slope > 0 else "baixa"

    for i, c in enumerate(candles):
        c["trend"] = trend_values[i] if trend_values else None

    # ── Detecção de Padrões de Candles ────────────────────────────────────────
    patterns = []

    for i in range(2, len(candles)):
        c0, c1, c2 = candles[i-2], candles[i-1], candles[i]
        o0,h0,l0,cl0 = c0["open"],c0["high"],c0["low"],c0["close"]
        o1,h1,l1,cl1 = c1["open"],c1["high"],c1["low"],c1["close"]
        o2,h2,l2,cl2 = c2["open"],c2["high"],c2["low"],c2["close"]
        body0 = abs(cl0 - o0); body1 = abs(cl1 - o1); body2 = abs(cl2 - o2)
        range0 = h0 - l0 or 0.001; range1 = h1 - l1 or 0.001; range2 = h2 - l2 or 0.001

        # Doji
        if body2 / range2 < 0.1:
            patterns.append({"date": c2["date"], "pattern": "Doji", "type": "neutro",
                              "desc": "Indecisão do mercado. Candle com corpo mínimo."})

        # Martelo (Hammer) — reversão de baixa
        lower_shadow = min(o2, cl2) - l2
        upper_shadow = h2 - max(o2, cl2)
        if (lower_shadow > body2 * 2 and upper_shadow < body2 * 0.5
                and cl1 < o1):  # tendência de baixa antes
            patterns.append({"date": c2["date"], "pattern": "Martelo", "type": "alta",
                              "desc": "Possível reversão de baixa. Sombra inferior longa."})

        # Shooting Star — reversão de alta
        if (upper_shadow > body2 * 2 and lower_shadow < body2 * 0.5
                and cl1 > o1):
            patterns.append({"date": c2["date"], "pattern": "Estrela Cadente", "type": "baixa",
                              "desc": "Possível reversão de alta. Sombra superior longa."})

        # Engolfo de alta (Bullish Engulfing)
        if (cl1 < o1 and cl2 > o2  # candle anterior baixista, atual altista
                and o2 < cl1 and cl2 > o1):
            patterns.append({"date": c2["date"], "pattern": "Engolfo de Alta", "type": "alta",
                              "desc": "Candle altista engolfa o anterior baixista. Sinal de reversão."})

        # Engolfo de baixa (Bearish Engulfing)
        if (cl1 > o1 and cl2 < o2
                and o2 > cl1 and cl2 < o1):
            patterns.append({"date": c2["date"], "pattern": "Engolfo de Baixa", "type": "baixa",
                              "desc": "Candle baixista engolfa o anterior altista. Sinal de reversão."})

        # Três Soldados Brancos
        if (cl0 > o0 and cl1 > o1 and cl2 > o2
                and cl1 > cl0 and cl2 > cl1
                and body1 > range1 * 0.6 and body2 > range2 * 0.6):
            patterns.append({"date": c2["date"], "pattern": "Três Soldados Brancos", "type": "alta",
                              "desc": "Três candles altistas consecutivos com corpos grandes. Forte impulso de alta."})

        # Três Corvos Negros
        if (cl0 < o0 and cl1 < o1 and cl2 < o2
                and cl1 < cl0 and cl2 < cl1
                and body1 > range1 * 0.6 and body2 > range2 * 0.6):
            patterns.append({"date": c2["date"], "pattern": "Três Corvos Negros", "type": "baixa",
                              "desc": "Três candles baixistas consecutivos com corpos grandes. Forte impulso de baixa."})

    # Deduplica padrões por data (mantém o mais recente)
    seen_dates = {}
    for p in patterns:
        seen_dates[p["date"]] = p
    patterns_clean = list(seen_dates.values())[-10:]  # últimos 10

    # ── Resumo final ──────────────────────────────────────────────────────────
    last_close = closes[-1]
    last_rsi   = next((v for v in reversed(rsi_values) if v is not None), None)

    if last_rsi:
        if last_rsi > 70:   rsi_signal = "Sobrecomprado"
        elif last_rsi < 30: rsi_signal = "Sobrevendido"
        else:               rsi_signal = "Neutro"
    else:
        rsi_signal = "—"

    return {
        "ticker":    ticker,
        "candles":   candles,
        "summary": {
            "last_close":      last_close,
            "trend_direction": trend_direction,
            "trend_slope":     round(slope, 4) if slope else None,
            "rsi":             last_rsi,
            "rsi_signal":      rsi_signal,
        },
        "support_levels":    support_levels[-5:],   # até 5 níveis mais recentes
        "resistance_levels": resistance_levels[-5:],
        "fibonacci":         fibonacci_levels,
        "fib_range":         {"high": fib_high, "low": fib_low},
        "patterns":          patterns_clean,
    }



# ══════════════════════════════════════════════════════════════════════════════
# PÁGINAS — MULTI-FORMAT UPLOAD + CHAT COM PERSISTÊNCIA NO BD
# ══════════════════════════════════════════════════════════════════════════════

_FILE_MAX_BYTES  = 15 * 1024 * 1024   # 15 MB
_TEXT_MAX_CHARS  = 100_000            # Aumentado para ~100k chars


def _extract_file_content(file_bytes: bytes, filename: str) -> dict:
    import io
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    content_text = ""
    info = "Documento"

    try:
        # 📄 PDF
        if ext == 'pdf':
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            parts = []
            for i, page in enumerate(reader.pages):
                txt = (page.extract_text() or "").strip()
                if txt: parts.append(f"--- Página {i+1} ---\n{txt}")
            content_text = "\n\n".join(parts)
            info = f"{len(reader.pages)} página(s)"

        # 📝 Word (.docx)
        elif ext == 'docx':
            import docx
            doc = docx.Document(io.BytesIO(file_bytes))
            content_text = "\n".join([p.text for p in doc.paragraphs])
            info = f"{len(doc.paragraphs)} parágrafos"

        # 📊 Excel (.xlsx)
        elif ext == 'xlsx':
            import pandas as pd
            df_map = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None)
            parts = []
            for sheet, df in df_map.items():
                parts.append(f"### Planilha: {sheet}\n{df.to_csv(index=False)}")
            content_text = "\n\n".join(parts)
            info = f"{len(df_map)} abas"

        # 📽️ PowerPoint (.pptx)
        elif ext == 'pptx':
            from pptx import Presentation
            prs = Presentation(io.BytesIO(file_bytes))
            parts = []
            for i, slide in enumerate(prs.slides):
                stext = []
                for shape in slide.shapes:
                    if hasattr(shape, "text"): stext.append(shape.text)
                if stext: parts.append(f"--- Slide {i+1} ---\n" + "\n".join(stext))
            content_text = "\n\n".join(parts)
            info = f"{len(prs.slides)} slides"

        # 🧾 CSV / Text / Code
        else:
            try:
                content_text = file_bytes.decode('utf-8', errors='replace')
                info = "Arquivo de texto"
            except:
                content_text = "Arquivo binário não suportado."
                info = "Binário"

    except Exception as e:
        content_text = f"Erro na extração: {str(e)}"
        info = "Erro"

    return {
        "text": content_text[:_TEXT_MAX_CHARS],
        "info": info,
        "filename": filename
    }


# ──────────────────────────────────────────────────────────────────────────────
# RAG HELPERS: chunking, embeddings, retrieval
# ──────────────────────────────────────────────────────────────────────────────

_CHUNK_SIZE   = 1500   # caracteres por chunk (~400 tokens)
_CHUNK_OVERLAP = 200   # sobreposição para preservar contexto entre chunks
_TOP_K         = 6     # chunks mais relevantes por pergunta
_EMBED_MODEL   = "text-embedding-3-small"  # modelo mais barato da OpenAI


def _chunk_text(text: str) -> list[str]:
    """Divide o texto em chunks com sobreposição para manter contexto."""
    chunks = []
    start = 0
    text = text.strip()
    while start < len(text):
        end = min(start + _CHUNK_SIZE, len(text))
        # Tenta quebrar no fim de uma frase/parágrafo
        if end < len(text):
            for sep in ("\n\n", "\n", ". ", " "):
                pos = text.rfind(sep, start, end)
                if pos > start + _CHUNK_SIZE // 2:
                    end = pos + len(sep)
                    break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - _CHUNK_OVERLAP
    return chunks


def _build_embeddings(chunks: list[str], api_key: str) -> list[list[float]]:
    """Gera embeddings para todos os chunks em uma única chamada em lote."""
    import openai
    client = openai.OpenAI(api_key=api_key)
    # API de embeddings aceita até 2048 inputs por chamada
    resp = client.embeddings.create(model=_EMBED_MODEL, input=chunks)
    return [item.embedding for item in sorted(resp.data, key=lambda x: x.index)]


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Similaridade cosseno entre dois vetores (puro Python/numpy)."""
    import numpy as np
    va, vb = np.array(a, dtype=np.float32), np.array(b, dtype=np.float32)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / denom) if denom > 0 else 0.0


def _retrieve_chunks(query: str, session_id: str, api_key: str, top_k: int = _TOP_K) -> str:
    """Recupera os top_k chunks mais relevantes para a query via similaridade coseno."""
    import openai
    from notifications_db import get_document_chunks

    chunks = get_document_chunks(session_id)  # [(text, embedding)]
    if not chunks:
        return ""  # fallback: sem chunks indexados

    # Embedding da query
    client = openai.OpenAI(api_key=api_key)
    q_resp = client.embeddings.create(model=_EMBED_MODEL, input=[query])
    q_emb = q_resp.data[0].embedding

    # Ranking por similaridade
    scored = sorted(
        [(text, _cosine_similarity(q_emb, emb)) for text, emb in chunks],
        key=lambda x: x[1],
        reverse=True,
    )
    top_chunks = [text for text, _ in scored[:top_k]]
    return "\n\n---\n\n".join(top_chunks)


def _index_document(session_id: str, text: str, api_key: str) -> int:
    """Divide o texto em chunks, gera embeddings e persiste no BD. Retorna nº de chunks."""
    from notifications_db import save_document_chunks
    chunks = _chunk_text(text)
    if not chunks:
        return 0
    # Lote: gera embeddings de todos os chunks de uma vez
    embeddings = _build_embeddings(chunks, api_key)
    save_document_chunks(session_id, list(zip(chunks, embeddings)))
    logging.info("[Páginas/RAG] %d chunks indexados para sessão %s", len(chunks), session_id)
    return len(chunks)


@app.post("/api/paginas/upload")
@limiter.limit("10/minute")
async def paginas_upload(request: Request, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Recebe qualquer arquivo, extrai texto, persiste no BD e indexa para RAG."""
    client_id = current_user["client_id"]
    content = await file.read()
    if len(content) > _FILE_MAX_BYTES:
        raise HTTPException(400, f"Arquivo muito grande. Máximo {_FILE_MAX_BYTES//1024//1024} MB.")

    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(executor, _extract_file_content, content, file.filename)
    except Exception as e:
        raise HTTPException(500, f"Erro ao processar arquivo: {e}")

    if not data["text"].strip() or data["info"] == "Binário":
         raise HTTPException(422, "Não foi possível extrair texto legível deste arquivo.")

    sid = str(uuid.uuid4())
    from notifications_db import save_document_session
    save_document_session(sid, client_id or "default", data["filename"], data["info"], data["text"])

    # Indexação RAG em background (não bloqueia a resposta)
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("CHATGPT_API_KEY")
    if api_key:
        try:
            n_chunks = await loop.run_in_executor(executor, _index_document, sid, data["text"], api_key)
            logging.info("[Páginas] '%s' indexado com %d chunks — sessão %s", data["filename"], n_chunks, sid)
        except Exception as e:
            logging.warning("[Páginas/RAG] Falha na indexação (usará texto completo como fallback): %s", e)
    else:
        logging.warning("[Páginas/RAG] OPENAI_API_KEY ausente — indexação RAG ignorada.")

    return {
        "session_id": sid,
        "filename": data["filename"],
        "info": data["info"],
        "preview": data["text"][:300]
    }



@app.get("/api/paginas/cliente/{client_id}")
async def get_paginas_cliente(client_id: str, current_user: dict = Depends(get_current_user)):
    """Retorna os documentos salvos do cliente."""
    if current_user["client_id"] != client_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    from notifications_db import get_user_documents
    docs = get_user_documents(client_id)
    return {"documents": docs}


@app.delete("/api/paginas/sessao/{session_id}")
async def delete_pagina_sessao(session_id: str, current_user: dict = Depends(get_current_user)):
    from notifications_db import delete_document_session
    delete_document_session(session_id)
    return {"status": "ok"}


class PaginasChatPayload(BaseModel):
    session_id: str
    message: str
    history: List[dict] = []


def _chat_file(session_id: str, message: str, history: list, client_id: str) -> str:
    """
    RAG-powered chat: recupera apenas os chunks relevantes (~2.500 tokens)
    em vez de enviar o documento inteiro (~100.000 tokens).
    """
    import openai
    from notifications_db import get_document_session, has_chunks

    file_data = get_document_session(session_id)
    if not file_data:
        raise ValueError("Documento não encontrado. Faça upload do arquivo novamente.")

    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("CHATGPT_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY não configurada.")

    # ── Recuperação RAG ────────────────────────────────────────────────────────
    if has_chunks(session_id):
        context = _retrieve_chunks(message, session_id, api_key)
        context_label = f"TRECHOS RELEVANTES DO ARQUIVO (selecionados por relevância semântica):"
        logging.info("[Páginas/RAG] Recuperados %d chars de contexto para a query", len(context))
    else:
        # Fallback: arquivo sem indexação (ex: indexação falhou) — usa primeiros 6000 chars
        context = file_data["content_text"][:6000]
        context_label = "INÍCIO DO CONTEÚDO DO ARQUIVO (indexação RAG não disponível):"
        logging.warning("[Páginas/RAG] Sem chunks indexados — usando fallback de 6000 chars.")

    client = openai.OpenAI(api_key=api_key)

    system_instruction = (
        f'Você é um assistente especializado em análise de documentos.\n'
        f'Arquivo: "{file_data["filename"]}" — {file_data["info"]}.\n\n'
        f'{context_label}\n{context}\n\n'
        'Responda APENAS com base nos trechos fornecidos acima. '
        'Se a informação não estiver nos trechos, diga claramente que pode não estar disponível neste contexto. '
        'Se for código ou dados tabulares, analise conforme solicitado. '
        'Use markdown para formatação.'
    )

    messages = [{"role": "system", "content": system_instruction}]
    # Mantém apenas as últimas 6 trocas (12 mensagens) para economizar tokens
    for m in history[-12:]:
        role = "user" if m.get("role") == "user" else "assistant"
        messages.append({"role": role, "content": m.get("content", "")})
    messages.append({"role": "user", "content": message})

    resp = client.chat.completions.create(
        model="gpt-4o-mini-2024-07-18",
        messages=messages,
        temperature=0.2,
        max_tokens=1500,
    )
    
    # Debita os tokens gastos
    tokens = resp.usage.total_tokens if hasattr(resp, "usage") and resp.usage else 0
    if tokens > 0:
        from token_manager import consume_tokens
        consume_tokens(client_id, tokens)
        
    return resp.choices[0].message.content


@app.post("/api/paginas/chat")
@limiter.limit("15/minute")
async def paginas_chat(request: Request, payload: PaginasChatPayload, current_user: dict = Depends(get_current_user)):
    """Responde perguntas sobre o arquivo persistido."""
    if not payload.message.strip():
        raise HTTPException(400, "Mensagem vazia.")
    
    # Valida tokens antes de rodar o executor
    from token_manager import verify_user_tokens
    verify_user_tokens(current_user["client_id"])
    
    loop = asyncio.get_event_loop()
    try:
        reply = await loop.run_in_executor(
            executor, _chat_file, payload.session_id, payload.message, payload.history, current_user["client_id"]
        )
        return {"response": reply}
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logging.exception("[Páginas] Erro no chat de arquivo persistido")
        raise HTTPException(500, f"Erro ao gerar resposta: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# ASSISTENTE DE PESQUISA E RESUMOS (GEMINI + YFINANCE)
# ══════════════════════════════════════════════════════════════════════════════

def _run_research(raw_ticker: str, client_id: str) -> dict:
    """Analisa empresa usando yfinance + Gemini e retorna resumo estruturado."""
    import warnings, json as _json
    import openai

    # ── Resolver ticker ────────────────────────────────────────────────────────
    stock, info, used = None, {}, raw_ticker
    for candidate in [f"{raw_ticker}.SA", raw_ticker]:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                t = yf.Ticker(candidate)
                _info = t.info
            if _info.get("longName") or _info.get("shortName"):
                stock, info, used = t, _info, candidate
                break
        except Exception:
            continue
    if stock is None:
        raise ValueError(f"Ticker '{raw_ticker}' não encontrado. Use código B3 (ex: PETR4, VALE3).")

    name     = info.get("longName") or info.get("shortName", raw_ticker)
    sector   = info.get("sector", "N/D")
    industry = info.get("industry", "N/D")
    desc     = (info.get("longBusinessSummary") or "")[:600]

    # ── Métricas financeiras ──────────────────────────────────────────────────
    def fmt_pct(v): return f"{(v or 0)*100:.1f}%" if v is not None else None
    def fmt_billions(v): return f"R$ {v/1e9:.1f}B" if v and v > 1e9 else (f"R$ {v/1e6:.0f}M" if v and v > 1e6 else None)

    metrics = {
        "P/L":            round(info.get("trailingPE") or 0, 1) or None,
        "P/VP":           round(info.get("priceToBook") or 0, 2) or None,
        "Dividend Yield": fmt_pct(info.get("dividendYield")),
        "Margem Líquida": fmt_pct(info.get("profitMargins")),
        "ROE":            fmt_pct(info.get("returnOnEquity")),
        "ROA":            fmt_pct(info.get("returnOnAssets")),
        "Dívida/PL":      round(info.get("debtToEquity") or 0, 1) or None,
        "Market Cap":     fmt_billions(info.get("marketCap")),
        "Receita Anual":  fmt_billions(info.get("totalRevenue")),
        "Beta":           round(info.get("beta") or 0, 2) or None,
    }
    metrics = {k: v for k, v in metrics.items() if v is not None}

    # ── Variação de preço ─────────────────────────────────────────────────────
    price_chg = {}
    try:
        import pandas as pd
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            h = stock.history(period="6mo")
        if len(h) >= 21:
            price_chg["1mo"]  = round((h["Close"].iloc[-1]/h["Close"].iloc[-21]-1)*100, 2)
            price_chg["3mo"]  = round((h["Close"].iloc[-1]/h["Close"].iloc[-63]-1)*100, 2) if len(h)>=63 else None
            price_chg["6mo"]  = round((h["Close"].iloc[-1]/h["Close"].iloc[0]-1)*100, 2)
        price_now = round(float(h["Close"].iloc[-1]), 2) if len(h) else None
    except Exception:
        price_now = info.get("currentPrice") or info.get("previousClose")

    # ── Notícias recentes ─────────────────────────────────────────────────────
    news_items = []
    try:
        for n in (stock.news or [])[:10]:
            ct = n.get("content", {}) if isinstance(n.get("content"), dict) else {}
            title  = ct.get("title") or n.get("title", "")
            source = ct.get("provider", {}).get("displayName", "") or n.get("publisher", "")
            if title:
                news_items.append({"title": title, "source": source})
    except Exception:
        pass

    # ── ChatGPT ───────────────────────────────────────────────────────────────
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("CHATGPT_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY não definida no .env")
    client = openai.OpenAI(api_key=api_key)

    news_str    = "\n".join(f"- {n['title']} ({n['source']})" for n in news_items) or "Sem notícias disponíveis."
    metrics_str = "\n".join(f"- {k}: {v}" for k, v in metrics.items())
    chg_str     = ", ".join(f"{k}: {v:+.1f}%" for k, v in price_chg.items() if v is not None)

    prompt = f"""Você é um analista financeiro sênior especializado no mercado brasileiro.
Analise os dados abaixo e retorne SOMENTE um JSON válido, sem markdown.

EMPRESA: {name} | TICKER: {raw_ticker}
SETOR: {sector} | INDÚSTRIA: {industry}
DESCRIÇÃO: {desc}
MÉTRICAS: {metrics_str}
VARIAÇÕES DE PREÇO: {chg_str or 'N/D'}
NOTÍCIAS: {news_str}

Formato JSON exato:
{{
  "company_summary": "Resumo executivo em 2-3 frases em linguagem simples para leigo",
  "executive_bullets": ["ponto chave 1", "ponto chave 2", "ponto chave 3"],
  "financial_health": {{
    "score": <0-100>,
    "label": "Excelente|Boa|Regular|Fraca|Crítica",
    "highlights": ["positivo 1", "positivo 2", "atenção 1"]
  }},
  "risks": [
    {{"title": "Nome", "description": "Explicação simples", "severity": "high|medium|low"}}
  ],
  "catalysts": [
    {{"title": "Nome", "description": "Por que pode impulsionar o preço", "horizon": "short|medium|long"}}
  ],
  "news_analysis": [
    {{"title": "Título resumido", "impact": "positive|negative|neutral", "summary": "O que significa para o investidor"}}
  ],
  "investment_highlights": ["destaque 1", "destaque 2", "destaque 3"],
  "ai_verdict": "Análise final equilibrada em 2-3 frases",
  "sentiment_score": <0-100>,
  "sentiment_label": "Muito Positivo|Positivo|Neutro|Negativo|Muito Negativo",
  "risk_level": "low|medium|high|very_high"
}}

Seja objetivo, use linguagem acessível. Máximo 4 itens por lista."""

    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.25,
        response_format={"type": "json_object"}
    )
    
    # Debita tokens reais consumidos
    tokens = resp.usage.total_tokens if hasattr(resp, "usage") and resp.usage else 0
    if tokens > 0:
        from token_manager import consume_tokens
        consume_tokens(client_id, tokens)
        
    raw_text = resp.choices[0].message.content or ""

    # Gemini às vezes embrulha em ```json ... ``` — extrair apenas o JSON
    import re as _re
    fence_match = _re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_text)
    json_str = fence_match.group(1).strip() if fence_match else raw_text.strip()

    # Tentar parsear; se falhar, usar fallback mínimo para não quebrar a UI
    try:
        analysis = _json.loads(json_str)
    except Exception as parse_err:
        logging.warning("[Research] Falha ao parsear JSON do ChatGPT: %s\nRaw: %.300s", parse_err, raw_text)
        analysis = {
            "company_summary": f"Análise de {name} ({raw_ticker}). Os dados foram coletados mas houve falha ao processar o relatório da IA.",
            "executive_bullets": [f"Setor: {sector}", f"Indústria: {industry}"],
            "financial_health": {"score": 50, "label": "Regular", "highlights": []},
            "risks": [{"title": "Dados incompletos", "description": "Não foi possível gerar análise de riscos desta vez.", "severity": "medium"}],
            "catalysts": [],
            "news_analysis": [],
            "investment_highlights": [],
            "ai_verdict": "Análise indisponível no momento. Tente novamente em alguns instantes.",
            "sentiment_score": 50,
            "sentiment_label": "Neutro",
            "risk_level": "medium",
        }

    return {
        "ticker":      raw_ticker.upper(),
        "name":        name,
        "sector":      sector,
        "industry":    industry,
        "price":       price_now,
        "price_chg":   price_chg,
        "metrics":     metrics,
        "news":        news_items,
        "analysis":    analysis,
        "generated_at": datetime.utcnow().isoformat(),
    }


@app.get("/api/pesquisa/{ticker}")
@limiter.limit("10/minute")
async def get_research(request: Request, ticker: str, current_user: dict = Depends(get_current_user)):
    """Análise completa de empresa via Gemini + yfinance."""
    # Valida tokens antes de iniciar a pesquisa
    from token_manager import verify_user_tokens
    verify_user_tokens(current_user["client_id"])
    
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(executor, _run_research, ticker.upper(), current_user["client_id"])
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logging.exception("[Research] Erro inesperado para %s", ticker)
        raise HTTPException(status_code=500, detail=f"Erro ao gerar análise: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# INSIGHTS PREDITIVOS ENGINE
# ══════════════════════════════════════════════════════════════════════════════

import numpy as np
import math as _math

def _compute_insights(raw_ticker: str) -> dict:
    """Calcula 10 cartões preditivos para um ticker usando yfinance."""
    import warnings, pandas as pd
    hist = None
    used = raw_ticker

    for candidate in [f"{raw_ticker}.SA", raw_ticker, f"{raw_ticker}.SAO"]:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                h = yf.download(candidate, period="1y", progress=False,
                                auto_adjust=True, threads=False)
            # yfinance moderno retorna MultiIndex (Price, Ticker) — nivelar para 1D
            if isinstance(h.columns, pd.MultiIndex):
                h = h.droplevel(1, axis=1)
            h = h.dropna(subset=["Close"])
            if len(h) >= 30:
                hist = h
                used = candidate
                logging.info("[Insights] %s → %s (%d candles)", raw_ticker, candidate, len(h))
                break
            logging.warning("[Insights] Dados insuficientes: %s (%d candles)", candidate, len(h))
        except Exception as exc:
            logging.warning("[Insights] Erro em %s: %s", candidate, exc)

    if hist is None or len(hist) < 30:
        raise ValueError(
            f"Ticker '{raw_ticker}' não encontrado ou sem dados suficientes. "
            "Use o código B3 sem sufixo (ex: PETR4, VALE3, ITUB4)."
        )

    closes  = hist["Close"].values.astype(float)
    volumes = hist["Volume"].fillna(0).values.astype(float)
    highs   = hist["High"].values.astype(float)
    lows    = hist["Low"].values.astype(float)
    price   = closes[-1]
    cards   = []

    # ── 1. ANOMALIA DE VOLUME ──────────────────────────────────────────────────
    avg_v20 = np.mean(volumes[-20:])
    curr_v  = volumes[-1]
    vratio  = curr_v / avg_v20 if avg_v20 > 0 else 1
    vstd    = np.std(volumes[-20:])
    vz      = (curr_v - avg_v20) / vstd if vstd > 0 else 0
    if vratio > 2:
        vsig, vdesc = "warning", f"Volume {vratio:.1f}x acima da média de 20 dias — atividade incomum pode indicar notícia relevante ou movimentação institucional."
    elif vratio > 1.4:
        vsig, vdesc = "bullish", f"Volume elevado ({vratio:.1f}x a média de 20 dias) com possível acúmulo institucional."
    elif vratio < 0.5:
        vsig, vdesc = "neutral", f"Volume baixo ({vratio:.1f}x a média). Mercado em compasso de espera."
    else:
        vsig, vdesc = "neutral", f"Volume dentro do padrão normal ({vratio:.1f}x a média de 20 dias)."
    cards.append({"id":"volume_anomaly","category":"technical","title":"Anomalia de Volume",
        "signal":vsig,"value":f"{vratio:.1f}x","description":vdesc,
        "confidence":min(95,int(abs(vz)*30+50)),"horizon":"short",
        "sparkline":[float(v) for v in volumes[-14:]]})

    # ── 2. PROJEÇÃO DE TENDÊNCIA (regressão linear 20d → próximos 5d) ─────────
    x20 = np.arange(20, dtype=float)
    c20 = closes[-20:]
    slope, intercept = np.polyfit(x20, c20, 1)
    proj5  = intercept + slope * 25
    chg5   = (proj5 / price - 1) * 100
    y_pred = slope * x20 + intercept
    ss_res = np.sum((c20 - y_pred)**2)
    ss_tot = np.sum((c20 - np.mean(c20))**2)
    r2     = max(0.0, 1 - ss_res / ss_tot) if ss_tot > 0 else 0
    tsig   = "bullish" if chg5 > 2 else ("bearish" if chg5 < -2 else "neutral")
    cards.append({"id":"trend_projection","category":"predictive","title":"Projeção de Tendência (5 dias)",
        "signal":tsig,"value":f"{chg5:+.1f}%",
        "description":f"Regressão linear dos últimos 20 pregões projeta {chg5:+.1f}% nos próximos 5 dias. Preço alvo: R$ {proj5:.2f}. R²={r2:.2f}.",
        "confidence":int(r2*100),"horizon":"short",
        "sparkline":[float(c) for c in closes[-14:]]})

    # ── 3. SCORE DE MOMENTUM (RSI + MAs) ─────────────────────────────────────
    delta = np.diff(closes[-15:])
    gains = np.where(delta>0, delta, 0.0)
    losses = np.where(delta<0, -delta, 0.0)
    ag, al = np.mean(gains[-14:]), np.mean(losses[-14:])
    rsi = 100 - (100/(1+ag/al)) if al > 0 else 100.0
    ma50  = np.mean(closes[-50:])  if len(closes)>=50  else np.mean(closes)
    ma200 = np.mean(closes[-200:]) if len(closes)>=200 else np.mean(closes)
    v50  = (price/ma50  - 1)*100
    v200 = (price/ma200 - 1)*100
    mscore = rsi*0.4 + min(100,max(0,50+v50*2))*0.35 + min(100,max(0,50+v200*1.5))*0.25
    msig = "bullish" if mscore>65 else ("bearish" if mscore<35 else "neutral")
    cards.append({"id":"momentum_score","category":"technical","title":"Score de Momentum",
        "signal":msig,"value":f"{mscore:.0f}/100",
        "description":f"Score composto: RSI={rsi:.0f}, vs MA50={v50:+.1f}%, vs MA200={v200:+.1f}%. {'Momento forte.' if mscore>65 else 'Momento fraco.' if mscore<35 else 'Sem tendência clara.'}",
        "confidence":75,"horizon":"medium",
        "sparkline":[float(c) for c in closes[-14:]]})

    # ── 4. REGIME DE VOLATILIDADE ─────────────────────────────────────────────
    lr = np.diff(np.log(np.where(closes>0, closes, 1e-9)))
    v20  = np.std(lr[-20:])*np.sqrt(252)*100
    v1y  = np.std(lr)*np.sqrt(252)*100
    vreg = v20/v1y if v1y>0 else 1
    if vreg>1.3:
        vrsig,vrlabel = "warning","Alta"
        vrdesc = f"Volatilidade atual ({v20:.1f}% a.a.) está {(vreg-1)*100:.0f}% acima da média histórica. Aumente margens de segurança."
    elif vreg<0.7:
        vrsig,vrlabel = "bullish","Comprimida"
        vrdesc = f"Volatilidade comprimida ({v20:.1f}% a.a.). Expansão iminente provável — fique atento a rompimentos."
    else:
        vrsig,vrlabel = "neutral","Normal"
        vrdesc = f"Volatilidade em regime normal ({v20:.1f}% a.a.), dentro do padrão de 1 ano ({v1y:.1f}% a.a.)."
    cards.append({"id":"volatility_regime","category":"risk","title":"Regime de Volatilidade",
        "signal":vrsig,"value":f"{v20:.1f}% a.a.","description":vrdesc,
        "confidence":82,"horizon":"medium","sparkline":[]})

    # ── 5. SINAL DE REVERSÃO À MÉDIA (Bollinger) ──────────────────────────────
    ma20b = np.mean(closes[-20:])
    std20 = np.std(closes[-20:])
    ub, lb = ma20b+2*std20, ma20b-2*std20
    bbpos = (price-lb)/(ub-lb) if (ub-lb)>0 else 0.5
    zs    = (price-ma20b)/std20 if std20>0 else 0
    if bbpos<0.1:   rsig,rval = "bullish","Reverter ↑"
    elif bbpos>0.9: rsig,rval = "bearish","Reverter ↓"
    else:           rsig,rval = "neutral", f"Pos. {bbpos:.0%}"
    cards.append({"id":"mean_reversion","category":"technical","title":"Sinal de Reversão à Média",
        "signal":rsig,"value":rval,
        "description":f"Bollinger z-score={zs:.2f}. {'Preço na banda inferior — alta probabilidade de repique.' if bbpos<0.1 else 'Preço na banda superior — possível correção.' if bbpos>0.9 else 'Preço em zona intermediária das bandas.'}",
        "confidence":int(min(95,abs(zs)*30+40)),"horizon":"short",
        "sparkline":[float(c) for c in closes[-14:]]})

    # ── 6. SAZONALIDADE MENSAL ────────────────────────────────────────────────
    mret = {}
    for m in range(1,13):
        md = hist[hist.index.month==m]["Close"]
        if len(md)>=2: mret[m] = (float(md.iloc[-1])/float(md.iloc[0])-1)*100
    mnames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
    cm = datetime.utcnow().month
    if cm in mret:
        mr = mret[cm]
        best = max(mret, key=mret.get)
        ssig = "bullish" if mr>2 else ("bearish" if mr<-2 else "neutral")
        sdesc = f"Historicamente, {mnames[cm-1]} apresenta {mr:+.1f}% para este ativo. Melhor mês: {mnames[best-1]} ({mret[best]:+.1f}%)."
        cards.append({"id":"seasonality","category":"predictive","title":"Padrão de Sazonalidade",
            "signal":ssig,"value":f"{mr:+.1f}%","description":sdesc,
            "confidence":55,"horizon":"medium",
            "sparkline":[mret.get(i,0) for i in range(1,13)]})

    # ── 7. POTENCIAL DE ROMPIMENTO (52 semanas) ────────────────────────────────
    h52 = float(np.max(highs[-252:])) if len(highs)>=252 else float(np.max(highs))
    l52 = float(np.min(lows[-252:]))  if len(lows)>=252  else float(np.min(lows))
    rng = h52 - l52
    rpos = (price-l52)/rng if rng>0 else 0.5
    pfh  = (price/h52-1)*100
    pfl  = (price/l52-1)*100
    if rpos>0.85:   bsig,bval = "bullish",f"{pfh:+.1f}% máx."
    elif rpos<0.15: bsig,bval = "warning",f"+{pfl:.1f}% mín."
    else:           bsig,bval = "neutral", f"{rpos:.0%} do range"
    bdesc = (f"Próximo da máxima de 52 semanas (R$ {h52:.2f}) — rompimento pode acelerar alta." if rpos>0.85
             else f"Próximo da mínima de 52 semanas (R$ {l52:.2f}) — suporte crítico. Cuidado." if rpos<0.15
             else f"Preço a {pfh:.1f}% da máxima e +{pfl:.1f}% da mínima de 52 semanas.")
    cards.append({"id":"breakout_potential","category":"predictive","title":"Potencial de Rompimento",
        "signal":bsig,"value":bval,"description":bdesc,
        "confidence":65,"horizon":"medium","sparkline":[float(c) for c in closes[-14:]]})

    # ── 8. FLUXO SMART MONEY (OBV) ────────────────────────────────────────────
    obv = [0.0]
    for i in range(1,len(closes)):
        obv.append(obv[-1]+volumes[i] if closes[i]>closes[i-1] else obv[-1]-volumes[i] if closes[i]<closes[i-1] else obv[-1])
    obv_arr = np.array(obv)
    obs20   = obv_arr[-20:]
    osl = np.polyfit(np.arange(20),obs20,1)[0]
    psl = np.polyfit(np.arange(20),closes[-20:],1)[0]
    pup,oup = psl>0, osl>0
    if pup and oup:     smsig,smval = "bullish","Acumulação"
    elif not pup and not oup: smsig,smval = "bearish","Distribuição"
    elif pup and not oup: smsig,smval = "warning","Div. Baixista"
    else:                 smsig,smval = "bullish","Div. Altista"
    smdesc = {"Acumulação":"Preço e OBV sobem juntos — instituições confirmando a alta.",
              "Distribuição":"Preço e OBV caem — pressão vendedora confirmada.",
              "Div. Baixista":"⚠️ Preço sobe mas OBV cai — smart money pode estar saindo.",
              "Div. Altista":"Preço cai mas OBV sobe — capital entrando na queda. Possível reversão."}[smval]
    cards.append({"id":"smart_money_flow","category":"predictive","title":"Fluxo de Capital (Smart Money)",
        "signal":smsig,"value":smval,"description":smdesc,
        "confidence":70,"horizon":"medium","sparkline":[float(o) for o in obs20]})

    # ── 9. SCORE DE RISCO COMPOSTO ────────────────────────────────────────────
    rm = np.maximum.accumulate(closes[-60:])
    dds = (closes[-60:]-rm)/rm*100
    mdd = abs(float(np.min(dds)))
    rscore = min(100,v20/50*100)*0.5 + min(100,mdd/30*100)*0.5
    if rscore>60:   risksig,riskl = "bearish","Alto"
    elif rscore<30: risksig,riskl = "bullish","Baixo"
    else:           risksig,riskl = "neutral","Moderado"
    cards.append({"id":"risk_score","category":"risk","title":"Score de Risco Composto",
        "signal":risksig,"value":f"{rscore:.0f}/100 — {riskl}",
        "description":f"Risco {riskl.lower()} (score {rscore:.0f}/100): volatilidade {v20:.1f}% a.a., drawdown máximo -{mdd:.1f}% em 60 dias.",
        "confidence":78,"horizon":"medium","sparkline":[float(d) for d in dds]})

    # ── 10. ANÁLISE DE ACELERAÇÃO DE PREÇO ───────────────────────────────────
    # Compara velocidade da mudança de preço: últimos 5 dias vs 10-20 dias atrás
    if len(closes) >= 25:
        vel_recente = (closes[-1]-closes[-6])/closes[-6]*100
        vel_anterior = (closes[-11]-closes[-21])/closes[-21]*100
        accel = vel_recente - vel_anterior
        if accel > 3:   asig = "bullish"
        elif accel < -3: asig = "bearish"
        else:           asig = "neutral"
        adesc = (f"Velocidade de preço acelerando ({accel:+.1f}pp vs período anterior) — momentum ganhando força." if accel>3
                 else f"Velocidade de preço desacelerando ({accel:+.1f}pp) — momentum perdendo força." if accel<-3
                 else f"Aceleração neutra ({accel:+.1f}pp). Sem mudança relevante de velocidade no preço.")
        cards.append({"id":"price_acceleration","category":"predictive","title":"Aceleração do Preço",
            "signal":asig,"value":f"{accel:+.1f}pp",
            "description":adesc,"confidence":62,"horizon":"short",
            "sparkline":[float(c) for c in closes[-20:]]})

    return {"ticker":raw_ticker.upper(),"ticker_used":used,"price":round(float(price),2),
            "cards":cards,"generated_at":datetime.utcnow().isoformat()}


@app.get("/api/insights/{ticker}")
@limiter.limit("15/minute")
async def get_insights(request: Request, ticker: str, current_user: dict = Depends(get_current_user)):
    """Retorna cartões de insights preditivos para um ticker."""
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(executor, _compute_insights, ticker.upper())
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao calcular insights: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# MOTOR DE NOTIFICAÇÕES — SSE + SYNC + HISTÓRICO
# ══════════════════════════════════════════════════════════════════════════════

class AlertSyncPayload(BaseModel):
    client_id: str
    alerts: List[dict]


@app.post("/api/alertas/sync")
@limiter.limit("30/minute")
async def sync_alerts_endpoint(request: Request, payload: AlertSyncPayload, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user), _rbac=Depends(require_permission("alerts"))):
    """
    Recebe as regras de alerta do frontend e salva no SQLite local.
    Chamado automaticamente quando o usuário salva alertas nas Configurações.
    """
    if current_user["client_id"] != payload.client_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    from notifications_db import sync_alerts
    sync_alerts(payload.client_id, payload.alerts)
    # Audit Log (Pilar 6 — Ciber)
    background_tasks.add_task(
        log_action, actor_id=payload.client_id, action="SYNC_ALERTS",
        resource_id=payload.client_id, ip_address=get_client_ip(request), status="success",
        new_value=json.dumps({"count": len(payload.alerts)}),
    )
    return {"status": "ok", "synced": len(payload.alerts)}


@app.get("/api/notificacoes/historico/{client_id}")
async def get_notification_history(client_id: str, limit: int = 30, current_user: dict = Depends(get_current_user)):
    """Retorna o histórico de notificações de um client."""
    if current_user["client_id"] != client_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    from notifications_db import get_history, mark_all_read
    history = get_history(client_id, limit)
    mark_all_read(client_id)
    return {"notifications": history, "total": len(history)}


@app.post("/api/notificacoes/testar/{client_id}")
async def test_notification(client_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["client_id"] != client_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    """
    Dispara uma notificação de teste imediata para o client_id.
    Útil para validar que o canal SSE está funcionando.
    """
    from notification_state import dispatch_notification
    from notifications_db import save_notification
    notif = {
        "client_id": client_id,
        "ticker":    "TESTE",
        "title":     "✅ Canal de alertas funcionando!",
        "body":      "Seus alertas em tempo real estão configurados corretamente.",
        "severity":  "info",
        "condition": "test",
        "value":     0.0,
        "price":     0.0,
        "timestamp": datetime.utcnow().isoformat(),
    }
    save_notification(notif)
    await dispatch_notification(client_id, notif)
    return {"status": "sent"}


@app.post("/api/notificacoes/verificar-agora")
@limiter.limit("5/minute")
async def run_monitor_now(request: Request, current_user: dict = Depends(get_current_user)):
    """Aciona uma verificação manual imediata de todos os alertas (útil em dev)."""
    from monitor_agent import check_all_alerts
    count = await check_all_alerts()
    return {"status": "ok", "dispatched": count}


@app.get("/api/notificacoes/stream/{client_id}")
async def notification_stream(client_id: str, request: Request):
    """
    Server-Sent Events — o frontend conecta aqui via EventSource.
    Mantém a conexão aberta e envia notificações conforme chegam.
    A autenticação para SSE geralmente usa token via Query String.
    """
    token = request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Token ausente no SSE")
    from auth import decode_access_token
    payload = decode_access_token(token)
    if not payload or payload.get("client_id") != client_id:
        raise HTTPException(status_code=403, detail="Acesso negado SSE")

    from notification_state import get_queue
    queue = get_queue(client_id)

    async def event_generator():
        # Confirmação de conexão
        yield "event: connected\ndata: {\"status\": \"ok\"}\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                notification = await asyncio.wait_for(queue.get(), timeout=25.0)
                payload = json.dumps(notification, ensure_ascii=False)
                yield f"event: alert\ndata: {payload}\n\n"
            except asyncio.TimeoutError:
                # Keepalive — evita que proxies matem a conexão ociosa
                yield "event: ping\ndata: {}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":       "keep-alive",
        },
    )


# ══════════════════════════════════════════════════════════════════════════════
# BACKTESTING ENGINE
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/backtesting/{ticker}")
@limiter.limit("15/minute")
async def run_backtesting(
    request: Request,
    ticker: str,
    period: str      = "2y",           # 1y | 2y | 5y
    strategy: str    = "ma_crossover", # ma_crossover | rsi | bollinger | buy_hold
    fast_ma: int     = 20,
    slow_ma: int     = 50,
    rsi_period: int  = 14,
    rsi_oversold: int    = 30,
    rsi_overbought: int  = 70,
    bb_period: int   = 20,
    bb_std: float    = 2.0,
    initial_capital: float = 10000.0,
    commission: float      = 0.001,
    current_user: dict = Depends(get_current_user),
):
    """
    Simula uma estratégia de investimento em dados históricos (backtesting).
    Retorna: curva de capital, sinais de compra/venda, lista de trades e métricas.
    """
    ticker_upper = ticker.upper()
    ticker_sa    = f"{ticker_upper}.SA"
    params = {
        "fast_ma": fast_ma, "slow_ma": slow_ma,
        "rsi_period": rsi_period, "rsi_oversold": rsi_oversold, "rsi_overbought": rsi_overbought,
        "bb_period": bb_period, "bb_std": bb_std,
        "initial_capital": initial_capital, "commission": commission,
    }
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(
            executor,
            lambda: _run_backtesting(ticker_sa, ticker_upper, period, strategy, params),
        )
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no backtesting: {str(e)}")


def _run_backtesting(ticker_sa: str, ticker: str, period: str, strategy: str, params: dict) -> dict:
    import math

    # Tenta diferentes variantes do ticker para garantir compatibilidade com o yfinance
    candidates = [ticker_sa, ticker, f"{ticker}.SAO"]
    hist = None
    used_ticker = None
    for candidate in candidates:
        try:
            h = yf.Ticker(candidate).history(period=period, interval="1d")
            if not h.empty:
                hist = h
                used_ticker = candidate
                break
        except Exception:
            continue

    if hist is None or hist.empty:
        raise ValueError(
            f"Não foi possível encontrar dados para '{ticker}' (tentativas: {', '.join(candidates)}). "
            f"Confira se o ticker está correto — ex: PETR4, VALE3, ITUB4."
        )

    hist = hist.reset_index()
    candles = []
    for _, row in hist.iterrows():
        dt = row["Date"]
        date_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
        candles.append({
            "date":   date_str,
            "open":   float(row["Open"]),
            "high":   float(row["High"]),
            "low":    float(row["Low"]),
            "close":  float(row["Close"]),
            "volume": int(row["Volume"]),
        })

    closes = [c["close"] for c in candles]
    n = len(candles)

    # ── Helpers ────────────────────────────────────────────────────────────────
    def compute_sma(data, period):
        result = [None] * len(data)
        for i in range(period - 1, len(data)):
            result[i] = sum(data[i - period + 1:i + 1]) / period
        return result

    def compute_rsi_series(data, period):
        result = [None] * len(data)
        if len(data) <= period:
            return result
        gains, losses = [], []
        for i in range(1, period + 1):
            diff = data[i] - data[i - 1]
            gains.append(max(diff, 0))
            losses.append(max(-diff, 0))
        avg_gain = sum(gains) / period
        avg_loss = sum(losses) / period
        for i in range(period, len(data)):
            diff = data[i] - data[i - 1]
            avg_gain = (avg_gain * (period - 1) + max(diff, 0)) / period
            avg_loss = (avg_loss * (period - 1) + max(-diff, 0)) / period
            rs = avg_gain / avg_loss if avg_loss != 0 else 100
            result[i] = 100 - (100 / (1 + rs))
        return result

    def compute_bb(data, period, std_mult):
        upper = [None] * len(data)
        lower = [None] * len(data)
        mid   = [None] * len(data)
        for i in range(period - 1, len(data)):
            w = data[i - period + 1:i + 1]
            m = sum(w) / period
            s = math.sqrt(sum((x - m) ** 2 for x in w) / period)
            upper[i] = m + std_mult * s
            lower[i] = m - std_mult * s
            mid[i]   = m
        return upper, lower, mid

    # ── Gerar sinais por estratégia ────────────────────────────────────────────
    signals    = [0] * n    # 1=compra, -1=venda, 0=nenhum
    indicators = {}         # dados extras para o gráfico

    if strategy == "buy_hold":
        signals[0]  = 1
        signals[-1] = -1

    elif strategy == "ma_crossover":
        fast_p = params["fast_ma"]
        slow_p = params["slow_ma"]
        sma_f  = compute_sma(closes, fast_p)
        sma_s  = compute_sma(closes, slow_p)
        indicators["fast_ma"] = [round(v, 2) if v else None for v in sma_f]
        indicators["slow_ma"] = [round(v, 2) if v else None for v in sma_s]
        in_pos = False
        for i in range(1, n):
            if sma_f[i] is None or sma_s[i] is None or sma_f[i-1] is None or sma_s[i-1] is None:
                continue
            cross_up   = sma_f[i] > sma_s[i] and sma_f[i-1] <= sma_s[i-1]
            cross_down = sma_f[i] < sma_s[i] and sma_f[i-1] >= sma_s[i-1]
            if not in_pos and cross_up:
                signals[i] = 1; in_pos = True
            elif in_pos and cross_down:
                signals[i] = -1; in_pos = False
        if in_pos: signals[-1] = -1

    elif strategy == "rsi":
        rsi_p    = params["rsi_period"]
        oversold = params["rsi_oversold"]
        overbought = params["rsi_overbought"]
        rsi_vals = compute_rsi_series(closes, rsi_p)
        indicators["rsi"] = [round(v, 2) if v else None for v in rsi_vals]
        in_pos = False
        for i in range(1, n):
            if rsi_vals[i] is None or rsi_vals[i-1] is None:
                continue
            if not in_pos and rsi_vals[i] <= oversold and rsi_vals[i-1] > oversold:
                signals[i] = 1; in_pos = True
            elif in_pos and rsi_vals[i] >= overbought and rsi_vals[i-1] < overbought:
                signals[i] = -1; in_pos = False
        if in_pos: signals[-1] = -1

    elif strategy == "bollinger":
        bb_p    = params["bb_period"]
        bb_std_val = params["bb_std"]
        bb_u, bb_l, bb_m = compute_bb(closes, bb_p, bb_std_val)
        indicators["bb_upper"] = [round(v, 2) if v else None for v in bb_u]
        indicators["bb_lower"] = [round(v, 2) if v else None for v in bb_l]
        indicators["bb_mid"]   = [round(v, 2) if v else None for v in bb_m]
        in_pos = False
        for i in range(bb_p, n):
            if bb_l[i] is None or bb_u[i] is None:
                continue
            if not in_pos and closes[i] < bb_l[i] and closes[i-1] >= (bb_l[i-1] or 0):
                signals[i] = 1; in_pos = True
            elif in_pos and closes[i] > bb_u[i] and closes[i-1] <= (bb_u[i-1] or 9999999):
                signals[i] = -1; in_pos = False
        if in_pos: signals[-1] = -1

    # ── Simular portfólio ──────────────────────────────────────────────────────
    initial_capital = params["initial_capital"]
    commission      = params["commission"]
    cash     = initial_capital
    shares   = 0.0
    in_pos   = False
    buy_price = 0.0
    trades   = []
    equity_curve = []
    bh_shares    = initial_capital / closes[0]  # Buy & Hold desde o dia 1

    for i, c in enumerate(candles):
        price = c["close"]
        sig   = signals[i]

        if sig == 1 and not in_pos:
            # COMPRA
            investable = cash * (1 - commission)
            shares     = investable / price
            cash       = 0.0
            in_pos     = True
            buy_price  = price
            trades.append({
                "index":      i,
                "date":       c["date"],
                "type":       "compra",
                "price":      round(price, 2),
                "shares":     round(shares, 4),
                "value":      round(shares * price, 2),
                "return_pct": None,
                "profit_loss": None,
            })

        elif sig == -1 and in_pos:
            # VENDA
            saved_shares = shares
            gross        = saved_shares * price
            net          = gross * (1 - commission)
            ret_pct      = (price / buy_price - 1) * 100
            profit       = net - initial_capital   # simplificado
            # calcula P&L real da operação
            cost_basis   = saved_shares * buy_price * (1 + commission)
            pl            = net - cost_basis
            cash          = net
            shares        = 0.0
            in_pos        = False
            trades.append({
                "index":       i,
                "date":        c["date"],
                "type":        "venda",
                "price":       round(price, 2),
                "shares":      round(saved_shares, 4),
                "value":       round(net, 2),
                "return_pct":  round(ret_pct, 2),
                "profit_loss": round(pl, 2),
            })

        # Equity atual
        curr_eq = cash + shares * price
        bh_eq   = bh_shares * price

        row_data = {
            "date":       c["date"],
            "close":      round(price, 2),
            "equity":     round(curr_eq, 2),
            "bh_equity":  round(bh_eq, 2),
            "signal":     sig,
        }
        # Adiciona indicadores ao ponto
        for k, arr in indicators.items():
            if arr[i] is not None:
                row_data[k] = arr[i]
        equity_curve.append(row_data)

    # ── Métricas ───────────────────────────────────────────────────────────────
    final_eq   = equity_curve[-1]["equity"]
    bh_final   = equity_curve[-1]["bh_equity"]
    total_ret  = (final_eq  / initial_capital - 1) * 100
    bh_ret     = (bh_final  / initial_capital - 1) * 100

    # Retorno anualizado
    years       = n / 252.0
    ann_ret     = ((final_eq / initial_capital) ** (1 / max(years, 0.01)) - 1) * 100

    # Max drawdown
    peak   = initial_capital
    max_dd = 0.0
    for e in equity_curve:
        if e["equity"] > peak: peak = e["equity"]
        dd = (peak - e["equity"]) / peak * 100
        if dd > max_dd: max_dd = dd

    # Win rate
    sells      = [t for t in trades if t["type"] == "venda"]
    wins       = [t for t in sells if (t["return_pct"] or 0) > 0]
    win_rate   = (len(wins) / len(sells) * 100) if sells else 0

    # Sharpe ratio simplificado
    daily_rets = []
    for i in range(1, len(equity_curve)):
        prev = equity_curve[i-1]["equity"]
        curr = equity_curve[i]["equity"]
        if prev > 0: daily_rets.append((curr - prev) / prev)
    if daily_rets:
        mu  = sum(daily_rets) / len(daily_rets)
        sig2 = math.sqrt(sum((r - mu)**2 for r in daily_rets) / len(daily_rets))
        sharpe = (mu / sig2 * math.sqrt(252)) if sig2 > 0 else 0.0
    else:
        sharpe = 0.0

    # Profit factor
    gross_profit = sum(t["profit_loss"] for t in sells if (t["profit_loss"] or 0) > 0)
    gross_loss   = abs(sum(t["profit_loss"] for t in sells if (t["profit_loss"] or 0) < 0))
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else float("inf")

    return {
        "ticker":       ticker,
        "strategy":     strategy,
        "period":       period,
        "params":       params,
        "equity_curve": equity_curve,
        "trades":       trades,
        "metrics": {
            "initial_capital":   round(initial_capital, 2),
            "final_equity":      round(final_eq, 2),
            "total_return":      round(total_ret, 2),
            "annualized_return": round(ann_ret, 2),
            "bh_return":         round(bh_ret, 2),
            "bh_final":          round(bh_final, 2),
            "max_drawdown":      round(max_dd, 2),
            "win_rate":          round(win_rate, 2),
            "num_trades":        len(sells),
            "sharpe_ratio":      round(sharpe, 3),
            "profit_factor":     round(min(profit_factor, 999), 2),
            "total_days":        n,
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# FÓRMULA MÁGICA DE JOEL GREENBLATT
# ══════════════════════════════════════════════════════════════════════════════

import requests

def _fetch_magic_formula(tickers_str: str) -> list:
    tickers = [t.strip().upper() for t in tickers_str.split(",") if t.strip()]
    if not (5 <= len(tickers) <= 10):
        raise ValueError("A quantidade de tickers deve ser entre 5 e 10.")
    
    token = os.getenv("BRAPI_TOKEN", "")
    data = []
    
    # Tentativa com BrAPI
    try:
        url = f"https://brapi.dev/api/quote/{','.join(tickers)}?modules=fundamentalData"
        if token:
            url += f"&token={token}"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            results = resp.json().get("results", [])
            for res in results:
                symbol = res.get("symbol", "")
                fund = res.get("fundamentalData", {}) or {}
                try:
                    pe = float(fund.get("priceEarnings", 0) or 0)
                    roe = float(fund.get("returnOnEquity", 0) or 0)
                except:
                    pe, roe = None, None
                
                if pe is not None and roe is not None:
                    data.append({"ticker": symbol, "pe": pe, "roe": roe})
    except Exception as e:
        logging.warning(f"BrAPI failed: {e}. Falling back to yfinance.")
    
    # Fallback para yfinance
    if len(data) < len(tickers):
        logging.info("Usando yfinance como fallback para Formula Mágica")
        data = []
        for t in tickers:
            ticker_sa = f"{t}.SA" if not t.endswith(".SA") else t
            try:
                stock = yf.Ticker(ticker_sa)
                info = stock.info
                pe = info.get("trailingPE") or info.get("forwardPE")
                roe = info.get("returnOnEquity")
                data.append({"ticker": t, "pe": pe, "roe": roe})
            except Exception:
                data.append({"ticker": t, "pe": None, "roe": None})
                
    valid_data = []
    for d in data:
        pe = d["pe"]
        roe = d["roe"]
        if pe is None: pe = 999999
        if roe is None: roe = -999999
        valid_data.append({"ticker": d["ticker"], "pe": pe, "roe": roe})
        
    def sort_pe(item):
        if item["pe"] <= 0: return 9999999
        return item["pe"]
        
    valid_data.sort(key=sort_pe)
    for i, item in enumerate(valid_data):
        item["rank_pe"] = i + 1

    valid_data.sort(key=lambda x: x["roe"], reverse=True)
    for i, item in enumerate(valid_data):
        item["rank_roe"] = i + 1
        
    for item in valid_data:
        item["score"] = item["rank_pe"] + item["rank_roe"]
        
    valid_data.sort(key=lambda x: x["score"])
    
    results = []
    for item in valid_data:
        results.append({
            "Nome da Ação": item["ticker"],
            "P/L": f"{item['pe']:.2f}" if item["pe"] not in (999999, 9999999) else "N/A",
            "Nota P/L": item["rank_pe"],
            "ROE (%)": f"{(item['roe']*100):.2f}%" if item["roe"] != -999999 else "N/A",
            "Nota ROE": item["rank_roe"],
            "Pontuação Final": item["score"]
        })
        
    return results

@app.get("/api/formula-magica")
@limiter.limit("10/minute")
async def get_magic_formula(request: Request, tickers: str, current_user: dict = Depends(get_current_user)):
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(executor, _fetch_magic_formula, tickers)
        return data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# COMPARAÇÃO DE AÇÕES (1V1)
# ══════════════════════════════════════════════════════════════════════════════
from openai import OpenAI

def _fetch_comparison(tickers_str: str, client_id: str) -> dict:
    tickers = [t.strip().upper() for t in tickers_str.split(",") if t.strip()]
    if len(tickers) != 2:
        raise ValueError("Exatamente 2 tickers são necessários para a comparação.")
    
    token = os.getenv("BRAPI_TOKEN", "")
    metrics_data = {}
    
    # Tentativa com BrAPI
    try:
        url = f"https://brapi.dev/api/quote/{','.join(tickers)}?modules=fundamentalData"
        if token:
            url += f"&token={token}"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            results = resp.json().get("results", [])
            for res in results:
                symbol = res.get("symbol", "")
                fund = res.get("fundamentalData", {}) or {}
                
                # Coleta e garante fallback para 0 se nulo
                metrics_data[symbol] = {
                    "P/L": float(fund.get("priceEarnings") or 0),
                    "P/VP": float(fund.get("priceToBook") or 0),
                    "ROE": float(fund.get("returnOnEquity") or 0),
                    "Margem Líquida": float(fund.get("netProfitMargin") or 0),
                    "Div/Patrimônio": float(fund.get("debtToEquity") or 0),
                    "Dividend Yield": float(fund.get("dividendYield") or 0),
                    "ROA": float(fund.get("returnOnAssets") or 0),
                    "DL/EBITDA": 0, # BrAPI limited
                    "CAGR Receita": 0,
                    "CAGR Lucro": 0,
                    "Lucro Bruto": 0,
                    "Lucro Líquido": 0,
                    "Receita Líquida": 0,
                    "Margem Bruta": 0,
                    "Margem EBITDA": 0,
                    "Patrimônio Líquido": 0,
                    "Dívida Líquida": 0,
                    "Indicador de Cobertura": 0
                }
    except Exception as e:
        logging.warning(f"BrAPI failed in comparison: {e}")
        
    # Fallback yfinance (mais rico em detalhes)
    for t in tickers:
        if t not in metrics_data or metrics_data[t].get("DL/EBITDA") == 0:
            try:
                ticker_sa = f"{t}.SA" if not t.endswith(".SA") else t
                stock = yf.Ticker(ticker_sa)
                info = stock.info
                
                # Cálculos manuais se necessário
                ebitda = float(info.get("ebitda") or 0)
                net_debt = float(info.get("netDebt") or info.get("totalDebt") or 0)
                dl_ebitda = net_debt / ebitda if ebitda > 0 else 0
                
                book_value = float(info.get("bookValue") or 0)
                shares = float(info.get("sharesOutstanding") or 0)
                equity = float(info.get("totalStockholderEquity") or (book_value * shares) or 0)
                
                metrics_data[t] = {
                    "P/L": float(info.get("trailingPE") or info.get("forwardPE") or 0),
                    "P/VP": float(info.get("priceToBook") or 0),
                    "ROE": float(info.get("returnOnEquity") or 0),
                    "ROA": float(info.get("returnOnAssets") or 0),
                    "Margem Líquida": float(info.get("profitMargins") or 0),
                    "Margem Bruta": float(info.get("grossMargins") or 0),
                    "Margem EBITDA": float(info.get("ebitdaMargins") or 0),
                    "Div/Patrimônio": float(info.get("debtToEquity", 0) / 100 if info.get("debtToEquity") else 0),
                    "DL/EBITDA": dl_ebitda,
                    "Dividend Yield": float(info.get("dividendYield") or 0) / 100,
                    "CAGR Receita": float(info.get("revenueGrowth") or 0),
                    "CAGR Lucro": float(info.get("earningsGrowth") or 0),
                    "Lucro Bruto": float(info.get("grossProfits") or 0),
                    "Lucro Líquido": float(info.get("netIncomeToCommon") or 0),
                    "Receita Líquida": float(info.get("totalRevenue") or 0),
                    "Patrimônio Líquido": equity,
                    "Dívida Líquida": net_debt
                }
            except Exception as e:
                logging.warning(f"yfinance failed for {t}: {e}")
                if t not in metrics_data:
                    metrics_data[t] = {k: 0 for k in ["P/L", "P/VP", "ROE", "ROIC", "Margem Líquida", "Div/Patrimônio", "DL/EBITDA", "Dividend Yield", "CAGR Receita", "CAGR Lucro", "Lucro Bruto", "Lucro Líquido", "Receita Líquida", "Margem Bruta", "Margem EBITDA", "Patrimônio Líquido", "Dívida Líquida", "Indicador de Cobertura"]}
                
    # Veredito IA
    client = OpenAI()
    prompt = f"""Você é um analista fundamentalista sênior especialista na bolsa de valores.
Analise as duas empresas abaixo e escolha qual é a melhor oportunidade de investimento no momento.
Empresa A ({tickers[0]}): {metrics_data[tickers[0]]}
Empresa B ({tickers[1]}): {metrics_data[tickers[1]]}

Regras:
1. Escreva um 'Veredito' de 2 a 3 parágrafos curtos.
2. Seja calmo, direto e evite jargões complexos não explicados.
3. Justifique sua escolha baseado estritamente nos números acima.
"""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini-2024-07-18",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.3
        )
        # Debita tokens reais consumidos
        tokens = response.usage.total_tokens if hasattr(response, "usage") and response.usage else 0
        if tokens > 0:
            from token_manager import consume_tokens
            consume_tokens(client_id, tokens)
            
        verdict = response.choices[0].message.content.strip()
    except Exception as e:
        verdict = f"Não foi possível gerar a análise da IA neste momento. Erro: {e}"
        
    return {
        "metrics": metrics_data,
        "verdict": verdict
    }

@app.get("/api/comparar")
@limiter.limit("15/minute")
async def compare_stocks(request: Request, tickers: str, current_user: dict = Depends(get_current_user)):
    # Valida tokens antes de comparar
    from token_manager import verify_user_tokens
    verify_user_tokens(current_user["client_id"])
    
    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(executor, _fetch_comparison, tickers, current_user["client_id"])
        return data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# PERSISTÊNCIA CENTRALIZADA NO BD: PERFIL E CHAT
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/perfil/{client_id}")
async def get_perfil(client_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["client_id"] != client_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    from notifications_db import get_user_profile
    profile = get_user_profile(client_id)
    if profile and "password_hash" in profile:
        del profile["password_hash"]
    return profile or {}


@app.post("/api/perfil/{client_id}")
@limiter.limit("20/minute")
async def save_perfil(client_id: str, request: Request, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user), _rbac=Depends(require_permission("settings"))):
    if current_user["client_id"] != client_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    data = await request.json()
    from notifications_db import save_user_profile
    save_user_profile(client_id, data)
    # Audit Log (Pilar 6 — Ciber)
    background_tasks.add_task(
        log_action, actor_id=client_id, action="UPDATE_PROFILE",
        resource_id=client_id, ip_address=get_client_ip(request), status="success",
    )
    return {"status": "ok"}


@app.get("/api/chat/conversas/{client_id}")
async def get_conversas(client_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["client_id"] != client_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    from notifications_db import get_user_conversations
    conversations = get_user_conversations(client_id)
    return {"conversations": conversations}


@app.post("/api/chat/conversa/{client_id}")
@limiter.limit("30/minute")
async def save_conversa(client_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    if current_user["client_id"] != client_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    data = await request.json()
    from notifications_db import save_conversation_full
    save_conversation_full(data, client_id)
    return {"status": "ok"}


@app.delete("/api/chat/conversa/{conv_id}")
@limiter.limit("30/minute")
async def delete_conversa_rota(conv_id: str, request: Request, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    from notifications_db import delete_conversation
    delete_conversation(conv_id)
    # Audit Log (Pilar 6 — Ciber)
    background_tasks.add_task(
        log_action, actor_id=current_user["client_id"], action="DELETE_CONVERSATION",
        resource_id=conv_id, ip_address=get_client_ip(request), status="success",
    )
    return {"status": "ok"}


# ── Admin: Audit Logs (Pilar 6 — Ciber) ──────────────────────────────────────
@app.get("/api/admin/audit-logs")
@limiter.limit("30/minute")
async def get_audit_logs_endpoint(
    request: Request,
    actor_id: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    _rbac=Depends(require_permission("*")),  # Somente admins
):
    """Consulta a trilha de auditoria. Restrito a role admin."""
    import notifications_db
    logs = notifications_db.get_audit_logs(actor_id=actor_id, action=action, limit=limit, offset=offset)
    return {"logs": logs, "total": len(logs)}


# ── Serving Frontend (Production) ──────────────────────────────────────────────
# Verifica se a pasta 'dist' (build do frontend) existe no diretório pai
dist_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")

if os.path.exists(dist_path):
    # Monta os arquivos estáticos (JS, CSS, Imagens)
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # Se não for uma rota de API, serve o index.html (para o React Router)
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        
        target_file = os.path.join(dist_path, full_path)
        if os.path.exists(target_file) and os.path.isfile(target_file):
            return FileResponse(target_file)
            
        return FileResponse(os.path.join(dist_path, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False)
