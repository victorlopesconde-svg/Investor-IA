import logging
import re

class DataMaskingFilter(logging.Filter):
    """
    Filtro de Log (Data Security)
    Intercepta todos os logs emitidos e masca padrões sensíveis como:
    - E-mails
    - CPFs
    - Chaves de API
    """
    
    # Expressões regulares para detecção de PII / Segredos
    EMAIL_RE = re.compile(r'([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)')
    CPF_RE = re.compile(r'(\d{3}\.\d{3}\.\d{3}-\d{2})')
    API_KEY_RE = re.compile(r'(sk-[a-zA-Z0-9]{32,})')
    
    def filter(self, record):
        if not isinstance(record.msg, str):
            # Se a mensagem for preguiçosa ou um objeto complexo, converte para string
            record.msg = str(record.msg)
            
        # Máscara E-mails
        record.msg = self.EMAIL_RE.sub(r'[EMAIL REDACTED]', record.msg)
        # Máscara CPFs
        record.msg = self.CPF_RE.sub(r'[CPF REDACTED]', record.msg)
        # Máscara Chaves API
        record.msg = self.API_KEY_RE.sub(r'[API KEY REDACTED]', record.msg)
        
        return True

def setup_security_logger():
    """Adiciona o filtro de sanitização ao root logger."""
    root_logger = logging.getLogger()
    masking_filter = DataMaskingFilter()
    
    for handler in root_logger.handlers:
        handler.addFilter(masking_filter)
        
    logging.info("[Security] Data Masking Filter ativado no sistema de logs.")
