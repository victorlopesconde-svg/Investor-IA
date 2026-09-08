"""
scheduler.py
APScheduler AsyncIOScheduler — dispara check_all_alerts() a cada 15 minutos.
Integrado ao lifespan do FastAPI em api.py.
"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


def create_scheduler() -> AsyncIOScheduler:
    """Cria e configura o scheduler. Não inicia ainda."""
    from monitor_agent import check_all_alerts

    scheduler = AsyncIOScheduler(timezone="America/Sao_Paulo")

    # Executa a cada 15 minutos durante o horário de mercado (9h-18h, seg-sex)
    scheduler.add_job(
        check_all_alerts,
        trigger=CronTrigger(
            day_of_week="mon-fri",
            hour="9-18",
            minute="*/15",
            timezone="America/Sao_Paulo",
        ),
        id="market_monitor",
        name="Monitor de Alertas (horário de mercado)",
        replace_existing=True,
        misfire_grace_time=120,   # tolera até 2 min de atraso
    )

    # Job adicional: verifica ao final do pregão (17h55) para avisos de fechamento
    scheduler.add_job(
        check_all_alerts,
        trigger=CronTrigger(
            day_of_week="mon-fri",
            hour=17,
            minute=55,
            timezone="America/Sao_Paulo",
        ),
        id="market_close_check",
        name="Monitor — Fechamento do pregão",
        replace_existing=True,
    )

    logger.info("[Scheduler] Jobs configurados: %s",
                [j.name for j in scheduler.get_jobs()])
    return scheduler
