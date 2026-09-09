"""
auth.py
Módulo de Autenticação (Pilar 3 — Ciber).
JWT com RS256 (assinatura assimétrica), Access Token curto (15 min),
Refresh Token longo (7 dias) e hashing seguro de senhas com bcrypt.
"""
import jwt
import bcrypt
import os
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger(__name__)

# ── Configuração ──────────────────────────────────────────────────────────────
ALGORITHM = "RS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15        # 15 minutos (Ciber recomenda curto)
REFRESH_TOKEN_EXPIRE_DAYS = 7           # 7 dias

_private_key = None
_public_key = None


def _load_keys():
    """Carrega ou gera par de chaves RSA para RS256."""
    global _private_key, _public_key

    if _private_key is not None:
        return

    private_pem = os.getenv("RSA_PRIVATE_KEY", "")
    public_pem = os.getenv("RSA_PUBLIC_KEY", "")

    if private_pem and public_pem:
        # Carrega das variáveis de ambiente
        _private_key = serialization.load_pem_private_key(
            private_pem.encode("utf-8"),
            password=None,
            backend=default_backend(),
        )
        _public_key = serialization.load_pem_public_key(
            public_pem.encode("utf-8"),
            backend=default_backend(),
        )
        logger.info("[Auth] Chaves RSA carregadas das variáveis de ambiente.")
    else:
        # Tenta carregar de arquivos
        keys_dir = os.path.join(os.getenv("DATA_DIR", os.path.dirname(__file__)), "keys")
        priv_path = os.path.join(keys_dir, "private.pem")
        pub_path = os.path.join(keys_dir, "public.pem")

        if os.path.exists(priv_path) and os.path.exists(pub_path):
            with open(priv_path, "rb") as f:
                _private_key = serialization.load_pem_private_key(
                    f.read(), password=None, backend=default_backend(),
                )
            with open(pub_path, "rb") as f:
                _public_key = serialization.load_pem_public_key(
                    f.read(), backend=default_backend(),
                )
            logger.info("[Auth] Chaves RSA carregadas de %s", keys_dir)
        else:
            # Gera um novo par de chaves automaticamente
            logger.warning("[Auth] Nenhuma chave RSA encontrada. Gerando par de chaves...")
            generate_rsa_keys()
            logger.info("[Auth] Par de chaves RSA gerado em %s", keys_dir)


def generate_rsa_keys():
    """Gera par de chaves RSA-2048 e salva em agent/keys/."""
    global _private_key, _public_key

    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )

    _private_key = key
    _public_key = key.public_key()

    keys_dir = os.path.join(os.getenv("DATA_DIR", os.path.dirname(__file__)), "keys")
    os.makedirs(keys_dir, exist_ok=True)

    priv_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = _public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    with open(os.path.join(keys_dir, "private.pem"), "wb") as f:
        f.write(priv_pem)
    with open(os.path.join(keys_dir, "public.pem"), "wb") as f:
        f.write(pub_pem)


# ── Senhas ────────────────────────────────────────────────────────────────────

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica uma senha contra o hash bcrypt."""
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Gera hash bcrypt de uma senha."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


# ── Access Token (RS256, 15 min) ──────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Cria um JWT Access Token assinado com RS256.
    Payload contém: sub (email), client_id, role, exp, iat, jti.
    """
    _load_keys()

    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))

    to_encode.update({
        "exp": expire,
        "iat": now,
        "jti": secrets.token_hex(16),
        "type": "access",
    })

    encoded_jwt = jwt.encode(to_encode, _private_key, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[Dict]:
    """Decodifica e valida um Access Token RS256."""
    _load_keys()
    try:
        payload = jwt.decode(token, _public_key, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("[Auth] Access token expirado.")
        return None
    except jwt.PyJWTError as e:
        logger.debug("[Auth] Erro ao decodificar access token: %s", e)
        return None


# ── Refresh Token (opaco + hash no banco, 7 dias) ────────────────────────────

def create_refresh_token(client_id: str) -> tuple[str, str]:
    """
    Cria um Refresh Token opaco (random hex de 64 chars).
    Retorna (token_raw, token_id) para enviar ao client e persistir no banco.
    O hash do token é salvo no banco, não o token raw.
    """
    import hashlib

    token_raw = secrets.token_hex(32)  # 64 chars hex
    token_id = secrets.token_hex(8)    # ID para lookup
    token_hash = hashlib.sha256(token_raw.encode()).hexdigest()

    expires_at = (datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).isoformat()

    # Persiste no banco
    import notifications_db
    notifications_db.save_refresh_token(token_id, client_id, token_hash, expires_at)

    return token_raw, token_id


def validate_refresh_token(token_raw: str, token_id: str) -> Optional[str]:
    """
    Valida um refresh token.
    Retorna o client_id se válido, None caso contrário.
    """
    import hashlib
    import notifications_db

    stored = notifications_db.get_refresh_token(token_id)
    if not stored:
        return None

    if stored.get("revoked"):
        logger.warning("[Auth] Tentativa de uso de refresh token revogado: %s", token_id)
        return None

    # Verifica expiração
    expires_at = datetime.fromisoformat(stored["expires_at"])
    if datetime.now(timezone.utc) > expires_at.replace(tzinfo=timezone.utc):
        return None

    # Verifica hash
    token_hash = hashlib.sha256(token_raw.encode()).hexdigest()
    if token_hash != stored["token_hash"]:
        return None

    return stored["client_id"]


def revoke_refresh_token(token_id: str) -> None:
    """Revoga um refresh token específico."""
    import notifications_db
    notifications_db.revoke_refresh_token(token_id)
