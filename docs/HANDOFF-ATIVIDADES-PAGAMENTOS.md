# Handoff — atividades, pagamentos e prestação de contas

Última atualização: 09/09/2026

Este documento registra as decisões e alterações implementadas no fluxo financeiro do Cockpit de Atividades. Ele deve ser lido pelo Claude junto com o `AGENTS.md` antes de continuar o desenvolvimento.

## Objetivo funcional

Padronizar a apresentação e o comportamento dos pagamentos de fornecedores, funcionários, reembolsos e adiantamentos. Todos devem expor, conforme o caso:

- forma de pagamento;
- status com a mesma linguagem visual;
- datas de solicitação, previsão e pagamento;
- ação de e-mail;
- comprovante bancário por pagamento;
- memória/arquivo de cálculo separado do comprovante;
- suporte a mais de um depósito no mesmo processo;
- prestação de contas consolidada de vários depósitos de adiantamento.

## O que foi implementado

### Padronização dos cadastros de pessoas e fornecedores

- Funcionário e fornecedor usam o mesmo componente `DadosBancariosForm.tsx` para dados bancários e PIX.
- Campos de domínio fechado são apresentados como `select`: forma de pagamento, tipo de chave PIX, tipo de conta, banco, UF, região, tipo de pessoa, categoria, vínculo e função, conforme aplicável a cada cadastro.
- Tipo de chave PIX usa valores canônicos `CPF`, `CNPJ`, `EMAIL`, `TELEFONE`, `ALEATORIA` e `NAO_POSSUI`, mas a interface reconhece valores legados como “Celular” e “N/A”.
- Tipo de conta usa `CORRENTE`, `POUPANCA`, `PAGAMENTO`, `SALARIO` e `NAO_APLICAVEL`.
- A lista de bancos oferece instituições usuais e a opção “Outro banco”, que abre texto livre sem impedir bancos não catalogados.
- Forma padrão do funcionário é persistida e usada na criação posterior de pagamentos; cartão corporativo permanece disponível apenas no cadastro de fornecedor, onde se aplica.

### Padronização das linhas de pagamento

- Fornecedores e funcionários usam o componente compartilhado `PagamentoStatusSelect.tsx` para o seletor de status.
- Reembolsos e adiantamentos passaram a apresentar uma linha por depósito, no mesmo padrão compacto das parcelas dos fornecedores.
- Cada linha possui número do depósito, valor, forma, comprovante, datas, e-mail e status.
- A fila geral em `ControlePagamentos.tsx` também expande os depósitos individualmente.
- Solicitações de fornecedor/funcionário ainda não pagas permitem editar valor e datas ou excluir a solicitação. Excluir cancela o pedido ao financeiro, preserva seu histórico e devolve a parcela para `PENDENTE`; não elimina a obrigação do contrato.
- Depósitos de reembolso/adiantamento ainda não pagos permitem editar valor/dados ou excluir a própria solicitação, inclusive depois de marcados como `SOLICITADO`.

### Formas de pagamento e cartão corporativo

- As formas suportadas pelo fluxo incluem PIX, transferência/TED, boleto, dinheiro e cartão corporativo, conforme o tipo de pagamento.
- O fluxo de fornecedores aceita compra no cartão e posterior formalização no sistema e por e-mail.
- O cadastro de cartão guarda somente dados administrativos seguros, como bandeira e quatro últimos dígitos; número integral e CVV não devem ser armazenados.
- A conciliação completa de fatura do cartão ainda é uma evolução pendente.

### Comprovante e arquivos de apoio

- O comprovante bancário pertence a um depósito específico (`ReembolsoPagamento.comprovante_url`).
- O arquivo de apoio/cálculo pertence ao processo de reembolso/adiantamento (`ReembolsoArquivo`) e é independente do comprovante.
- Pode haver mais de um arquivo de apoio por processo.
- Todos os formatos são aceitos, inclusive compactados (`.zip`, `.rar`, `.7z`, `.tar`, `.gz`), arquivos técnicos e arquivos sem extensão.
- Limite atual de upload: 100 MB por arquivo.
- Arquivos são gravados em `storage/reembolsos/`; o banco guarda metadados e uma chave interna segura.
- O conteúdo não é executado nem publicado diretamente: o nome físico é aleatório e o download força `application/octet-stream`, usa `nosniff`, impede navegação de diretório e preserva o nome original apresentado ao usuário.

### Múltiplos depósitos

- Um `Reembolso` continua sendo o processo/cabeçalho.
- Cada transferência efetiva é um `ReembolsoPagamento`, numerado sequencialmente dentro do processo.
- O usuário pode criar, editar e excluir depósitos enquanto as regras de estado permitirem.
- Para reembolso, a soma programada não pode ultrapassar o valor total do processo.
- Ao corrigir para cima o único depósito ainda não pago de um reembolso simples (uma única despesa que representa o total), o sistema sincroniza automaticamente depósito, total do processo e despesa. Reembolsos com múltiplas despesas/depósitos exigem ajustar primeiro o detalhamento, para não romper a conferência da memória de cálculo.
- O cabeçalho legado de `Reembolso` é sincronizado como resumo dos depósitos para manter compatibilidade temporária com código antigo.
- Ao excluir o último depósito ainda permitido, o resumo volta para o estado pendente e limpa datas/comprovante derivados.

### Prestação de contas consolidada

- O usuário seleciona um ou mais depósitos pagos de adiantamento do mesmo favorecido.
- Os depósitos podem vir de processos/atividades diferentes; nesse caso a prestação consolidada fica sem uma única `atividade_id`.
- Um depósito só pode participar de uma prestação de contas, garantido também no banco por `PrestacaoContasPagamento.pagamento_id @unique`.
- Somente depósitos com status financeiro pago/concluído podem ser selecionados.
- A prestação registra valor adiantado consolidado, despesas, saldo, parecer e estados de análise.
- Estados previstos: `EM_PREENCHIMENTO`, `ENVIADA`, `EM_ANALISE`, `APROVADA` e `AJUSTES_SOLICITADOS`.
- A interface para seleção e edição está em `PrestacaoConsolidadaPanel.tsx`, incorporada à seção de reembolsos/adiantamentos.

## Modelo de dados

Modelos adicionados ao `prisma/schema.prisma`:

- `ReembolsoPagamento`: depósito/parcela efetiva, com número, valor, forma, status, datas e comprovante.
- `ReembolsoArquivo`: arquivo administrativo classificado; atualmente usado como `MEMORIA_CALCULO`.
- `PrestacaoContasConsolidada`: cabeçalho da prestação consolidada.
- `PrestacaoContasPagamento`: vínculo entre a prestação e cada depósito selecionado.
- `PrestacaoContasDespesa`: itens de despesa da prestação consolidada.

Os modelos e campos antigos `ReembolsoDespesa`, `prestacao_status` e demais dados de prestação existentes em `Reembolso` permanecem por compatibilidade. Não removê-los sem auditoria e migração explícitas.

## APIs principais

Base `/api/reembolsos`:

- `GET /` — lista processos com depósitos e arquivos.
- `POST /:id/pagamentos` — adiciona depósito.
- `PUT /pagamentos/:pagamentoId` — altera valor, forma e datas do depósito.
- `PUT /pagamentos/:pagamentoId/status` — altera seu status.
- `DELETE /pagamentos/:pagamentoId` — exclui depósito permitido.
- `POST /:id/arquivos-calculo` — envia memória de cálculo (`multipart`, campo `arquivo`).
- `GET /arquivos/:arquivoId/download` — baixa arquivo de cálculo.
- Na interface, cada anexo agora apresenta nome, extensão, tamanho e ações explícitas **Baixar** e **Excluir**. O seletor aceita vários arquivos por vez e pode ser usado novamente para acrescentar quantos anexos forem necessários (limite de 100 MB por arquivo).
- Nomes com acentos enviados por `multipart/form-data` são normalizados no backend para evitar textos como `JOSÃ‰`; arquivos compactados continuam sendo servidos como download, nunca executados ou abertos pelo servidor.
- `DELETE /arquivos/:arquivoId` — remove arquivo de cálculo.
- `POST /:id/email` e `GET /:id/email.eml` aceitam `pagamento_id` para gerar comunicação referente ao depósito certo.

Base `/api/prestacoes-contas`:

- `GET /` — lista prestações consolidadas.
- `POST /` — cria com `pagamento_ids`.
- `PUT /:id` — atualiza itens de despesa e dados da prestação.
- `POST /:id/enviar` — envia para análise.
- `POST /:id/analisar` — registra aprovação ou solicitação de ajustes.
- `DELETE /:id` — exclui quando permitido.

Base `/api/pagamentos`:

- A origem `DEPOSITO` foi adicionada às rotas de comprovante.
- A listagem central transforma os depósitos em lançamentos independentes e informa `processo_id` e `deposito_numero`.

Base `/api/contratacoes`:

- `PUT /parcelas/:parcelaId` — edita valor, percentual derivado, forma e datas enquanto o pagamento não estiver concluído.
- `POST /parcelas/:parcelaId/cancelar-solicitacao` — cancela a solicitação ativa, preserva a auditoria e devolve a parcela para `PENDENTE`.
- `DELETE /parcelas/:parcelaId` continua reservado à remoção da própria parcela quando a regra do contrato permitir; não deve ser confundido com cancelar uma solicitação ao financeiro.

## Arquivos centrais alterados

Backend:

- `prisma/schema.prisma`
- `src/backend/controllers/reembolso.controller.ts`
- `src/backend/controllers/prestacao-consolidada.controller.ts`
- `src/backend/controllers/pagamentos.controller.ts`
- `src/backend/routes/reembolso.routes.ts`
- `src/backend/routes/prestacao-consolidada.routes.ts`
- `src/backend/services/reembolso-arquivo.service.ts`
- `src/backend/server.ts`

Frontend:

- `src/frontend/components/atividades/PrestacaoContasViagem.tsx`
- `src/frontend/components/atividades/PrestacaoConsolidadaPanel.tsx`
- `src/frontend/components/atividades/PagamentoStatusSelect.tsx`
- `src/frontend/pages/ControlePagamentos.tsx`

Migração:

- `src/backend/scripts/backfill-reembolso-pagamentos.ts`

## Migração executada em 09/09/2026

- Backup anterior à alteração: `prisma/backups/dev-before-multiplos-depositos-2026-09-09.db`.
- Schema aplicado com `prisma db push --skip-generate` e cliente regenerado.
- Backfill executado: 2 processos existentes e 2 depósitos iniciais criados; nenhuma prestação legada precisou ser convertida.
- O reembolso e o adiantamento existentes de José da Silva foram preservados como depósito 1, com valores, status, datas e comprovantes anteriores.
- Na adequação posterior de edição/exclusão, `SolicitacaoPagamento` recebeu valor congelado, estado e campos de cancelamento. Backup anterior: `prisma/backups/dev-before-cancelamento-solicitacao-2026-09-09.db`.
- O script `src/backend/scripts/backfill-solicitacao-pagamento-auditoria.ts` completou `valor_snapshot` em 5 solicitações existentes, sem alterar o valor das parcelas.
- Na padronização dos cadastros, o backup `prisma/backups/dev-before-padronizacao-cadastros-2026-09-10.db` foi criado antes do `db push`. O script `src/backend/scripts/backfill-cadastros-financeiros.ts` normalizou forma de pagamento, tipo PIX e tipo de conta de 1 funcionário e 6 fornecedores existentes.

## Auditoria das solicitações de pagamento

- `SolicitacaoPagamento.valor_snapshot` registra o valor da parcela no momento da solicitação.
- `status` diferencia `ATIVA` de `CANCELADA`.
- `atualizada_em` registra edição posterior de valor ou previsão.
- `cancelada_em`, `cancelada_por` e `motivo_cancelamento` preservam a trilha da exclusão solicitada pelo usuário.
- Editar uma parcela solicitada atualiza o snapshot ativo; pagamentos concluídos continuam bloqueados para alteração.

## Regras técnicas para continuar

- Este projeto não usa migrations Prisma. Para qualquer nova alteração de schema: parar o backend, criar backup do banco, executar `npx prisma db push --skip-generate`, executar `npx prisma generate` e reiniciar explicitamente o backend.
- Usar o Node portátil indicado no `AGENTS.md`.
- Preservar as telas/dados legados até confirmar sua origem e concluir qualquer migração necessária.
- Comparar mudanças funcionais com o Blueprint LSI. O Artifact original ainda não está no repositório; pedir o link ao usuário se a decisão ultrapassar este handoff.

## Validação realizada

- `npx prisma validate`: aprovado.
- `npm run build:backend`: aprovado.
- `npm run build:frontend`: aprovado.
- APIs locais: listagem de depósitos, rejeição de seleção vazia e criação/remoção controlada de prestação consolidada aprovadas.
- Upload, download e remoção controlada de memória de cálculo em CSV aprovados; o registro e o arquivo de teste foram removidos ao final.
- O build do frontend mantém avisos preexistentes de tamanho de bundle e base de navegadores desatualizada; não são erros desta implementação.

## Pendências conhecidas

- Obter e registrar o link/conteúdo oficial do Blueprint LSI para reconciliação documental completa.
- Implementar conciliação de fatura do cartão corporativo, caso seja priorizada.
- Implementar anexos individuais nas linhas de despesa consolidada; o campo `anexo_url` já está preparado, mas a rota de upload específica ainda não existe.
- Implementar comunicação por e-mail da prestação consolidada, se desejado; hoje os e-mails são gerados por depósito/processo.
- Acrescentar testes automatizados de integração para uploads, múltiplos depósitos e concorrência na seleção consolidada.
## Sincronização automática de cadastros e pendências

- Funcionário e fornecedor são a fonte mestre dos dados cadastrais e bancários.
- Ao editar nome, CPF/CNPJ, banco, agência, conta, tipo de conta, tipo/chave PIX ou forma padrão de pagamento, o backend atualiza automaticamente reembolsos, adiantamentos, parcelas e solicitações que ainda estejam em `PENDENTE` ou `SOLICITADO`.
- A forma de pagamento de uma obrigação só acompanha a troca do padrão quando ainda correspondia ao padrão anterior. Uma escolha específica feita naquela obrigação é preservada.
- Toda nova pré-visualização ou arquivo `.eml` de reembolso/adiantamento consulta o cadastro mestre no momento da geração, inclusive quando o depósito já foi pago ou recebeu comprovante. Assim, uma chave PIX corrigida aparece imediatamente ao fechar e gerar novamente o e-mail. O snapshot histórico continua preservado no registro financeiro e não é reescrito.
- Alterações da atividade (site, título, cliente, descrição, pasta etc.) passam a regenerar contratos com status `GERADO` e são lidas diretamente pelas prévias de e-mail.
- Contratos `ENVIADO` ou `ASSINADO`, pagamentos `PAGO`, `COMPROVANTE_RECEBIDO` ou `CONFERIDO` e demais registros concluídos não são reescritos. Eles conservam o snapshot usado na época para fins de auditoria.
- O serviço central da regra é `src/backend/services/sincronizacao-pendencias.service.ts`; ele é acionado pelos endpoints de atualização de funcionário, fornecedor e atividade.
- Validação de integração em 10/09/2026: atualização normal do cadastro DIASTRON sincronizou a solicitação ativa ligada à parcela pendente (PIX, banco, agência e conta), marcou `atualizada_em` e a prévia do e-mail passou a usar os mesmos dados mestres. Builds de backend e frontend aprovados.
- Correção complementar em 10/09/2026: prévias e arquivos `.eml` de reembolso/adiantamento passaram a impedir cache no navegador e em proxies. A interface também usa `cache: no-store` e uma chave única por geração. Validado com os dois processos de José da Silva: ambos exibiram a chave PIX atual do cadastro mestre e não apresentaram o snapshot antigo; builds de backend e frontend aprovados.
