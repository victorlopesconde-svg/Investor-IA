import React, { useState, useEffect, useCallback } from 'react';
import { Bell, X, CheckCheck, AlertTriangle, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { useNotifications, getOrCreateClientId } from '../hooks/useNotifications';
import './NotificationBell.css';

const SEVERITY_CONFIG = {
  danger:  { icon: AlertTriangle, color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  warning: { icon: AlertTriangle, color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  info:    { icon: Info,          color: '#38BDF8', bg: 'rgba(56,189,248,0.12)' },
};

function NotifCard({ notif, onDismiss }) {
  const cfg = SEVERITY_CONFIG[notif.severity] || SEVERITY_CONFIG.info;
  const Icon = cfg.icon;
  const age  = notif.timestamp
    ? Math.round((Date.now() - new Date(notif.timestamp).getTime()) / 60000)
    : 0;

  return (
    <div className="nb-card" style={{ borderLeft: `3px solid ${cfg.color}` }}>
      <div className="nb-card-icon" style={{ background: cfg.bg, color: cfg.color }}>
        <Icon size={16} />
      </div>
      <div className="nb-card-body">
        <p className="nb-card-title">{notif.title}</p>
        <p className="nb-card-text">{notif.body}</p>
        <span className="nb-card-age">
          {age === 0 ? 'Agora mesmo' : `${age} min atrás`}
        </span>
      </div>
      {onDismiss && (
        <button className="nb-card-dismiss" onClick={() => onDismiss(notif)}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export default function NotificationBell() {
  const [clientId]       = useState(getOrCreateClientId);
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen]  = useState(false);
  const [toast, setToast]  = useState(null);

  // Carrega histórico ao montar
  useEffect(() => {
    if (!clientId) return;
    const token = localStorage.getItem('investoria_token');
    fetch(`/api/notificacoes/historico/${clientId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.notifications?.length) {
          setNotifs(data.notifications.map(n => ({ ...n, read: true })));
        }
      })
      .catch(() => {});
  }, [clientId]);

  const handleAlert = useCallback((notif) => {
    const enriched = { ...notif, read: false, id: notif.alert_id || Date.now() };
    setNotifs(prev => [enriched, ...prev].slice(0, 50));

    // Toast flutuante por 6 segundos
    setToast(enriched);
    setTimeout(() => setToast(t => t?.id === enriched.id ? null : t), 6000);
  }, []);

  useNotifications(clientId, handleAlert);

  const unread = notifs.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  };

  const dismiss = (notif) => {
    setNotifs(prev => prev.filter(n => n !== notif));
  };

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open) markAllRead();
  };

  return (
    <>
      {/* ── Sino ── */}
      <div className="nb-wrapper">
        <button className="nb-bell" onClick={handleOpen} title="Notificações">
          <Bell size={20} />
          {unread > 0 && (
            <span className="nb-badge">{unread > 9 ? '9+' : unread}</span>
          )}
        </button>

        {/* ── Painel dropdown ── */}
        {open && (
          <div className="nb-panel">
            <div className="nb-panel-header">
              <span>Notificações</span>
              {notifs.length > 0 && (
                <button className="nb-clear-btn" onClick={() => setNotifs([])}>
                  <CheckCheck size={14} /> Limpar tudo
                </button>
              )}
            </div>

            <div className="nb-panel-body">
              {notifs.length === 0 ? (
                <div className="nb-empty">
                  <Bell size={28} className="nb-empty-icon" />
                  <p>Nenhuma notificação ainda</p>
                  <span>Configure alertas em Configurações para receber avisos em tempo real.</span>
                </div>
              ) : (
                notifs.map((n, i) => (
                  <NotifCard key={`${n.id ?? i}`} notif={n} onDismiss={dismiss} />
                ))
              )}
            </div>

            <div className="nb-panel-footer">
              <button
                className="nb-test-btn"
                onClick={() => {
                  const token = localStorage.getItem('investoria_token');
                  fetch(`/api/notificacoes/testar/${clientId}`, { 
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                }}
              >
                Enviar notificação de teste
              </button>
            </div>
          </div>
        )}

        {/* Backdrop para fechar o painel */}
        {open && <div className="nb-backdrop" onClick={() => setOpen(false)} />}
      </div>

      {/* ── Toast flutuante ── */}
      {toast && (
        <div
          className={`nb-toast nb-toast-${toast.severity || 'info'}`}
          onClick={() => { setToast(null); setOpen(true); }}
        >
          <div className="nb-toast-content">
            <strong>{toast.title}</strong>
            <p>{toast.body}</p>
          </div>
          <button className="nb-toast-close" onClick={(e) => { e.stopPropagation(); setToast(null); }}>
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}
