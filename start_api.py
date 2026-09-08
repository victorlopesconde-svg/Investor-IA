#!/usr/bin/env python
"""
InvestorIA — Inicializador do Backend
Execute: python start_api.py
"""
import os
import sys

# Garante que o diretório agent está no path
agent_dir = os.path.join(os.path.dirname(__file__), "agent")
sys.path.insert(0, agent_dir)
os.chdir(agent_dir)

import uvicorn

if __name__ == "__main__":
    print("=" * 55)
    print("  InvestorIA API — iniciando servidor...")
    print("  Acesse: http://localhost:8000")
    print("  Docs:   http://localhost:8000/docs")
    print("=" * 55)
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False)
