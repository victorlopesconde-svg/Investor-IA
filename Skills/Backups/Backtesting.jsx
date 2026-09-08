import React, { useState } from 'react';
import { Activity, AlertCircle, Play } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './Backtesting.css';

const ASSETS = ['PETR4', 'VALE3', 'ITUB4', 'BBDC4', 'WEGE3', 'MGLU3', 'B3SA3', 'RENT3', 'BBAS3'];
const RANGES = [
  { label: '3 Meses', value: '3mo' },
  { label: '6 Meses', value: '6mo' },
  { label: '1 Ano', value: '1y' },
  { label: '5 Anos', value: '5y' }
];

export default function Backtesting() {
  const [ticker, setTicker] = useState('PETR4');
  const [range, setRange] = useState('1y');
  const [initialCapital, setInitialCapital] = useState(10000);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const runBacktest = async (e) => {
    e.preventDefault();
    if (!ticker.trim()) return;
    
    setIsLoading(true);
    setError(null);
    setResult(null);

    const safeTicker = ticker.trim().toUpperCase();

    try {
      const apiUrl = `https://brapi.dev/api/quote/${safeTicker}?range=${range}&interval=1d`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error('Falha ao buscar dados da API. Verifique o Ticker digitado.');
      }
      
      const data = await response.json();
      
      if (!data.results || data.results.length === 0 || !data.results[0].historicalDataPrice) {
        throw new Error('Ativo não encontrado ou sem dados históricos na BRAPI.');
      }
      
      const rawHistoricalData = data.results[0].historicalDataPrice;
      
      if (rawHistoricalData.length === 0) {
        throw new Error('Dados insuficientes para este período.');
      }
      
      const validData = rawHistoricalData.filter(item => item.close !== null && item.close !== undefined);
      
      if (validData.length === 0) {
        throw new Error('Nenhum dado de preço válido encontrado.');
      }
      
      const firstPrice = validData[0].close;
      const sharesPurchased = initialCapital / firstPrice;
      
      const chartData = validData.map(item => ({
        dateStr: new Date(item.date * 1000).toLocaleDateString('pt-BR'),
        capital: sharesPurchased * item.close
      }));
      
      const finalCapital = chartData[chartData.length - 1].capital;
      const totalReturnPercent = ((finalCapital - initialCapital) / initialCapital) * 100;
      const profitLoss = finalCapital - initialCapital;

      setResult({
        assetName: safeTicker,
        finalCapital,
        totalReturnPercent,
        profitLoss,
        chartData
      });

    } catch (err) {
      console.error(err);
      setError(err.message || 'Erro na simulação do ativo. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="backtesting-container">
      <header className="backtesting-header">
        <h1>Backtesting Visual</h1>
        <p>Teste estratégias de investimento com base em dados históricos reais da B3.</p>
      </header>

      <div className="backtesting-content">
        {/* Formulário de Configuração */}
        <div className="config-panel">
          <h2>Configuração</h2>
          <form onSubmit={runBacktest} className="config-form">
            <div className="form-group">
              <label>Ativo (Ticker)</label>
              <input 
                type="text" 
                placeholder="Ex: PETR4, MGLU3, BBAS3"
                value={ticker} 
                onChange={(e) => setTicker(e.target.value.toUpperCase())} 
                required
              />
            </div>

            <div className="form-group">
              <label>Período Histórico</label>
              <select value={range} onChange={(e) => setRange(e.target.value)}>
                {RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Capital Inicial (R$)</label>
              <input 
                type="number" 
                min="100" 
                step="100" 
                value={initialCapital} 
                onChange={(e) => setInitialCapital(Number(e.target.value))} 
              />
            </div>

            <div className="form-group">
              <label>Estratégia</label>
              <select disabled>
                <option>Buy & Hold (Comprar e Segurar)</option>
              </select>
              <small className="hint-text">Mais estratégias em breve</small>
            </div>

            <button type="submit" className="btn-executar" disabled={isLoading}>
              {isLoading ? <div className="spinner-small" /> : <Play size={18} />}
              {isLoading ? 'Simulando...' : 'Executar Backtest'}
            </button>
          </form>
        </div>

        {/* Área de Resultados */}
        <div className="results-panel">
          {error && (
            <div className="error-banner">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {!result && !error && !isLoading && (
            <div className="empty-state">
              <Activity size={48} />
              <p>Configure os parâmetros ao lado e clique em Executar para ver a simulação do seu capital.</p>
            </div>
          )}

          {isLoading && !error && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Processando histórico e aplicando estratégia...</p>
            </div>
          )}

          {result && !isLoading && !error && (
            <div className="results-dashboard">
              <div className="metrics-row">
                <div className="metric-card">
                  <span className="metric-label">Capital Inicial</span>
                  <span className="metric-value neutral">R$ {initialCapital.toFixed(2)}</span>
                </div>
                
                <div className="metric-card">
                  <span className="metric-label">Capital Final</span>
                  <span className={`metric-value ${result.totalReturnPercent >= 0 ? 'profit' : 'loss'}`}>
                    R$ {result.finalCapital.toFixed(2)}
                  </span>
                </div>

                <div className="metric-card">
                  <span className="metric-label">Retorno Total</span>
                  <span className={`metric-value ${result.totalReturnPercent >= 0 ? 'profit' : 'loss'}`}>
                    {result.totalReturnPercent >= 0 ? '+' : ''}{result.totalReturnPercent.toFixed(2)}%
                  </span>
                </div>
              </div>

              <div className="chart-container">
                <h3>Curva de Evolução - {result.assetName}</h3>
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                      <XAxis 
                        dataKey="dateStr" 
                        stroke="var(--text-muted)" 
                        tick={{ fill: 'var(--text-muted)', fontSize: 12 }} 
                        tickMargin={10}
                        minTickGap={30}
                      />
                      <YAxis 
                        stroke="var(--text-muted)" 
                        tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                        domain={['auto', 'auto']}
                        tickFormatter={(value) => `R$ ${value.toFixed(0)}`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', borderRadius: '8px' }}
                        itemStyle={{ color: 'var(--text-primary)' }}
                        formatter={(value) => [`R$ ${value.toFixed(2)}`, 'Capital']}
                        labelStyle={{ color: 'var(--text-secondary)', marginBottom: '8px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="capital" 
                        stroke={result.totalReturnPercent >= 0 ? 'var(--signal-profit)' : 'var(--signal-loss)'} 
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, fill: 'var(--bg-primary)', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
