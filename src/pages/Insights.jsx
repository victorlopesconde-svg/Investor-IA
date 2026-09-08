import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, Search, TrendingUp, TrendingDown, Shield, BarChart2,
  Activity, RefreshCw, Calendar, ArrowUpCircle, Users,
  Volume2, AlertTriangle, Info, Wind, Cpu, DollarSign, Minus,
  ChevronRight, Loader2, Sparkles, BookOpen,
} from 'lucide-react';
import './Insights.css';

/* ── Config por tipo de sinal ─────────────────────────────────────────────── */
const SIGNAL = {
  bullish: { label:'Alta',    color:'#10B981', glow:'rgba(16,185,129,0.18)',  bg:'rgba(16,185,129,0.10)',  Icon: TrendingUp  },
  bearish: { label:'Baixa',   color:'#EF4444', glow:'rgba(239,68,68,0.18)',   bg:'rgba(239,68,68,0.10)',   Icon: TrendingDown },
  warning: { label:'Atenção', color:'#F59E0B', glow:'rgba(245,158,11,0.18)',  bg:'rgba(245,158,11,0.10)',  Icon: AlertTriangle},
  neutral: { label:'Neutro',  color:'#60A5FA', glow:'rgba(96,165,250,0.18)',  bg:'rgba(96,165,250,0.10)',  Icon: Minus        },
};

/* ── Config por categoria ─────────────────────────────────────────────────── */
const CATEGORY = {
  technical:    { label:'Técnico',       Icon: BarChart2,  color:'#8B5CF6' },
  predictive:   { label:'Preditivo',     Icon: Cpu,        color:'#FBBF24' },
  risk:         { label:'Risco',         Icon: Shield,     color:'#EF4444' },
  fundamentals: { label:'Fundamentos',   Icon: DollarSign, color:'#10B981' },
};

/* ── Config por card id ───────────────────────────────────────────────────── */
const CARD_ICONS = {
  volume_anomaly:     Volume2,
  trend_projection:   TrendingUp,
  momentum_score:     Activity,
  volatility_regime:  Wind,
  mean_reversion:     RefreshCw,
  seasonality:        Calendar,
  breakout_potential: ArrowUpCircle,
  smart_money_flow:   Users,
  risk_score:         Shield,
  price_acceleration: Zap,
};

const HORIZON = {
  short:  { label:'Curto prazo',  color:'#FBBF24' },
  medium: { label:'Médio prazo',  color:'#60A5FA' },
  long:   { label:'Longo prazo',  color:'#10B981' },
};

/* ── Mini Sparkline SVG ───────────────────────────────────────────────────── */
function Sparkline({ data, color = '#60A5FA', height = 40, width = 100 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ins-sparkline" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Barra de confiança ───────────────────────────────────────────────────── */
function ConfidenceBar({ value, color }) {
  return (
    <div className="ins-conf-wrap">
      <span className="ins-conf-label">Confiança</span>
      <div className="ins-conf-bar">
        <div className="ins-conf-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="ins-conf-pct">{value}%</span>
    </div>
  );
}

/* ── Card de Insight ──────────────────────────────────────────────────────── */
function InsightCard({ card, index }) {
  const sig  = SIGNAL[card.signal]    || SIGNAL.neutral;
  const cat  = CATEGORY[card.category] || CATEGORY.technical;
  const hz   = HORIZON[card.horizon]  || HORIZON.medium;
  const CardIcon = CARD_ICONS[card.id] || Zap;
  const SigIcon  = sig.Icon;

  return (
    <div
      className="ins-card"
      style={{ '--card-glow': sig.glow, '--card-color': sig.color, animationDelay: `${index * 60}ms` }}
    >
      {/* Top accent line */}
      <div className="ins-card-accent" style={{ background: sig.color }} />

      {/* Header */}
      <div className="ins-card-header">
        <div className="ins-card-icon" style={{ background: sig.bg, color: sig.color }}>
          <CardIcon size={18} />
        </div>
        <div className="ins-card-meta">
          <div className="ins-cat-badge" style={{ color: cat.color }}>
            <cat.Icon size={11} />
            <span>{cat.label}</span>
          </div>
          <div className="ins-hz-badge" style={{ color: hz.color }}>{hz.label}</div>
        </div>
      </div>

      {/* Title + Signal */}
      <div className="ins-card-title-row">
        <h3 className="ins-card-title">{card.title}</h3>
        <div className="ins-signal-pill" style={{ background: sig.bg, color: sig.color }}>
          <SigIcon size={11} />
          {sig.label}
        </div>
      </div>

      {/* Value */}
      <div className="ins-card-value" style={{ color: sig.color }}>{card.value}</div>

      {/* Sparkline */}
      {card.sparkline && card.sparkline.length > 2 && (
        <div className="ins-sparkline-wrap">
          <Sparkline data={card.sparkline} color={sig.color} />
        </div>
      )}

      {/* Description */}
      <p className="ins-card-desc">{card.description}</p>

      {/* Confidence */}
      <ConfidenceBar value={card.confidence} color={sig.color} />
    </div>
  );
}

/* ── Skeleton Card ────────────────────────────────────────────────────────── */
function SkeletonCard({ i }) {
  return (
    <div className="ins-card ins-skeleton" style={{ animationDelay: `${i * 80}ms` }}>
      <div className="ins-card-accent sk-bar" />
      <div className="sk-row"><div className="sk-circle" /><div className="sk-line short" /></div>
      <div className="sk-line medium" style={{ marginTop: 16 }} />
      <div className="sk-line long" />
      <div className="sk-line long" />
      <div className="sk-line medium" />
    </div>
  );
}

/* ── Tela principal ───────────────────────────────────────────────────────── */
const FILTERS = [
  { key: 'all',          label: 'Todos' },
  { key: 'technical',    label: 'Técnico' },
  { key: 'predictive',   label: 'Preditivo' },
  { key: 'risk',         label: 'Risco' },
];

export default function Insights() {
  const [ticker, setTicker] = useState('');
  const [input,  setInput]  = useState('');
  const [data,   setData]   = useState(null);
  const [loading,setLoading]= useState(false);
  const [error,  setError]  = useState('');
  const [filter, setFilter] = useState('all');

  const search = useCallback(async (t = input) => {
    const tk = t.trim().toUpperCase();
    if (!tk) return;
    setLoading(true); setError(''); setData(null); setTicker(tk);
    try {
      const token = localStorage.getItem('investoria_token');
      const r = await fetch(`/api/insights/${tk}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!r.ok) {
        const errText = await r.text();
        let errMsg = 'Erro';
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.detail || errMsg;
        } catch {}
        throw new Error(errMsg);
      }
      const resText = await r.text();
      setData(resText ? JSON.parse(resText) : null);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, [input]);

  const visible = data?.cards.filter(c => filter === 'all' || c.category === filter) || [];

  return (
    <div className="ins-page">
      {/* Header */}
      <header className="ins-header">
        <div className="ins-header-left">
          <div className="ins-header-icon"><Sparkles size={20} /></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1>Cartões de Insights Preditivos</h1>
              <Link to="/aprender/insights" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ai-accent)', background: 'rgba(251,191,36,0.1)', padding: '4px 10px', borderRadius: '6px', textDecoration: 'none', border: '1px solid rgba(251,191,36,0.3)', transition: 'all 0.2s' }}>
                <BookOpen size={16} /> Aprender Funcionalidade
              </Link>
            </div>
            <p>Análise algorítmica em tempo real com 10 modelos quantitativos</p>
          </div>
        </div>
        {data && (
          <div className="ins-price-display">
            <span className="ins-price-label">{data.ticker}</span>
            <span className="ins-price-value">R$ {data.price.toFixed(2)}</span>
          </div>
        )}
      </header>

      {/* Search */}
      <div className="ins-search-bar">
        <div className="ins-search-inner">
          <Search size={18} className="ins-search-icon" />
          <input
            className="ins-search-input"
            placeholder="Digite o ticker (ex: PETR4, VALE3, ITUB4)…"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && search()}
          />
          <button className="ins-search-btn" onClick={() => search()} disabled={loading || !input.trim()}>
            {loading ? <Loader2 size={16} className="ins-spin" /> : <><ChevronRight size={16} />Analisar</>}
          </button>
        </div>

        {/* Quick tickers */}
        <div className="ins-quick-tickers">
          {['PETR4','VALE3','ITUB4','BBAS3','WEGE3'].map(tk => (
            <button key={tk} className="ins-quick-btn"
              onClick={() => { setInput(tk); search(tk); }}>
              {tk}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="ins-error">
          <AlertTriangle size={16} />
          <span>{error}. Verifique se o ticker está correto.</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !data && !error && (
        <div className="ins-empty">
          <div className="ins-empty-orb" />
          <Cpu size={48} className="ins-empty-icon" />
          <h2>Análise Preditiva com IA</h2>
          <p>Digite um ticker acima para gerar <strong>10 cartões preditivos</strong> com base em algoritmos quantitativos: regressão linear, OBV, Bollinger Bands, sazonalidade histórica e muito mais.</p>
          <div className="ins-empty-chips">
            {['Anomalia de Volume','Projeção 5 dias','Smart Money','Aceleração do Preço'].map(l => (
              <span key={l} className="ins-empty-chip"><Zap size={11}/>{l}</span>
            ))}
          </div>
        </div>
      )}

      {/* Cards area */}
      {(loading || data) && (
        <div className="ins-cards-area">
          {/* Filter tabs */}
          {data && (
            <div className="ins-filters">
              {FILTERS.map(f => (
                <button key={f.key}
                  className={`ins-filter-btn ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}>
                  {f.label}
                  {f.key === 'all' && <span className="ins-filter-count">{data.cards.length}</span>}
                </button>
              ))}
            </div>
          )}

          <div className="ins-grid">
            {loading
              ? Array.from({length: 6}, (_, i) => <SkeletonCard key={i} i={i} />)
              : visible.map((card, i) => <InsightCard key={card.id} card={card} index={i} />)
            }
          </div>

          {data && (
            <p className="ins-footer-note">
              <Info size={13} /> Análise gerada em {new Date(data.generated_at).toLocaleTimeString('pt-BR')} · Dados históricos via Yahoo Finance · Uso educacional apenas.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
