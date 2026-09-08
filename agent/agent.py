"""
InvestorIA - Agente Especialista em Investimentos
Utiliza o framework Agno com ferramentas de Yahoo Finance e busca web.

Provedor padrão de produção: Groq (openai/gpt-oss-120b)
Suporta fallback automático para: Gemini, OpenAI, Ollama.
"""

import os
import logging
from dotenv import load_dotenv

from agno.agent import Agent
from agno.tools.yfinance import YFinanceTools
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.db.sqlite import SqliteDb
from agno.knowledge.knowledge import Knowledge
from agno.knowledge.reader.pdf_reader import PDFReader
from agno.knowledge.chunking.recursive import RecursiveChunking
from agno.vectordb.chroma import ChromaDb

load_dotenv()

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# System Prompt do Agente (otimizado para tokens)
# ──────────────────────────────────────────────
SYSTEM_PROMPT = """Você é o InvestorIA, consultor financeiro especializado no mercado brasileiro (B3).

## Ferramentas disponíveis
Você tem acesso APENAS às seguintes ferramentas:
- **YFinance**: para consultar preços, indicadores, fundamentos e notícias de ações.
- **DuckDuckGo**: para buscar informações na web e notícias recentes.

⚠️ NUNCA tente usar ferramentas que não foram fornecidas (como web_browser, open_url, browse, file_reader, etc.). Se precisar acessar um conteúdo de URL ou PDF, use a ferramenta DuckDuckGo para pesquisar informações sobre o assunto.

## Regras obrigatórias
- Responda SEMPRE em Português do Brasil.
- Tickers brasileiros: adicione .SA (ex: PETR4.SA).
- Valores em R$ com separador de milhar.
- Nunca invente dados — se não encontrar, informe claramente.
- Use tabelas Markdown para indicadores financeiros.
- Use **negrito** para dados-chave e conclusões.
- Interprete os dados, não apenas liste números brutos.

## Comportamento por tipo de pergunta
**Indicadores/Fundamentos:** visão geral da empresa → tabela de indicadores (Valuation, Rentabilidade, Endividamento, Dividendos) → interpretação → pontos fortes e riscos → recomendação de analistas → conclusão.
**Notícias/Pesquisa:** resumo do panorama → análise de cada notícia (título em PT, data, impacto) → sentimento (🟢/🔴/🟡) → pontos de atenção.
**Perguntas gerais:** resposta direta e objetiva, proporcional à complexidade da pergunta.

Termine análises complexas com "💡 **Dica do InvestorIA**" com uma orientação prática.
"""

# ──────────────────────────────────────────────
# Ferramentas do Agente
# ──────────────────────────────────────────────
finance_tools = YFinanceTools(
    enable_stock_price=True,
    enable_company_info=True,
    enable_analyst_recommendations=True,
    enable_key_financial_ratios=True,
    enable_stock_fundamentals=True,
    enable_income_statements=True,
    enable_historical_prices=True,
    enable_company_news=True,
    enable_technical_indicators=True,
)

search_tools = DuckDuckGoTools(
    enable_search=True,
    enable_news=True,
    region="br-pt",
    fixed_max_results=5,
)

# ──────────────────────────────────────────────
# Seleção Dinâmica do Provedor de IA
# ──────────────────────────────────────────────
MODEL_PROVIDER = os.getenv("MODEL_PROVIDER", "").lower()
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "").lower()

# Autodetect se não for especificado
if not MODEL_PROVIDER:
    if os.getenv("GROQ_API_KEY"):
        MODEL_PROVIDER = "groq"
    elif os.getenv("GOOGLE_API_KEY"):
        MODEL_PROVIDER = "gemini"
    elif os.getenv("OPENAI_API_KEY"):
        MODEL_PROVIDER = "openai"
    else:
        MODEL_PROVIDER = "ollama"

logger.info(f"[InvestorIA] Provedor de modelo: {MODEL_PROVIDER}")

# Configuração do Modelo LLM
if MODEL_PROVIDER == "groq":
    from agno.models.groq import Groq
    model = Groq(id=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"))
elif MODEL_PROVIDER == "ollama":
    from agno.models.ollama import Ollama
    model = Ollama(id=os.getenv("OLLAMA_MODEL", "llama3.2"))
elif MODEL_PROVIDER == "openai":
    from agno.models.openai import OpenAIChat
    model = OpenAIChat(id=os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
else:
    from agno.models.google import Gemini
    model = Gemini(id=os.getenv("GOOGLE_MODEL", "gemini-2.0-flash"))

# ──────────────────────────────────────────────
# Configuração do Embedder e RAG
# (Graceful Degradation: se falhar, desativa RAG sem derrubar o agente)
# ──────────────────────────────────────────────
use_rag = False
knowledge = None

if not EMBEDDING_PROVIDER:
    # Para Groq em produção, usa OpenAI embeddings se disponível
    if MODEL_PROVIDER == "groq" and os.getenv("OPENAI_API_KEY"):
        EMBEDDING_PROVIDER = "openai"
    else:
        EMBEDDING_PROVIDER = MODEL_PROVIDER

try:
    if EMBEDDING_PROVIDER == "ollama":
        from agno.knowledge.embedder.ollama import OllamaEmbedder
        embedder = OllamaEmbedder(id=os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text"))
        use_rag = True
    elif EMBEDDING_PROVIDER == "openai" and os.getenv("OPENAI_API_KEY"):
        from agno.knowledge.embedder.openai import OpenAIEmbedder
        embedder = OpenAIEmbedder(id="text-embedding-3-small")
        use_rag = True
    elif EMBEDDING_PROVIDER == "gemini" and os.getenv("GOOGLE_API_KEY"):
        from agno.knowledge.embedder.google import GoogleEmbedder
        embedder = GoogleEmbedder(
            model_name="models/text-embedding-004",
            api_key=os.getenv("GOOGLE_API_KEY"),
        )
        use_rag = True
    else:
        logger.info("[InvestorIA] Nenhuma credencial de embedding configurada. RAG desativado.")
except Exception as e:
    logger.warning(f"[InvestorIA] Falha ao configurar o Embedder ({e}). Prosseguindo sem RAG.")

if use_rag:
    try:
        vector_db = ChromaDb(
            collection="relatorios",
            path="./tmp/chromaDB",
            embedder=embedder,
            persistent_client=True,
        )

        pdf_reader = PDFReader(
            chunking_strategy=RecursiveChunking(
                chunk_size=2048,
                overlap=150,
            )
        )

        knowledge = Knowledge(
            vector_db=vector_db,
        )

        # Indexa os PDFs se existirem
        knowledge.add_content(
            path="files",
            reader=pdf_reader,
            skip_if_exists=True,
        )
    except Exception as e:
        logger.warning(f"[InvestorIA] Falha ao inicializar Chroma/Knowledge ({e}). RAG desativado.")
        use_rag = False

# ──────────────────────────────────────────────
# Storage (SQLite para memória e sessão)
# ──────────────────────────────────────────────
db = SqliteDb(db_file="tmp/data.db")

# ──────────────────────────────────────────────
# Instância do Agente
# ──────────────────────────────────────────────
agent_kwargs = {
    "model": model,
    "tools": [finance_tools, search_tools],
    "instructions": SYSTEM_PROMPT,
    "markdown": True,
    "db": db,
    "update_memory_on_run": True,
    "add_memories_to_context": True,
    "enable_user_memories": True,
    "enable_agentic_memory": True,
    "learning": True,
}

if use_rag and knowledge:
    agent_kwargs["knowledge"] = knowledge
    agent_kwargs["search_knowledge"] = True
    agent_kwargs["add_knowledge_to_context"] = True

agent = Agent(**agent_kwargs)

logger.info(f"[InvestorIA] Agente inicializado com sucesso. Modelo: {MODEL_PROVIDER} | RAG: {use_rag}")


# ──────────────────────────────────────────────
# Loop interativo no terminal
# ──────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  InvestorIA - Agente Especialista em Investimentos")
    print(f"  Modelo: {MODEL_PROVIDER} | RAG: {'Ativo' if use_rag else 'Desativado'}")
    print("  Digite sua pergunta ou 'sair' para encerrar.")
    print("=" * 60)

    while True:
        try:
            pergunta = input("\n> Voce: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nEncerrando o InvestorIA. Até logo!")
            break

        if not pergunta:
            continue

        if pergunta.lower() in ("sair", "exit", "quit"):
            print("\nEncerrando o InvestorIA. Até logo!")
            break

        try:
            agent.print_response(pergunta, stream=True)
        except Exception as e:
            print(f"\n❌ Erro ao processar sua pergunta: {e}")


if __name__ == "__main__":
    main()
