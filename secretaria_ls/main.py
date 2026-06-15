"""
Secretária LS Office — Backend
================================
Servidor FastAPI para gerenciamento de atividades com:
  - CRUD completo de tarefas
  - Reagendamento automático de vencidas
  - Envio de alertas via WhatsApp (Evolution API ou Twilio)
  - Relatório diário automático (cron)
  - Persistência em JSON local (sem banco externo)

Requisitos:
    pip install fastapi uvicorn apscheduler httpx python-dotenv

Uso:
    uvicorn main:app --reload --port 8000
"""

import json
import os
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import List, Optional

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

# ─────────────────────────────────────────────
# Configuração
# ─────────────────────────────────────────────
DATA_FILE = Path("tasks.json")
CONFIG_FILE = Path("config.json")

# Variáveis de ambiente (.env)
WA_PROVIDER        = os.getenv("WA_PROVIDER", "evolution")   # "evolution" ou "twilio"

# Evolution API (self-hosted / Antigravity)
EVOLUTION_URL      = os.getenv("EVOLUTION_URL", "http://localhost:8080")
EVOLUTION_KEY      = os.getenv("EVOLUTION_API_KEY", "")
EVOLUTION_INSTANCE = os.getenv("EVOLUTION_INSTANCE", "ls-office")

# Twilio (fallback / cloud)
TWILIO_SID         = os.getenv("TWILIO_SID", "")
TWILIO_TOKEN       = os.getenv("TWILIO_TOKEN", "")
TWILIO_FROM        = os.getenv("TWILIO_FROM", "whatsapp:+14155238886")

# Número padrão para alertas (com DDI, sem +)
DEFAULT_WA_NUMBER  = os.getenv("DEFAULT_WA_NUMBER", "")

# ─────────────────────────────────────────────
# Modelos Pydantic
# ─────────────────────────────────────────────
class Task(BaseModel):
    id: Optional[str] = None
    desc: str
    status: str = "pending"          # pending | awaiting | done
    priority: str = "normal"         # normal | high | low
    client: Optional[str] = ""
    type: Optional[str] = ""
    date: str                        # YYYY-MM-DD
    time: Optional[str] = ""         # HH:MM
    resp: Optional[str] = ""
    deadline: Optional[str] = ""     # YYYY-MM-DD
    note: Optional[str] = ""
    rescheduled: bool = False
    created_at: Optional[str] = None

class TaskUpdate(BaseModel):
    desc: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    client: Optional[str] = None
    type: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    resp: Optional[str] = None
    deadline: Optional[str] = None
    note: Optional[str] = None
    rescheduled: Optional[bool] = None

class WAMessageRequest(BaseModel):
    number: str           # ex: "5511999999999"
    message: str

class Config(BaseModel):
    wa_number: Optional[str] = ""
    daily_report_time: Optional[str] = "08:00"
    auto_reschedule: Optional[bool] = True

# ─────────────────────────────────────────────
# Persistência JSON
# ─────────────────────────────────────────────
def load_tasks() -> List[dict]:
    if not DATA_FILE.exists():
        return []
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))

def save_tasks(tasks: List[dict]):
    DATA_FILE.write_text(json.dumps(tasks, ensure_ascii=False, indent=2), encoding="utf-8")

def load_config() -> dict:
    if not CONFIG_FILE.exists():
        return {"wa_number": "", "daily_report_time": "08:00", "auto_reschedule": True}
    return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

def save_config(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

# ─────────────────────────────────────────────
# WhatsApp — envio de mensagem
# ─────────────────────────────────────────────
async def send_whatsapp(number: str, message: str) -> dict:
    """
    Envia mensagem WhatsApp via Evolution API ou Twilio.
    number: somente dígitos, com DDI (ex: 5511999999999)
    """
    clean_number = "".join(filter(str.isdigit, number))

    if WA_PROVIDER == "evolution":
        return await _send_evolution(clean_number, message)
    elif WA_PROVIDER == "twilio":
        return await _send_twilio(clean_number, message)
    else:
        raise ValueError(f"WA_PROVIDER inválido: {WA_PROVIDER}")

async def _send_evolution(number: str, message: str) -> dict:
    url = f"{EVOLUTION_URL}/message/sendText/{EVOLUTION_INSTANCE}"
    headers = {"apikey": EVOLUTION_KEY, "Content-Type": "application/json"}
    payload = {
        "number": f"{number}@s.whatsapp.net",
        "textMessage": {"text": message},
        "options": {"delay": 500, "presence": "composing"}
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, json=payload, headers=headers)
        r.raise_for_status()
        return r.json()

async def _send_twilio(number: str, message: str) -> dict:
    from base64 import b64encode
    auth = b64encode(f"{TWILIO_SID}:{TWILIO_TOKEN}".encode()).decode()
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json"
    headers = {"Authorization": f"Basic {auth}"}
    data = {
        "From": TWILIO_FROM,
        "To": f"whatsapp:+{number}",
        "Body": message
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, data=data, headers=headers)
        r.raise_for_status()
        return r.json()

# ─────────────────────────────────────────────
# Lógica de negócio
# ─────────────────────────────────────────────
def get_effective_status(task: dict, today_str: str) -> str:
    if task["status"] == "done":
        return "done"
    if task["date"] < today_str:
        return "overdue"
    return task["status"]

def build_daily_report(tasks: List[dict], label: str = "Resumo do dia") -> str:
    today_str = date.today().isoformat()
    overdue   = [t for t in tasks if get_effective_status(t, today_str) == "overdue"]
    pending   = [t for t in tasks if get_effective_status(t, today_str) == "pending"]
    awaiting  = [t for t in tasks if get_effective_status(t, today_str) == "awaiting"]
    done      = [t for t in tasks if t["status"] == "done"]

    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    msg = f"*Secretária LS Office — {label}*\n"
    msg += f"📅 {now}\n\n"

    if overdue:
        msg += f"🔴 *Vencidas ({len(overdue)})*\n"
        for t in overdue:
            msg += f"• {t['desc']}"
            if t.get("client"): msg += f" [{t['client']}]"
            msg += f" _(venceu {t['date']})_\n"
        msg += "\n"

    if pending:
        msg += f"🟡 *Pendentes hoje ({len(pending)})*\n"
        for t in pending:
            msg += f"• {t['desc']}"
            if t.get("client"): msg += f" [{t['client']}]"
            if t.get("time"): msg += f" ⏰{t['time']}"
            msg += "\n"
        msg += "\n"

    if awaiting:
        msg += f"🔵 *Aguardando resposta ({len(awaiting)})*\n"
        for t in awaiting:
            msg += f"• {t['desc']}"
            if t.get("resp"): msg += f" → {t['resp']}"
            msg += "\n"
        msg += "\n"

    if done:
        msg += f"✅ *Concluídas ({len(done)})*\n"
        for t in done:
            msg += f"• {t['desc']}\n"
        msg += "\n"

    # Prazos próximos (próximos 3 dias)
    deadlines_soon = []
    for t in tasks:
        if t.get("deadline") and t["status"] != "done":
            dl = date.fromisoformat(t["deadline"])
            diff = (dl - date.today()).days
            if 0 <= diff <= 3:
                deadlines_soon.append((t, diff))

    if deadlines_soon:
        msg += f"⏳ *Prazos próximos*\n"
        for t, diff in deadlines_soon:
            label_d = "hoje!" if diff == 0 else f"em {diff}d"
            msg += f"• {t['desc']} — {label_d}\n"
        msg += "\n"

    msg += "_Enviado automaticamente pela Secretária LS Office_"
    return msg

# ─────────────────────────────────────────────
# App FastAPI
# ─────────────────────────────────────────────
app = FastAPI(
    title="Secretária LS Office",
    description="API de gestão de atividades com alertas WhatsApp",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve o frontend estático na raiz
if Path("static").exists():
    app.mount("/app", StaticFiles(directory="static", html=True), name="static")

# ─────────────────────────────────────────────
# Endpoints — Tarefas
# ─────────────────────────────────────────────
@app.get("/tasks", response_model=List[dict])
def list_tasks(date_filter: Optional[str] = None, status: Optional[str] = None):
    """Lista todas as tarefas. Filtra por date (YYYY-MM-DD) e/ou status."""
    tasks = load_tasks()
    if date_filter:
        tasks = [t for t in tasks if t["date"] == date_filter]
    if status:
        today_str = date.today().isoformat()
        tasks = [t for t in tasks if get_effective_status(t, today_str) == status]
    return tasks

@app.post("/tasks", response_model=dict)
def create_task(task: Task):
    tasks = load_tasks()
    task_dict = task.dict()
    task_dict["id"] = str(uuid.uuid4())[:8]
    task_dict["created_at"] = datetime.now().isoformat()
    tasks.append(task_dict)
    save_tasks(tasks)
    return task_dict

@app.get("/tasks/{task_id}", response_model=dict)
def get_task(task_id: str):
    tasks = load_tasks()
    for t in tasks:
        if t["id"] == task_id:
            return t
    raise HTTPException(404, "Tarefa não encontrada")

@app.patch("/tasks/{task_id}", response_model=dict)
def update_task(task_id: str, update: TaskUpdate):
    tasks = load_tasks()
    for i, t in enumerate(tasks):
        if t["id"] == task_id:
            for k, v in update.dict(exclude_none=True).items():
                tasks[i][k] = v
            save_tasks(tasks)
            return tasks[i]
    raise HTTPException(404, "Tarefa não encontrada")

@app.delete("/tasks/{task_id}")
def delete_task(task_id: str):
    tasks = load_tasks()
    new_tasks = [t for t in tasks if t["id"] != task_id]
    if len(new_tasks) == len(tasks):
        raise HTTPException(404, "Tarefa não encontrada")
    save_tasks(new_tasks)
    return {"ok": True, "deleted": task_id}

@app.post("/tasks/reschedule-overdue")
def reschedule_overdue():
    """Move todas as tarefas vencidas (não concluídas) para hoje."""
    today_str = date.today().isoformat()
    tasks = load_tasks()
    count = 0
    for t in tasks:
        if t["status"] != "done" and t["date"] < today_str:
            t["date"] = today_str
            t["rescheduled"] = True
            count += 1
    save_tasks(tasks)
    return {"ok": True, "rescheduled": count}

# ─────────────────────────────────────────────
# Endpoints — WhatsApp
# ─────────────────────────────────────────────
@app.post("/whatsapp/send")
async def whatsapp_send(req: WAMessageRequest):
    """Envia mensagem WhatsApp para número específico."""
    try:
        result = await send_whatsapp(req.number, req.message)
        return {"ok": True, "result": result}
    except Exception as e:
        raise HTTPException(500, f"Erro ao enviar WhatsApp: {str(e)}")

@app.post("/whatsapp/daily-summary")
async def whatsapp_daily_summary(date_filter: Optional[str] = None, number: Optional[str] = None):
    """
    Gera e envia resumo diário das atividades.
    Se number não informado, usa DEFAULT_WA_NUMBER do .env.
    """
    target_date = date_filter or date.today().isoformat()
    tasks = load_tasks()
    today_tasks = [t for t in tasks if t["date"] == target_date]
    msg = build_daily_report(today_tasks)

    target_number = number or DEFAULT_WA_NUMBER
    if not target_number:
        return {"ok": False, "message": msg, "sent": False, "reason": "Número não configurado"}

    try:
        result = await send_whatsapp(target_number, msg)
        return {"ok": True, "message": msg, "sent": True, "result": result}
    except Exception as e:
        return {"ok": False, "message": msg, "sent": False, "error": str(e)}

@app.get("/whatsapp/preview-summary")
def preview_summary(date_filter: Optional[str] = None):
    """Pré-visualiza o texto do resumo sem enviar."""
    target_date = date_filter or date.today().isoformat()
    tasks = load_tasks()
    today_tasks = [t for t in tasks if t["date"] == target_date]
    return {"message": build_daily_report(today_tasks), "date": target_date, "task_count": len(today_tasks)}

# ─────────────────────────────────────────────
# Endpoints — Configuração
# ─────────────────────────────────────────────
@app.get("/config")
def get_config():
    return load_config()

@app.post("/config")
def update_config(cfg: Config):
    current = load_config()
    current.update(cfg.dict(exclude_none=True))
    save_config(current)
    # Reagenda o job de relatório diário se horário mudou
    if cfg.daily_report_time:
        _reschedule_daily_job(cfg.daily_report_time)
    return current

# ─────────────────────────────────────────────
# Endpoints — Relatório / Dashboard
# ─────────────────────────────────────────────
@app.get("/report/summary")
def report_summary():
    """Resumo geral de todas as atividades."""
    tasks = load_tasks()
    today_str = date.today().isoformat()
    by_client = {}
    by_type = {}

    for t in tasks:
        cl = t.get("client") or "Sem cliente"
        ty = t.get("type") or "Sem tipo"
        by_client.setdefault(cl, {"total": 0, "done": 0, "pending": 0, "overdue": 0})
        by_type.setdefault(ty, 0)
        eff = get_effective_status(t, today_str)
        by_client[cl]["total"] += 1
        by_client[cl][eff if eff in ("done","pending","overdue") else "pending"] += 1
        by_type[ty] += 1

    overdue_tasks = [t for t in tasks if get_effective_status(t, today_str) == "overdue"]
    urgent_tasks  = [t for t in tasks if t.get("priority") == "high" and t["status"] != "done"]

    deadline_alerts = []
    for t in tasks:
        if t.get("deadline") and t["status"] != "done":
            diff = (date.fromisoformat(t["deadline"]) - date.today()).days
            if 0 <= diff <= 3:
                deadline_alerts.append({"task": t, "days_left": diff})

    return {
        "total": len(tasks),
        "done": sum(1 for t in tasks if t["status"] == "done"),
        "pending": sum(1 for t in tasks if get_effective_status(t, today_str) == "pending"),
        "awaiting": sum(1 for t in tasks if get_effective_status(t, today_str) == "awaiting"),
        "overdue": len(overdue_tasks),
        "urgent": len(urgent_tasks),
        "by_client": by_client,
        "by_type": by_type,
        "deadline_alerts": deadline_alerts,
        "overdue_tasks": overdue_tasks,
    }

# ─────────────────────────────────────────────
# Scheduler — Relatório diário automático
# ─────────────────────────────────────────────
scheduler = AsyncIOScheduler()

async def _auto_daily_report():
    """Job agendado: envia resumo diário via WhatsApp."""
    cfg = load_config()
    number = cfg.get("wa_number") or DEFAULT_WA_NUMBER
    if not number:
        print("[Scheduler] Número WA não configurado, pulando envio.")
        return
    tasks = load_tasks()
    today_str = date.today().isoformat()
    today_tasks = [t for t in tasks if t["date"] == today_str]

    # Auto-reagendar vencidas se configurado
    if cfg.get("auto_reschedule"):
        for t in tasks:
            if t["status"] != "done" and t["date"] < today_str:
                t["date"] = today_str
                t["rescheduled"] = True
        save_tasks(tasks)
        today_tasks = [t for t in load_tasks() if t["date"] == today_str]

    msg = build_daily_report(today_tasks, "Bom dia! Resumo de hoje")
    try:
        await send_whatsapp(number, msg)
        print(f"[Scheduler] Resumo enviado para {number}")
    except Exception as e:
        print(f"[Scheduler] Erro ao enviar: {e}")

def _reschedule_daily_job(time_str: str):
    """Reagenda o job de relatório diário para o novo horário."""
    try:
        hour, minute = map(int, time_str.split(":"))
        scheduler.reschedule_job("daily_report", trigger="cron", hour=hour, minute=minute)
    except Exception:
        pass

@app.on_event("startup")
async def startup():
    cfg = load_config()
    time_str = cfg.get("daily_report_time", "08:00")
    hour, minute = map(int, time_str.split(":"))
    scheduler.add_job(
        _auto_daily_report,
        trigger="cron",
        hour=hour,
        minute=minute,
        id="daily_report",
        replace_existing=True
    )
    scheduler.start()
    print(f"[Secretária LS] Servidor iniciado. Relatório diário agendado para {time_str}.")

@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()

# ─────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "2.0.0",
        "provider": WA_PROVIDER,
        "tasks_stored": len(load_tasks()),
        "time": datetime.now().isoformat()
    }
