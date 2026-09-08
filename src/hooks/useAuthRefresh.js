/**
 * useAuthRefresh.js
 * Hook de renovação automática de token (Pilar 3 — Ciber).
 * Intercepta respostas 401 e tenta renovar o Access Token
 * usando o Refresh Token antes de deslogar o usuário.
 *
 * O Refresh Token não fica mais no localStorage: o backend agora o entrega
 * como cookie httpOnly (Set-Cookie em /api/auth/login|google|refresh), então
 * nem este código nem um eventual XSS conseguem lê-lo via JavaScript. Basta
 * chamar fetch com `credentials: 'include'` para o navegador enviá-lo sozinho.
 */
import { useEffect, useRef, useCallback } from 'react';

const TOKEN_KEY = 'investoria_token';
const CLIENT_ID_KEY = 'investoria_client_id';

/**
 * Wrapper inteligente para fetch que intercepta 401 e renova automaticamente.
 */
let isRefreshing = false;
let refreshPromise = null;

async function refreshAccessToken() {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // envia o cookie httpOnly do refresh token
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * fetchWithAuth — drop-in replacement para fetch que:
 * 1. Adiciona o Bearer token automaticamente
 * 2. Se receber 401, tenta renovar com refresh token
 * 3. Se renovação falhar, dispara evento de logout
 */
export async function fetchWithAuth(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);

  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let response = await fetch(url, { ...options, headers });

  // Se 401 e temos refresh token, tenta renovar
  if (response.status === 401) {
    let newToken = null;

    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken();
      newToken = await refreshPromise;
      isRefreshing = false;
      refreshPromise = null;
    } else {
      // Outra chamada já está renovando — espera o resultado
      newToken = await refreshPromise;
    }

    if (newToken) {
      // Retry com o novo token
      const retryHeaders = {
        ...options.headers,
        Authorization: `Bearer ${newToken}`,
      };
      response = await fetch(url, { ...options, headers: retryHeaders });
    } else {
      // Refresh falhou — logout
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(CLIENT_ID_KEY);
      window.dispatchEvent(new CustomEvent('investoria:logout'));
    }
  }

  return response;
}


/**
 * Encerra a sessão no servidor: revoga o Refresh Token no banco (Pilar 3/6 —
 * Ciber) e limpa o cookie httpOnly. Sem isso, um token copiado antes do
 * logout continuaria válido até expirar sozinho em até 7 dias.
 */
export async function logoutRequest() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Falha de rede no logout não deve travar o fluxo — os dados locais
    // ainda são limpos e o cookie expira sozinho.
  }
}


/**
 * Hook useAuthRefresh — escuta o evento de logout global
 * e chama o callback de logout do componente pai.
 */
export function useAuthRefresh(onLogout) {
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  useEffect(() => {
    const handler = () => {
      if (onLogoutRef.current) onLogoutRef.current();
    };
    window.addEventListener('investoria:logout', handler);
    return () => window.removeEventListener('investoria:logout', handler);
  }, []);
}


/**
 * Salva o Access Token no localStorage. O Refresh Token não passa mais por
 * aqui — ele chega via cookie httpOnly (Set-Cookie da resposta de login).
 */
export function saveAuthTokens({ access_token, client_id }) {
  if (access_token) localStorage.setItem(TOKEN_KEY, access_token);
  if (client_id) localStorage.setItem(CLIENT_ID_KEY, client_id);
}


/**
 * Remove os dados locais de autenticação. Para revogar a sessão no servidor
 * (o cookie do refresh token), use `logoutRequest()` também.
 */
export function clearAuthTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CLIENT_ID_KEY);
}
