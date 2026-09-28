# Handoff — Refatoração sistêmica (11/09/2026)

Leia este arquivo com `AGENTS.md`, `CLAUDE.md`, `HANDOFF-ATIVIDADES-PAGAMENTOS.md` e `SYNC_MATRIX.md` antes de continuar esta frente.

## Decisões de domínio

- **Empresa** (`EmpresaConfig`): identidade e dados fiscais da LS Office, contas para recebimento, cartões corporativos e roteamento institucional.
- **Usuário** (`User`): dados pessoais/profissionais, acesso e assinatura individual. Nunca hardcode a assinatura em template.
- **Cliente** (`Contratante`): fonte canônica de clientes, sharings e operadoras, inclusive logos. `Operadora` permanece apenas como histórico de migração.
- **Processo financeiro** é independente da finalidade e da forma: `PAYMENT_REQUEST` ainda gera desembolso; `PAYMENT_FORMALIZATION` registra pagamento já realizado sem nova transferência.
- **Finalidade** vem do catálogo central `PAYMENT_PURPOSES` em `payment-domain.service.ts`.
- Formalização de material exige comprovante e documento fiscal. Demais finalidades exigem comprovante; ampliar a regra no catálogo central.

## Implementado

### Perfil e assinatura

- `User`: `nome_exibicao`, `cargo`, `telefone` e timestamps.
- API `/api/profile` e `/api/profile/password`.
- `MeuPerfil.tsx`, aberto pelo item **Meu Perfil** da sidebar (e pelo avatar), com Dados, Acesso e senha e Assinatura.
- **Pendente:** nenhuma assinatura foi cadastrada. O arquivo original não está no
  workspace e `storage/email-signatures/` está vazio — todo e-mail gerado hoje sai
  com o bloco institucional de fallback. Ver "Pendência externa" em
  `HANDOFF-ASSINATURA-EMAIL.md`.
- Compositor global aplica assinatura à prévia e incorpora imagem por CID no `.eml`.

### Configurações, comunicação e clientes

- Configurações não exibe mais assinatura nem operadoras; contém Empresa, Contas, Cartões e Comunicação.
- `EmailRoutingConfig` e `/api/email-config/routing`: perfis `PAYMENT_REQUEST`, `PAYMENT_FORMALIZATION` e `BILLING`, cada um com múltiplos Para/CC.
- `Contratante` recebeu razão social, sigla, tipo, endereço, cidade, UF, ativo e timestamps.
- `/api/clientes` e `Clientes.tsx`: cadastro, edição, ativação e logo. Tipos: `CLIENTE`, `SHARING`, `OPERADORA`, `SHARING_OPERADORA`.
- Cronograma consulta logos somente em `Contratante`.
- O componente localStorage legado continua no código para preservar histórico, mas a navegação usa a tela real. `ls_clientes_v2` só poderá ser migrado após export explícito do navegador.

### Pagamentos e documentos

- `ParcelaPagamento.processo_tipo` é canônico; `formalizacao_posterior` continua apenas para compatibilidade.
- Formalização aceita PIX, TED, boleto, dinheiro ou cartão e nasce pendente de documentos.
- Novo `PaymentAttachment`: múltiplos arquivos por parcela ou depósito, tipos `COMPROVANTE_PAGAMENTO` e `DOCUMENTO_FISCAL`, SHA-256 e storage privado.
- `/api/payment-attachments` e `PaymentAttachments.tsx`: listar, anexar múltiplos, baixar e remover.
- Memória de cálculo continua em `ReembolsoArquivo`; memória e documentos do depósito entram no `.eml`.
- Múltiplos depósitos e prestação consolidada permanecem preservados.

### E-mails

- Assuntos centrais usam `Atividade.tipo_demanda`: `[IMPLANTAÇÃO] SOLICITAÇÃO DE PAGAMENTO`, `[IMPLANTAÇÃO] FORMALIZAÇÃO DE PAGAMENTO`, reembolso/adiantamento equivalentes e `[ORIGEM] FATURAMENTO`.
- Nunca inferir Implantação/Operações pelo tipo do e-mail.
- Prévia devolve Responsável, Para, CC, Assunto, HTML e anexos.
- `.eml` suporta CC, assinatura CID e anexos físicos.
- Reembolso exibe `Atividade.diretorio_url` como pasta/caminho de servidor.

## Banco, migração e validação

- Backup: `prisma/backups/dev-before-refatoracao-sistemica-2026-09-11.db`.
- Schema aplicado por `prisma db push --skip-generate`; nenhum reset foi usado.
- Script idempotente: `src/backend/scripts/migrar-refatoracao-sistemica.ts`. Copia Operadoras para Contratante sem apagar origem, classifica clientes, cria roteamentos e converte formalizações antigas.
- Validados: Prisma, health check, login real, perfil, assinatura, roteamento e clientes.
- Arquivos alterados sem erro TypeScript. O `tsc` global ainda mostra dívida preexistente sobretudo no monólito `SimuladorLPU.tsx`.

## Correções de 12/09/2026

- A prévia de faturamento voltou a exibir Responsável/Para/CC; o bloco estava no modal de
  cancelamento, que quebrava por referenciar `email` fora de escopo.
- Concluir uma formalização não sobrescreve mais a data real do pagamento: `atualizarStatusParcela`
  só carimba `data_pagamento` quando a parcela ainda não tinha uma.
- Leitura do roteamento ficou tolerante (`lenient`). O campo legado `destinatarios_pagamento`
  aceitava texto livre e, com endereço inválido, derrubava toda prévia de e-mail. A gravação
  pelo formulário continua estrita.
- `resolveEmailRouting` devolve `pendente`. Não existe destinatário padrão embutido — as três
  prévias avisam em âmbar quando falta cadastrar em **Configurações → Comunicação**.
- Sidebar ganhou a seção **SISTEMA** com Meu Perfil e Configurações. Antes só o avatar e a logo
  levavam a essas telas.
- `.gitignore` passou a cobrir `prisma/*.db`; o dump pré-refatoração foi movido para
  `prisma/backups/`.

### Lote 3 — segurança, domínio financeiro e design

- `/api/pos/faturamento-linhas/planilha` passou a exigir `requireAuth` e a filtrar por
  `tenant_id`; o front baixa por `downloadAuthenticatedFile` em vez de `<a href>`.
- **Formalização deixou de contar como caixa a sair.** `isDesembolsoPendente()` em
  `payment-domain.service.ts` é a regra única: uma `PAYMENT_FORMALIZATION` registra dinheiro
  que já saiu, então entra em "pago" e não segura o `CUSTO_PAGO` da atividade. A pendência
  dela é documental e tem KPI próprio ("Formalizações sem documento") em Controle de Pagamentos.
- Removidos os dois blocos mortos guardados por `{false && ...}` em `TabFornecedores.tsx`.
- O campo do formulário `data_compra_cartao` virou `data_pagamento_realizado` — ele guarda a
  data em PIX, TED, boleto ou dinheiro, não só cartão. A chave enviada à API continua
  `data_compra_cartao`, preenchida somente quando a forma é cartão.
- `Clientes.tsx` ganhou busca (nome/razão social/sigla/CNPJ), filtro por tipo, alternância de
  inativos e estado visual de inativo no cartão.
- `Clientes.tsx`, `MeuPerfil.tsx`, `PaymentAttachments.tsx` e `ConfiguracaoComunicacao`
  reescritos em formato legível; estavam em linhas minificadas à mão.
- `Configuracoes.tsx` passou a ler as CSS variables do tema (`--card`, `--border`,
  `--foreground`, `--primary`) em vez da paleta hex própria, e alinhou raio/altura/tipografia
  com o `rounded-xl` / `h-9` das telas em Tailwind. O JSX não foi reescrito.
- `ls_clientes_v2` **é exportável**: o botão "⬇ Backup" da sidebar já inclui `clientes` no JSON.
  A tela legada `TabClientes()` continua órfã no monólito, mas não bloqueia mais a migração.

## Pendências conscientes

- Migrar `ls_clientes_v2` somente após backup/export do usuário (o "⬇ Backup" da sidebar já o exporta).
- Remover tabela/API legada `Operadora` somente após auditoria final.
- Expandir `requireAuth` às APIs historicamente abertas.
- O Blueprint oficial foi atualizado em 12/09/2026 (v4) com a **seção 23 — Refatoração sistêmica**
  e a revisão das seções 05, 14 e 21:
  https://claude.ai/code/artifact/8eebd04f-dc2e-4cb4-8752-05d444a7b4a8
  Este handoff registra o detalhe de implementação; o Blueprint continua sendo a fonte funcional.
