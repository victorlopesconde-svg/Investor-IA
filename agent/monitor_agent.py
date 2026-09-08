"""
monitor_agent.py
Agente Monitor — executado pelo scheduler a cada 15 minutos.
Fluxo: lê alertas → verifica cotações (yfinance) → avalia regras
       → filtro cognitivo (Gemini) → despacha SSE.
"""
import asyncio
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

import yfinance as yf

from notifications_db import (
    get_all_active_alerts,
    is_on_cooldown,
    set_cooldown,
    save_notification,
)
from cognitive_filter import humanize_alert
from notification_state import dispatch_notification

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=3)


# ── Helpers de cotação ──────────────────────────────────────────────────────────

def _fetch_quote(ticker: str) -> dict | None:
    """
    Busca cotação atual via yfinance.
    Tenta TICKER.SA primeiro; fallback para TICKER.
    Retorna None em caso de falha.
    """
    for candidate in [f"{ticker}.SA", ticker]:
        try:
            info = yf.Ticker(candidate).fast_info
            price = getattr(info, "last_price", None)
            if not price:
                continue
            prev_close = getattr(info, "previous_close", price)
            change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0
            volume     = getattr(info, "three_month_average_volume", 0) or 1
            day_volume = getattr(info, "last_volume", 0) or 0
            return {
                "ticker":     ticker,
                "price":      float(price),
                "change_pct": float(change_pct),
                "volume":     int(day_volume),
                "avg_volume": int(volume),
            }
        except Exception as exc:
            logger.debug("_fetch_quote(%s): %s", candidate, exc)
    return None


# ── Avaliador de regras ─────────────────────────────────────────────────────────

def _evaluate_rule(rule: dict, quote: dict) -> bool:
    cond = rule.get("condition", "")
    thr  = float(rule.get("threshold", 5))
    change = quote.get("change_pct", 0)

    if cond == "price_drop":
        return change <= -thr
    if cond == "price_rise":
        return change >= thr
    if cond == "volume_spike":
        avg = quote.get("avg_volume") or 1
        return (quote.get("volume", 0) / avg) >= thr
    # RSI: seria calculado via endpoint de Análise Técnica; ignorado aqui por ora
    return False


# ── Job principal ───────────────────────────────────────────────────────────────

async def check_all_alerts() -> int:
    """
    Verificação completa de todos os alertas ativos.
    Retorna o número de notificações enviadas.
    """
    logger.info("[Monitor] Iniciando verificação de alertas — %s", datetime.utcnow().isoformat())

    alerts = get_all_active_alerts()
    if not alerts:
        logger.info("[Monitor] Nenhum alerta ativo. Encerrando.")
        return 0

    # Agrupa por ticker para minimizar chamadas à API
    tickers_needed = list({a["ticker"] for a in alerts})
    quotes: dict[str, dict] = {}

    loop = asyncio.get_event_loop()
    for ticker in tickers_needed:
        quote = await loop.run_in_executor(_executor, _fetch_quote, ticker)
        if quote:
            quotes[ticker] = quote
        else:
            logger.warning("[Monitor] Não foi possível obter cotação de %s", ticker)

    dispatched = 0
    for rule in alerts:
        ticker    = rule["ticker"]
        alert_id  = rule["id"]
        client_id = rule["client_id"]

        quote = quotes.get(ticker)
        if not quote:
            continue

        if not _evaluate_rule(rule, quote):
            continue

        if is_on_cooldown(alert_id):
            logger.info("[Monitor] Alerta %s em cooldown — ignorando.", alert_id)
            continue

        logger.info("[Monitor] ⚡ Regra disparada: %s / %s", client_id, ticker)

        # Filtro cognitivo (bloqueante — roda no executor)
        notification = await loop.run_in_executor(
            _executor, humanize_alert, rule, quote
        )
        notification["client_id"] = client_id
        notification["alert_id"]  = alert_id
        notification["timestamp"] = datetime.utcnow().isoformat()

        # Persiste no histórico
        save_notification(notification)

        # Atualiza cooldown ANTES de despachar (evita duplicatas em falha)
        set_cooldown(alert_id)

        # Envia via SSE
        await dispatch_notification(client_id, notification)
        dispatched += 1

    logger.info("[Monitor] Verificação concluída — %d notificação(ões) enviada(s).", dispatched)
    return dispatched
