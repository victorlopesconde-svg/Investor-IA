import React, { useState, useEffect, useCallback } from 'react';
import { 
  Lock, Mail, User, ShieldCheck, ArrowRight,
  TrendingUp, BarChart2, Shield
} from 'lucide-react';
import { saveAuthTokens } from '../hooks/useAuthRefresh';

export function Auth({ onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [logoError, setLogoError] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    hp: '', // honeypot — campo invisível; só um bot preenche
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    
    try {
      const res = await fetch(`${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // recebe o cookie httpOnly do refresh token
        body: JSON.stringify(formData)
      });

      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {}

      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Erro de autenticação');
      }

      if (isLogin) {
        // Salva o access token; o refresh token já chegou via cookie httpOnly
        saveAuthTokens({
          access_token: data.access_token,
          client_id: data.client_id,
        });
        onLoginSuccess();
      } else {
        setIsLogin(true);
        setError('Conta criada com sucesso! Faça login.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Google SSO callback (Pilar 2 — Ciber)
  const handleGoogleCallback = useCallback(async (response) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // recebe o cookie httpOnly do refresh token
        body: JSON.stringify({ id_token: response.credential }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {}
      if (!res.ok) throw new Error(data.detail || 'Erro no login Google');

      saveAuthTokens({
        access_token: data.access_token,
        client_id: data.client_id,
      });
      onLoginSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onLoginSuccess]);

  // Inicializa Google Identity Services
  useEffect(() => {
    if (window.google?.accounts?.id) {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (clientId) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCallback,
        });
        const btnContainer = document.getElementById('google-signin-btn');
        if (btnContainer) {
          window.google.accounts.id.renderButton(btnContainer, {
            theme: 'filled_black',
            size: 'large',
            width: '100%',
            text: isLogin ? 'signin_with' : 'signup_with',
            shape: 'rectangular',
          });
        }
      }
    }
  }, [isLogin, handleGoogleCallback]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col md:flex-row text-zinc-100 font-sans selection:bg-[#121A2F]/80">
      
      {/* Lado Esquerdo - Branding */}
      <div className="md:w-1/2 p-8 md:p-16 flex flex-col justify-between border-b md:border-b-0 md:border-r border-zinc-800/50 bg-[#0F0F0F] relative overflow-hidden">
        {/* Efeito Glow */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#121A2F]/60 blur-[120px]"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-900/15 blur-[120px]"></div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            {!logoError ? (
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#121A2F] border border-blue-500/30 flex items-center justify-center shadow-lg shadow-[#121A2F]/50">
                <img 
                  src="/logo_hexagon.png" 
                  className="w-full h-full object-cover" 
                  alt="InvestorIA Logo"
                  onError={() => setLogoError(true)}
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-[#121A2F] border border-blue-500/30 flex items-center justify-center shadow-lg shadow-[#121A2F]/50">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
            )}
            <span className="text-2xl font-bold tracking-tight text-white">Investor<span className="text-blue-400">IA</span></span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-6 tracking-tight">
            Seu copiloto <br/> financeiro com <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-white">Inteligência Artificial</span>
          </h1>
          
          <p className="text-zinc-400 text-lg mb-12 max-w-md">
            Acesse análises fundamentalistas, monitoramento em tempo real e chat contextual para transformar sua carteira de investimentos.
          </p>

          <div className="space-y-6">
            <div className="flex items-center gap-4 text-zinc-300">
              <div className="w-10 h-10 rounded-lg bg-zinc-800/50 flex items-center justify-center border border-zinc-700/50">
                <BarChart2 className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-100">Análises Precisas</h3>
                <p className="text-sm text-zinc-500">Dados da B3 em tempo real.</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-zinc-300">
              <div className="w-10 h-10 rounded-lg bg-zinc-800/50 flex items-center justify-center border border-zinc-700/50">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-100">Segurança Enterprise</h3>
                <p className="text-sm text-zinc-500">Criptografia JWT e Data Masking.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lado Direito - Form */}
      <div className="md:w-1/2 flex items-center justify-center p-8 relative">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">
              {isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}
            </h2>
            <p className="text-zinc-400">
              {isLogin ? 'Insira suas credenciais para acessar a plataforma.' : 'Comece a investir com apoio da inteligência artificial.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Honeypot anti-bot — invisível para humanos, tentador para bots que preenchem tudo */}
            <input
              type="text"
              name="hp"
              value={formData.hp}
              onChange={handleChange}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }}
            />
            {!isLogin && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input 
                    type="text" 
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full bg-[#121212] border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-[#121A2F] focus:ring-1 focus:ring-[#121A2F] transition-colors"
                    placeholder="João Silva"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input 
                  type="email" 
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full bg-[#121212] border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-[#121A2F] focus:ring-1 focus:ring-[#121A2F] transition-colors"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input 
                  type="password" 
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full bg-[#121212] border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-[#121A2F] focus:ring-1 focus:ring-[#121A2F] transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${error.includes('sucesso') ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                <ShieldCheck className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3 px-4 bg-[#121A2F] hover:bg-[#1c294a] border border-blue-500/30 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#121A2F]/40 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? 'Entrar na plataforma' : 'Criar minha conta'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 h-px bg-zinc-800"></div>
              <span className="text-xs text-zinc-500 uppercase tracking-wider">ou</span>
              <div className="flex-1 h-px bg-zinc-800"></div>
            </div>

            {/* Google SSO Button (Pilar 2 — Ciber) */}
            <div id="google-signin-btn" className="flex justify-center w-full"></div>
          </form>

          <div className="mt-8 text-center">
            <p className="text-zinc-500 text-sm">
              {isLogin ? "Ainda não tem conta?" : "Já possui uma conta?"}{' '}
              <button 
                onClick={() => { setIsLogin(!isLogin); setError(null); }}
                className="text-blue-400 font-medium hover:text-blue-300 hover:underline transition-colors"
              >
                {isLogin ? 'Criar agora' : 'Fazer login'}
              </button>
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
