"""
cognitive_filter.py
Filtro de Linguagem Natural — converte dados brutos de alerta em
mensagens calmas, humanas e acionáveis usando Gemini.
"""
import os
import json
import logging

import openai

logger = logging.getLogger(__name__)

_CONDITION_LABELS = {
    "price_drop":      "queda de preço",
    "price_rise":      "alta de preço",
    "volume_spike":    "volume anormalmente alto",
    "rsi_oversold":    "RSI na zona de sobrevenda",
    "rsi_overbought":  "RSI na zona de sobrecompra",
}

_FALLBACK_MESSAGES = {
    "price_drop":     ("📉 {ticker} recuou {value:.1f}%",
                       "O ativo ultrapassou seu limite de queda. Analise antes de tomar decisões."),
    "price_rise":     ("📈 {ticker} avançou {value:.1f}%",
                       "O ativo ultrapassou seu limite de alta. Pode ser um bom momento para revisar."),
    "volume_spike":   ("🔊 Volume incomum em {ticker}",
                       "O volume negociado está acima do normal. Fique atento a movimentos relevantes."),
    "rsi_oversold":   ("⚡ {ticker} em zona de sobrevenda",
                       "O RSI indica que o ativo pode estar barato. Avalie o contexto antes de agir."),
    "rsi_overbought": ("⚠️ {ticker} em zona de sobrecompra",
                       "O RSI indica que o ativo pode estar sobrevalorizado."),
}


def _build_fallback(rule: dict, quote: dict) -> dict:
    cond = rule.get("condition", "price_drop")
    tpl = _FALLBACK_MESSAGES.get(cond, ("Alerta: {ticker}", "Sua regra foi ativada."))
    return {
        "title":     tpl[0].format(ticker=rule["ticker"], value=abs(quote.get("change_pct", 0))),
        "body":      tpl[1],
        "severity":  "warning",
        "ticker":    rule["ticker"],
        "condition": cond,
        "value":     round(quote.get("change_pct", 0), 2),
        "price":     round(quote.get("price", 0), 2),
    }


def humanize_alert(rule: dict, quote: dict) -> dict:
    """
    Chama ChatGPT para gerar mensagem humanizada.
    Em caso de erro (timeout, cota, etc.) retorna mensagem padrão.
    Síncrono — deve ser chamado via loop.run_in_executor.
    """
    client_id = rule.get("client_id")
    if client_id:
        from token_manager import has_enough_tokens
        if not has_enough_tokens(client_id):
            logger.info("cognitive_filter: usuário sem tokens de IA, usando fallback.")
            return _build_fallback(rule, quote)

    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("CHATGPT_API_KEY")
    if not api_key:
        logger.warning("cognitive_filter: CHATGPT_API_KEY não configurada, usando fallback.")
        return _build_fallback(rule, quote)

    try:
        client = openai.OpenAI(api_key=api_key)

        cond_label = _CONDITION_LABELS.get(rule.get("condition", ""), rule.get("condition", ""))
        thr = rule.get("threshold", 5)
        change = quote.get("change_pct", 0)
        price  = quote.get("price", 0)
        suffix = "%" if "price" in rule.get("condition", "") else "x"

        prompt = f"""Você é o assistente de investimentos InvestorIA.
Um alerta personalizado foi ativado:
- Ativo: {rule['ticker']}
- Condição ativada: {cond_label}
- Variação atual: {change:+.2f}%
- Preço atual: R$ {price:.2f}
- Limite configurado pelo usuário: {thr}{suffix}

Escreva uma notificação push em português brasileiro.
Regras obrigatórias:
- Tom: calmo, educativo, nunca alarmista
- "title": frase curta (máx 55 chars) com emoji relevante
- "body": explicação objetiva e acionável (máx 110 chars)
- "severity": "info" | "warning" | "danger" baseado na intensidade

Responda APENAS com JSON válido no formato:
{{"title": "...", "body": "...", "severity": "..."}}"""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=200,
            response_format={"type": "json_object"}
        )
        
        # Debita tokens se o client_id estiver disponível
        if client_id and response.usage:
            from token_manager import consume_tokens
            consume_tokens(client_id, response.usage.total_tokens)
            
        result = json.loads(response.choices[0].message.content)

        return {
            "title":     result.get("title",    f"Alerta: {rule['ticker']}"),
            "body":      result.get("body",      "Sua regra de alerta foi ativada."),
            "severity":  result.get("severity",  "info"),
            "ticker":    rule["ticker"],
            "condition": rule.get("condition"),
            "value":     round(change, 2),
            "price":     round(price, 2),
        }

    except Exception as exc:
        logger.warning("cognitive_filter: ChatGPT falhou (%s) — usando fallback.", exc)
        return _build_fallback(rule, quote)
