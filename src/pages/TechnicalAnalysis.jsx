import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { Search, TrendingUp, TrendingDown, Minus, Activity,
         BarChart2, Layers, AlertCircle, Loader2, ChevronDown, BookOpen } from 'lucide-react';
import './TechnicalAnalysis.css';

/* ── Candle Bar personalizado (desenhado em SVG) ─────────────────────── */
const CandleBar = (props) => {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;
  const { open, close, high, low } = payload;
  if (open == null || close == null) return null;

  const isUp    = close >= open;
  const color   = isUp ? '#10B981' : '#EF4444';
  const bodyTop = Math.min(open, close);
  const bodyH   = Math.max(Math.abs(close - open), 0.5);

  // We need the chart's y-scale, passed via recharts internal props
  const { yAxis } = props;
  if (!yAxis || !yAxis.scale) return null;
  const scale = yAxis.scale;

  const candleX    = x + width / 2;
  const bodyTopPx  = scale(Math.max(open, close));
  const bodyBotPx  = scale(Math.min(open, close));
  const highPx     = scale(high);
  const lowPx      = scale(low);
  const bodyWidth  = Math.max(width * 0.7, 3);

  return (
    <g>
      {/* Pavio superior */}
      <line x1={candleX} x2={candleX} y1={highPx} y2={bodyTopPx}
            stroke={color} strokeWidth={1.5} />
      {/* Corpo */}
      <rect
        x={candleX - bodyWidth / 2}
        y={bodyTopPx}
        width={bodyWidth}
        height={Math.max(bodyBotPx - bodyTopPx, 1)}
        fill={color}
        stroke={color}
        strokeWidth={0.5}
        opacity={0.9}
      />
      {/* Pavio inferior */}
      <line x1={candleX} x2={candleX} y1={bodyBotPx} y2={lowPx}
            stroke={color} strokeWidth={1.5} />
    </g>
  );
};

/* ── Tooltip personalizado ───────────────────────────────────────────── */
const CandleTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const isUp = d.close >= d.open;
  return (
    <div className="ta-tooltip">
      <p className="ta-tooltip-date">{d.date}</p>
      <div className="ta-tooltip-grid">
        <span>Abertura</span><span>R$ {d.open?.toFixed(2)}</span>
        <span>Máxima</span> <span className="profit">R$ {d.high?.toFixed(2)}</span>
        <span>Mínima</span> <span className="loss">R$ {d.low?.toFixed(2)}</span>
        <span>Fechamento</span>
        <span style={{ color: isUp ? '#10B981' : '#EF4444', fontWeight: 700 }}>
          R$ {d.close?.toFixed(2)}
        </span>
        <span>Volume</span><span>{(d.volume / 1e6).toFixed(1)}M</span>
        {d.rsi != null && <><span>RSI</span><span>{d.rsi?.toFixed(1)}</span></>}
        {d.sma20 != null && <><span>MM20</span><span>R$ {d.sma20?.toFixed(2)}</span></>}
      </div>
    </div>
  );
};

/* ── Painel de um padrão de candle ──────────────────────────────────── */
const PatternBadge = ({ p }) => {
  const color = p.type === 'alta' ? 'profit' : p.type === 'baixa' ? 'loss' : 'neutral';
  const icon  = p.type === 'alta' ? '▲' : p.type === 'baixa' ? '▼' : '◆';
  return (
    <div className={`ta-pattern-badge ${color}`}>
      <div className="ta-pattern-header">
        <span className="ta-pattern-icon">{icon}</span>
        <strong>{p.pattern}</strong>
        <span className="ta-pattern-date">{p.date}</span>
      </div>
      <p className="ta-pattern-desc">{p.desc}</p>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════ */
export default function TechnicalAnalysis() {
  const [ticker, setTicker]   = useState('');
  const [period, setPeriod]   = useState('3mo');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [overlay, setOverlay] = useState({ sma20: true, sma50: true, bb: true, trend: true });
  const [activeTab, setActiveTab] = useState('price'); // 'price' | 'rsi' | 'macd'

  const toggleOverlay = (k) => setOverlay(prev => ({ ...prev, [k]: !prev[k] }));

  const handleSearch = useCallback(async (e) => {
    e?.preventDefault();
    if (!ticker.trim()) return;
    setLoading(true);
    setError('');
    setData(null);

    try {
      let res;
      try {
        const token = localStorage.getItem('investoria_token');
        res = await fetch(
          `/api/analise-tecnica/${ticker.trim().toUpperCase()}?period=${period}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );
      } catch {
        throw new Error(
          'Não foi possível conectar ao servidor. Verifique se o backend está rodando em localhost:8000.'
        );
      }

      // Tenta extrair o corpo como texto primeiro, depois tenta parsear como JSON
      const bodyText = await res.text().catch(() => '');

      if (!res.ok) {
        let detail = `Erro ${res.status}`;
        if (bodyText) {
          try {
            const errJson = JSON.parse(bodyText);
            detail = errJson.detail || errJson.message || detail;
          } catch {
            detail = bodyText.slice(0, 200) || detail;
          }
        }
        throw new Error(detail);
      }

      if (!bodyText) {
        throw new Error('O servidor retornou uma resposta vazia. Tente novamente.');
      }

      let json;
      try {
        json = JSON.parse(bodyText);
      } catch {
        throw new Error('Resposta inválida do servidor (não é JSON). Tente novamente.');
      }

      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ticker, period]);


  const handleKey = (e) => { if (e.key === 'Enter') handleSearch(); };

  /* ── Helpers de display ── */
  const priceMin = data ? Math.min(...data.candles.map(c => c.low))   * 0.995 : 0;
  const priceMax = data ? Math.max(...data.candles.map(c => c.high))  * 1.005 : 0;

  const fibColors = {
    '0%': '#94A3B8', '23%': '#F59E0B', '38%': '#FBBF24',
    '50%': '#FB923C', '61%': '#F97316', '78%': '#EF4444', '100%': '#94A3B8',
  };

  const trendColor = data?.summary?.trend_direction === 'alta' ? '#10B981' : '#EF4444';
  const rsiColor   = data?.summary?.rsi > 70 ? '#EF4444'
                   : data?.summary?.rsi < 30 ? '#10B981' : '#FBBF24';

  return (
    <div className="ta-page">
      {/* ── Header ── */}
      <header className="ta-header">
        <div className="ta-header-left">
          <Activity size={22} className="ta-header-icon" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1>Análise Técnica Automatizada</h1>
              <Link to="/aprender/analise-tecnica" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ai-accent)', background: 'rgba(251,191,36,0.1)', padding: '4px 10px', borderRadius: '6px', textDecoration: 'none', border: '1px solid rgba(251,191,36,0.3)', transition: 'all 0.2s' }}>
                <BookOpen size={16} /> Aprender Funcionalidade
              </Link>
            </div>
            <p>Tendências · Suporte/Resistência · Fibonacci · Padrões de Candles</p>
          </div>
        </div>

        {/* Barra de busca */}
        <form className="ta-search-bar" onSubmit={handleSearch}>
          <input
            className="ta-search-input"
            placeholder="Digite o ticker  (ex: PETR4)"
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={handleKey}
            maxLength={10}
          />
          <div className="ta-period-select">
            <select value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="1mo">1 mês</option>
              <option value="3mo">3 meses</option>
              <option value="6mo">6 meses</option>
              <option value="1y">1 ano</option>
            </select>
            <ChevronDown size={14} className="ta-select-arrow" />
          </div>
          <button type="submit" className="ta-search-btn" disabled={loading || !ticker.trim()}>
            {loading ? <Loader2 size={18} className="ta-spin" /> : <Search size={18} />}
            {loading ? 'Analisando…' : 'Analisar'}
          </button>
        </form>
      </header>

      {/* ── Estado vazio ── */}
      {!data && !loading && !error && (
        <div className="ta-empty">
          <BarChart2 size={56} className="ta-empty-icon" />
          <h2>Pronto para analisar</h2>
          <p>Digite um ticker da B3 acima e selecione o período para gerar<br/>a análise técnica completa com gráficos e indicadores.</p>
          <div className="ta-empty-examples">
            {['PETR4','VALE3','BBAS3','ITUB4','WEGE3'].map(t => (
              <button key={t} className="ta-example-chip"
                onClick={() => { setTicker(t); }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Erro ── */}
      {error && (
        <div className="ta-error">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="ta-loading">
          <Loader2 size={40} className="ta-spin" />
          <p>Carregando dados e calculando indicadores…</p>
        </div>
      )}

      {/* ══════════ CONTEÚDO PRINCIPAL ══════════ */}
      {data && !loading && (
        <div className="ta-content">

          {/* ── Summary Cards ── */}
          <div className="ta-summary-row">
            <div className="ta-card ta-card-main">
              <span className="ta-card-label">Último Fechamento</span>
              <span className="ta-card-value">R$ {data.summary.last_close?.toFixed(2)}</span>
            </div>
            <div className="ta-card">
              <span className="ta-card-label">Tendência</span>
              <span className="ta-card-value" style={{ color: trendColor }}>
                {data.summary.trend_direction === 'alta'
                  ? <><TrendingUp size={18}/> Alta</>
                  : <><TrendingDown size={18}/> Baixa</>}
              </span>
            </div>
            <div className="ta-card">
              <span className="ta-card-label">RSI (14)</span>
              <span className="ta-card-value" style={{ color: rsiColor }}>
                {data.summary.rsi?.toFixed(1)} · {data.summary.rsi_signal}
              </span>
            </div>
            <div className="ta-card">
              <span className="ta-card-label">Padrões Detectados</span>
              <span className="ta-card-value">{data.patterns.length}</span>
            </div>
            <div className="ta-card">
              <span className="ta-card-label">Suportes / Resistências</span>
              <span className="ta-card-value">
                {data.support_levels.length} / {data.resistance_levels.length}
              </span>
            </div>
          </div>

          {/* ── Grid principal ── */}
          <div className="ta-main-grid">

            {/* ── Coluna esquerda: gráficos ── */}
            <div className="ta-chart-col">

              {/* Controles de overlay */}
              <div className="ta-controls">
                <span className="ta-controls-label">Sobreposições:</span>
                {[
                  { k: 'sma20', label: 'MM20', color: '#FBBF24' },
                  { k: 'sma50', label: 'MM50', color: '#8B5CF6' },
                  { k: 'bb',    label: 'Bollinger', color: '#38BDF8' },
                  { k: 'trend', label: 'Tendência', color: '#10B981' },
                ].map(({ k, label, color }) => (
                  <button
                    key={k}
                    className={`ta-overlay-btn ${overlay[k] ? 'active' : ''}`}
                    style={overlay[k] ? { borderColor: color, color } : {}}
                    onClick={() => toggleOverlay(k)}
                  >
                    {label}
                  </button>
                ))}

                {/* Abas de sub-gráfico */}
                <div className="ta-tab-group">
                  {[
                    { id: 'price', label: 'Preço' },
                    { id: 'rsi',   label: 'RSI' },
                    { id: 'macd',  label: 'MACD' },
                  ].map(t => (
                    <button
                      key={t.id}
                      className={`ta-tab-btn ${activeTab === t.id ? 'active' : ''}`}
                      onClick={() => setActiveTab(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Gráfico de Preço (Candles) ── */}
              {activeTab === 'price' && (
                <div className="ta-chart-box">
                  <h3 className="ta-chart-title">
                    {data.ticker} · Candlestick + Indicadores
                  </h3>
                  <ResponsiveContainer width="100%" height={420}>
                    <ComposedChart data={data.candles} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#64748B', fontSize: 11 }}
                        tickFormatter={v => v.slice(5)}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={[priceMin, priceMax]}
                        tick={{ fill: '#64748B', fontSize: 11 }}
                        tickFormatter={v => `R$${v.toFixed(0)}`}
                        width={68}
                        yAxisId="price"
                      />
                      <YAxis yAxisId="vol" orientation="right" hide />
                      <Tooltip content={<CandleTooltip />} />

                      {/* Volume (fundo) */}
                      <Bar dataKey="volume" yAxisId="vol" fill="rgba(100,116,139,0.15)"
                           radius={[2,2,0,0]} />

                      {/* Bollinger Bands */}
                      {overlay.bb && <>
                        <Line yAxisId="price" dataKey="bb_upper" stroke="#38BDF8"
                              strokeWidth={1} dot={false} strokeDasharray="4 3" name="BB Superior" />
                        <Line yAxisId="price" dataKey="bb_lower" stroke="#38BDF8"
                              strokeWidth={1} dot={false} strokeDasharray="4 3" name="BB Inferior" />
                        <Line yAxisId="price" dataKey="bb_mid"   stroke="#38BDF888"
                              strokeWidth={1} dot={false} name="BB Médio" />
                      </>}

                      {/* Médias Móveis */}
                      {overlay.sma20 && (
                        <Line yAxisId="price" dataKey="sma20" stroke="#FBBF24"
                              strokeWidth={1.5} dot={false} name="MM20" />
                      )}
                      {overlay.sma50 && (
                        <Line yAxisId="price" dataKey="sma50" stroke="#8B5CF6"
                              strokeWidth={1.5} dot={false} name="MM50" />
                      )}

                      {/* Linha de Tendência */}
                      {overlay.trend && (
                        <Line yAxisId="price" dataKey="trend" stroke={trendColor}
                              strokeWidth={1.5} dot={false} strokeDasharray="6 3" name="Tendência" />
                      )}

                      {/* Suporte */}
                      {data.support_levels.map((lvl, i) => (
                        <ReferenceLine key={`s${i}`} yAxisId="price" y={lvl}
                          stroke="#10B981" strokeDasharray="5 3" strokeWidth={1.2}
                          label={{ value: `S R$${lvl}`, fill: '#10B981', fontSize: 10, position: 'insideTopLeft' }}
                        />
                      ))}

                      {/* Resistência */}
                      {data.resistance_levels.map((lvl, i) => (
                        <ReferenceLine key={`r${i}`} yAxisId="price" y={lvl}
                          stroke="#EF4444" strokeDasharray="5 3" strokeWidth={1.2}
                          label={{ value: `R R$${lvl}`, fill: '#EF4444', fontSize: 10, position: 'insideTopLeft' }}
                        />
                      ))}

                      {/* Fibonacci */}
                      {Object.entries(data.fibonacci).map(([ratio, lvl]) => (
                        <ReferenceLine key={`fib${ratio}`} yAxisId="price" y={lvl}
                          stroke={fibColors[ratio] || '#FBBF24'} strokeDasharray="2 4"
                          strokeWidth={1} opacity={0.6}
                          label={{ value: `Fib ${ratio}`, fill: fibColors[ratio] || '#FBBF24', fontSize: 9, position: 'insideBottomRight' }}
                        />
                      ))}

                      <Legend wrapperStyle={{ fontSize: '11px', color: '#94A3B8' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ── RSI ── */}
              {activeTab === 'rsi' && (
                <div className="ta-chart-box">
                  <h3 className="ta-chart-title">RSI (14) — Índice de Força Relativa</h3>
                  <p className="ta-chart-hint">
                    Acima de 70 = Sobrecomprado · Abaixo de 30 = Sobrevendido
                  </p>
                  <ResponsiveContainer width="100%" height={340}>
                    <ComposedChart data={data.candles} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }}
                             tickFormatter={v => v.slice(5)} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} tick={{ fill: '#64748B', fontSize: 11 }} width={40} />
                      <Tooltip formatter={(v) => [v?.toFixed(1), 'RSI']} />
                      <ReferenceLine y={70} stroke="#EF4444" strokeDasharray="4 2"
                        label={{ value: 'Sobrecomprado 70', fill: '#EF4444', fontSize: 10 }} />
                      <ReferenceLine y={30} stroke="#10B981" strokeDasharray="4 2"
                        label={{ value: 'Sobrevendido 30', fill: '#10B981', fontSize: 10 }} />
                      <ReferenceLine y={50} stroke="#475569" strokeDasharray="2 4" />
                      <Line dataKey="rsi" stroke="#FBBF24" strokeWidth={2} dot={false} name="RSI" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ── MACD ── */}
              {activeTab === 'macd' && (
                <div className="ta-chart-box">
                  <h3 className="ta-chart-title">MACD (12,26,9)</h3>
                  <p className="ta-chart-hint">
                    Histograma verde = momento de alta · Vermelho = momento de baixa
                  </p>
                  <ResponsiveContainer width="100%" height={340}>
                    <ComposedChart data={data.candles} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }}
                             tickFormatter={v => v.slice(5)} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#64748B', fontSize: 11 }} width={50} />
                      <Tooltip formatter={(v, n) => [v?.toFixed(4), n]} />
                      <ReferenceLine y={0} stroke="#475569" />
                      <Bar dataKey="histogram" name="Histograma"
                           fill="#10B981"
                           radius={[2,2,0,0]}
                           // Recharts doesn't support dynamic fill per bar without custom shape, use opacity trick
                      />
                      <Line dataKey="macd"   stroke="#FBBF24" strokeWidth={1.8} dot={false} name="MACD" />
                      <Line dataKey="signal" stroke="#EF4444" strokeWidth={1.8} dot={false} name="Sinal" />
                      <Legend wrapperStyle={{ fontSize: '11px', color: '#94A3B8' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* ── Coluna direita: painéis ── */}
            <div className="ta-side-col">

              {/* Fibonacci */}
              <div className="ta-panel">
                <h3 className="ta-panel-title">
                  <Layers size={15} /> Retrações de Fibonacci
                </h3>
                <p className="ta-panel-hint">
                  Range: R$ {data.fib_range.low.toFixed(2)} → R$ {data.fib_range.high.toFixed(2)}
                </p>
                <div className="ta-fib-list">
                  {Object.entries(data.fibonacci).map(([ratio, lvl]) => {
                    const last = data.summary.last_close;
                    const isNear = Math.abs(lvl - last) / last < 0.012;
                    return (
                      <div key={ratio} className={`ta-fib-row ${isNear ? 'near' : ''}`}>
                        <span className="ta-fib-ratio"
                              style={{ color: fibColors[ratio] || '#FBBF24' }}>
                          {ratio}
                        </span>
                        <div className="ta-fib-bar-wrap">
                          <div className="ta-fib-bar"
                               style={{ width: `${ratio.replace('%','') || 0}%`,
                                        background: fibColors[ratio] || '#FBBF24' }} />
                        </div>
                        <span className="ta-fib-price">R$ {lvl.toFixed(2)}</span>
                        {isNear && <span className="ta-fib-near-badge">← atual</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Suporte & Resistência */}
              <div className="ta-panel">
                <h3 className="ta-panel-title">
                  <Minus size={15} /> Suporte & Resistência
                </h3>
                <div className="ta-levels-section">
                  <p className="ta-levels-subtitle loss">Resistências</p>
                  {data.resistance_levels.slice().reverse().map((lvl, i) => (
                    <div key={i} className="ta-level-row resistance">
                      <span className="ta-level-bar" />
                      <span>R$ {lvl.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="ta-current-price-marker">
                    ◆ R$ {data.summary.last_close.toFixed(2)} (atual)
                  </div>
                  {data.support_levels.slice().reverse().map((lvl, i) => (
                    <div key={i} className="ta-level-row support">
                      <span className="ta-level-bar" />
                      <span>R$ {lvl.toFixed(2)}</span>
                    </div>
                  ))}
                  <p className="ta-levels-subtitle profit">Suportes</p>
                </div>
              </div>

              {/* Padrões detectados */}
              <div className="ta-panel">
                <h3 className="ta-panel-title">
                  <AlertCircle size={15} /> Padrões de Candles
                </h3>
                {data.patterns.length === 0 ? (
                  <p className="ta-panel-empty">Nenhum padrão detectado no período.</p>
                ) : (
                  <div className="ta-patterns-list">
                    {[...data.patterns].reverse().map((p, i) => (
                      <PatternBadge key={i} p={p} />
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
