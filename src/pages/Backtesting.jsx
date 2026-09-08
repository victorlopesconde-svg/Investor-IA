import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend, Area, AreaChart,
} from 'recharts';
import {
  FlaskConical, Search, Loader2, AlertCircle, TrendingUp, TrendingDown,
  BarChart2, ChevronDown, Info, Trophy, ShieldAlert, Percent, Hash, BookOpen,
} from 'lucide-react';
import './Backtesting.css';

/* ── Estratégias disponíveis ─────────────────────────────────────── */
const STRATEGIES = [
  {
    id: 'ma_crossover',
    icon: '📈',
    title: 'Cruzamento de Médias',
    desc: 'Compra quando a média rápida cruza acima da lenta. Vende no cruzamento oposto.',
    color: '#FBBF24',
  },
  {
    id: 'rsi',
    icon: '📊',
    title: 'RSI – Reversão à Média',
    desc: 'Compra quando RSI fica sobrevendido, vende quando fica sobrecomprado.',
    color: '#8B5CF6',
  },
  {
    id: 'bollinger',
    icon: '🎯',
    title: 'Bandas de Bollinger',
    desc: 'Compra quando o preço toca a banda inferior, vende quando toca a banda superior.',
    color: '#38BDF8',
  },
  {
    id: 'buy_hold',
    icon: '💰',
    title: 'Comprar e Segurar',
    desc: 'Referência simples: compra no início e segura até o fim do período.',
    color: '#10B981',
  },
];

/* ── Tooltip do gráfico de equidade ─────────────────────────────── */
const EquityTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const strategy = payload.find(p => p.dataKey === 'equity');
  const bh       = payload.find(p => p.dataKey === 'bh_equity');
  return (
    <div className="bt-tooltip">
      <p className="bt-tooltip-date">{label}</p>
      {strategy && <p style={{ color: strategy.color }}>Estratégia: R$ {strategy.value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>}
      {bh       && <p style={{ color: bh.color      }}>Buy & Hold: R$ {bh.value?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>}
    </div>
  );
};

/* ── Tooltip do gráfico de sinais ───────────────────────────────── */
const SignalTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const close = payload.find(p => p.dataKey === 'close');
  const sig   = payload[0]?.payload?.signal;
  return (
    <div className="bt-tooltip">
      <p className="bt-tooltip-date">{label}</p>
      {close && <p>Preço: R$ {close.value?.toFixed(2)}</p>}
      {sig === 1  && <p className="profit">▲ Sinal de COMPRA</p>}
      {sig === -1 && <p className="loss">▼ Sinal de VENDA</p>}
    </div>
  );
};

/* ── Card de métrica ─────────────────────────────────────────────── */
const MetricCard = ({ label, value, sub, color, icon: Icon, highlight }) => (
  <div className={`bt-metric-card ${highlight ? 'highlight' : ''}`} style={highlight ? { borderColor: color } : {}}>
    <div className="bt-metric-top">
      {Icon && <Icon size={16} style={{ color }} />}
      <span className="bt-metric-label">{label}</span>
    </div>
    <span className="bt-metric-value" style={{ color }}>{value}</span>
    {sub && <span className="bt-metric-sub">{sub}</span>}
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════ */
export default function Backtesting() {
  const [ticker,   setTicker]   = useState('');
  const [period,   setPeriod]   = useState('2y');
  const [strategy, setStrategy] = useState('ma_crossover');
  const [capital,  setCapital]  = useState(10000);
  const [params,   setParams]   = useState({
    fast_ma: 20, slow_ma: 50,
    rsi_period: 14, rsi_oversold: 30, rsi_overbought: 70,
    bb_period: 20, bb_std: 2.0,
  });
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [tab,     setTab]     = useState('equity'); // equity | signals

  const setParam = (k, v) => setParams(p => ({ ...p, [k]: v }));

  const handleRun = useCallback(async () => {
    if (!ticker.trim()) return;
    setLoading(true); setError(''); setData(null);
    const qs = new URLSearchParams({
      period, strategy, initial_capital: capital, commission: 0.001,
      ...params,
    });
    try {
      let res;
      try { 
        const token = localStorage.getItem('investoria_token');
        res = await fetch(`/api/backtesting/${ticker.trim().toUpperCase()}?${qs}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }); 
      }
      catch { throw new Error('Backend offline. Inicie o servidor com python start_api.py'); }
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        let detail = `Erro ${res.status}`;
        try { detail = JSON.parse(text).detail || detail; } catch {}
        throw new Error(detail);
      }
      if (!text) throw new Error('Resposta vazia do servidor.');
      setData(JSON.parse(text));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [ticker, period, strategy, capital, params]);

  const m = data?.metrics;
  const strat = STRATEGIES.find(s => s.id === strategy);
  const stratColor = strat?.color || '#FBBF24';
  const totalRetColor = m ? (m.total_return >= 0 ? '#10B981' : '#EF4444') : '#94A3B8';
  const beatsBH = m ? m.total_return > m.bh_return : false;

  // Sinais de compra/venda para pontos no gráfico
  const buyPoints  = data?.equity_curve.filter(e => e.signal === 1)  || [];
  const sellPoints = data?.equity_curve.filter(e => e.signal === -1) || [];

  return (
    <div className="bt-page">
      {/* ── Header ── */}
      <header className="bt-header">
        <div className="bt-header-left">
          <FlaskConical size={22} className="bt-header-icon" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1>Backtesting Sem Código</h1>
              <Link to="/aprender/backtesting" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--ai-accent)', background: 'rgba(251,191,36,0.1)', padding: '4px 10px', borderRadius: '6px', textDecoration: 'none', border: '1px solid rgba(251,191,36,0.3)', transition: 'all 0.2s' }}>
                <BookOpen size={16} /> Aprender Funcionalidade
              </Link>
            </div>
            <p>Teste suas estratégias com dados históricos reais · Visual · Sem programação</p>
          </div>
        </div>
      </header>

      <div className="bt-body">
        {/* ══ PAINEL DE CONFIGURAÇÃO ══ */}
        <aside className="bt-config-panel">
          <h2 className="bt-section-title">Configuração</h2>

          {/* Ticker + Período */}
          <div className="bt-field">
            <label>Ticker da Ação</label>
            <input
              className="bt-input"
              placeholder="Ex: PETR4"
              value={ticker}
              maxLength={10}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleRun()}
            />
          </div>

          <div className="bt-field">
            <label>Período Histórico</label>
            <div className="bt-select-wrap">
              <select className="bt-select" value={period} onChange={e => setPeriod(e.target.value)}>
                <option value="1y">1 ano</option>
                <option value="2y">2 anos</option>
                <option value="5y">5 anos</option>
              </select>
              <ChevronDown size={14} className="bt-select-arrow" />
            </div>
          </div>

          <div className="bt-field">
            <label>Capital Inicial (R$)</label>
            <input
              className="bt-input"
              type="number"
              min={100}
              step={1000}
              value={capital}
              onChange={e => setCapital(Number(e.target.value))}
            />
          </div>

          {/* Seletor de estratégia */}
          <div className="bt-field">
            <label>Estratégia</label>
            <div className="bt-strategy-list">
              {STRATEGIES.map(s => (
                <button
                  key={s.id}
                  className={`bt-strategy-card ${strategy === s.id ? 'selected' : ''}`}
                  style={strategy === s.id ? { borderColor: s.color, background: `${s.color}12` } : {}}
                  onClick={() => setStrategy(s.id)}
                >
                  <span className="bt-strat-icon">{s.icon}</span>
                  <div>
                    <strong style={strategy === s.id ? { color: s.color } : {}}>{s.title}</strong>
                    <p>{s.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Parâmetros dinâmicos */}
          {strategy === 'ma_crossover' && (
            <div className="bt-params">
              <p className="bt-params-title">Parâmetros</p>
              <SliderField label="Média Rápida" value={params.fast_ma} min={5} max={50}
                onChange={v => setParam('fast_ma', v)} />
              <SliderField label="Média Lenta" value={params.slow_ma} min={20} max={200}
                onChange={v => setParam('slow_ma', v)} />
            </div>
          )}

          {strategy === 'rsi' && (
            <div className="bt-params">
              <p className="bt-params-title">Parâmetros</p>
              <SliderField label="Período RSI" value={params.rsi_period} min={5} max={30}
                onChange={v => setParam('rsi_period', v)} />
              <SliderField label="Sobrevendido" value={params.rsi_oversold} min={10} max={40}
                onChange={v => setParam('rsi_oversold', v)} />
              <SliderField label="Sobrecomprado" value={params.rsi_overbought} min={60} max={90}
                onChange={v => setParam('rsi_overbought', v)} />
            </div>
          )}

          {strategy === 'bollinger' && (
            <div className="bt-params">
              <p className="bt-params-title">Parâmetros</p>
              <SliderField label="Período" value={params.bb_period} min={10} max={50}
                onChange={v => setParam('bb_period', v)} />
              <SliderField label="Desvios Padrão" value={params.bb_std} min={1} max={3} step={0.1}
                onChange={v => setParam('bb_std', parseFloat(v))} />
            </div>
          )}

          <button
            className="bt-run-btn"
            onClick={handleRun}
            disabled={loading || !ticker.trim()}
          >
            {loading
              ? <><Loader2 size={18} className="bt-spin" /> Calculando…</>
              : <><FlaskConical size={18} /> Executar Backtesting</>}
          </button>

          {/* Aviso de custos */}
          <div className="bt-disclaimer">
            <Info size={13} />
            <span>Corretagem simulada: 0,1% por operação. Resultados passados não garantem retornos futuros.</span>
          </div>
        </aside>

        {/* ══ ÁREA DE RESULTADOS ══ */}
        <main className="bt-results">
          {/* Estado vazio */}
          {!data && !loading && !error && (
            <div className="bt-empty">
              <BarChart2 size={52} className="bt-empty-icon" />
              <h2>Configure e execute o backtesting</h2>
              <p>Selecione um ticker, período e estratégia no painel à esquerda, depois clique em <strong>Executar Backtesting</strong>.</p>
              <div className="bt-examples">
                {['PETR4','VALE3','BBAS3','ITUB4','WEGE3'].map(t => (
                  <button key={t} className="bt-chip" onClick={() => setTicker(t)}>{t}</button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bt-error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="bt-loading">
              <Loader2 size={42} className="bt-spin" />
              <p>Buscando dados e simulando a estratégia…</p>
            </div>
          )}

          {data && !loading && (
            <>
              {/* Resumo do teste */}
              <div className="bt-run-summary">
                <span className="bt-run-ticker">{data.ticker}</span>
                <span className="bt-run-sep">·</span>
                <span>{strat?.title}</span>
                <span className="bt-run-sep">·</span>
                <span>{period === '1y' ? '1 ano' : period === '2y' ? '2 anos' : '5 anos'}</span>
                <span className="bt-run-sep">·</span>
                <span>{data.metrics.total_days} pregões</span>
              </div>

              {/* Métricas */}
              <div className="bt-metrics-grid">
                <MetricCard
                  label="Retorno Total" icon={TrendingUp}
                  value={`${m.total_return >= 0 ? '+' : ''}${m.total_return.toFixed(2)}%`}
                  sub={`Capital final: R$ ${m.final_equity.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  color={totalRetColor} highlight
                />
                <MetricCard
                  label="Buy & Hold" icon={BarChart2}
                  value={`${m.bh_return >= 0 ? '+' : ''}${m.bh_return.toFixed(2)}%`}
                  sub={beatsBH ? '✓ Estratégia venceu' : '✗ B&H foi melhor'}
                  color={beatsBH ? '#10B981' : '#EF4444'}
                />
                <MetricCard
                  label="Retorno Anualizado" icon={Percent}
                  value={`${m.annualized_return >= 0 ? '+' : ''}${m.annualized_return.toFixed(2)}%`}
                  color={m.annualized_return >= 0 ? '#10B981' : '#EF4444'}
                />
                <MetricCard
                  label="Sharpe Ratio" icon={Trophy}
                  value={m.sharpe_ratio.toFixed(2)}
                  sub={m.sharpe_ratio >= 1 ? 'Bom' : m.sharpe_ratio >= 0.5 ? 'Razoável' : 'Fraco'}
                  color={m.sharpe_ratio >= 1 ? '#10B981' : m.sharpe_ratio >= 0.5 ? '#FBBF24' : '#EF4444'}
                />
                <MetricCard
                  label="Max. Drawdown" icon={ShieldAlert}
                  value={`-${m.max_drawdown.toFixed(2)}%`}
                  sub="Pior queda do capital"
                  color={m.max_drawdown < 10 ? '#10B981' : m.max_drawdown < 25 ? '#FBBF24' : '#EF4444'}
                />
                <MetricCard
                  label="Taxa de Acerto" icon={Percent}
                  value={`${m.win_rate.toFixed(1)}%`}
                  sub={`${m.num_trades} operações concluídas`}
                  color={m.win_rate >= 50 ? '#10B981' : '#EF4444'}
                />
                <MetricCard
                  label="Profit Factor"
                  value={m.profit_factor >= 999 ? '∞' : m.profit_factor.toFixed(2)}
                  sub="Lucros / Perdas"
                  color={m.profit_factor >= 1.5 ? '#10B981' : m.profit_factor >= 1 ? '#FBBF24' : '#EF4444'}
                />
                <MetricCard
                  label="Nº de Negócios" icon={Hash}
                  value={m.num_trades}
                  sub="Vendas realizadas"
                  color="#94A3B8"
                />
              </div>

              {/* Abas */}
              <div className="bt-tabs">
                {[
                  { id: 'equity',  label: 'Curva de Capital' },
                  { id: 'signals', label: 'Sinais no Gráfico' },
                ].map(t => (
                  <button
                    key={t.id}
                    className={`bt-tab ${tab === t.id ? 'active' : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Curva de capital ── */}
              {tab === 'equity' && (
                <div className="bt-chart-box">
                  <h3>Evolução do Capital  <span className="bt-chart-sub">(R$)</span></h3>
                  <ResponsiveContainer width="100%" height={360}>
                    <AreaChart data={data.equity_curve} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="stratGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={stratColor} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={stratColor} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="bhGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#64748B" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#64748B" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }}
                             tickFormatter={v => v.slice(0,7)} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#64748B', fontSize: 11 }}
                             tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} width={64} />
                      <Tooltip content={<EquityTooltip />} />
                      <ReferenceLine y={capital} stroke="#475569" strokeDasharray="4 3"
                        label={{ value: 'Capital inicial', fill: '#475569', fontSize: 10 }} />
                      <Area dataKey="bh_equity" stroke="#64748B" fill="url(#bhGrad)"
                            strokeWidth={1.5} dot={false} name="Buy & Hold" />
                      <Area dataKey="equity" stroke={stratColor} fill="url(#stratGrad)"
                            strokeWidth={2} dot={false} name={strat?.title} />
                      <Legend wrapperStyle={{ fontSize: '11px', color: '#94A3B8' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ── Sinais no gráfico ── */}
              {tab === 'signals' && (
                <div className="bt-chart-box">
                  <h3>Preço + Sinais de Entrada/Saída</h3>
                  <ResponsiveContainer width="100%" height={380}>
                    <ComposedChart data={data.equity_curve} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" tick={{ fill: '#64748B', fontSize: 11 }}
                             tickFormatter={v => v.slice(0,7)} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#64748B', fontSize: 11 }}
                             tickFormatter={v => `R$${v.toFixed(0)}`} width={64} />
                      <Tooltip content={<SignalTooltip />} />
                      <Line dataKey="close" stroke="#94A3B8" strokeWidth={1.5} dot={false} name="Preço" />
                      {/* Indicadores por estratégia */}
                      {strategy === 'ma_crossover' && <>
                        <Line dataKey="fast_ma" stroke="#FBBF24" strokeWidth={1.5} dot={false} name={`MM${params.fast_ma}`} />
                        <Line dataKey="slow_ma" stroke="#8B5CF6" strokeWidth={1.5} dot={false} name={`MM${params.slow_ma}`} />
                      </>}
                      {strategy === 'bollinger' && <>
                        <Line dataKey="bb_upper" stroke="#38BDF8" strokeWidth={1} dot={false} strokeDasharray="4 3" name="BB Sup" />
                        <Line dataKey="bb_lower" stroke="#38BDF8" strokeWidth={1} dot={false} strokeDasharray="4 3" name="BB Inf" />
                        <Line dataKey="bb_mid"   stroke="#38BDF888" strokeWidth={1} dot={false} name="BB Mid" />
                      </>}
                      {/* Marcadores de compra */}
                      {data.trades.filter(t=>t.type==='compra').map((t,i) => (
                        <ReferenceLine key={`b${i}`} x={t.date} stroke="#10B981"
                          strokeWidth={1.5} strokeDasharray="3 3"
                          label={{ value: '▲', fill: '#10B981', fontSize: 14 }} />
                      ))}
                      {/* Marcadores de venda */}
                      {data.trades.filter(t=>t.type==='venda').map((t,i) => (
                        <ReferenceLine key={`s${i}`} x={t.date} stroke="#EF4444"
                          strokeWidth={1.5} strokeDasharray="3 3"
                          label={{ value: '▼', fill: '#EF4444', fontSize: 14 }} />
                      ))}
                      <Legend wrapperStyle={{ fontSize: '11px', color: '#94A3B8' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <p className="bt-chart-hint">▲ Compra · ▼ Venda</p>
                </div>
              )}


            </>
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Slider com label e valor ──────────────────────────────────── */
function SliderField({ label, value, min, max, step = 1, onChange }) {
  return (
    <div className="bt-slider-field">
      <div className="bt-slider-header">
        <span>{label}</span>
        <span className="bt-slider-value">{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(e.target.value)}
        className="bt-slider"
      />
      <div className="bt-slider-labels"><span>{min}</span><span>{max}</span></div>
    </div>
  );
}
