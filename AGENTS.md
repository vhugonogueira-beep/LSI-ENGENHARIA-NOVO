# LS Office ERP de Engenharia (LSI)

ERP interno da LS Office para gestão de atividades de telecom/engenharia (implantação e
operação de sites para operadoras/compartilhadoras como Highline, IHS, Winity, SBA).

## Regra permanente

**O sistema deve sempre ficar coerente com o "Blueprint LSI"** — a especificação funcional
viva do produto, publicada como um Claude Artifact (peça o link ao usuário ou veja a memória
`reference-blueprint-lsi.md` do Claude se disponível). Sempre que uma mudança de schema/fluxo
divergir do que o Blueprint documenta, ou vice-versa, sinalize a divergência e resolva-a —
não deixe código e documentação IA descolarem.

## Stack

- Frontend: React + Vite + TypeScript + Tailwind (tema via CSS variables, estilo shadcn).
- Backend: Express + Prisma ORM + SQLite (`prisma/dev.db`).
- Node.js: usar a instalação portátil em `%LOCALAPPDATA%\node-portable\node-v20.18.3-win-x64`
  (adicionada ao PATH) — não depende de instalação de sistema.

## Rodando localmente

```
npm run dev:backend   # tsx watch src/backend/server.ts — porta 3001
npm run dev:frontend  # vite — porta 5174 (proxy /api -> :3001)
npm run dev           # os dois juntos via concurrently
```

Health check: `curl http://localhost:3001/api/health`.

## Prisma — fluxo sem migrations

Este projeto **não tem pasta de migrations**. Toda mudança de schema é:

```
npx prisma db push --skip-generate
npx prisma generate
```

O `db push`/`generate` trava o `.dll` do query engine no Windows enquanto o backend roda —
**pare o processo do backend antes**, rode os dois comandos, **depois reinicie o backend**.
Esquecer de reiniciar já causou outage silenciosa (curl retornando `ECONNREFUSED` sem motivo
óbvio) — sempre reinicie explicitamente após qualquer schema change.

Client naming gotcha: models com sigla toda maiúscula viram acessor com só a primeira letra
minúscula — `APC` → `prisma.aPC`, `RFI` → `prisma.rFI`.

## Arquitetura — dois mundos de dados (histórico e cuidado)

O protótipo original tinha telas legadas (Controle de Obras/Kanban, Fornecedores, Faturamento,
Orçamento/PV Highline) rodando 100% em `localStorage`, sem nenhuma ligação com o backend real.
Elas foram sendo substituídas, uma onda por vez, por telas novas ligadas à API real:

- `Atividades` (Cockpit) — substitui Controle de Obras/Kanban para o fluxo novo.
- `Fornecedores` (real) — substitui a tela legada de mesmo nome.
- `Faturamento` (real) — substitui a tela legada de mesmo nome, com export Excel idêntico
  ao legado (`gerarPlanilhaFaturamento`, sheet "MED ENG LS OFFICE", fórmula `=E{row}*22.04%`).
- O nav "Orçamento" (Novo Orçamento / PV Highline / `TabOrcamentoV2`) **ainda é legado/localStorage**
  — só o cabeçalho de um novo orçamento passou a ser criável via API real, dentro da Atividade
  (aba Comercial); o editor de itens/linhas ainda não existe ligado ao banco real (decisão
  consciente, aguardando prioridade).

**Antes de apagar qualquer tela/código legado**: confirme que os dados que ela mostra não são
reais (dados de produção não podem ser perdidos) e, se forem reais, migre para o modelo Prisma
correspondente antes de excluir.

## Modelo de domínio principal

- `Acionamento` → pode gerar uma `Atividade`.
- `Atividade` tem **5 dimensões de status independentes** (não um status único):
  `status_operacional`, `status_comercial`, `status_documental`, `status_financeiro`,
  `status_faturamento`, cada uma com histórico em `AtividadeStatusHistorico` (campo `dimensao`).
- `tipo_demanda` é binário: `IMPLANTACAO` | `OPERACAO`. Quando `OPERACAO`, um `subtipo_demanda`
  (Manutenção/Adequação/Emergencial/Vistoria/Engenharia/Outro) qualifica sem mudar o fluxo.
- `modelo_operacao` tem **3 valores reais** (não 2) — Blueprint LSI, seção 02, três trilhas:
  - `EXECUCAO_DIRETA` — Operação direta (Modelo 1), sem aprovação prévia.
  - `EXECUCAO_COM_APROVACAO` — Operação com aprovação (Modelo 2 simplificado): Orçamento/
    Negociação completos, mas sem Planejamento/APC/RFI/Documentação (isso é só de obra).
  - `MEDIANTE_APROVACAO` — Implantação (Modelo 2 completo): fluxo inteiro com APC como gate
    real, RFI, matriz documental.
  - **A correspondência tipo_demanda → modelo_operacao é 1:1 e travada na UI**:
    `IMPLANTACAO` só pode ser `MEDIANTE_APROVACAO`; `OPERACAO` só escolhe entre os outros dois.
    Ver `modelosPermitidos()` em `src/frontend/components/atividades/constants.tsx`.
  - `AtividadeCockpit.tsx`'s `buildTabs(modelo)` monta um **conjunto de abas diferente por
    modelo** (não é só esconder uma aba) — qualquer nova feature de fluxo deve passar por essa
    função para decidir em quais dos 3 modelos ela aparece.
- `sharing` (compartilhadora: Highline/IHS/Winity/SBA) e `operadora` (Vivo/Claro/Tim/Oi) são
  campos **independentes** — não confundir, foi um bug real já corrigido uma vez.
- `Atividade.contratante_id`/`site_id` são FKs reais para `Contratante`/`Site` — diferentes de
  `contrato` (texto livre) e `id_site_sharing` (texto livre). Editáveis em
  `TabIdentificacao.tsx` via dropdowns que buscam `/api/contratantes` e `/api/sites`.
- `Budget`/`BudgetItem`/`BudgetTemplate` são um motor de orçamento real e antigo (pré-existia
  ao trabalho de evolução desta sessão), mas **não há endpoint runtime que instancie itens a
  partir de um template** — só um script de seed faz isso hoje. `Budget.tipo_orcamento`
  (`COTACAO_INTERNA` | `PV_HIGHLINE`) foi adicionado para o caso Highline + Implantação, que
  tem dois documentos de orçamento possíveis; o modelo/template exato do "PV Highline" ainda
  não foi fornecido pelo usuário — não inventar o formato, só preparar o campo.
- Motor de faturamento (`faturamento.service.ts`, `avaliarMarcosFaturamento`) resolve a regra
  Highline de dois caminhos condicionais de marcos (`caminho`: `PADRAO` sempre conta;
  `ENERGIZADO`/`SEM_ENERGIA` só contam conforme o campo `RFI.energizado`).

## Onde olhar primeiro

- `prisma/schema.prisma` — todo o domínio.
- `src/backend/controllers/` + `src/backend/routes/` — um par por entidade, montados em
  `src/backend/server.ts`.
- `src/frontend/components/atividades/` — o Activity Cockpit (`AtividadeCockpit.tsx` +
  `TabIdentificacao/TabComercial/TabPlanejamento/TabAPC/TabExecucao/TabDocumentacao/
  TabFornecedores/TabFaturamento/TabResultado.tsx`, `constants.tsx`, `ui.tsx`).
- `src/frontend/pages/Atividades.tsx` — lista/kanban (Carteira) + criação de atividade.
- `src/frontend/pages/SimuladorLPU.tsx` — monólito legado (~8k linhas); ainda hospeda telas
  não migradas (`TabOrcamentoV2`/PV Highline, `Dashboard`, `Clientes`) e o roteamento de abas
  (`tab === "..."`) que monta as telas novas dentro dele.
- `src/frontend/components/Sidebar.tsx` — extraído do monólito; ainda tem o item "Controle de
  Obras" (não removido — havia dados reais lá que precisavam ser migrados antes).

## Pendências conhecidas (na data desta escrita)

- Migração de dados reais de `localStorage` (Controle de Obras: sites PAPCJ001/PAPCJ06 etc.)
  para `Atividade` real — aguardando export "⬇ Backup" do usuário.
- Editor de itens de orçamento (quantidade/valor unitário/BDI) ligado ao `Budget`/`BudgetItem`
  real ainda não existe — criação de orçamento hoje só grava o cabeçalho.
- Geração do arquivo "PV Highline" (template padrão da Highline) — aguardando o usuário enviar
  o modelo/formato exato.
- Levantamento de código morto (`Contratantes.tsx`, `Sites.tsx`, `Catalog.tsx`, `PriceBooks.tsx`,
  `BudgetEditor.tsx`, `VersionHistory.tsx`, `SimuladorLPU.tsx.txt`, `TabFornecedores`/
  `TabFaturamento` dentro do monólito) já identificado como órfão, aguardando ok para excluir.
