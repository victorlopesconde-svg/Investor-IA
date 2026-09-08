import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Settings, Sun, Moon, Bell, BellOff, User, Shield, Plus, Trash2,
  Camera, Save, Eye, EyeOff, ChevronRight, AlertTriangle, TrendingDown,
  TrendingUp, Activity, CheckCircle2,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { syncAlertsToBackend, getOrCreateClientId } from '../hooks/useNotifications';
import './Settings.css';

/* ── Toggle Switch ──────────────────────────────────────────────── */
const Toggle = ({ checked, onChange, color = 'var(--ai-accent)' }) => (
  <button
    role="switch"
    aria-checked={checked}
    className={`cfg-toggle ${checked ? 'on' : ''}`}
    style={checked ? { background: color } : {}}
    onClick={() => onChange(!checked)}
  />
);

/* ── Section wrapper ─────────────────────────────────────────────── */
const Section = ({ id, icon: Icon, title, desc, children }) => (
  <section className="cfg-section" id={id}>
    <div className="cfg-section-header">
      <div className="cfg-section-icon"><Icon size={18} /></div>
      <div>
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
    </div>
    <div className="cfg-section-body">{children}</div>
  </section>
);

/* ── Condition labels ────────────────────────────────────────────── */
const CONDITIONS = [
  { value: 'price_drop', label: 'Preço cair', icon: TrendingDown, color: '#EF4444' },
  { value: 'price_rise', label: 'Preço subir', icon: TrendingUp, color: '#10B981' },
  { value: 'rsi_oversold', label: 'RSI sobrevendido', icon: Activity, color: '#8B5CF6' },
  { value: 'rsi_overbought', label: 'RSI sobrecomprado', icon: Activity, color: '#EF4444' },
  { value: 'volume_spike', label: 'Volume disparar', icon: Activity, color: '#FBBF24' },
];

/* ── Load / save helpers ─────────────────────────────────────────── */
const load = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } };
const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch { } };

/* ══════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();

  const [clientId] = useState(getOrCreateClientId);

  /* ── Notificações ── */
  const [notif, setNotif] = useState(() => load('investoria-notif', {
    orders: true,
    portfolio: true,
    news: false,
    ai_alerts: true,
    email_digest: false,
  }));

  /* ── Perfil ── */
  const [profile, setProfile] = useState(() => load('investoria-profile', {
    name: 'Victor', email: 'victor@email.com', role: 'free', photo: null,
  }));

  /* Carrega do backend centralizado na inicialização */
  useEffect(() => {
    const token = localStorage.getItem('investoria_token');
    fetch(`/api/perfil/${clientId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.text();
      })
      .then(text => text ? JSON.parse(text) : {})
      .then(data => {
        if (data && data.name) {
          setProfile(prev => ({ 
            ...prev, 
            name: data.name, 
            email: data.email || prev.email, 
            photo: data.photo_url || data.photo || prev.photo,
            role: data.role || prev.role 
          }));
        }
        if (data && data.settings) {
          setNotif(prev => ({ ...prev, ...data.settings }));
        }
      })
      .catch(() => {});
  }, [clientId]);

  const syncProfileToBackend = useCallback((prof, cfg) => {
    const token = localStorage.getItem('investoria_token');
    fetch(`/api/perfil/${clientId}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ ...prof, settings: cfg }),
    }).catch(() => {});
  }, [clientId]);

  const setNotifKey = (k, v) => {
    const next = { ...notif, [k]: v };
    setNotif(next); save('investoria-notif', next);
    syncProfileToBackend(profile, next);
  };

  /* ── Alertas dinâmicos ── */
  const [alerts, setAlerts] = useState(() => load('investoria-alerts', []));
  const [newAlert, setNewAlert] = useState({ ticker: '', condition: 'price_drop', threshold: '' });
  const [alertSaved, setAlertSaved] = useState(false);

  const addAlert = () => {
    if (!newAlert.ticker.trim() || !newAlert.threshold) return;
    const rule = { ...newAlert, id: Date.now(), ticker: newAlert.ticker.toUpperCase().trim(), active: true };
    const next = [...alerts, rule];
    setAlerts(next); save('investoria-alerts', next);
    syncAlertsToBackend(clientId);
    setNewAlert({ ticker: '', condition: 'price_drop', threshold: '' });
    setAlertSaved(true);
    setTimeout(() => setAlertSaved(false), 2000);
  };

  const removeAlert = (id) => {
    const next = alerts.filter(a => a.id !== id);
    setAlerts(next); save('investoria-alerts', next);
    syncAlertsToBackend(clientId);
  };

  const toggleAlert = (id) => {
    const next = alerts.map(a => a.id === id ? { ...a, active: !a.active } : a);
    setAlerts(next); save('investoria-alerts', next);
    syncAlertsToBackend(clientId);
  };

  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const fileRef = useRef();

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    const token = localStorage.getItem('investoria_token');
    try {
      const res = await fetch('/api/user/cancel-subscription', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setProfile(prev => {
          const next = { ...prev, role: 'viewer' };
          save('investoria-profile', next);
          return next;
        });
        alert('Sua assinatura foi cancelada com sucesso. Seu plano agora é Viewer.');
      } else {
        const errText = await res.text();
        let errDetail = 'Ocorreu um erro';
        try {
          const errJson = JSON.parse(errText);
          errDetail = errJson.detail || errDetail;
        } catch {}
        alert(`Erro ao cancelar assinatura: ${errDetail}`);
      }
    } catch (e) {
      alert('Erro de conexão ao tentar cancelar a assinatura.');
    } finally {
      setIsCancelling(false);
      setShowCancelConfirm(false);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 400; // Tamanho ideal para carregar rápido e ficar super nítido em telas 4K/Retina
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Ativa suavização de alta qualidade no redimensionamento
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(img, 0, 0, width, height);

        // Converte para Base64 com JPEG de altíssima qualidade (0.95)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.95);
        
        const next = { ...profile, photo: compressedBase64 };
        setProfile(next);
        save('investoria-profile', next);
        syncProfileToBackend(next, notif);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = () => {
    save('investoria-profile', profile);
    syncProfileToBackend(profile, notif);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  const condLabel = (c) => CONDITIONS.find(x => x.value === c)?.label || c;
  const condColor = (c) => CONDITIONS.find(x => x.value === c)?.color || '#FBBF24';
  const condSuffix = (c) => ['price_drop', 'price_rise'].includes(c) ? '%' : c === 'volume_spike' ? 'x' : '';

  const notifItems = [
    { key: 'orders', label: 'Execução de ordens', desc: 'Quando uma compra ou venda for executada', color: '#10B981' },
    { key: 'portfolio', label: 'Atualização do portfólio', desc: 'Variações relevantes no valor total', color: '#FBBF24' },
    { key: 'news', label: 'Resumo diário de notícias', desc: 'Digest matinal com as principais notícias', color: '#38BDF8' },
    { key: 'ai_alerts', label: 'Alertas da IA', desc: 'Anomalias e padrões detectados pelo agente', color: '#8B5CF6' },
    { key: 'email_digest', label: 'Digest semanal por e-mail', desc: 'Resumo semanal enviado para seu e-mail', color: '#F97316' },
  ];

  return (
    <div className="cfg-page">
      {/* ── Header ── */}
      <header className="cfg-header">
        <Settings size={22} className="cfg-header-icon" />
        <div>
          <h1>Configurações</h1>
          <p>Personalize sua experiência no InvestorIA</p>
        </div>
      </header>

      <div className="cfg-layout">
        {/* ── Índice lateral ── */}
        <nav className="cfg-nav">
          {[
            { href: '#aparencia', label: 'Aparência' },
            { href: '#alertas', label: 'Alertas Dinâmicos' },
            { href: '#perfil', label: 'Perfil' },
          ].map(({ href, label }) => (
            <a key={href} href={href} className="cfg-nav-link">
              <ChevronRight size={14} />
              {label}
            </a>
          ))}
        </nav>

        {/* ── Conteúdo ── */}
        <div className="cfg-content">

          {/* ══ 1. APARÊNCIA ══ */}
          <Section id="aparencia" icon={theme === 'dark' ? Moon : Sun}
            title="Aparência" desc="Escolha entre o modo escuro e o modo claro">
            <div className="cfg-theme-toggle">
              {/* Card Escuro */}
              <button
                className={`cfg-theme-card ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => theme !== 'dark' && toggleTheme()}
              >
                <div className="cfg-theme-preview dark-preview">
                  <div className="tp-sidebar" />
                  <div className="tp-content">
                    <div className="tp-bar" />
                    <div className="tp-bar short" />
                    <div className="tp-card" />
                  </div>
                </div>
                <div className="cfg-theme-label">
                  <Moon size={15} />
                  <span>Modo Escuro</span>
                  {theme === 'dark' && <span className="cfg-active-badge">Ativo</span>}
                </div>
                <p className="cfg-theme-desc">Reduz o cansaço visual e economiza bateria em telas OLED.</p>
              </button>

              {/* Card Claro */}
              <button
                className={`cfg-theme-card ${theme === 'light' ? 'active' : ''}`}
                onClick={() => theme !== 'light' && toggleTheme()}
              >
                <div className="cfg-theme-preview light-preview">
                  <div className="tp-sidebar" />
                  <div className="tp-content">
                    <div className="tp-bar" />
                    <div className="tp-bar short" />
                    <div className="tp-card" />
                  </div>
                </div>
                <div className="cfg-theme-label">
                  <Sun size={15} />
                  <span>Modo Claro</span>
                  {theme === 'light' && <span className="cfg-active-badge">Ativo</span>}
                </div>
                <p className="cfg-theme-desc">Ideal para ambientes com muita luz natural.</p>
              </button>
            </div>
          </Section>



          {/* ══ 3. ALERTAS DINÂMICOS ══ */}
          <Section id="alertas" icon={AlertTriangle}
            title="Alertas Dinâmicos"
            desc="Crie regras personalizadas e seja avisado quando elas forem atingidas">

            {/* Formulário */}
            <div className="cfg-alert-form">
              <div className="cfg-alert-row">
                <div className="cfg-field">
                  <label>Ticker</label>
                  <input
                    className="cfg-input"
                    placeholder="Ex: PETR4"
                    maxLength={10}
                    value={newAlert.ticker}
                    onChange={e => setNewAlert(p => ({ ...p, ticker: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="cfg-field">
                  <label>Condição</label>
                  <select className="cfg-select"
                    value={newAlert.condition}
                    onChange={e => setNewAlert(p => ({ ...p, condition: e.target.value }))}>
                    {CONDITIONS.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="cfg-field">
                  <label>Limite {condSuffix(newAlert.condition) && `(${condSuffix(newAlert.condition)})`}</label>
                  <input
                    className="cfg-input"
                    type="number"
                    min={0}
                    step={0.1}
                    placeholder="Ex: 5"
                    value={newAlert.threshold}
                    onChange={e => setNewAlert(p => ({ ...p, threshold: e.target.value }))}
                  />
                </div>
                <button className="cfg-add-btn" onClick={addAlert}
                  disabled={!newAlert.ticker.trim() || !newAlert.threshold}>
                  <Plus size={16} /> Adicionar
                </button>
              </div>
              {alertSaved && (
                <div className="cfg-success-msg">
                  <CheckCircle2 size={15} /> Alerta criado com sucesso!
                </div>
              )}
            </div>

            {/* Lista de alertas */}
            {alerts.length === 0 ? (
              <p className="cfg-empty-msg">Nenhum alerta configurado. Crie o primeiro acima.</p>
            ) : (
              <div className="cfg-alert-list">
                {alerts.map(alert => {
                  const cond = CONDITIONS.find(c => c.value === alert.condition);
                  const Icon = cond?.icon || Activity;
                  return (
                    <div key={alert.id} className={`cfg-alert-item ${alert.active ? '' : 'paused'}`}>
                      <div className="cfg-alert-icon" style={{ background: `${cond?.color}20`, color: cond?.color }}>
                        <Icon size={16} />
                      </div>
                      <div className="cfg-alert-info">
                        <strong>{alert.ticker}</strong>
                        <span>
                          {condLabel(alert.condition)} mais de <em>{alert.threshold}{condSuffix(alert.condition)}</em>
                        </span>
                      </div>
                      <div className="cfg-alert-actions">
                        <Toggle checked={alert.active} onChange={() => toggleAlert(alert.id)} color={cond?.color} />
                        <button className="cfg-delete-btn" onClick={() => removeAlert(alert.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ══ 4. PERFIL ══ */}
          <Section id="perfil" icon={User}
            title="Perfil" desc="Suas informações pessoais e credenciais">

            {/* Foto + nome */}
            <div className="cfg-profile-top">
              <div className="cfg-avatar-wrap" onClick={() => fileRef.current?.click()}>
                {profile.photo
                  ? <img src={profile.photo} alt="Avatar" className="cfg-avatar-img" />
                  : <div className="cfg-avatar-placeholder">
                    {(profile.name || 'U')[0].toUpperCase()}
                  </div>
                }
                <div className="cfg-avatar-overlay"><Camera size={18} /></div>
              </div>
              <input ref={fileRef} type="file" accept="image/*"
                style={{ display: 'none' }} onChange={handlePhotoChange} />
              <div>
                <p className="cfg-avatar-hint">Clique na foto para alterar</p>
                <span className="cfg-role-badge">
                  {profile.role?.toLowerCase() === 'viewer' ? 'Acesso Suspenso (Viewer)' : 
                   profile.role?.toLowerCase() === 'elite' ? 'Plano Elite' : 
                   (profile.role?.toLowerCase() === 'pro' || profile.role?.toLowerCase() === 'plano pro') ? 'Plano Pro' : 
                   profile.role?.toLowerCase() === 'free' ? 'Plano Gratuito' : 
                   (profile.role?.startsWith('Plano') ? profile.role : `Plano ${profile.role || 'Gratuito'}`)}
                </span>
              </div>
            </div>

            {/* Campos */}
            <div className="cfg-profile-fields">
              <div className="cfg-field">
                <label>Nome de exibição</label>
                <input className="cfg-input" value={profile.name}
                  onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="cfg-field">
                <label>E-mail</label>
                <input className="cfg-input" type="email" value={profile.email}
                  onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>

            {/* Alterar senha */}
            <div className="cfg-subsection">
              <div className="cfg-subsection-header">
                <Shield size={15} />
                <h3>Alterar senha</h3>
              </div>
              <div className="cfg-profile-fields">
                <div className="cfg-field">
                  <label>Senha atual</label>
                  <div className="cfg-input-wrap">
                    <input className="cfg-input" type={showPw ? 'text' : 'password'}
                      placeholder="••••••••" value={password.current}
                      onChange={e => setPassword(p => ({ ...p, current: e.target.value }))} />
                    <button className="cfg-pw-eye" onClick={() => setShowPw(s => !s)}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="cfg-field">
                  <label>Nova senha</label>
                  <input className="cfg-input" type={showPw ? 'text' : 'password'}
                    placeholder="••••••••" value={password.next}
                    onChange={e => setPassword(p => ({ ...p, next: e.target.value }))} />
                </div>
                <div className="cfg-field">
                  <label>Confirmar nova senha</label>
                  <input className="cfg-input"
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password.confirm}
                    onChange={e => setPassword(p => ({ ...p, confirm: e.target.value }))}
                    style={password.confirm && password.next !== password.confirm
                      ? { borderColor: '#EF4444' } : {}}
                  />
                  {password.confirm && password.next !== password.confirm && (
                    <span className="cfg-field-error">As senhas não coincidem</span>
                  )}
                </div>
              </div>
            </div>

            {/* Cancelar Assinatura */}
            {profile.role?.toLowerCase() !== 'viewer' && (
              <div className="cfg-subsection border-t border-white/5 pt-6 mt-6">
                <div className="cfg-subsection-header text-red-500">
                  <AlertTriangle size={15} className="text-red-500" />
                  <h3 className="text-red-500">Assinatura</h3>
                </div>
                <p className="text-xs text-zinc-500 mb-4">
                  Se você cancelar sua assinatura, seu plano passará para Viewer e você perderá acesso ao assistente de IA.
                </p>
                
                {!showCancelConfirm ? (
                  <button 
                    className="cfg-cancel-sub-btn" 
                    onClick={() => setShowCancelConfirm(true)}
                  >
                    Cancelar Assinatura
                  </button>
                ) : (
                  <div className="cfg-cancel-confirm-box">
                    <p className="text-sm text-zinc-300 font-semibold mb-3">
                      Tem certeza que deseja cancelar a assinatura do InvestorIA?
                    </p>
                    <div className="cfg-cancel-actions">
                      <button className="cfg-cancel-yes" onClick={handleCancelSubscription} disabled={isCancelling}>
                        {isCancelling ? 'Cancelando...' : 'Sim, cancelar'}
                      </button>
                      <button className="cfg-cancel-no" onClick={() => setShowCancelConfirm(false)} disabled={isCancelling}>
                        Não, voltar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Salvar */}
            <div className="cfg-save-row">
              {profileSaved && (
                <span className="cfg-success-msg">
                  <CheckCircle2 size={15} /> Perfil salvo com sucesso!
                </span>
              )}
              <button className="cfg-save-btn" onClick={saveProfile}>
                <Save size={16} /> Salvar alterações
              </button>
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
