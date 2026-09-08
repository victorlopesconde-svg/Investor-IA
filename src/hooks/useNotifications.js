import { useEffect, useRef, useCallback } from 'react';

/**
 * useNotifications
 * Conecta ao SSE endpoint e chama onAlert(notification) quando chegar um alerta.
 * Reconecta automaticamente em caso de queda.
 *
 * @param {string} clientId   - UUID do cliente (localStorage)
 * @param {function} onAlert  - Callback chamado com o objeto de notificação
 */
export function useNotifications(clientId, onAlert) {
  const esRef      = useRef(null);
  const retryRef   = useRef(null);
  const onAlertRef = useRef(onAlert);

  // Mantém a referência do callback atualizada sem causar re-subscribe
  useEffect(() => { onAlertRef.current = onAlert; }, [onAlert]);

  const connect = useCallback(() => {
    if (!clientId) return;
    if (esRef.current) esRef.current.close();

    const token = localStorage.getItem('investoria_token');
    const es = new EventSource(`/api/notificacoes/stream/${clientId}?token=${token}`);

    es.addEventListener('connected', () => {
      console.log('[SSE] Canal de notificações conectado.');
    });

    es.addEventListener('alert', (e) => {
      try {
        const data = JSON.parse(e.data);
        onAlertRef.current?.(data);
      } catch (err) {
        console.warn('[SSE] Falha ao parsear alerta:', err);
      }
    });

    // Reconecta automaticamente em caso de erro
    es.onerror = () => {
      console.warn('[SSE] Conexão perdida. Reconectando em 5s…');
      es.close();
      esRef.current = null;
      clearTimeout(retryRef.current);
      retryRef.current = setTimeout(connect, 5000);
    };

    esRef.current = es;
  }, [clientId]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      clearTimeout(retryRef.current);
    };
  }, [connect]);
}

/**
 * getOrCreateClientId
 * Gera ou recupera um UUID persistido em localStorage.
 */
export function getOrCreateClientId() {
  const tokenClientId = localStorage.getItem('investoria_client_id');
  if (tokenClientId) return tokenClientId;

  const key = 'investoria-client-id';
  let id = null;
  try { id = localStorage.getItem(key); } catch {}
  if (!id) {
    id = crypto.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try { localStorage.setItem(key, id); } catch {}
  }
  return id;
}

/**
 * syncAlertsToBackend
 * Envia as regras de alerta do localStorage para o backend.
 * Chamada sempre que o usuário salva as configurações.
 */
export async function syncAlertsToBackend(clientId) {
  try {
    const token = localStorage.getItem('investoria_token');
    const alerts = JSON.parse(localStorage.getItem('investoria-alerts') || '[]');
    const res = await fetch('/api/alertas/sync', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ client_id: clientId, alerts }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log(`[Sync] ${data.synced} alerta(s) sincronizado(s).`);
    return true;
  } catch (err) {
    console.warn('[Sync] Falha ao sincronizar alertas:', err);
    return false;
  }
}
