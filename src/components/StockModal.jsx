import React, { useEffect, useState } from 'react';
import {
  X, ExternalLink, TrendingUp, TrendingDown,
  BarChart3, Landmark, DollarSign, Activity,
} from 'lucide-react';
import './StockModal.css';

/* ── Configuração dos indicadores ── */
const CARDS = [
  { key: 'pl',           label: 'P/L',          desc: 'Preço / Lucro',                  group: 'valuation' },
  { key: 'pvp',          label: 'P/VP',          desc: 'Preço / Val. Patrimonial',       group: 'valuation' },
  { key: 'ev_ebitda',    label: 'EV/EBITDA',     desc: 'Enterprise Value / EBITDA',      group: 'valuation' },
  { key: 'roe',          label: 'ROE',            desc: 'Retorno sobre Patrimônio',       group: 'rentabilidade' },
  { key: 'roa',          label: 'ROA',            desc: 'Retorno sobre Ativos',           group: 'rentabilidade' },
  { key: 'margem_liquida', label: 'Margem Líq.',  desc: 'Margem Líquida',                group: 'rentabilidade' },
  { key: 'margem_bruta', label: 'Margem Bruta',   desc: 'Margem Bruta',                  group: 'rentabilidade' },
  { key: 'dividend_yield', label: 'Div. Yield',   desc: 'Dividend Yield anual',          group: 'dividendos' },
  { key: 'market_cap',   label: 'Market Cap',     desc: 'Capitalização de Mercado',      group: 'resultado' },
  { key: 'receita',      label: 'Receita',        desc: 'Receita Total anual',           group: 'resultado' },
  { key: 'lucro_liquido', label: 'Lucro Líq.',    desc: 'Lucro Líquido anual',           group: 'resultado' },
  { key: 'ebitda',       label: 'EBITDA',         desc: 'EBITDA anual',                  group: 'resultado' },
  { key: 'divida_bruta', label: 'Dívida Bruta',   desc: 'Dívida Bruta total',            group: 'divida' },
  { key: 'caixa',        label: 'Caixa',          desc: 'Caixa e equivalentes',          group: 'divida' },
  { key: 'beta',         label: 'Beta',           desc: 'Volatilidade vs. índice',       group: 'risco' },
];

const GROUP_LABEL = {
  valuation:     { label: 'Valuation',       icon: BarChart3 },
  rentabilidade: { label: 'Rentabilidade',   icon: Activity },
  dividendos:    { label: 'Dividendos',      icon: DollarSign },
  resultado:     { label: 'Resultado',       icon: Landmark },
  divida:        { label: 'Endividamento',   icon: Landmark },
  risco:         { label: 'Risco',           icon: Activity },
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function StockModal({ ticker, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setData(null);

    const token = localStorage.getItem('investoria_token');
    fetch(`/api/acao/${ticker}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => {
        if (!r.ok) throw new Error(`Dados indisponíveis para ${ticker}`);
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [ticker]);

  /* Fecha ao pressionar Esc */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const ind = data?.indicadores || {};
  const positivo = ind.variacao_positiva;

  /* ── Organiza cards por grupo ── */
  const groups = {};
  CARDS.forEach(c => {
    if (!groups[c.group]) groups[c.group] = [];
    groups[c.group].push(c);
  });

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-panel" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="sm-header">
          <div className="sm-header-left">
            <span className="sm-ticker-badge">{ticker}</span>
            {loading
              ? <div className="sm-skeleton sm-skeleton-name" />
              : <h2 className="sm-company-name">{ind.nome || ticker}</h2>
            }
            {!loading && ind.setor && ind.setor !== '—' && (
              <span className="sm-sector">{ind.setor}</span>
            )}
          </div>

          <div className="sm-header-right">
            {!loading && (
              <div className="sm-price-block">
                <span className="sm-price">{ind.preco_atual}</span>
                {ind.variacao_dia && ind.variacao_dia !== '—' && (
                  <span className={`sm-variation ${positivo ? 'positive' : 'negative'}`}>
                    {positivo ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {ind.variacao_dia}
                  </span>
                )}
              </div>
            )}
            <button className="sm-close-btn" onClick={onClose} aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Corpo ── */}
        <div className="sm-body">
          {loading && (
            <div className="sm-loading-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="sm-skeleton sm-skeleton-card" />
              ))}
            </div>
          )}

          {error && (
            <div className="sm-error">
              <span>⚠️ {error}</span>
            </div>
          )}

          {data && !loading && (
            <>
              {/* ── Grupos de indicadores ── */}
              {Object.entries(groups).map(([groupKey, cards]) => {
                const groupCfg = GROUP_LABEL[groupKey];
                const GroupIcon = groupCfg?.icon || BarChart3;
                return (
                  <div key={groupKey} className="sm-group">
                    <div className="sm-group-title">
                      <GroupIcon size={13} />
                      <span>{groupCfg?.label || groupKey}</span>
                    </div>
                    <div className="sm-cards-grid">
                      {cards.map(c => (
                        <div key={c.key} className={`sm-card sm-card-${groupKey}`}>
                          <span className="sm-card-label">{c.label}</span>
                          <span className="sm-card-value">{ind[c.key] || '—'}</span>
                          <span className="sm-card-desc">{c.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* ── Fatos Relevantes ── */}
              <div className="sm-group">
                <div className="sm-group-title">
                  <Activity size={13} />
                  <span>Últimas Notícias</span>
                </div>

                {(data.fatos_relevantes || []).length === 0 ? (
                  <p className="sm-no-news">Nenhuma notícia disponível no momento.</p>
                ) : (
                  <div className="sm-news-list">
                    {data.fatos_relevantes.map((f, i) => (
                      <a
                        key={i}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sm-news-card"
                      >
                        <div className="sm-news-meta">
                          <span className="sm-news-fonte">{f.fonte}</span>
                          <span className="sm-news-data">{formatDate(f.data)}</span>
                        </div>
                        <p className="sm-news-titulo">{f.titulo}</p>
                        <ExternalLink size={12} className="sm-news-icon" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
