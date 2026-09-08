# ── InvestorIA — imagem única para o Render (ou qualquer host Docker) ──────────
# Duas etapas: 1) builda o frontend com Node, 2) roda o backend com Python,
# que serve o dist/ gerado na etapa 1 (é assim que agent/api.py já espera).

# ── Etapa 1: build do frontend (React + Vite) ──────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

# ── Etapa 2: backend (FastAPI + Agno) ──────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# tzdata: o scheduler roda em America/Sao_Paulo (agent/scheduler.py)
# build-essential: algumas libs (cryptography, bcrypt, chromadb) podem precisar compilar
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY agent/requirements.txt ./agent/requirements.txt
RUN pip install --no-cache-dir -r agent/requirements.txt

COPY agent ./agent
COPY --from=frontend-build /app/dist ./dist

EXPOSE 8000

# Render injeta a variável $PORT — o app precisa escutar nela, não numa porta fixa.
# (equivalente ao "cd agent && uvicorn api:app --port 8000" do CLAUDE.md, mas com $PORT)
CMD ["sh", "-c", "cd agent && uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
