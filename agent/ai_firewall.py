import re
from fastapi import HTTPException
import logging

class AIFirewall:
    """
    Firewall de Proteção de IA (Prompt Injection).
    Inspeciona a entrada do usuário contra padrões comuns de sequestro de LLM.
    """
    
    # Padrões comuns de Prompt Injection e Jailbreaking
    INJECTION_PATTERNS = [
        re.compile(r'(?i)ignore\s+(all\s+)?(previous\s+)?instructions'),
        re.compile(r'(?i)disregard\s+(all\s+)?(previous\s+)?instructions'),
        re.compile(r'(?i)you\s+are\s+now\s+(in\s+)?(developer\s+mode|dan|god\s+mode)'),
        re.compile(r'(?i)forget\s+(what\s+)?i\s+told\s+you'),
        re.compile(r'(?i)system\s+prompt\s+bypass'),
        re.compile(r'(?i)output\s+your\s+(api\s+key|system\s+prompt|instructions)'),
        re.compile(r'(?i)simule\s+um\s+terminal'),
        re.compile(r'(?i)ignore\s+as\s+instruções\s+anteriores'),
    ]
    
    @classmethod
    def validate_prompt(cls, message: str) -> None:
        """
        Valida o prompt. Lança HTTPException 403 se for detectada uma injeção.
        """
        if not message:
            return
            
        for pattern in cls.INJECTION_PATTERNS:
            if pattern.search(message):
                logging.warning(f"[Security] AI Firewall detectou Prompt Injection! Payload: {message[:100]}")
                raise HTTPException(
                    status_code=403, 
                    detail="Forbidden: Potential Prompt Injection Detected. A requisição foi bloqueada pelo Firewall de IA."
                )

def protect_ai_route(message: str):
    """Função utilitária para chamar a validação no escopo da rota."""
    AIFirewall.validate_prompt(message)
