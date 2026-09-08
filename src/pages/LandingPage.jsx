import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  TrendingUp, BarChart2, FlaskConical, Sparkles, FileText, Trophy,
  MessageSquare, ChevronDown, Shield, Clock, Zap, ArrowRight,
  Bot, Activity, Layers, Search, CheckCircle2, Star, Users, X, BookOpen
} from 'lucide-react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import HeroParticles from './HeroParticles';
import './LandingPage.css';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ══════════════════════════════════════════════════════════════════
   COUNTDOWN HOOK
   ══════════════════════════════════════════════════════════════════ */
function useCountdown(targetDate) {
  const calcTimeLeft = useCallback(() => {
    const diff = new Date(targetDate) - new Date();
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    };
  }, [targetDate]);

  const [timeLeft, setTimeLeft] = useState(calcTimeLeft);
  useEffect(() => {
    const id = setInterval(() => setTimeLeft(calcTimeLeft()), 1000);
    return () => clearInterval(id);
  }, [calcTimeLeft]);
  return timeLeft;
}

/* ══════════════════════════════════════════════════════════════════
   TOAST COMPONENT
   ══════════════════════════════════════════════════════════════════ */
const TOAST_MESSAGES = [
  { icon: '⚡', text: 'Marcos S. de SP assinou o plano PRO', time: 'agora mesmo' },
  { icon: '🎯', text: 'Análise preditiva de PETR4 gerada', time: 'há 2 min' },
  { icon: '🛡️', text: 'Novo investidor entrou para o InvestorIA', time: 'há 12 min' },
  { icon: '💎', text: 'Camila L. entrou para o plano Elite', time: 'há 45 min' },
  { icon: '⚡', text: 'Lucas Santos assinou o plano Elite', time: 'há 3 min' },
  { icon: '🎯', text: 'Insights gerados com sucesso!', time: 'há 2 min' },
  { icon: '🛡️', text: 'Novo investidor entrou para o InvestorIA', time: 'agora mesmo' },
  { icon: '💎', text: 'Maria F. assinou o plano PRO', time: 'há 7 min' }
];

function RecentActivityToast() {
  const [currentToast, setCurrentToast] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        if (!dismissed) {
          setCurrentToast((prev) => (prev + 1) % TOAST_MESSAGES.length);
          setVisible(true);
        }
      }, 500);
    }, 8000);

    setTimeout(() => setVisible(true), 2500);
    return () => clearInterval(interval);
  }, [dismissed]);

  if (dismissed) return null;
  const msg = TOAST_MESSAGES[currentToast];

  return (
    <div className={`lp-toast-notification ${visible ? 'show' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-lg shrink-0 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
          {msg.icon}
        </div>
        <div className="flex flex-col pr-4">
          <span className="text-xs text-white font-medium">{msg.text}</span>
          <span className="text-[10px] text-zinc-500 mt-0.5">{msg.time}</span>
        </div>
      </div>
      <button onClick={() => { setDismissed(true); setVisible(false); }} className="absolute top-2 right-2 text-zinc-500 hover:text-white transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   FAQ ITEM
   ══════════════════════════════════════════════════════════════════ */
function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`lp-faq-item ${open ? 'open' : ''}`} data-rv>
      <button className="lp-faq-q" onClick={() => setOpen(v => !v)}>
        {q}
        <ChevronDown size={18} className="transform transition-transform duration-300" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
      </button>
      <div className="lp-faq-a"><p className="text-zinc-400">{a}</p></div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   DATA
   ══════════════════════════════════════════════════════════════════ */
const BENEFITS = [
  { icon: '🤖', title: 'Seu Analista Pessoal 24/7', desc: 'Converse com a IA sobre qualquer ação da B3 e receba análises instantâneas com dados fundamentalistas e técnicos.' },
  { icon: '📊', title: 'Análise Técnica Completa', desc: 'Candlestick, RSI, MACD, Bandas de Bollinger, Fibonacci e suporte/resistência — tudo em um único clique.' },
  { icon: '🧪', title: 'Teste Antes de Investir', desc: 'Simule estratégias com dados históricos reais de até 5 anos e veja se seu método funciona antes de arriscar dinheiro.' },
  { icon: '⚡', title: '10 Insights Preditivos', desc: 'Modelos quantitativos que identificam padrões invisíveis: anomalia de volume, smart money, aceleração de preço e mais.' },
  { icon: '🏆', title: 'Fórmula Mágica Integrada', desc: 'O método de Joel Greenblatt aplicado automaticamente para encontrar as ações mais subvalorizadas do mercado.' },
];

const FEATURES = [
  {
    icon: MessageSquare,
    title: 'Chat com IA Especialista',
    desc: 'Tire dúvidas e faça perguntas em linguagem natural 24 horas por dia. O assistente inteligente analisa qualquer ação da B3, interpretando indicadores fundamentalistas e técnicos para te entregar respostas claras e objetivas em segundos.'
  },
  {
    icon: Activity,
    title: 'Análise Técnica',
    desc: 'Visualize padrões de candlestick com overlays de médias móveis, RSI, Bollinger e tendências de forma limpa e intuitiva.',
    note: 'Observação: há um guia de aprendizado dos termos técnicos dentro do InvestorIA'
  },
  {
    icon: FlaskConical,
    title: 'Backtesting',
    desc: 'Simule e comprove a eficiência de suas estratégias usando dados históricos reais do mercado antes de arriscar seu dinheiro. Avalie o retorno potencial, histórico de acertos e controle de riscos de maneira simples e visual, sem precisar programar nada.',
    note: 'Observação: há um guia de aprendizado dos termos técnicos dentro do InvestorIA'
  },
  {
    icon: Sparkles,
    title: 'Insights Preditivos',
    desc: 'Receba alertas e detecções automáticas de oportunidades ocultas no mercado, como surtos atípicos de volume e acelerações de preço. Nossos modelos quantitativos monitoram o mercado continuamente e classificam o nível de confiança de cada sinal em tempo real.',
    note: 'Observação: há um guia de aprendizado dos termos técnicos dentro do InvestorIA'
  },
  {
    icon: Layers,
    title: 'Fórmula Mágica',
    desc: 'O consagrado método de Joel Greenblatt aplicado automaticamente para encontrar as ações mais subvalorizadas e lucrativas da B3.'
  },
  {
    icon: Search,
    title: 'Comparação de Ações',
    desc: 'Compare múltiplos ativos lado a lado com indicadores fundamentalistas e técnicos completos para tomar decisões mais seguras.'
  },
  {
    icon: BookOpen,
    title: 'Indicadores Básicos Educativos',
    desc: 'Aprenda o que é cada indicador fundamentalista, como analisá-lo e seus pontos de atenção com nosso guia rápido embutido para investidores que estão começando.'
  },
];

const OBJECTIONS = [
  { q: '"É seguro confiar na IA para investir?"', a: 'O InvestorIA possui sistema de segurança multicamadas: RBAC (controle de acesso), audit log, criptografia AES-256, filtro cognitivo anti-viés e firewall de IA. A plataforma analisa e recomenda — a decisão final é sempre sua.' },
  { q: '"Não entendo nada de análise técnica."', a: 'Não precisa entender. A IA traduz gráficos complexos em linguagem simples. Você pergunta "Como está a PETR4?" e recebe uma explicação clara, sem jargões. É como ter um professor particular de investimentos.' },
  { q: '"Não tenho tempo para mais uma ferramenta."', a: 'Em 2 minutos você recebe uma análise que levaria horas para fazer manualmente. A IA trabalha 24/7, monitora o mercado e gera insights enquanto você foca no que importa. Menos planilhas, mais resultados.' },
];

const WHOM = [
  'Quer investir na B3 mas não sabe por onde começar',
  'Já investe mas perde oportunidades por falta de tempo',
  'Está cansado de seguir "dicas quentes" que não funcionam',
  'Quer testar estratégias antes de arriscar dinheiro real',
  'Precisa de análises técnicas mas não domina gráficos',
  'Busca uma ferramenta profissional sem curva de aprendizado',
];

const FAQS = [
  { q: 'Como funciona o acesso à plataforma?', a: 'Após a assinatura, você recebe acesso imediato ao painel web. Basta fazer login e começar a usar todos os recursos do seu plano. Funciona em qualquer navegador, no computador ou celular.' },
  { q: 'Preciso ter experiência com investimentos?', a: 'Não. O InvestorIA foi projetado para todos os níveis. A IA explica conceitos complexos em linguagem simples e guia você passo a passo. Se você sabe digitar uma pergunta, sabe usar a plataforma.' },
  { q: 'Em quanto tempo vou ver resultados?', a: 'Você recebe sua primeira análise em menos de 2 minutos. O backtesting mostra resultados históricos na hora. Para resultados financeiros reais, depende da sua estratégia — a IA ajuda a construir uma.' },
  { q: 'Tem garantia? Posso cancelar?', a: 'Sim, oferecemos 7 dias de garantia incondicional. Se não gostar, devolvemos 100% do valor sem perguntas. Você pode cancelar a assinatura a qualquer momento sem multa.' },
  { q: 'A IA opera automaticamente na minha conta?', a: 'Não. O InvestorIA é uma ferramenta de análise e recomendação. Ele nunca acessa sua conta de corretora nem executa ordens. Todas as decisões de investimento são suas.' },
];

const TESTIMONIALS = [
  { name: 'Ricardo M.', role: 'Trader Iniciante', initial: 'R', text: 'Em 3 semanas usando o InvestorIA, identifiquei padrões que eu levaria meses estudando sozinho. O backtesting me mostrou que minha estratégia antiga perdia para o Buy & Hold — mudei e já estou 12% positivo.' },
  { name: 'Camila S.', role: 'Médica', initial: 'C', text: 'Eu não tinha tempo para analisar ações depois do plantão. Agora pergunto à IA "como está minha carteira?" e recebo um relatório completo em segundos. Economizo 5 horas por semana.' },
  { name: 'André L.', role: 'Empresário', initial: 'A', text: 'A Fórmula Mágica me ajudou a encontrar ações que meu assessor nunca mencionou. Os insights preditivos são impressionantes — o modelo de anomalia de volume acertou 3 movimentos seguidos.' },
];

const PRICE_PRO = 49.90;
const PRICE_ELITE = 59.90;

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const countdown = useCountdown('2026-07-31T23:59:59');
  const pad = (n) => String(n).padStart(2, '0');

  const [isAnnual, setIsAnnual] = useState(true);
  const calcPrice = (monthlyPrice) => isAnnual ? (monthlyPrice * 0.8).toFixed(2) : monthlyPrice.toFixed(2);
  const calcDaily = (monthlyPrice) => (isAnnual ? (monthlyPrice * 0.8) / 30 : monthlyPrice / 30).toFixed(2);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const handleMouseMove = useCallback((e) => {
    const { innerWidth, innerHeight } = window;
    const x = (e.clientX / innerWidth - 0.5) * 20; // max 10deg
    const y = (e.clientY / innerHeight - 0.5) * 20;
    setMousePos({ x, y });
  }, []);

  const containerRef = useRef(null);
  const trackWrapRef = useRef(null);
  const [lightboxImage, setLightboxImage] = useState(null);

  useGSAP(() => {
    // Hero Entrance Animation (Staggered)
    gsap.fromTo('.hero-reveal',
      { opacity: 0, y: 50 },
      { opacity: 1, y: 0, duration: 1.2, stagger: 0.15, ease: 'power4.out', delay: 0.2 }
    );

    // General Reveal animations for rest of page
    gsap.utils.toArray('[data-rv]').forEach(el => {
      gsap.fromTo(el,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%' }
        }
      );
    });

    // Hero parallax background
    gsap.to('.hero-bg', {
      yPercent: 15,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero-section',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });

    // Horizontal Scroll Pin (Ritual / Funcionalidades)
    if (trackWrapRef.current) {
      const slides = gsap.utils.toArray('.step-card');
      const trackWidth = trackWrapRef.current.scrollWidth;

      gsap.to(slides, {
        xPercent: -100 * (slides.length - 1),
        ease: 'none',
        scrollTrigger: {
          trigger: trackWrapRef.current,
          pin: true,
          scrub: 0.5,
          end: () => "+=" + (trackWrapRef.current.offsetWidth * 1.5)
        }
      });
    }
  }, { scope: containerRef });

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div ref={containerRef} className="relative w-full text-zinc-300">
      <RecentActivityToast />

      {/* ═══════════ URGENCY BAR ═══════════ */}
      <div className="lp-urgency-bar font-sans">
        <span className="hidden sm:inline">🔥 Vagas limitadas nos novos planos de IA</span>
        <span className="inline-flex items-center gap-1 bg-black/20 px-2 py-1 rounded-md text-xs font-mono tracking-widest">
          ⏳ {pad(countdown.days)}d {pad(countdown.hours)}h {pad(countdown.minutes)}m {pad(countdown.seconds)}s
        </span>
        <a href="#precos" onClick={(e) => { e.preventDefault(); scrollTo('precos'); }} className="bg-zinc-950 text-cyan-400 px-3 py-1 rounded-md text-xs font-bold hover:bg-zinc-900 transition-colors">
          Garantir vaga →
        </a>
      </div>

      {/* ═══════════ NAVBAR ═══════════ */}
      <nav className="fixed top-[44px] left-0 right-0 z-50 px-6 md:px-12 py-4 flex justify-between items-center bg-zinc-950/80 backdrop-blur-xl border-b border-white/5 transition-all">
        <a href="#" className="flex items-center gap-2 text-white no-underline group">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#121A2F] border border-blue-500/30 flex items-center justify-center shadow-lg shadow-[#121A2F]/50">
            <img
              src="/logo_hexagon.png"
              className="w-full h-full object-cover"
              alt="InvestorIA Logo"
            />
          </div>
          <span className="font-serif-display text-2xl font-normal tracking-tight">Investor<b className="text-cyan-400">IA</b></span>
        </a>
        <div className="hidden md:flex items-center gap-8">
          <a href="#beneficios" onClick={(e) => { e.preventDefault(); scrollTo('beneficios'); }} className="text-sm uppercase tracking-widest hover:text-cyan-400 transition-colors">Benefícios</a>
          <a href="#funcionalidades" onClick={(e) => { e.preventDefault(); scrollTo('funcionalidades'); }} className="text-sm uppercase tracking-widest hover:text-cyan-400 transition-colors">A Plataforma</a>
          <a href="#precos" onClick={(e) => { e.preventDefault(); scrollTo('precos'); }} className="text-sm uppercase tracking-widest hover:text-cyan-400 transition-colors">Planos</a>
        </div>
        <div className="flex gap-4">
          <a href="/login" className="hidden sm:flex px-5 py-2 items-center justify-center rounded-full border border-white/10 hover:border-white/30 transition-colors text-sm font-semibold uppercase tracking-widest text-white">Entrar</a>
          <a href="#precos" onClick={(e) => { e.preventDefault(); scrollTo('precos'); }} className="gs-te-cta relative overflow-hidden group px-5 py-2 rounded-[3px] bg-gradient-to-r from-cyan-400 to-blue-500 text-zinc-950 font-bold text-sm uppercase tracking-widest transition-transform hover:scale-105">
            <span className="relative z-10 flex items-center gap-2">Quero Investir com Estratégia <ArrowRight size={16} /></span>
          </a>
        </div>
      </nav>

      {/* ═══════════ HERO ═══════════ */}
      <header
        className="hero-section relative w-full h-[100dvh] flex flex-col items-center justify-center overflow-hidden bg-black pt-20"
        onMouseMove={handleMouseMove}
      >
        <HeroParticles />
        {/* Parallax Background */}
        <div className="hero-grid"></div>
        <div className="hero-glow-blob"></div>
        <div className="hero-bg absolute inset-[-10%] w-[120%] h-[120%] bg-aura-mesh opacity-70 z-0 pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-zinc-950/90 z-0 pointer-events-none"></div>

        {/* Floating Cards (Mouse Parallax) */}
        <div
          className="absolute hidden lg:flex top-1/4 left-[8%] hero-glass-card z-10 flex-col gap-2 w-48"
          style={{ transform: `rotateY(${mousePos.x}deg) rotateX(${-mousePos.y}deg) translateZ(30px)` }}
        >
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-cyan-400" />
            <span className="text-xs font-bold text-white uppercase tracking-widest">PETR4</span>
          </div>
          <span className="text-[10px] text-zinc-400">Análise de IA Concluída</span>
          <div className="text-sm font-bold text-green-400">+14.5% Upside</div>
        </div>

        <div
          className="absolute hidden lg:flex bottom-1/4 right-[8%] hero-glass-card z-10 flex-col gap-2 w-56"
          style={{ transform: `rotateY(${mousePos.x}deg) rotateX(${-mousePos.y}deg) translateZ(40px)` }}
        >
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-blue-500" />
            <span className="text-xs font-bold text-white uppercase tracking-widest">Insights</span>
          </div>
          <span className="text-xs text-zinc-300">Volume atípico detectado em BBAS3. Possível rompimento.</span>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-4xl mx-auto">
          <div className="hero-reveal inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-8">
            <Bot size={14} /> IA Especialista B3
          </div>

          <h1 className="hero-reveal font-serif-display text-5xl md:text-7xl lg:text-[6rem] leading-[0.9] text-white tracking-tight mb-8">
            De investidor perdido <br /> <em className="text-cyan-400 not-italic">para estrategista</em>
          </h1>

          <p className="hero-reveal text-lg md:text-xl text-zinc-400 font-light max-w-2xl leading-relaxed mb-12">
            A plataforma que analisa, simula e recomenda as melhores estratégias da B3 — enquanto você foca no que importa.
          </p>

          <div className="hero-reveal flex flex-col sm:flex-row gap-4">
            <a href="#precos" onClick={(e) => { e.preventDefault(); scrollTo('precos'); }} className="gs-te-cta relative group px-8 py-4 rounded bg-gradient-to-r from-cyan-400 to-blue-500 text-zinc-950 font-bold text-sm uppercase tracking-widest transition-transform hover:scale-105">
              Desbloquear Análises da B3 Agora
            </a>
            <a href="#funcionalidades" onClick={(e) => { e.preventDefault(); scrollTo('funcionalidades'); }} className="px-8 py-4 rounded border border-white/20 text-white font-bold text-sm uppercase tracking-widest hover:bg-white/5 transition-colors">
              Explorar Funcionalidades
            </a>
          </div>
        </div>
      </header>

      {/* ═══════════ MANIFESTO E COMPARAÇÃO ═══════════ */}
      <section className="wrap bg-zinc-950 relative" id="problema">
        <div className="max-w-3xl mx-auto text-center py-12 md:py-24">
          <span data-rv className="text-xs uppercase tracking-widest text-zinc-500 mb-6 block">O Cenário Atual</span>
          <p data-rv className="font-serif-display text-3xl md:text-5xl leading-[1.1] text-white mb-8">
            Você abre o home broker e vê dezenas de ações. <em className="text-cyan-400 not-italic">Não sabe se é hora de comprar, vender ou esperar.</em>
          </p>
          <p data-rv className="text-lg text-zinc-400 font-light leading-relaxed mb-6">
            Enquanto você hesita, investidores com as ferramentas certas já estão capturando oportunidades que passaram despercebidas. O mercado não espera. Cada dia sem um método claro é um dia de oportunidades perdidas.
          </p>
          <p data-rv className="text-lg text-zinc-400 font-light leading-relaxed mb-16">
            E se você tivesse um analista pessoal que trabalha 24h por dia, não tem viés emocional e analisa dados que levariam semanas? <strong className="text-white font-normal">Esse analista existe. Chama-se InvestorIA.</strong>
          </p>
        </div>

        <div className="max-w-5xl mx-auto pb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12" data-rv>
            {/* Old Way */}
            <div className="lp-comp-card old-way">
              <div className="lp-comp-header">
                <h3 className="font-serif-display text-2xl text-zinc-300">Sem InvestorIA</h3>
                <span className="text-xs font-mono text-red-400 border border-red-400/20 bg-red-400/5 px-2 py-1 rounded">O Caminho Lento</span>
              </div>
              <ul className="lp-comp-list">
                <li><span className="icon">❌</span> Horas perdidas em planilhas e dezenas de guias abertas.</li>
                <li><span className="icon">❌</span> Comprar ações na alta e vender na baixa por impulso.</li>
                <li><span className="icon">❌</span> Pagar R$ 150/mês em carteiras recomendadas de prateleira.</li>
                <li><span className="icon">❌</span> Operar às cegas sem backtesting para provar sua estratégia.</li>
                <li><span className="icon">❌</span> Depender de "dicas" de fóruns e grupos de WhatsApp.</li>
              </ul>
            </div>

            {/* New Way */}
            <div className="lp-comp-card new-way">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 to-blue-500"></div>
              <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-xl blur opacity-20 pointer-events-none"></div>
              <div className="lp-comp-header relative z-10">
                <h3 className="font-serif-display text-2xl text-white">Com InvestorIA <Sparkles size={20} className="inline text-cyan-400 ml-1" /></h3>
                <span className="text-xs font-mono text-cyan-400 border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 rounded text-center leading-none flex items-center">Estrategista</span>
              </div>
              <ul className="lp-comp-list relative z-10">
                <li><span className="icon">✅</span> Análises fundamentalistas e técnicas prontas em 10 segundos.</li>
                <li><span className="icon">✅</span> IA imune a vieses emocionais monitorando o mercado 24/7.</li>
                <li><span className="icon">✅</span> 10 modelos preditivos avançados identificando oportunidades.</li>
                <li><span className="icon">✅</span> Teste estratégias sem programar e prove o que realmente funciona.</li>
                <li><span className="icon">✅</span> Tecnologias de elite por uma fração do preço (a partir de R$ 1,86/dia).</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ BENEFÍCIOS (SPLIT LAYOUT) ═══════════ */}
      <section className="wrap bg-zinc-950 border-t border-white/5" id="beneficios">

        {/* Split 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center mb-32">
          <div data-rv className="relative rounded-xl overflow-hidden aspect-[4/3] bg-zinc-900 border border-white/5 p-0 flex items-center justify-center group">
            <video
              autoPlay
              loop
              muted={true}
              playsInline
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 pointer-events-none"
            >
              <source src="/videos/AI_teaching_man_to_invest.mp4" type="video/mp4" />
            </video>
          </div>
          <div className="flex flex-col justify-center">
            <span data-rv className="text-xs uppercase tracking-widest text-zinc-500 mb-4">01 · Inteligência</span>
            <h2 data-rv className="font-serif-display text-4xl md:text-5xl text-white leading-tight mb-6">Seu Analista Pessoal <em className="text-cyan-400 not-italic">24/7.</em></h2>
            <p data-rv className="text-zinc-400 text-lg font-light leading-relaxed mb-8">
              {BENEFITS[0].desc}
            </p>
            <div data-rv className="flex flex-wrap gap-4 mt-4">
              <div className="flex-1 min-w-[140px]">
                <div className="text-cyan-400 font-mono text-sm tracking-wider mb-1">01 · Natural</div>
                <div className="text-sm text-zinc-300">Linguagem humana</div>
              </div>
              <div className="flex-1 min-w-[140px]">
                <div className="text-cyan-400 font-mono text-sm tracking-wider mb-1">02 · Profundo</div>
                <div className="text-sm text-zinc-300">Fundamentos B3</div>
              </div>
            </div>
          </div>
        </div>

        {/* Split 2 (Reversed on desktop) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
          <div className="flex flex-col justify-center order-2 lg:order-1">
            <span data-rv className="text-xs uppercase tracking-widest text-zinc-500 mb-4">02 · Estratégia</span>
            <h2 data-rv className="font-serif-display text-4xl md:text-5xl text-white leading-tight mb-6">Teste Antes de <em className="text-cyan-400 not-italic">Investir.</em></h2>
            <p data-rv className="text-zinc-400 text-lg font-light leading-relaxed mb-8">
              {BENEFITS[2].desc}
            </p>
            <div data-rv className="flex flex-wrap gap-6 mt-4">
              <div className="flex-1 min-w-[180px]">
                <div className="text-cyan-400 font-mono text-sm tracking-wider mb-1">01 · Sem Código</div>
                <div className="text-sm text-zinc-300">Valide estratégias complexas (médias, RSI, Bollinger) apenas preenchendo parâmetros simples.</div>
              </div>
              <div className="flex-1 min-w-[180px]">
                <div className="text-cyan-400 font-mono text-sm tracking-wider mb-1">02 · Métricas Claras</div>
                <div className="text-sm text-zinc-300">Analise retorno total, Sharpe Ratio, Taxa de Acerto e Drawdown de forma imediata.</div>
              </div>
            </div>
          </div>
          <div data-rv className="relative rounded-xl overflow-hidden bg-zinc-900 border border-white/10 p-2 flex items-center justify-center order-1 lg:order-2 group shadow-2xl shadow-cyan-500/5 cursor-zoom-in" onClick={() => setLightboxImage('/images/backtesting.png')}>
            <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 to-blue-500/10 opacity-30 z-0"></div>
            <img
              src="/images/backtesting.png"
              alt="Backtesting de estratégias sem código no InvestorIA"
              className="w-full h-auto object-contain rounded-lg border border-white/5 opacity-90 group-hover:opacity-100 group-hover:scale-102 transition-all duration-700 relative z-10"
            />
          </div>
        </div>

        {/* Split 3 (Showcase Real Dashboard) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center mt-32">
          <div data-rv className="relative rounded-xl overflow-hidden bg-zinc-900 border border-white/10 p-2 flex items-center justify-center group shadow-2xl shadow-cyan-500/5 cursor-zoom-in" onClick={() => setLightboxImage('/images/dashboard.png')}>
            <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 to-blue-500/10 opacity-30 z-0"></div>
            <img
              src="/images/dashboard.png"
              alt="Plataforma InvestorIA por dentro"
              className="w-full h-auto object-contain rounded-lg border border-white/5 opacity-90 group-hover:opacity-100 group-hover:scale-102 transition-all duration-700 relative z-10"
            />
          </div>
          <div className="flex flex-col justify-center">
            <span data-rv className="text-xs uppercase tracking-widest text-zinc-500 mb-4">03 · Resultados</span>
            <h2 data-rv className="font-serif-display text-4xl md:text-5xl text-white leading-tight mb-6">
              Pare de adivinhar. <br />
              <em className="text-cyan-400 not-italic">Decida com dados.</em>
            </h2>
            <p data-rv className="text-zinc-400 text-lg font-light leading-relaxed mb-8">
              A diferença entre o investidor comum e o de elite é o acesso à informação rápida. O InvestorIA resume notícias, calcula o sentimento do mercado e gera insights sobre qualquer ação da B3 em 2 minutos. Você economiza horas de pesquisa e investe com a certeza de um profissional.
            </p>
            <div data-rv className="flex flex-col gap-4 mt-2">
              <div className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded bg-cyan-400/10 flex items-center justify-center text-cyan-400 shrink-0">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <strong className="text-white block text-sm font-semibold">Resumos Instantâneos</strong>
                  <span className="text-xs text-zinc-400">Compilação automática de fatos relevantes sem precisar navegar por portais.</span>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-8 h-8 rounded bg-cyan-400/10 flex items-center justify-center text-cyan-400 shrink-0">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <strong className="text-white block text-sm font-semibold">Mapeamento de Oportunidades</strong>
                  <span className="text-xs text-zinc-400">Classificação visual de riscos e oportunidades do ativo analisado.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* ═══════════ RITUAL / FUNCIONALIDADES (HORIZONTAL PIN) ═══════════ */}
      <section className="bg-zinc-900 border-y border-white/5" id="funcionalidades">
        <div className="px-6 md:px-12 pt-24 pb-12">
          <span className="text-xs uppercase tracking-widest text-zinc-500 block text-center mb-4">03 · A Plataforma</span>
          <h2 className="font-serif-display text-4xl md:text-5xl text-white text-center">Tudo o que você precisa.</h2>
        </div>

        <div ref={trackWrapRef} className="track-wrap">
          <div className="track">
            {FEATURES.map((feature, i) => (
              <div key={i} className="step-card group p-8 lg:p-12">
                <div className="w-16 h-16 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 mb-8 group-hover:scale-110 transition-transform">
                  <feature.icon size={32} />
                </div>
                <div className="font-mono text-sm text-zinc-500 tracking-widest mb-4">MÓDULO 0{i + 1}</div>
                <h3 className="font-serif-display text-3xl text-white mb-4">{feature.title}</h3>
                <p className="text-zinc-400 text-lg leading-relaxed">{feature.desc}</p>
                {feature.note && (
                  <p className="text-xs text-zinc-500 mt-4 italic font-sans border-t border-white/5 pt-3">
                    {feature.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ PARA QUEM (NUMBERS GRID) ═══════════ */}
      <section className="wrap bg-zinc-950">
        <div className="text-center mb-16" data-rv>
          <span className="text-xs uppercase tracking-widest text-zinc-500 mb-4 block">Perfil</span>
          <h2 className="font-serif-display text-4xl md:text-5xl text-white">O InvestorIA é para você?</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {WHOM.map((item, i) => (
            <div key={i} data-rv className="bg-zinc-900/50 border border-white/5 p-6 rounded-lg flex gap-4 items-start hover:bg-zinc-900 transition-colors">
              <CheckCircle2 size={24} className="text-cyan-400 shrink-0" />
              <p className="text-sm text-zinc-300 leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ DEPOIMENTOS (SOCIAL PROOF) ═══════════ */}
      <section className="wrap bg-zinc-900/30 border-t border-white/5" id="depoimentos">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16" data-rv>
            <span className="text-xs uppercase tracking-widest text-cyan-400 mb-4 block">Prova Social</span>
            <h2 className="font-serif-display text-4xl md:text-5xl text-white">Quem usa, lucra e aprova.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} data-rv className="lp-testimonial-card relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/5 rounded-full blur-3xl"></div>
                <div className="flex gap-1 text-yellow-400 mb-6">
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                </div>
                <p className="text-zinc-300 font-light text-base leading-relaxed mb-8 flex-1 italic">"{t.text}"</p>
                <div className="flex items-center gap-4 mt-auto border-t border-white/5 pt-4">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center font-serif-display text-xl text-cyan-400 shrink-0">
                    {t.initial}
                  </div>
                  <div>
                    <h4 className="text-white font-medium text-sm">{t.name}</h4>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      {t.role} <CheckCircle2 size={12} className="text-cyan-400" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ PREÇOS (GRADES) ═══════════ */}
      <section className="wrap bg-zinc-950 border-t border-white/5 relative" id="precos">
        {/* Glow de fundo */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-3/4 h-1/2 bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="text-center mb-12 relative z-10" data-rv>
          <span className="text-xs uppercase tracking-widest text-zinc-500 mb-4 block">Investimento</span>
          <h2 className="font-serif-display text-4xl md:text-5xl text-white mb-8">Comece a ser Estrategista Agora</h2>

          {/* Toggle Anual/Mensal */}
          <div className="lp-toggle-switch">
            <div
              className="lp-toggle-indicator"
              style={{
                width: '120px',
                transform: isAnnual ? 'translateX(0)' : 'translateX(100%)'
              }}
            ></div>
            <button
              className={isAnnual ? 'active' : ''}
              onClick={() => setIsAnnual(true)}
              style={{ width: '120px' }}
            >
              Anual <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white ml-1">-30%</span>
            </button>
            <button
              className={!isAnnual ? 'active' : ''}
              onClick={() => setIsAnnual(false)}
              style={{ width: '120px' }}
            >
              Mensal
            </button>
          </div>
        </div>

        <div className="grades max-w-4xl mx-auto relative z-10">
          {/* Pro */}
          <div data-rv className="grade-card">
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">Avançado</span>
            <h3 className="font-serif-display text-3xl text-white mb-2">Pro</h3>
            {!isAnnual && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest mb-3 text-center inline-block">
                Apenas R$9,90 no primeiro mês
              </div>
            )}
            <p className="text-sm text-zinc-400 mb-6 flex-1">Acesso completo aos módulos de análise e documentos.</p>
            <div className="flex flex-col mb-8 pt-6 border-t border-white/10">
              <div className="flex items-baseline gap-1">
                <span className="font-serif-display text-5xl text-white">
                  {isAnnual ? 'R$419' : 'R$49'}
                </span>
                <span className="text-zinc-500">
                  {isAnnual ? ',90 /ano' : ',90 /mês'}
                </span>
              </div>
              <span className="text-xs text-cyan-400 font-mono mt-2 bg-cyan-400/10 inline-block w-fit px-2 py-1 rounded">
                Equivale a R$ {isAnnual ? '1,15' : '1,66'} / dia
              </span>
            </div>
            <ul className="flex flex-col gap-3 mb-8 text-sm text-zinc-300">
              <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-cyan-400" /> 5 Milhões de créditos/mês</li>
              <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-cyan-400" /> Acesso a todas as funcionalidades</li>
            </ul>
            <a href={isAnnual ? "https://pay.kiwify.com.br/ItjexKi" : "https://pay.kiwify.com.br/RfgfSyr"} target="_blank" rel="noopener noreferrer" className="w-full text-center py-3 rounded border border-cyan-400/30 text-cyan-400 font-bold text-xs uppercase tracking-widest hover:bg-cyan-400/10 transition-colors">
              {isAnnual ? "Assinar Pro anual" : "Assinar Pro mensal"}
            </a>
          </div>

          {/* Elite */}
          <div data-rv className="grade-card border-cyan-400/50 bg-gradient-to-b from-cyan-400/5 to-transparent relative shadow-[0_0_40px_rgba(34,211,238,0.1)]">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-cyan-400 text-zinc-950 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest">Mais Escolhido</div>
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 mb-2">Premium</span>
            <h3 className="font-serif-display text-3xl text-white mb-2">Elite</h3>
            {!isAnnual && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest mb-3 text-center inline-block">
                Apenas 19,90 no primeiro mês
              </div>
            )}
            <p className="text-sm text-zinc-400 mb-6 flex-1">Para quem exige o máximo, com limite extremo de IA e APIs.</p>
            <div className="flex flex-col mb-8 pt-6 border-t border-white/10">
              <div className="flex items-baseline gap-1">
                <span className="font-serif-display text-5xl text-white">
                  {isAnnual ? 'R$499' : 'R$59'}
                </span>
                <span className="text-zinc-500">
                  {isAnnual ? ',90 /ano' : ',90 /mês'}
                </span>
              </div>
              <span className="text-xs text-cyan-400 font-mono mt-2 bg-cyan-400/10 inline-block w-fit px-2 py-1 rounded">
                Equivale a R$ {isAnnual ? '1,36' : '1,99'} / dia
              </span>
            </div>
            <ul className="flex flex-col gap-3 mb-8 text-sm text-zinc-300">
              <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-cyan-400" /> 15 Milhões de créditos/mês</li>
              <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-cyan-400" /> Acesso a todas as funcionalidades</li>
              <li className="flex gap-2 items-center"><CheckCircle2 size={16} className="text-cyan-400" /> Suporte Prioritário VIP</li>
            </ul>
            <a href={isAnnual ? "https://pay.kiwify.com.br/krX1FV3" : "https://pay.kiwify.com.br/vkimdyz"} target="_blank" rel="noopener noreferrer" className="w-full text-center py-3 rounded bg-cyan-400 text-zinc-950 font-bold text-xs uppercase tracking-widest hover:bg-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.4)] transition-all">
              {isAnnual ? "Assinar Elite anual" : "Assinar Elite mensal"}
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════ FAQ ═══════════ */}
      <section className="wrap bg-zinc-950" id="faq">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16" data-rv>
            <span className="text-xs uppercase tracking-widest text-zinc-500 mb-4 block">FAQ</span>
            <h2 className="font-serif-display text-4xl md:text-5xl text-white">Perguntas Comuns</h2>
          </div>
          <div className="flex flex-col gap-3">
            {FAQS.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
          </div>
        </div>
      </section>

      {/* ═══════════ INTERLUDE / CTA ═══════════ */}
      <section className="wrap text-center border-t border-white/5 bg-aura-mesh bg-center">
        <div className="max-w-2xl mx-auto py-16" data-rv>
          <span className="text-xs uppercase tracking-widest text-cyan-400 mb-6 block">Decisão</span>
          <h2 className="font-serif-display text-4xl md:text-6xl text-white leading-[1.1] mb-8">
            Dê o primeiro passo para se tornar um investidor de  <br /><em className="not-italic text-cyan-400">ELITE</em>
          </h2>
          <p className="text-zinc-400 text-lg mb-10">
            Junte-se à plataforma. Assine hoje, garanta as ferramentas que faltavam para sua estratégia e teste sem compromisso por 7 dias.
          </p>
          <a href="#precos" onClick={(e) => { e.preventDefault(); scrollTo('precos'); }} className="gs-te-cta inline-flex items-center gap-2 px-8 py-4 rounded bg-cyan-400 text-zinc-950 font-bold text-sm uppercase tracking-widest hover:scale-105 transition-transform">
            Garantir Vaga (7 Dias de Garantia) <ArrowRight size={16} />
          </a>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="bg-zinc-950 border-t border-white/10 pt-16 pb-8 px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between gap-12 mb-16">
          <div className="max-w-xs">
            <a href="#" className="flex items-center gap-2 text-white no-underline mb-4 group">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#121A2F] border border-blue-500/30 flex items-center justify-center shadow-lg shadow-[#121A2F]/50">
                <img
                  src="/logo_hexagon.png"
                  className="w-full h-full object-cover"
                  alt="InvestorIA Logo"
                />
              </div>
              <span className="font-serif-display text-2xl font-normal tracking-tight">Investor<b className="text-cyan-400">IA</b></span>
            </a>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Plataforma de investimentos inteligente com análise técnica automatizada, backtesting e insights preditivos para a B3.
            </p>
          </div>
          <div className="flex gap-16 flex-wrap">
            <div className="flex flex-col gap-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-widest">Produto</h4>
              <a href="#beneficios" className="text-sm text-zinc-400 hover:text-cyan-400 transition-colors">Benefícios</a>
              <a href="#funcionalidades" className="text-sm text-zinc-400 hover:text-cyan-400 transition-colors">Funcionalidades</a>
              <a href="#precos" className="text-sm text-zinc-400 hover:text-cyan-400 transition-colors">Preços</a>
            </div>
            <div className="flex flex-col gap-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-widest">Empresa</h4>
              <a href="#" className="text-sm text-zinc-400 hover:text-cyan-400 transition-colors">Termos de Uso</a>
              <a href="#" className="text-sm text-zinc-400 hover:text-cyan-400 transition-colors">Privacidade</a>
              <a href="#" className="text-sm text-zinc-400 hover:text-cyan-400 transition-colors">Contato</a>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between gap-4 text-xs text-zinc-600">
          <span>© 2026 InvestorIA. Todos os direitos reservados.</span>
          <span className="max-w-xl text-right md:text-left">
            Investimentos envolvem riscos. Resultados passados não garantem retornos futuros. O InvestorIA é uma ferramenta de análise e não constitui recomendação financeira.
          </span>
        </div>
      </footer>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-7xl max-h-[90vh] overflow-hidden rounded-xl border border-white/10 shadow-2xl">
            <img
              src={lightboxImage}
              alt="Visualização ampliada"
              className="w-full h-auto max-h-[85vh] object-contain"
            />
            <button
              className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/80 w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
