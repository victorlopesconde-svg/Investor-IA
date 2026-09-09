"""
migrate_sqlite_to_postgres.py
Copia os dados do antigo agent/notifications.db (SQLite) para o PostgreSQL
apontado por DATABASE_URL. Idempotente: linhas já existentes são ignoradas
(ON CONFLICT DO NOTHING), então pode rodar mais de uma vez sem duplicar.

Uso:
    cd agent && ../.venv/bin/python migrate_sqlite_to_postgres.py
"""
import os
import sqlite3
import sys

from dotenv import load_dotenv

load_dotenv()

import notifications_db

# Ordem importa: tabelas referenciadas por FK vêm antes das que as referenciam.
TABLES = [
    "users",
    "alerts",
    "alert_cooldowns",
    "notification_history",
    "ai_tasks",
    "documents",
    "document_chunks",
    "conversations",
    "messages",
    "refresh_tokens",
    "audit_logs",
]

# Tabelas cujo id é SERIAL no Postgres — a sequência precisa ser reposicionada
# depois de inserir ids explícitos, senão o próximo INSERT colide com uma PK existente.
SERIAL_TABLES = ["notification_history", "document_chunks", "audit_logs"]

SQLITE_PATH = os.path.join(os.path.dirname(__file__), "notifications.db")


def main() -> int:
    if not os.path.exists(SQLITE_PATH):
        print(f"[erro] {SQLITE_PATH} não encontrado — nada a migrar.")
        return 1
    if not notifications_db.DATABASE_URL:
        print("[erro] DATABASE_URL não configurada. Defina no .env antes de rodar.")
        return 1

    src = sqlite3.connect(SQLITE_PATH)
    src.row_factory = sqlite3.Row

    print("Criando schema no PostgreSQL (init_db)...")
    notifications_db.init_db()

    dest = notifications_db._connect()
    try:
        for table in TABLES:
            try:
                rows = src.execute(f"SELECT * FROM {table}").fetchall()
            except sqlite3.OperationalError:
                print(f"  {table}: tabela inexistente no SQLite, pulando.")
                continue

            if not rows:
                print(f"  {table}: 0 linhas.")
                continue

            columns = list(rows[0].keys())
            col_list = ", ".join(f'"{c}"' for c in columns)
            placeholders = ", ".join(["?"] * len(columns))
            sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"

            for row in rows:
                dest.execute(sql, tuple(row[c] for c in columns))

            print(f"  {table}: {len(rows)} linhas migradas.")

        for table in SERIAL_TABLES:
            dest.execute(
                f"""SELECT setval(pg_get_serial_sequence('{table}', 'id'),
                                  COALESCE((SELECT MAX(id) FROM {table}), 0) + 1,
                                  false)"""
            )

        dest.commit()
        print("\nMigração concluída.")

        users = dest.execute("SELECT email, role FROM users ORDER BY created_at").fetchall()
        print(f"\nUsuários agora no PostgreSQL ({len(users)}):")
        for u in users:
            print(f"  - {u['email']} ({u['role']})")
    finally:
        dest.close()
        src.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
