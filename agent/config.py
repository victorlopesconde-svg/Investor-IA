import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr, ValidationError
import logging

class Settings(BaseSettings):
    """
    Validador de Variáveis de Ambiente (Cloud Security).
    Garante que a aplicação não inicie se estiver faltando configurações críticas,
    falhando de forma segura (Fail-Safe) em vez de expor erros em tempo de execução.
    """
    openai_api_key: SecretStr | None = None
    chatgpt_api_key: SecretStr | None = None
    groq_api_key: SecretStr | None = None
    
    # Podemos adicionar outras variáveis, como chaves de banco de dados, URIs, etc.
    
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

def validate_environment():
    """Valida o ambiente e sincroniza chaves legadas se necessário."""
    try:
        settings = Settings()
        
        # Mapeamento de CHATGPT_API_KEY → OPENAI_API_KEY
        if not os.getenv("OPENAI_API_KEY") and os.getenv("CHATGPT_API_KEY"):
            os.environ["OPENAI_API_KEY"] = os.getenv("CHATGPT_API_KEY")
            logging.info("[Security] Chave CHATGPT_API_KEY mapeada com sucesso para o ambiente.")
            
        if not os.getenv("OPENAI_API_KEY"):
            logging.warning("[Security] Nenhuma chave da OpenAI detectada. Algumas funcionalidades de IA falharão.")

        # ── Ciber: Validação de variáveis de segurança ────────────────────
        if not os.getenv("ENCRYPTION_KEY"):
            logging.warning("[Ciber] ENCRYPTION_KEY não configurada. Criptografia AES-256 desabilitada (graceful degradation).")
        
        if not os.getenv("GOOGLE_CLIENT_ID"):
            logging.info("[Ciber] GOOGLE_CLIENT_ID não configurado. Login via Google SSO desabilitado.")
        
        logging.info("[Ciber] Chaves RSA serão auto-geradas em agent/keys/ se não encontradas.")

        return settings
    except ValidationError as e:
        logging.critical(f"[Security] Erro crítico na validação do ambiente (Segredos Vazados/Faltantes): {e}")
        raise RuntimeError("Falha de Validação de Nuvem: O arquivo .env está corrompido ou incompleto.")
