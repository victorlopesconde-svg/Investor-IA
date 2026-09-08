import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import MainLayout from './layouts/MainLayout';
import Chat from './pages/Chat';
import TechnicalAnalysis from './pages/TechnicalAnalysis';
import Backtesting from './pages/Backtesting';
import Settings from './pages/Settings';
import Insights from './pages/Insights';
import { Auth } from './pages/Auth';
import LandingPage from './pages/LandingPage';
import { TrendingUp, DollarSign } from 'lucide-react';

import MagicFormula from './components/MagicFormula';
import CompareStocks from './components/CompareStocks';
import BasicIndicators from './pages/BasicIndicators';
import LearnTechnicalAnalysis from './pages/LearnTechnicalAnalysis';
import LearnBacktesting from './pages/LearnBacktesting';
import LearnInsights from './pages/LearnInsights';

// Componente para proteger rotas privadas
function ProtectedRoute({ isAuthenticated }) {
  return isAuthenticated ? <Outlet /> : <Navigate to="/landing" replace />;
}

// Componente para redirecionar usuários logados tentando acessar rotas públicas
function PublicRoute({ isAuthenticated }) {
  return !isAuthenticated ? <Outlet /> : <Navigate to="/chat" replace />;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionType, setTransitionType] = useState(''); // 'login' or 'logout'

  useEffect(() => {
    const token = localStorage.getItem('investoria_token');
    if (!token) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }
    // Valida o token com o backend ao iniciar o app
    fetch('/api/chat/conversas/validate-token', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (res.status === 401 || res.status === 403) {
        // Token inválido ou expirado — faz logout automático
        localStorage.removeItem('investoria_token');
        localStorage.removeItem('investoria_client_id');
        setIsAuthenticated(false);
      } else {
        setIsAuthenticated(true);
      }
    })
    .catch(() => {
      // Se o backend não responde, assume autenticado (offline fallback)
      setIsAuthenticated(true);
    })
    .finally(() => setLoading(false));
  }, []);

  // Escuta evento de logout forçado (ex: token expirado durante uso)
  useEffect(() => {
    const handleForceLogout = () => {
      setTransitionType('logout');
      setTransitioning(true);
      setTimeout(() => {
        setIsAuthenticated(false);
        setTransitioning(false);
      }, 2000);
    };
    window.addEventListener('investoria:logout', handleForceLogout);
    return () => window.removeEventListener('investoria:logout', handleForceLogout);
  }, []);

  const handleLoginSuccess = () => {
    setTransitionType('login');
    setTransitioning(true);
    setTimeout(() => {
      setIsAuthenticated(true);
      setTransitioning(false);
    }, 2000);
  };

  if (loading) return null;

  if (transitioning) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0A0F1C] text-white font-sans">
        <div className="relative flex items-center justify-center mb-8">
          {/* Animated Glow / Orbit */}
          <div className="absolute w-28 h-28 rounded-full border-2 border-t-[#FBBF24] border-r-transparent border-b-[#334155] border-l-transparent animate-spin duration-1000"></div>
          <div className="absolute w-24 h-24 rounded-full border border-dashed border-[#475569] animate-spin duration-[3000ms] reverse"></div>
          
          {/* Investment Icon in the center */}
          <div className="w-16 h-16 rounded-full bg-[#121A2F]/90 border border-[#FBBF24]/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
            {transitionType === 'login' ? (
              <TrendingUp className="w-8 h-8 text-[#FBBF24] animate-pulse" />
            ) : (
              <DollarSign className="w-8 h-8 text-[#EF4444] animate-pulse" />
            )}
          </div>
        </div>
        <h2 className="text-xl font-bold tracking-tight mb-2">
          {transitionType === 'login' ? 'Acessando plataforma...' : 'Saindo do sistema...'}
        </h2>
        <p className="text-sm text-[#94A3B8]">
          {transitionType === 'login' ? 'Carregando suas análises e insights' : 'Encerrando sua sessão com segurança'}
        </p>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Rota da Landing Page (sempre pública) */}
          <Route path="/landing" element={<LandingPage />} />

          {/* Rota Pública (Apenas se não autenticado) */}
          <Route element={<PublicRoute isAuthenticated={isAuthenticated} />}>
            <Route path="/login" element={<Auth onLoginSuccess={handleLoginSuccess} />} />
          </Route>

          {/* Rotas Privadas/Protegidas */}
          <Route element={<ProtectedRoute isAuthenticated={isAuthenticated} />}>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/chat" replace />} />
              <Route path="chat" element={<Chat />} />
              <Route path="analise-tecnica" element={<TechnicalAnalysis />} />
              <Route path="backtesting" element={<Backtesting />} />
              <Route path="insights" element={<Insights />} />
              <Route path="configuracoes" element={<Settings />} />
              <Route path="formula-magica" element={<MagicFormula />} />
              <Route path="comparacao" element={<CompareStocks />} />
              <Route path="indicadores-basicos" element={<BasicIndicators />} />
              
              {/* Tutoriais (Aprender Funcionalidade) */}
              <Route path="aprender/analise-tecnica" element={<LearnTechnicalAnalysis />} />
              <Route path="aprender/backtesting" element={<LearnBacktesting />} />
              <Route path="aprender/insights" element={<LearnInsights />} />
            </Route>
          </Route>

          {/* Redirecionamento Padrão */}
          <Route path="*" element={<Navigate to={isAuthenticated ? "/chat" : "/landing"} replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;

