"""
encryption.py
Módulo de Criptografia AES-256-GCM (Pilar 5 — Ciber).
Encripta/decripta campos sensíveis antes de persistir no banco.
Cada operação gera um nonce (IV) aleatório de 12 bytes, prepended ao ciphertext.
"""
import os
import base64
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import logging

logger = logging.getLogger(__name__)

_KEY: bytes | None = None


def _get_key() -> bytes:
    """Carrega a chave AES-256 da variável de ambiente (base64-encoded, 32 bytes)."""
    global _KEY
    if _KEY is not None:
        return _KEY

    key_b64 = os.getenv("ENCRYPTION_KEY")
    if not key_b64:
        raise RuntimeError(
            "[Ciber] ENCRYPTION_KEY não configurada. "
            "Gere com: python -c \"import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())\""
        )
    raw = base64.b64decode(key_b64)
    if len(raw) != 32:
        raise RuntimeError("[Ciber] ENCRYPTION_KEY deve ter exatamente 32 bytes (256 bits).")
    _KEY = raw
    return _KEY


def encrypt_field(plaintext: str) -> str:
    """
    Encripta uma string com AES-256-GCM.
    Retorna: base64( nonce_12bytes || ciphertext || tag_16bytes )
    """
    if not plaintext:
        return plaintext

    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)  # 96-bit nonce (recomendado para GCM)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    # nonce + ciphertext (que já inclui o tag de 16 bytes do GCM)
    return base64.b64encode(nonce + ciphertext).decode("utf-8")


def decrypt_field(encrypted: str) -> str:
    """
    Decripta uma string encriptada por encrypt_field().
    Aceita o formato: base64( nonce_12bytes || ciphertext || tag )
    """
    if not encrypted:
        return encrypted

    key = _get_key()
    aesgcm = AESGCM(key)
    raw = base64.b64decode(encrypted)
    nonce = raw[:12]
    ciphertext = raw[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")


def is_encrypted(value: str) -> bool:
    """Heurística simples: tenta decodificar como base64 e verifica tamanho mínimo."""
    if not value:
        return False
    try:
        raw = base64.b64decode(value)
        return len(raw) > 12  # nonce (12) + pelo menos 1 byte de dados + tag (16)
    except Exception:
        return False
