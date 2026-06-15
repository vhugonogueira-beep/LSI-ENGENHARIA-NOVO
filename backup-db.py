"""
Backup automático do banco SQLite - LS Office ERP
Execução: python backup-db.py
Agendar: Agendador de Tarefas do Windows → diariamente às 23:00
"""

import shutil
import os
from datetime import datetime

DB_SOURCE = os.path.join(os.path.dirname(__file__), "prisma", "dev.db")
BACKUP_DIR = os.path.join(os.path.dirname(__file__), "prisma", "backups")

os.makedirs(BACKUP_DIR, exist_ok=True)

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
dest = os.path.join(BACKUP_DIR, f"dev_backup_{timestamp}.db")

if not os.path.exists(DB_SOURCE):
    print(f"[ERRO] Banco não encontrado: {DB_SOURCE}")
    exit(1)

shutil.copy2(DB_SOURCE, dest)
size_kb = os.path.getsize(dest) / 1024
print(f"[OK] Backup criado: {dest} ({size_kb:.1f} KB)")

# Manter apenas os últimos 30 backups
backups = sorted([
    os.path.join(BACKUP_DIR, f) for f in os.listdir(BACKUP_DIR)
    if f.startswith("dev_backup_") and f.endswith(".db")
])
while len(backups) > 30:
    os.remove(backups.pop(0))
    print(f"[LIMPEZA] Backup antigo removido")

print(f"[INFO] Total de backups mantidos: {len(backups)}")
