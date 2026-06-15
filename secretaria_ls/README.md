# Secretária LS Office — Backend v2.0

Sistema completo de gestão de atividades com alertas automáticos via WhatsApp.

---

## Estrutura do projeto

```
secretaria_ls/
├── main.py              ← Servidor FastAPI (backend)
├── requirements.txt     ← Dependências Python
├── .env.example         ← Modelo de configuração (copie para .env)
├── tasks.json           ← Banco de dados local (criado automaticamente)
├── config.json          ← Configurações (criado automaticamente)
├── static/
│   └── index.html       ← Frontend web completo
└── README.md
```

---

## Instalação rápida

### 1. Instalar dependências

```bash
pip install -r requirements.txt
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite o .env com suas credenciais
```

### 3. Iniciar o servidor

```bash
uvicorn main:app --reload --port 8000
```

Acesse: http://localhost:8000/app

---

## Configuração do WhatsApp

### Opção A — Evolution API (recomendado para Antigravity)

A Evolution API é open source e roda 100% local no seu servidor.

**Instalação via Docker:**
```bash
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=sua_chave_secreta \
  -e AUTHENTICATION_TYPE=apikey \
  atendai/evolution-api:latest
```

**Configurar instância:**
1. Acesse http://localhost:8080 (painel Evolution)
2. Crie uma instância chamada `ls-office`
3. Conecte via QR Code no seu celular
4. Copie a API Key para o `.env`

**No .env:**
```
WA_PROVIDER=evolution
EVOLUTION_URL=http://localhost:8080
EVOLUTION_API_KEY=sua_chave_secreta
EVOLUTION_INSTANCE=ls-office
DEFAULT_WA_NUMBER=5511999999999
```

---

### Opção B — Twilio (cloud, sem servidor extra)

1. Crie conta em https://twilio.com
2. Ative o WhatsApp Sandbox
3. Copie Account SID e Auth Token

**No .env:**
```
WA_PROVIDER=twilio
TWILIO_SID=ACxxxxxxxxxxxx
TWILIO_TOKEN=seu_token
TWILIO_FROM=whatsapp:+14155238886
DEFAULT_WA_NUMBER=5511999999999
```

---

## Endpoints principais

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /tasks | Lista todas as tarefas |
| POST | /tasks | Cria nova tarefa |
| PATCH | /tasks/{id} | Atualiza tarefa |
| DELETE | /tasks/{id} | Remove tarefa |
| POST | /tasks/reschedule-overdue | Reagenda vencidas para hoje |
| POST | /whatsapp/send | Envia mensagem WA |
| POST | /whatsapp/daily-summary | Envia resumo do dia |
| GET | /whatsapp/preview-summary | Pré-visualiza resumo |
| GET | /report/summary | Métricas gerais |
| GET | /config | Configurações atuais |
| POST | /config | Salva configurações |
| GET | /health | Status do servidor |

Documentação interativa: http://localhost:8000/docs

---

## Relatório diário automático

O servidor agenda automaticamente o envio do resumo diário para o horário configurado.

Para alterar o horário via API:
```bash
curl -X POST http://localhost:8000/config \
  -H "Content-Type: application/json" \
  -d '{"wa_number": "5511999999999", "daily_report_time": "08:00"}'
```

---

## Deploy no Antigravity

Se você usa o Antigravity como plataforma de hospedagem:

1. Suba os arquivos `main.py`, `requirements.txt` e a pasta `static/`
2. Configure as variáveis de ambiente no painel do Antigravity
3. Defina o comando de start: `uvicorn main:app --host 0.0.0.0 --port 8000`
4. Aponte o frontend para a URL do seu servidor (edite a linha `const API = '...'` no `index.html`)

---

## Integração com o sistema de orçamentos

O backend expõe uma API REST padrão. Para integrar com seu sistema de orçamentos (PV/Highline):

```javascript
// Criar atividade relacionada a um orçamento
fetch('http://localhost:8000/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    desc: 'Enviar orçamento revisado para aprovação',
    status: 'pending',
    priority: 'high',
    client: 'PV/Highline',
    type: 'Contrato',
    date: '2025-04-03',
    deadline: '2025-04-05',
    resp: 'Eng. João',
    note: 'Revisão de BDI de 28% para 30%'
  })
})
```

---

## Segurança (produção)

Para ambiente de produção, adicione ao `.env`:
```
API_SECRET_KEY=chave_longa_aleatoria
```

E proteja os endpoints com autenticação Bearer no `main.py` (descomentar bloco de segurança).
