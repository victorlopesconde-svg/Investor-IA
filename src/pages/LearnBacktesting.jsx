import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FlaskConical, PlayCircle, Settings, BarChart2, TrendingUp, Search } from 'lucide-react';
import './LearnBacktesting.css';

export default function LearnBacktesting() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="learn-bt-page">
      <div className="learn-bt-container">
        
        {/* Header */}
        <header className="learn-bt-header">
          <Link to="/backtesting" className="learn-bt-back">
            <ArrowLeft size={18} />
            Voltar para Backtesting
          </Link>
          <div className="learn-bt-title-wrapper">
            <FlaskConical size={32} className="learn-bt-title-icon" />
            <h1>Como usar o Backtesting Sem Código</h1>
          </div>
          <p className="learn-bt-subtitle">
            A funcionalidade <strong>Backtesting Sem Código</strong> permite que você faça uma "viagem no tempo" com o seu dinheiro (de forma simulada) para responder à pergunta: "Se eu tivesse usado essa regra de investimento nos últimos anos, eu teria ganhado ou perdido dinheiro?".
            <br/><br/>
            Você testa estratégias famosas do mercado <strong>sem precisar escrever uma única linha de código.</strong>
          </p>
        </header>

        {/* 1. Configuração */}
        <section className="learn-bt-section">
          <div className="learn-bt-section-header">
            <div className="learn-bt-badge">1</div>
            <h2>Configuração (O que você vai testar)</h2>
          </div>
          <div className="learn-bt-card">
            <p>No painel lateral esquerdo, você define as regras do jogo:</p>
            <ul className="learn-bt-list">
              <li>
                <Search size={16} className="text-bt-accent" />
                <span><strong>Ticker da Ação:</strong> Digite a ação que quer testar (ex: <code>VALE3</code>).</span>
              </li>
              <li>
                <Settings size={16} className="text-bt-accent" />
                <span><strong>Período Histórico:</strong> Escolha o quão longe no passado quer voltar (1, 2 ou 5 anos). Quanto maior o período, mais confiável é o teste, pois pega momentos de alta e queda do mercado.</span>
              </li>
              <li>
                <TrendingUp size={16} className="text-bt-accent" />
                <span><strong>Capital Inicial:</strong> Quanto dinheiro virtual você quer usar no teste (ex: R$ 10.000).</span>
              </li>
            </ul>

            <div className="learn-bt-strategies">
              <h3>Estratégias disponíveis:</h3>
              <div className="learn-bt-strat-grid">
                <div className="learn-bt-strat-item">
                  <h4>📈 Cruzamento de Médias</h4>
                  <p>Compra quando a ação ganha força rápida.</p>
                </div>
                <div className="learn-bt-strat-item">
                  <h4>📊 RSI - Reversão</h4>
                  <p>Compra quando a ação cai exageradamente ("sobrevendida").</p>
                </div>
                <div className="learn-bt-strat-item">
                  <h4>🎯 Bandas de Bollinger</h4>
                  <p>Compra quando o preço atinge o "piso" estatístico.</p>
                </div>
                <div className="learn-bt-strat-item bh-ref">
                  <h4>💰 Comprar e Segurar</h4>
                  <p>É a sua referência. Mostra o que aconteceria se você só comprasse no primeiro dia e não fizesse mais nada.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Parâmetros */}
        <section className="learn-bt-section">
          <div className="learn-bt-section-header">
            <div className="learn-bt-badge">2</div>
            <h2>Parâmetros (O ajuste fino)</h2>
          </div>
          <div className="learn-bt-card">
            <p>Dependendo da estratégia escolhida, você pode ajustar as regras usando os "sliders" (barrinhas).</p>
            <p className="learn-bt-highlight">
              <strong>Exemplo no RSI:</strong> Você pode definir que "Sobrevendido" é 30 (padrão) ou ser mais exigente e colocar 20 (vai comprar menos vezes, mas talvez com mais segurança).
            </p>
            <p>Após ajustar tudo, pressione <strong className="text-bt-accent">Rodar Backtest</strong>.</p>
          </div>
        </section>

        {/* 3. Os Resultados */}
        <section className="learn-bt-section">
          <div className="learn-bt-section-header">
            <div className="learn-bt-badge">3</div>
            <h2>Os Resultados (Métricas)</h2>
          </div>
          <p className="learn-bt-intro">Assim que o teste termina, olhe para os cartões no topo. Eles são o "boletim" da sua estratégia:</p>
          
          <div className="learn-bt-grid">
            <div className="learn-bt-grid-card">
              <h3>Retorno Total</h3>
              <p>O lucro (ou prejuízo) que a estratégia gerou. Fica <span className="profit">verde</span> se for positivo, <span className="loss">vermelho</span> se negativo.</p>
            </div>
            <div className="learn-bt-grid-card highlight">
              <h3>Comparação Buy & Hold</h3>
              <p>O dado mais importante! Mostra se o seu trabalho de comprar e vender usando a regra (estratégia) rendeu <strong>MAIS</strong> do que simplesmente comprar e esquecer (Buy & Hold).</p>
            </div>
            <div className="learn-bt-grid-card">
              <h3>Taxa de Acerto</h3>
              <p>De todas as vezes que a estratégia mandou comprar e depois vender, qual a porcentagem que deu lucro?</p>
            </div>
            <div className="learn-bt-grid-card">
              <h3>Máximo Drawdown</h3>
              <p>É o "teste de estômago". Qual foi a maior queda que o seu patrimônio sofreu durante o período? (Ex: Se caiu de 10 mil para 8 mil, foi um drawdown de 20%).</p>
            </div>
          </div>
        </section>

        {/* 4. O Gráfico Principal */}
        <section className="learn-bt-section">
          <div className="learn-bt-section-header">
            <div className="learn-bt-badge">4</div>
            <h2>O Gráfico Principal (Curva de Capital)</h2>
          </div>
          <div className="learn-bt-card">
            <p>Esta é a aba padrão (Curva de Patrimônio). Ela mostra o "caminho" do seu dinheiro.</p>
            <ul className="learn-bt-list">
              <li>
                <span className="dot strat"></span>
                <span><strong>Linha Principal (Estratégia):</strong> Como o seu dinheiro (ex: os 10 mil iniciais) cresceu ou diminuiu usando a regra escolhida.</span>
              </li>
              <li>
                <span className="dot bh"></span>
                <span><strong>Linha Pontilhada (Buy & Hold):</strong> Como seu dinheiro estaria se você não tivesse feito nada além de comprar no início.</span>
              </li>
            </ul>
            <p className="learn-bt-highlight center">
              <strong>O objetivo é que a linha principal termine ACIMA da linha pontilhada.</strong>
            </p>
          </div>
        </section>

        {/* 5. Sinais no Gráfico */}
        <section className="learn-bt-section">
          <div className="learn-bt-section-header">
            <div className="learn-bt-badge">5</div>
            <h2>Aba "Sinais no Gráfico"</h2>
          </div>
          <div className="learn-bt-card">
            <p>Clique nesta aba para ver exatamente ONDE a estratégia tomou decisões (É o gráfico de preços da ação):</p>
            <ul className="learn-bt-list">
              <li>
                <span className="profit">▲</span>
                <span><strong>Setas Verdes:</strong> Dias em que a regra mandou comprar.</span>
              </li>
              <li>
                <span className="loss">▼</span>
                <span><strong>Setas Vermelhas:</strong> Dias em que a regra mandou vender.</span>
              </li>
            </ul>
            <p>
              Isso ajuda a entender a lógica: a estratégia está comprando na baixa e vendendo na alta? Ou está entrando atrasada? Além das setas, nesta aba podem aparecer as linhas do indicador que guiou a decisão (como <strong>MM31 e MM50</strong> se você rodou Cruzamento de Médias).
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
