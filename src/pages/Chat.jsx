import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, BarChart3, Loader2, Plus, MessageSquare, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getOrCreateClientId } from '../hooks/useNotifications';
import './Chat.css';

/* ── Constantes ── */
const TICKER_RE = /\b([A-Z]{3,5}[0-9]{1,2})\b/g;
const FALSE_POS = new Set([
  'P/L','P/VP','EV','ROE','ROA','DY','API','SQL','PDF','URL',
  'HTTP','CEO','CFO','CPF','CVM','B3',
]);
const STORAGE_KEY = 'investoria_conversations';
const INITIAL_MSG = {
  id: 1,
  role: 'ai',
  text: 'Olá! Sou o **InvestorIA**, seu assistente especialista em investimentos na B3. Como posso ajudar suas análises hoje?\n\n> Experimente perguntar: *\"Quais os principais indicadores da PETR4?\"*',
  tickers: [],
  timestamp: Date.now(),
};

/* ── Helpers ── */
function extractTickers(text) {
  const matches = [...(text.matchAll(TICKER_RE) || [])].map(m => m[1]);
  const seen = new Set();
  return matches.filter(m => {
    if (FALSE_POS.has(m) || seen.has(m)) return false;
    seen.add(m);
    return true;
  });
}

function generateTitle(text) {
  return text.length > 50 ? text.slice(0, 47) + '…' : text;
}

function formatDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function loadConversations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveConversations(convs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
}

function createNewConversation() {
  return {
    id: `conv_${Date.now()}`,
    title: 'Nova conversa',
    messages: [INITIAL_MSG],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/* ── Componente principal ── */
export default function Chat() {
  const [conversations, setConversations] = useState(() => {
    const saved = loadConversations();
    if (saved.length === 0) {
      const first = createNewConversation();
      return [first];
    }
    return saved;
  });

  const [activeId, setActiveId] = useState(() => {
    const saved = loadConversations();
    return saved.length > 0 ? saved[0].id : `conv_${Date.now()}`;
  });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue]   = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [userPhoto, setUserPhoto]     = useState(() => {
    try {
      const local = JSON.parse(localStorage.getItem('investoria-profile'));
      return local?.photo || null;
    } catch {
      return null;
    }
  });

  const messagesEndRef = useRef(null);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('investoria_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }, []);

  /* Conversa ativa */
  const activeConv = conversations.find(c => c.id === activeId) || conversations[0];
  const messages   = activeConv?.messages || [];

  /* Sincronização inicial com o Banco de Dados do Backend */
  useEffect(() => {
    const cid = getOrCreateClientId();
    fetch(`/api/chat/conversas/${cid}`, { headers: getAuthHeaders() })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.text();
      })
      .then(text => text ? JSON.parse(text) : {})
      .then(data => {
        if (data.conversations && data.conversations.length > 0) {
          setConversations(prev => {
            const map = new Map();
            prev.forEach(c => map.set(c.id, c));
            data.conversations.forEach(c => map.set(c.id, c));
            return Array.from(map.values()).sort((a,b) => b.updatedAt - a.updatedAt);
          });
        }
      })
      .catch(err => console.warn('[Chat] Falha ao carregar conversas do BD:', err));

    const token = localStorage.getItem('investoria_token');
    if (token && cid) {
      fetch(`/api/perfil/${cid}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.text();
        })
        .then(text => text ? JSON.parse(text) : {})
        .then(data => {
          if (data && (data.photo_url || data.photo)) {
            const photo = data.photo_url || data.photo;
            setUserPhoto(photo);
            try {
              const local = JSON.parse(localStorage.getItem('investoria-profile') || '{}');
              localStorage.setItem('investoria-profile', JSON.stringify({ ...local, photo }));
            } catch {}
          }
        })
        .catch(() => {});
    }
  }, [getAuthHeaders]);

  /* Persistir ao mudar conversas */
  useEffect(() => {
    saveConversations(conversations);
    const cid = getOrCreateClientId();
    const active = conversations.find(c => c.id === activeId);
    if (active) {
      fetch(`/api/chat/conversa/${cid}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(active),
      }).catch(() => {});
    }
  }, [conversations, activeId, getAuthHeaders]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── Atualizar conversa ativa ── */
  const updateConv = useCallback((id, updater) => {
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...updater(c), updatedAt: Date.now() } : c)
    );
  }, []);

  /* ── Nova conversa ── */
  const handleNewChat = useCallback(() => {
    const conv = createNewConversation();
    setConversations(prev => [conv, ...prev]);
    setActiveId(conv.id);
    setInputValue('');
  }, []);

  /* ── Deletar conversa ── */
  const handleDelete = useCallback((e, id) => {
    e.stopPropagation();
    fetch(`/api/chat/conversa/${id}`, { method: 'DELETE', headers: getAuthHeaders() }).catch(() => {});
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      if (next.length === 0) {
        const fresh = createNewConversation();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }, [activeId]);

  /* ── Enviar mensagem ── */
  const handleSend = useCallback(async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const text = inputValue.trim();
    const userMsg = {
      id: Date.now(),
      role: 'user',
      text,
      tickers: [],
      timestamp: Date.now(),
    };

    /* Atualiza título na primeira mensagem do usuário */
    updateConv(activeId, c => ({
      ...c,
      title: c.messages.filter(m => m.role === 'user').length === 0
        ? generateTitle(text)
        : c.title,
      messages: [...c.messages, userMsg],
    }));

    setInputValue('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message: text, session_id: activeId }),
      });

      // Token expirado ou inválido — força logout automático
      if (res.status === 401) {
        localStorage.removeItem('investoria_token');
        localStorage.removeItem('investoria_client_id');
        window.dispatchEvent(new CustomEvent('investoria:logout'));
        return;
      }

      if (!res.ok) throw new Error(`Erro ${res.status}`);

      const resText = await res.text();
      const data = resText ? JSON.parse(resText) : {};
      
      if (data.task_id) {
        let completed = false;
        while (!completed) {
          await new Promise(resolve => setTimeout(resolve, 1500)); // Espera 1.5s
          
          const pollRes = await fetch(`/api/chat/status/${data.task_id}`, { headers: getAuthHeaders() });
          if (pollRes.status === 401) {
            localStorage.removeItem('investoria_token');
            localStorage.removeItem('investoria_client_id');
            window.dispatchEvent(new CustomEvent('investoria:logout'));
            return;
          }
          if (!pollRes.ok) throw new Error(`Erro no Polling ${pollRes.status}`);
          
          const pollText = await pollRes.text();
          const pollData = pollText ? JSON.parse(pollText) : {};
          if (pollData.status === 'completed') {
            completed = true;
            
            const tickers = pollData.tickers?.length
              ? pollData.tickers
              : extractTickers(pollData.response || '');

            const aiMsg = {
              id: Date.now() + 1,
              role: 'ai',
              text: pollData.response || 'Sem resposta.',
              tickers,
              timestamp: Date.now(),
            };

            updateConv(activeId, c => ({ ...c, messages: [...c.messages, aiMsg] }));
          } else if (pollData.status === 'error') {
             throw new Error(pollData.error || "Erro no processamento da IA");
          }
        }
      }

    } catch (err) {
      const errMsg = {
        id: Date.now() + 1,
        role: 'ai',
        text: `⚠️ Erro ao conectar com a IA: **${err.message}**`,
        tickers: [],
        timestamp: Date.now(),
      };
      updateConv(activeId, c => ({ ...c, messages: [...c.messages, errMsg] }));
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, activeId, updateConv, getAuthHeaders]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) handleSend(e);
  };

  return (
    <div className="chat-root">

      {/* ── Sidebar de histórico ── */}
      <aside className={`chat-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <button className="btn-new-chat" onClick={handleNewChat}>
            <Plus size={16} />
            {sidebarOpen && <span>Nova Conversa</span>}
          </button>
          <button
            className="btn-toggle-sidebar"
            onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? 'Recolher sidebar' : 'Expandir sidebar'}
          >
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {sidebarOpen && (
          <div className="sidebar-list">
            {conversations.length === 0 && (
              <p className="sidebar-empty">Nenhuma conversa ainda.</p>
            )}
            {conversations.map(conv => (
              <div
                key={conv.id}
                className={`sidebar-item ${conv.id === activeId ? 'active' : ''}`}
                onClick={() => setActiveId(conv.id)}
              >
                <MessageSquare size={14} className="sidebar-item-icon" />
                <div className="sidebar-item-info">
                  <span className="sidebar-item-title">{conv.title}</span>
                  <span className="sidebar-item-date">{formatDate(conv.updatedAt)}</span>
                </div>
                <button
                  className="btn-delete-conv"
                  onClick={(e) => handleDelete(e, conv.id)}
                  title="Deletar conversa"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── Área principal do chat ── */}
      <div className="chat-container">
        <header className="chat-header">
          <div>
            <h1>Análise Assistida por IA</h1>
            <p>{activeConv?.title || 'Nova conversa'}</p>
          </div>
        </header>

        <div className="chat-messages-area">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble-wrapper ${msg.role}`}>
              <div className="chat-avatar">
                {msg.role === 'ai' ? (
                  <Bot size={20} />
                ) : userPhoto ? (
                  <img src={userPhoto} alt="User" className="chat-avatar-img" />
                ) : (
                  <User size={20} />
                )}
              </div>

              <div className="chat-bubble-column">
                <div className="chat-bubble">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.text}
                  </ReactMarkdown>
                </div>

                {msg.timestamp && (
                  <span className="chat-msg-time">
                    {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="chat-bubble-wrapper ai">
              <div className="chat-avatar">
                <Bot size={20} />
              </div>
              <div className="chat-bubble chat-bubble-loading">
                <Loader2 size={16} className="chat-loading-spinner" />
                <span>Analisando...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <form className="chat-form" onSubmit={handleSend}>
            <input
              type="text"
              className="chat-input"
              placeholder="Pergunte sobre qualquer ativo... (ex: Qual o P/L da PETR4?)"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={!inputValue.trim() || isLoading}
            >
              {isLoading ? <Loader2 size={18} className="chat-loading-spinner" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
