import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, Activity, BarChart2, TrendingUp, Layers, Minus, AlertCircle } from 'lucide-react';
import './LearnTechnicalAnalysis.css';

export default function LearnTechnicalAnalysis() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="learn-ta-page">
      <div className="learn-ta-container">
        
        {/* Header com botão de voltar */}
        <header className="learn-ta-header">
          <Link to="/analise-tecnica" className="learn-ta-back">
            <ArrowLeft size={18} />
            Voltar para Análise Técnica
          </Link>
          <div className="learn-ta-title-wrapper">
            <Activity size={32} className="learn-ta-title-icon" />
            <h1>Como usar a Análise Técnica Automatizada</h1>
          </div>
          <p className="learn-ta-subtitle">
            A funcionalidade <strong>Análise Técnica Automatizada</strong> é o seu "analista gráfico de bolso". Em vez de você ter que abrir um software complexo de gráficos de bolsa, traçar linhas manualmente, calcular fibonacci ou tentar adivinhar padrões visuais, o <strong>InvestorIA</strong> faz todo esse trabalho pesado matematicamente em segundos.
            <br/><br/>
            Ela serve para te dar uma leitura visual e estatística de como os investidores estão se comportando em relação a uma ação, ajudando a identificar os melhores momentos para comprar ou vender.
          </p>
        </header>

        {/* 1. Como começar */}
        <section className="learn-ta-section">
          <div className="learn-ta-section-header">
            <div className="learn-ta-badge">1</div>
            <h2>Como começar (A Busca)</h2>
          </div>
          <div className="learn-ta-card">
            <p>No topo da página, você verá uma barra de busca:</p>
            <ul className="learn-ta-list">
              <li>
                <Search size={16} className="text-ai-accent" />
                <span><strong>Ticker:</strong> Digite o código da ação (ex: <code>PETR4</code>, <code>WEGE3</code>).</span>
              </li>
              <li>
                <CalendarIcon />
                <span><strong>Período:</strong> Escolha o horizonte de tempo que deseja analisar (1 mês, 3 meses, 6 meses ou 1 ano). Para análises de curto prazo (operações rápidas), 1 a 3 meses é o ideal. Para médio prazo, use 6 meses ou 1 ano.</span>
              </li>
            </ul>
            <p className="learn-ta-highlight">Clique em <strong>Analisar</strong>. Assim que a análise carrega, a tela se divide em Cartões de Resumo no topo, a área de Gráficos à esquerda, e o Painel de Leitura à direita.</p>
          </div>
        </section>

        {/* 2. Os Cartões de Resumo */}
        <section className="learn-ta-section">
          <div className="learn-ta-section-header">
            <div className="learn-ta-badge">2</div>
            <h2>Os Cartões de Resumo (O Panorama Rápido)</h2>
          </div>
          <p className="learn-ta-intro">Antes de olhar os gráficos, leia os cartões no topo para ter a "temperatura" da ação:</p>
          
          <div className="learn-ta-grid">
            <div className="learn-ta-grid-card">
              <h3>Último Fechamento</h3>
              <p>O preço atual da ação no mercado.</p>
            </div>
            <div className="learn-ta-grid-card">
              <h3>Tendência <TrendingUp size={14} className="inline-icon profit" /></h3>
              <p>Aponta de forma clara se a força principal do ativo no período selecionado é de Alta (compradores no controle) ou Baixa (vendedores no controle).</p>
            </div>
            <div className="learn-ta-grid-card">
              <h3>RSI (14)</h3>
              <p>Um número de 0 a 100 que mostra se a ação está "esticada". Se estiver muito alto (sobrecomprado), pode estar cara demais para comprar agora. Se estiver muito baixo (sobrevendido), pode ser uma oportunidade barata.</p>
            </div>
            <div className="learn-ta-grid-card">
              <h3>Padrões / Suportes</h3>
              <p>Mostra quantos padrões visuais (como "Martelos" ou "Engolfos") a IA encontrou e quantas barreiras de preço (suportes e resistências) existem.</p>
            </div>
          </div>
        </section>

        {/* 3. A Área de Gráficos */}
        <section className="learn-ta-section">
          <div className="learn-ta-section-header">
            <div className="learn-ta-badge">3</div>
            <h2>A Área de Gráficos (O Coração da Análise)</h2>
          </div>
          <p className="learn-ta-intro">No lado esquerdo, você tem os gráficos interativos. Você pode alternar entre 3 abas diferentes:</p>
          
          <div className="learn-ta-tabs-explanation">
            <div className="learn-ta-tab-item">
              <h3><BarChart2 size={18}/> Aba "Preço" (O Gráfico Principal)</h3>
              <p>Este é o famoso gráfico de <strong>Candlesticks</strong> (velas). Cada "vela" verde é um dia em que a ação subiu, e vermelha, um dia em que caiu. Em cima do gráfico de preço, você pode ativar ou desativar Sobreposições clicando nos botões acima do gráfico:</p>
              <ul className="learn-ta-list">
                <li><span><strong>MM20 e MM50:</strong> São as Médias Móveis. Elas suavizam o gráfico mostrando o preço médio dos últimos 20 ou 50 dias. Se o preço está acima dessas linhas, é um forte sinal de alta.</span></li>
                <li><span><strong>Bollinger:</strong> Desenha um "túnel" azul ao redor do preço. O preço costuma viajar dentro desse túnel. Se o preço toca o teto do túnel, a ação esticou demais e tende a cair. Se toca o chão, tende a subir.</span></li>
                <li><span><strong>Tendência:</strong> Desenha uma linha reta pontilhada (verde ou vermelha) baseada em estatística para mostrar a direção matemática pura do ativo.</span></li>
              </ul>
            </div>

            <div className="learn-ta-tab-item">
              <h3><Activity size={18}/> Aba "RSI" (Índice de Força Relativa)</h3>
              <p>Um gráfico auxiliar simples. Funciona como um velocímetro do carro:</p>
              <ul className="learn-ta-list">
                <li><span className="loss">Se a linha amarela passar da linha vermelha tracejada no topo (70), o mercado acelerou demais e uma correção (queda) é provável.</span></li>
                <li><span className="profit">Se a linha cair abaixo da linha verde no fundo (30), o mercado freou forte demais e uma reversão de alta pode acontecer.</span></li>
              </ul>
            </div>

            <div className="learn-ta-tab-item">
              <h3><BarChart2 size={18}/> Aba "MACD"</h3>
              <p>É um indicador de "momento". Ele ajuda a confirmar a direção do mercado:</p>
              <ul className="learn-ta-list">
                <li><span className="profit"><strong>Barras Verdes (Histograma):</strong> Indicam que a força compradora está aumentando.</span></li>
                <li><span className="loss"><strong>Barras Vermelhas:</strong> Indicam que a força vendedora está assumindo o controle.</span></li>
              </ul>
            </div>
          </div>
        </section>

        {/* 4. O Painel da Direita */}
        <section className="learn-ta-section">
          <div className="learn-ta-section-header">
            <div className="learn-ta-badge">4</div>
            <h2>O Painel da Direita (O Resumo da IA)</h2>
          </div>
          <p className="learn-ta-intro">À direita dos gráficos, a IA traduz o desenho do gráfico em informações práticas para você tomar decisões:</p>
          
          <div className="learn-ta-grid panels-grid">
            <div className="learn-ta-card">
              <div className="learn-ta-card-header">
                <Layers size={18} className="text-ai-accent" />
                <h3>Retrações de Fibonacci</h3>
              </div>
              <p>O sistema calcula automaticamente do ponto mais baixo ao ponto mais alto do período e traça linhas imaginárias. Pense nelas como "redes de segurança". Se o preço da ação começar a cair, ele tende a parar e voltar a subir exatamente nos percentuais clássicos de Fibonacci (como 38%, 50% ou 61%). A IA te mostra em qual dessas redes o preço atual está mais próximo.</p>
            </div>

            <div className="learn-ta-card">
              <div className="learn-ta-card-header">
                <Minus size={18} className="text-ai-accent" />
                <h3>Suporte & Resistência</h3>
              </div>
              <p>Onde é seguro comprar? Onde é arriscado manter?</p>
              <ul className="learn-ta-list">
                <li><span className="profit"><strong>Suportes (Verdes, abaixo do preço atual):</strong> São como o "chão". São preços onde a ação caiu no passado e os compradores entraram com força, impedindo que caísse mais. São bons pontos para pensar em compras.</span></li>
                <li><span className="loss"><strong>Resistências (Vermelhas, acima do preço atual):</strong> São como o "teto". Preços onde, no passado, muita gente decidiu vender e empurrou a ação para baixo. Fique atento se a ação se aproximar de uma resistência.</span></li>
              </ul>
            </div>

            <div className="learn-ta-card" style={{ gridColumn: '1 / -1' }}>
              <div className="learn-ta-card-header">
                <AlertCircle size={18} className="text-ai-accent" />
                <h3>Padrões de Candles</h3>
              </div>
              <p>O comportamento humano deixa rastros no gráfico através dos formatos das "velas" (candles). A IA analisa as velas dos últimos dias e procura formações clássicas (como o <strong>Doji</strong> indicando indecisão, ou o <strong>Martelo</strong> indicando que a queda acabou). Se algum padrão importante aconteceu recentemente, a IA te alertará aqui, dizendo qual o padrão, quando aconteceu e se é um sinal altista, baixista ou neutro.</p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

// Icon helper
function CalendarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ai-accent"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
  )
}
