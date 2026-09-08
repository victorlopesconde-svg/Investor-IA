import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, AlertCircle } from 'lucide-react';
import './Market.css';

// Lista de tickers de alta liquidez na B3 para acompanhamento
const TICKERS_LIST = 'PETR4,VALE3,ITUB4,BBDC4,WEGE3,MGLU3,B3SA3,ABEV3,RENT3,SUZB3,ELET3,BBAS3,RADL3,JBSS3,BBSE3,AZUL4,GOLL4,COGN3,BHIA3,CVCB3';

export default function Market() {
  const [altas, setAltas] = useState([]);
  const [baixas, setBaixas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMarketData();
  }, []);

  const fetchMarketData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`https://brapi.dev/api/quote/${TICKERS_LIST}`);
      if (!response.ok) throw new Error('Falha ao buscar dados da B3');
      
      const data = await response.json();
      const results = data.results || [];

      // Filtra ativos que possuem regularMarketChangePercent válido
      const validResults = results.filter(stock => 
        stock.regularMarketChangePercent !== undefined && 
        stock.regularMarketChangePercent !== null
      );

      // Maiores Altas: change > 0, ordenado do maior para o menor
      const sortedAltas = validResults
        .filter(stock => stock.regularMarketChangePercent > 0)
        .sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
        .slice(0, 5);

      // Maiores Baixas: change < 0, ordenado do menor para o maior (mais negativo primeiro)
      const sortedBaixas = validResults
        .filter(stock => stock.regularMarketChangePercent < 0)
        .sort((a, b) => a.regularMarketChangePercent - b.regularMarketChangePercent)
        .slice(0, 5);

      setAltas(sortedAltas);
      setBaixas(sortedBaixas);
    } catch (err) {
      console.error(err);
      setError('Não foi possível conectar à B3 no momento. Tente novamente mais tarde.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="market-container">
      <header className="market-header">
        <div className="header-title-row">
          <h1>Altas e Quedas do Dia</h1>
          <button 
            onClick={fetchMarketData} 
            className="refresh-btn" 
            disabled={isLoading}
            title="Atualizar Cotações"
          >
            <RefreshCw size={18} className={isLoading ? 'spinning' : ''} />
          </button>
        </div>
        <p>Cotações reais da B3 (Delay de 15 minutos)</p>
      </header>

      {error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {isLoading && !error ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Buscando cotações em tempo real...</p>
        </div>
      ) : (
        <div className="market-content">
          {/* Altas Panel */}
          <div className="market-panel altas-panel">
            <div className="panel-header">
              <div className="panel-title">
                <TrendingUp size={24} className="icon-profit" />
                <h2>Maiores Altas</h2>
              </div>
            </div>
            <div className="stock-list">
              {altas.length === 0 ? (
                <p className="empty-message">Nenhuma alta expressiva no momento.</p>
              ) : (
                altas.map(stock => (
                  <StockCard key={stock.symbol} stock={stock} isPositive={true} />
                ))
              )}
            </div>
          </div>

          {/* Baixas Panel */}
          <div className="market-panel baixas-panel">
            <div className="panel-header">
              <div className="panel-title">
                <TrendingDown size={24} className="icon-loss" />
                <h2>Maiores Baixas</h2>
              </div>
            </div>
            <div className="stock-list">
              {baixas.length === 0 ? (
                <p className="empty-message">Nenhuma baixa expressiva no momento.</p>
              ) : (
                baixas.map(stock => (
                  <StockCard key={stock.symbol} stock={stock} isPositive={false} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StockCard({ stock, isPositive }) {
  const signalClass = isPositive ? 'profit' : 'loss';
  const changePrefix = isPositive ? '+' : '';
  const price = stock.regularMarketPrice ? stock.regularMarketPrice.toFixed(2).replace('.', ',') : '0,00';
  const change = stock.regularMarketChangePercent ? stock.regularMarketChangePercent.toFixed(2) : '0.00';
  const name = stock.shortName || stock.longName || 'Empresa B3';

  return (
    <div className="stock-card">
      <div className="stock-info">
        <span className="stock-ticker">{stock.symbol}</span>
        <span className="stock-name" title={name}>{name.substring(0, 18)}{name.length > 18 ? '...' : ''}</span>
      </div>
      
      <div className="stock-stats">
        <div className="stock-price">R$ {price}</div>
        <div className={`stock-change ${signalClass}`}>
          {changePrefix}{change}%
        </div>
      </div>
    </div>
  );
}
