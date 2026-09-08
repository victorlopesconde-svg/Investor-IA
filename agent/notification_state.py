"""
notification_state.py
Módulo de estado compartilhado entre api.py e monitor_agent.py.
Mantém as filas SSE por client_id.
"""
import asyncio
from typing import Dict

# Mapa  client_id → asyncio.Queue
notification_queues: Dict[str, asyncio.Queue] = {}


def get_queue(client_id: str) -> asyncio.Queue:
    if client_id not in notification_queues:
        notification_queues[client_id] = asyncio.Queue(maxsize=100)
    return notification_queues[client_id]


async def dispatch_notification(client_id: str, notification: dict) -> None:
    """Coloca a notificação na fila do client. Chamado pelo monitor."""
    q = get_queue(client_id)
    try:
        q.put_nowait(notification)
    except asyncio.QueueFull:
        # Descarta a mais antiga e insere a nova
        try:
            q.get_nowait()
        except asyncio.QueueEmpty:
            pass
        q.put_nowait(notification)
