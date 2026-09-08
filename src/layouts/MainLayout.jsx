import React, { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { MessageSquareText, TrendingUp, Sparkles, LineChart, FlaskConical, Settings, Cpu, FileText, Scale, LogOut, BookOpen } from 'lucide-react';
import NotificationBell from '../components/NotificationBell';
import { logoutRequest } from '../hooks/useAuthRefresh';
import './MainLayout.css';

export default function MainLayout() {
  const [profile, setProfile] = useState({ name: 'Victor', photo: null });
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem('investoria-profile'));
      if (p) setProfile(p);
    } catch {}
    const onStorage = () => {
      try {
        const p = JSON.parse(localStorage.getItem('investoria-profile'));
        if (p) setProfile(p);
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleLogout = () => {
    // Revoga a sessão no servidor (Pilar 3/6 — Ciber) antes de limpar o
    // estado local, para que o refresh token não continue válido por aí.
    logoutRequest();
    localStorage.removeItem('investoria_token');
    localStorage.removeItem('investoria_client_id');
    window.dispatchEvent(new CustomEvent('investoria:logout'));
  };

  const initials = (profile.name || 'U').slice(0, 2).toUpperCase();

  const formatRole = (role) => {
    const r = role?.toLowerCase();
    if (r === 'viewer') return 'Acesso Suspenso (Viewer)';
    if (r === 'elite') return 'Plano Elite';
    if (r === 'pro' || r === 'plano pro') return 'Plano Pro';
    if (r === 'free') return 'Plano Gratuito';
    return role?.startsWith('Plano') ? role : `Plano ${role || 'Gratuito'}`;
  };

  return (
    <div className="layout-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            {!logoError ? (
              <div className="logo-img-container">
                <img 
                  src="/logo_hexagon.png" 
                  className="logo-img" 
                  alt="InvestorIA Logo"
                  onError={() => setLogoError(true)}
                />
              </div>
            ) : (
              <Sparkles className="logo-icon" size={24} />
            )}
            <h2>InvestorIA</h2>
            <button className="logout-btn" onClick={handleLogout} title="Sair do sistema">
              <LogOut size={14} />
              <span>Sair</span>
            </button>
          </div>
          <NotificationBell />
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/chat"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <MessageSquareText size={20} />
            <span>Chat IA</span>
          </NavLink>

          <NavLink to="/analise-tecnica"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <LineChart size={20} />
            <span>Análise Técnica</span>
          </NavLink>

          <NavLink to="/backtesting"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <FlaskConical size={20} />
            <span>Backtesting</span>
          </NavLink>

          <NavLink to="/insights"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Cpu size={20} />
            <span>Insights IA</span>
          </NavLink>

          <NavLink to="/formula-magica"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Sparkles size={20} />
            <span>Fórmula Mágica</span>
          </NavLink>

          <NavLink to="/comparacao"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Scale size={20} />
            <span>Comparação</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          {/* Indicadores Básicos */}
          <NavLink to="/indicadores-basicos"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <BookOpen size={20} />
            <span>Indicadores Básicos</span>
          </NavLink>

          {/* Configurações */}
          <NavLink to="/configuracoes"
            className={({ isActive }) => `nav-item nav-item-settings ${isActive ? 'active' : ''}`}>
            <Settings size={20} />
            <span>Configurações</span>
          </NavLink>

          {/* Perfil */}
          <NavLink to="/configuracoes#perfil" className="user-profile" style={{ textDecoration: 'none' }}>
            <div className="avatar">
              {profile.photo
                ? <img src={profile.photo} alt="avatar"
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : initials}
            </div>
            <div className="user-info">
              <span className="user-name">{profile.name || 'Usuário'}</span>
              <span className="user-role">{formatRole(profile.role)}</span>
            </div>
          </NavLink>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
