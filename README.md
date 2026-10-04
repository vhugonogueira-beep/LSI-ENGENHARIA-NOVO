# LSI — LS Office ERP de Engenharia

ERP interno da LS Office para atividades de telecom: implantação e operação de sites para
detentoras (Highline, IHS, Winity, SBA…) e operadoras (Vivo, Claro, TIM, Oi). Cobre o ciclo
da demanda: acionamento, atividade, orçamento, contratação de fornecedores, pagamentos e
reembolsos, documentação, PO e faturamento.

A especificação funcional é o **[Blueprint LSI](https://claude.ai/code/artifact/8eebd04f-dc2e-4cb4-8752-05d444a7b4a8)**.
Antes de mudar fluxo, schema ou regra de negócio, leia a seção correspondente e o
[AGENTS.md](AGENTS.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Telas | React 18, TypeScript, Vite 5, Tailwind 3, React Router, Recharts, lucide-react |
| API | Node.js 20, Express, Prisma 5 |
| Banco | SQLite (`prisma/dev.db`) |
| Arquivos | Disco local, pasta `storage/` (comprovantes, POs, contratos, documentação) |

## Rodar na máquina

Pré-requisito: Node.js 20. Nesta máquina ele é portátil, em
`%LOCALAPPDATA%\node-portable\node-v20.18.3-win-x64`, e precisa estar no `PATH`.

```bash
npm install
cp .env.example .env          # preencha o JWT_SECRET
npx prisma db push            # cria/atualiza o banco a partir do schema
npx prisma generate
npm run dev                   # API na 3001 + telas na 5174
```

Abra http://localhost:5174. A API responde em http://localhost:3001/api/health.

No Windows, `iniciar-sistema.bat` faz o mesmo com dois cliques.

**Primeiro acesso numa base vazia:** `npx tsx src/backend/seed.ts` cria a empresa e as contas
iniciais e mostra as senhas **uma vez** no terminal. Troque-as no primeiro login.

### Mudar o schema

Não há migrations: o banco segue o `schema.prisma` por `db push`.

1. Faça backup de `prisma/dev.db`.
2. Pare o backend (no Windows, o Prisma não regrava o próprio cliente com ele rodando).
3. `npx prisma db push --skip-generate` e depois `npx prisma generate`.
4. Suba o backend de novo.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | API e telas em modo desenvolvimento |
| `npm run dev:backend` | Só a API, recarregando a cada alteração |
| `npm run build` | Build das telas (`dist/`) e da API |
| `npm run typecheck` | Confere os tipos do backend |
| `npm test` | Roda os roteiros `validar-*.ts` (precisa do backend no ar) |
| `npm test -- sites` | Só os roteiros com "sites" no nome |

Com as telas compiladas (`npm run build:frontend`), a própria API serve tudo em
http://localhost:3001 — é o modo usado para publicar.

## Testes

Os roteiros em `src/backend/scripts/validar-*.ts` testam a regra de negócio de ponta a ponta:
chamam a API com um administrador temporário e conferem o banco. Cada um cria e apaga o que
usa. Eles dependem dos dados de referência da base local (HIGHLINE, PAMRB008…), por isso
rodam na máquina, não no GitHub.

O CI (`.github/workflows/ci.yml`) roda a cada push: instalação limpa, tipos do backend e build
das telas.

## Estrutura

```
prisma/schema.prisma        modelo de dados
src/backend/
  server.ts                 Express: CORS, limites, porteiro de acesso, rotas
  routes/ controllers/      rotas HTTP
  services/                 regras de negócio (uma fonte por regra)
  services/permissoes.service.ts   quem pode o quê — rota sem regra é negada
  scripts/                  migrações pontuais e roteiros validar-*.ts
src/frontend/
  shell/                    moldura: menu, barra superior, roteamento por aba
  pages/                    telas
  components/               peças compartilhadas (FiltroPainel, PageHeader…)
  lib/cores.ts              cor com significado (status, área, operadora…)
docs/                       handoffs, design system, publicação
```

## Acesso e segurança

- Toda rota `/api` exige login, menos login, convite, health e localidades.
- Todos veem tudo; as **ações** dependem das permissões do usuário. Excluir registros e
  gerenciar usuários é só do administrador.
- Novos usuários entram por **link de convite** e criam a própria senha.
- Limites: 10 tentativas de login a cada 15 minutos; 600 requisições por minuto por IP.

## Publicar

O sistema roda hoje só na rede local. O caminho preparado é o Cloudflare Tunnel, descrito em
[docs/DEPLOY-CLOUDFLARE.md](docs/DEPLOY-CLOUDFLARE.md) (`iniciar-internet.bat`). Antes,
troque as senhas iniciais e o `JWT_SECRET`.

## Documentação

| Documento | Assunto |
|---|---|
| [AGENTS.md](AGENTS.md) | Arquitetura, regras permanentes e fluxo de trabalho |
| [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) | Cores, tipografia, disposição das telas |
| [docs/HANDOFF-ATIVIDADES-PAGAMENTOS.md](docs/HANDOFF-ATIVIDADES-PAGAMENTOS.md) | Atividades, pagamentos, reembolsos, prestação de contas |
| [docs/HANDOFF-ASSINATURA-EMAIL.md](docs/HANDOFF-ASSINATURA-EMAIL.md) | Assinatura por usuário nos e-mails |
| [docs/HANDOFF-CONTROLE-ACESSO.md](docs/HANDOFF-CONTROLE-ACESSO.md) | Usuários, permissões e aprovação de pagamentos |
| [docs/HANDOFF-REFATORACAO-SISTEMICA-2026-09-11.md](docs/HANDOFF-REFATORACAO-SISTEMICA-2026-09-11.md) | Refatoração sistêmica |
| [docs/SYNC_MATRIX.md](docs/SYNC_MATRIX.md) | Matriz de sincronização entre módulos |
