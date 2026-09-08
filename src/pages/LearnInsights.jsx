import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Search, CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, Target, Zap, ShieldAlert, BarChart2 } from 'lucide-react';
import './LearnInsights.css';

export default function LearnInsights() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="learn-ins-page">
      <div className="learn-ins-container">
        
        {/* Header */}
        <header className="learn-ins-header">
          <Link to="/insights" className="learn-ins-back">
            <ArrowLeft size={18} />
            Voltar para Insights IA
          </Link>
          <div className="learn-ins-title-wrapper">
            <Sparkles size={32} className="learn-ins-title-icon" />
            <h1>Como usar os Insights IA Preditivos</h1>
          </div>
          <p className="learn-ins-subtitle">
            A funcionalidade <strong>Insights IA Preditivos</strong> é como ter uma equipe de 10 analistas financeiros trabalhando para você em tempo real. Em vez de você olhar para dezenas de gráficos e indicadores confusos, a nossa IA (Inteligência Artificial) processa todos esses dados matemáticos e cospe a resposta mastigada: <em>"Isso é bom ou ruim?"</em>.
            <br/><br/>
            Ela pega cálculos complexos e transforma em cartões simples de ler.
          </p>
        </header>

        {/* 1. Como começar */}
        <section className="learn-ins-section">
          <div className="learn-ins-section-header">
            <div className="learn-ins-badge">1</div>
            <h2>Como começar (A Busca)</h2>
          </div>
          <div className="learn-ins-card">
            <p>No topo da página, você verá uma barra de busca igual à da Análise Técnica:</p>
            <ul className="learn-ins-list">
              <li>
                <Search size={16} className="text-ins-accent" />
                <span><strong>Ticker:</strong> Digite o código da ação (ex: <code>PETR4</code>, <code>WEGE3</code>).</span>
              </li>
            </ul>
            <p className="learn-ins-highlight">
              Assim que você clica em <strong>Analisar</strong>, a IA começa a calcular 10 modelos diferentes simultaneamente. Cada modelo gera um "Cartão de Insight".
            </p>
          </div>
        </section>

        {/* 2. Entendendo um Cartão */}
        <section className="learn-ins-section">
          <div className="learn-ins-section-header">
            <div className="learn-ins-badge">2</div>
            <h2>Entendendo um Cartão de Insight</h2>
          </div>
          <p className="learn-ins-intro">Cada cartão é o resultado de um robô especialista. Para ler um cartão, preste atenção nestes 4 elementos:</p>
          
          <div className="learn-ins-card layout-grid">
            <div className="ins-visual-guide">
              <div className="ins-guide-card">
                <div className="ins-guide-top">
                  <strong>Título</strong>
                  <span className="ins-guide-pill profit"><TrendingUp size={12}/> Sinal Principal</span>
                </div>
                <div className="ins-guide-val">Valor ou Gráfico</div>
                <div className="ins-guide-desc">Explicação breve sobre a métrica...</div>
                <div className="ins-guide-bar">Barra de Confiança</div>
              </div>
            </div>
            
            <div className="ins-guide-text">
              <ul className="learn-ins-list no-bg">
                <li>
                  <span className="dot ins-title"></span>
                  <span><strong>Título:</strong> O que está sendo analisado (ex: "Força da Tendência").</span>
                </li>
                <li>
                  <span className="dot ins-signal"></span>
                  <span>
                    <strong>Sinal Principal (O Veredito):</strong> É a "pílula" colorida no canto direito.
                    <div className="ins-signal-types">
                      <div className="ins-sig-type"><span className="profit">Verde (Alta):</span> Sinal positivo, indica força compradora.</div>
                      <div className="ins-sig-type"><span className="loss">Vermelho (Baixa):</span> Sinal negativo, indica força vendedora.</div>
                      <div className="ins-sig-type"><span className="warning">Amarelo (Atenção):</span> Sinal de alerta (ex: a ação subiu demais e pode cair).</div>
                      <div className="ins-sig-type"><span className="neutral">Cinza (Neutro):</span> Sem sinal claro no momento.</div>
                    </div>
                  </span>
                </li>
                <li>
                  <span className="dot ins-val"></span>
                  <span><strong>Valor/Gráfico:</strong> O número atual ou um pequeno gráfico (sparkline) mostrando o comportamento recente.</span>
                </li>
                <li>
                  <span className="dot ins-conf"></span>
                  <span><strong>Barra de Confiança:</strong> Uma barrinha colorida no fundo do cartão. Quanto mais cheia, mais certeza matemática a IA tem sobre aquele sinal.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* 3. Categorias de Insights */}
        <section className="learn-ins-section">
          <div className="learn-ins-section-header">
            <div className="learn-ins-badge">3</div>
            <h2>Categorias de Insights</h2>
          </div>
          <p className="learn-ins-intro">Você pode filtrar os cartões usando os botões acima deles (Todos, Técnico, Preditivo, Risco). Aqui está o que cada um significa:</p>
          
          <div className="learn-ins-cats-grid">
            
            {/* Técnicos */}
            <div className="learn-ins-cat-card">
              <div className="learn-ins-cat-header tech">
                <BarChart2 size={20} />
                <h3>Análises Técnicas</h3>
                <span>(O que está acontecendo agora)</span>
              </div>
              <div className="learn-ins-cat-body">
                <div className="learn-ins-item">
                  <h4>Força da Tendência</h4>
                  <p>Mede se a ação está subindo ou caindo com vontade, usando médias e MACD.</p>
                </div>
                <div className="learn-ins-item">
                  <h4>Momento (RSI)</h4>
                  <p>Mede a "velocidade". Se o carro (ação) acelerou demais, o sinal fica amarelo (Sobrecomprado). Se freou demais, fica verde (Sobrevendido - barato).</p>
                </div>
                <div className="learn-ins-item">
                  <h4>Pressão de Volume</h4>
                  <p>Analisa se as subidas estão acontecendo com muito dinheiro entrando (bom) ou se as quedas estão com muito dinheiro saindo (ruim).</p>
                </div>
              </div>
            </div>

            {/* Preditivos */}
            <div className="learn-ins-cat-card">
              <div className="learn-ins-cat-header pred">
                <Target size={20} />
                <h3>Análises Preditivas</h3>
                <span>(Tentando ver o futuro)</span>
              </div>
              <div className="learn-ins-cat-body">
                <div className="learn-ins-item">
                  <h4>Z-Score (Reversão à Média)</h4>
                  <p>Um nome chique para responder: <em>"O preço atual está muito fora do normal?"</em>. Se estiver muito acima do histórico, a IA avisa que pode cair.</p>
                </div>
                <div className="learn-ins-item">
                  <h4>Fluxo de Dinheiro (MFI)</h4>
                  <p>Parece com o RSI, mas leva em conta o volume de dinheiro. Mostra se os "peixes grandes" estão colocando ou tirando dinheiro da ação.</p>
                </div>
                <div className="learn-ins-item">
                  <h4>Índice de Força (EFI)</h4>
                  <p>Combina o tamanho da alta/queda com o volume. Uma alta com sinal forte no EFI significa que a tendência tem combustível para continuar.</p>
                </div>
              </div>
            </div>

            {/* Risco */}
            <div className="learn-ins-cat-card full-width">
              <div className="learn-ins-cat-header risk">
                <ShieldAlert size={20} />
                <h3>Análises de Risco</h3>
                <span>(Protegendo seu dinheiro)</span>
              </div>
              <div className="learn-ins-cat-body grid-2-cols">
                <div className="learn-ins-item">
                  <h4>Aperto de Bollinger (Squeeze)</h4>
                  <p>A IA analisa as Bandas de Bollinger. Quando o sinal é "Aperto Iminente", significa que a ação está parada há muito tempo e deve dar um "tiro" (explodir de preço) para cima ou para baixo muito em breve.</p>
                </div>
                <div className="learn-ins-item">
                  <h4>Volatilidade Histórica (Risco)</h4>
                  <p>Mede o quão "nervosa" a ação está. Se estiver alta, significa que o preço está variando violentamente (maior risco).</p>
                </div>
                <div className="learn-ins-item">
                  <h4>Distância da Média 200d</h4>
                  <p>A média de 200 dias é o "centro de gravidade" de longo prazo. Se a ação está longe demais (sinal de Atenção), a gravidade pode puxá-la de volta.</p>
                </div>
              </div>
            </div>

          </div>
        </section>

      </div>
    </div>
  );
}
