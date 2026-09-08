# CLAUDE.md — InvestorIA

SaaS de análise de investimentos para o mercado brasileiro (B3). Frontend React/Vite + backend
FastAPI que expõe um agente de IA (framework **Agno**) com ferramentas de Yahoo Finance e busca web.
Todo o produto e o código são em **Português do Brasil** — mantenha esse idioma em strings, prompts,
comentários e mensagens de erro.

## Comandos

```bash
# Frontend (dev, porta 5173 — proxy /api → localhost:8000)
npm install
npm run dev
npm run build      # gera dist/, que o backend passa a servir automaticamente
npm run lint

# Backend (porta 8000)
.venv/bin/python start_api.py        # entrypoint oficial (faz chdir para agent/)
# ou: cd agent && ../.venv/bin/uvicorn api:app --port 8000
```

O venv Python fica em `.venv/` na raiz (Python 3.11 — **não** use 3.14, várias deps não compilam).
Deps do backend: `agent/requirements.txt`.

`start_api.py` faz `os.chdir(agent/)` e insere `agent/` no `sys.path`. Por isso todos os módulos do
backend se importam **sem pacote** (`from auth import ...`, não `from agent.auth import ...`), e os
caminhos relativos (`notifications.db`, `tmp/`) resolvem a partir de `agent/`.

## Arquitetura

```
src/                 React 19 + react-router-dom 7, CSS puro (sem Tailwind build; classes utilitárias
                     aparecem no JSX mas o styling real está nos .css por página)
agent/               Backend Python — FastAPI + Agno
  api.py             (~2.6k linhas) TODAS as rotas, num único módulo. Ponto central do sistema.
  agent.py           Definição do agente Agno: SYSTEM_PROMPT, tools, escolha de LLM, RAG
  notifications_db.py Camada SQLite única (todas as tabelas e queries)
dist/                Build do frontend; se existir, api.py o serve como SPA fallback
```

Não há ORM nem routers separados: `api.py` concentra rotas e `notifications_db.py` concentra SQL cru
com um `_lock` global. Ao adicionar uma rota, siga o padrão existente no mesmo arquivo em vez de criar
módulos novos.

### Banco de dados
SQLite em `agent/notifications.db`, criado por `init_db()` no lifespan. Tabelas: `users`, `alerts`,
`alert_cooldowns`, `notification_history`, `ai_tasks`, `documents`, `document_chunks`,
`conversations`, `messages`, `refresh_tokens`, `audit_logs`.
`agent/tmp/data.db` e `agent/tmp/chromaDB/` pertencem ao Agno (sessões e vetores do RAG), não ao app.

### Camada de IA (`agent/agent.py`)
Provedor escolhido por `MODEL_PROVIDER`, com autodetecção na ordem Groq → Gemini → OpenAI → Ollama.
Padrão de produção: **Groq** (`openai/gpt-oss-120b`). Embeddings/RAG (Chroma + PDFReader) degradam
graciosamente: se o embedder falhar, o agente sobe sem RAG em vez de quebrar. O agente é carregado
**lazy** (`_get_agent()`), só na primeira requisição.

Chat é assíncrono: `POST /api/chat` cria uma `ai_task` e retorna `task_id`; o frontend faz polling em
`GET /api/chat/status/{task_id}`.

## Segurança — os "Pilares Ciber"

O código marca módulos com "Pilar N". Ao mexer em qualquer um, preserve a estrutura:

1. **Headers** — middleware `security_headers` em `api.py` (CSP, HSTS, X-Frame-Options). O CSP
   permite `accounts.google.com` por causa do SSO; ao adicionar recursos externos, atualize-o.
2. **Google OAuth** — `oauth.py`, rota `POST /api/auth/google`.
3. **JWT RS256** — `auth.py`. Access token 15 min (Authorization header, guardado em
   `localStorage`). Refresh token 7 dias — opaco, hash SHA-256 persistido em `refresh_tokens`,
   entregue ao navegador via **cookie httpOnly + Secure + SameSite=Lax** escopado a `/api/auth`
   (`_set_refresh_cookies`/`_clear_refresh_cookies` em `api.py`; nunca volta a viver em
   `localStorage`, então um XSS no frontend não consegue mais lê-lo). As chaves RSA ficam em
   `agent/keys/*.pem` e são **auto-geradas** se ausentes (ou lidas de
   `RSA_PRIVATE_KEY`/`RSA_PUBLIC_KEY`). `POST /api/auth/logout` revoga o refresh token **no banco**
   (não é só limpar o navegador — um token copiado antes do logout para de funcionar). Frontend
   renova/desloga via `src/hooks/useAuthRefresh.js` (`fetchWithAuth`, `logoutRequest`).
   Em dev local sobre HTTP, se o navegador rejeitar o cookie `Secure`, defina `COOKIE_SECURE=false`
   no `.env` (não deveria ser necessário em `localhost`/`127.0.0.1`, que os navegadores tratam como
   origem confiável).
4. **RBAC** — `rbac.py`. Roles `admin > elite > pro > free > viewer`, default `free`.
   Rotas protegidas usam `Depends(require_permission("chat"))` **em cadeia depois de**
   `Depends(get_current_user)` — a ordem importa, pois `require_permission` lê `request.state.current_user`.
5. **Criptografia** — `encryption.py`, AES-256-GCM com `ENCRYPTION_KEY`. Desabilita-se sozinho se a
   chave faltar.
6. **Audit log** — `audit_log.py` → tabela `audit_logs`, consultável em `GET /api/admin/audit-logs`.
   Gravado sempre via `background_tasks.add_task(log_action, ...)` para não bloquear a resposta.
7. **Anti-bot** — `bot_protection.py`. Duas camadas em `/api/auth/register` e `/api/auth/login`:
   honeypot (`check_honeypot`, campo `hp` — grátis, sempre ativo) e Cloudflare Turnstile opcional
   (`verify_captcha`, ativado sozinho se `TURNSTILE_SECRET_KEY` existir no `.env`; sem a chave, é
   pulado — graceful degradation). O frontend (`Auth.jsx`) já manda o campo `hp` oculto; o widget do
   Turnstile só aparece se `VITE_TURNSTILE_SITE_KEY` estiver definida.

Além disso: `ai_firewall.py` bloqueia prompt injection por regex antes de qualquer chamada ao LLM
(chame `protect_ai_route(message)` em toda rota nova que receba texto livre do usuário);
**rate limiting via slowapi em praticamente toda rota que custa dinheiro ou I/O** (auth, chat,
análises, backtesting, upload) — ao criar uma rota nova que chame LLM/yfinance/DB de escrita,
adicione `@limiter.limit(...)` (a função precisa ter `request: Request` como parâmetro, é o que o
slowapi usa para identificar o IP); `/api/admin/system_dump` é um **honeypot** proposital, não uma
rota real, propositalmente sem rate limit para registrar toda tentativa; `docs_url`/`redoc_url`
estão desativados de propósito.

## Cotas e billing

`token_manager.py` define `ROLE_LIMITS` (elite 15M, pro 5M, free 50k, viewer 0) com reset a cada
30 dias. O provisionamento vem do webhook da **Kiwify** em `POST /api/webhooks/create-user`:
`order_approved`/`subscription_renewed` criam ou promovem o usuário; `subscription_canceled`/
`subscription_late` rebaixam para `viewer` com `token_limit = 0`. O plano é inferido do
`product_name` (contém "elite"/"pro") ou do valor cobrado.

O token do webhook vem de `KIWIFY_WEBHOOK_TOKEN` (`.env`) — precisa ser o mesmo valor configurado no
painel da Kiwify. Sem essa variável, a rota se recusa a processar qualquer chamada (503, fail-safe)
em vez de aceitar sem checagem.

## Alertas e notificações

`scheduler.py` (APScheduler, timezone `America/Sao_Paulo`) roda `monitor_agent.check_all_alerts()` a
cada 15 min entre 9h–18h em dias úteis, mais uma checagem de fechamento às 17h55. O fluxo é:
alertas ativos → cotação yfinance → `_evaluate_rule` → cooldown → `cognitive_filter.humanize_alert`
(LLM transforma o dado bruto em texto humano, com fallback estático se faltar cota) →
`notification_state.dispatch_notification` → SSE em `GET /api/notificacoes/stream/{client_id}`.

## Funcionalidades / rotas principais

| Página (frontend) | Endpoint |
|---|---|
| Chat | `POST /api/chat`, `GET /api/chat/status/{task_id}` |
| Análise Técnica | `GET /api/analise-tecnica/{ticker}` (candles, SMA/EMA, RSI, MACD, Bollinger) |
| Backtesting | `GET /api/backtesting/{ticker}` — estratégias `ma_crossover`, `rsi`, `bollinger`, `buy_hold` |
| Insights | `GET /api/insights/{ticker}` |
| Pesquisa | `GET /api/pesquisa/{ticker}` |
| Fórmula Mágica | `GET /api/formula-magica?tickers=` (Greenblatt) |
| Comparação | `GET /api/comparar?tickers=` |
| Indicadores Básicos | `GET /api/acao/{ticker}` |
| Documentos (RAG) | `POST /api/paginas/upload`, `POST /api/paginas/chat` |
| Configurações | `GET/POST /api/perfil/{client_id}`, `POST /api/alertas/sync` |

As páginas `aprender/*` são tutoriais estáticos, sem backend.

## Convenções

- **Tickers**: o usuário digita `PETR4`; o backend anexa `.SA` antes de chamar o yfinance. Sempre
  normalize com `.upper()` e trate o fallback sem sufixo (como faz `monitor_agent._fetch_quote`).
- **Chamadas bloqueantes** (yfinance, LLM) rodam em `loop.run_in_executor(executor, ...)` — nunca
  chame yfinance direto dentro de uma coroutine.
- **Frontend auth**: access token em `localStorage` sob `investoria_token` / `investoria_client_id`
  (o refresh token vive só no cookie httpOnly — não tem chave de localStorage). Um logout forçado
  é sinalizado pelo evento `window` `investoria:logout`. Toda chamada que envolva o refresh token
  (`/api/auth/refresh`, `/api/auth/logout`) precisa de `credentials: 'include'` no fetch.
- **Rotas novas que aceitam upload/dado do usuário**: sempre exija `Depends(get_current_user)` —
  `/api/paginas/upload` ficou aberta sem autenticação até essa lacuna ser fechada; não repita o erro.
- Erros de rota devolvem `HTTPException` com `detail` em português — é isso que a UI exibe.

## Variáveis de ambiente (`.env` na raiz)

`GROQ_API_KEY` + `MODEL_PROVIDER` + `GROQ_MODEL` (produção), `OPENAI_API_KEY` (embeddings/RAG e
filtro cognitivo), `JWT_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `ALLOWED_ORIGINS`,
`COOKIE_SECURE` (default `true`; só põe `false` em dev HTTP se necessário),
`TURNSTILE_SECRET_KEY`/`VITE_TURNSTILE_SITE_KEY` (CAPTCHA opcional no registro/login),
`KIWIFY_WEBHOOK_TOKEN` (obrigatória para `/api/webhooks/create-user` — sem ela, a rota recusa tudo).
`config.py::validate_environment()` valida no startup e apenas **avisa** para as opcionais
(graceful degradation) — não transforme esses warnings em erros fatais sem necessidade.

⚠️ O `.env` atual contém segredos reais e o repositório **não é um repo git**. Não commite `.env`
nem `agent/keys/*.pem`.

## Armadilhas conhecidas

- **`agno` está preso na série 2.x.** A 3.0 removeu `Agent(enable_user_memories=...)` e trocou
  `Knowledge.add_content`, então `agent.py` não sobe nela. `requirements.txt` já fixa `<3.0.0`.
- **Use Python 3.11.** Com 3.14 as dependências nativas (chromadb/onnxruntime) não instalam.
- **`site_inpirations/`** são HTMLs de referência de design, fora do app. O Vite os varre no dev e
  loga erro de dependência ausente (`unicornstudio-react`) — é ruído, não afeta o dev server nem o
  build. `video/`, `tmp/` e `Skills/` também não fazem parte do bundle.
- `dist/` está versionado no diretório e é servido pelo backend; depois de mudar o frontend para
  rodar em produção num servidor só, refaça `npm run build`.
