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

## Assinatura global dos e-mails — 11/09/2026

- Assinatura personalizada passou a pertencer ao usuário autenticado e não aos templates de pagamento.
- Pagamento, reembolso, adiantamento e faturamento usam o compositor global documentado em `docs/HANDOFF-ASSINATURA-EMAIL.md`.
- A antiga prévia textual duplicada da programação de pagamento foi removida; a solicitação abre a prévia corporativa assinada.
- O arquivo da assinatura fica no storage e somente metadados ficam no banco.
- O assunto usa `Atividade.tipo_demanda` como origem: `IMPLANTACAO` vira **IMPLANTAÇÃO** e `OPERACAO` vira **OPERAÇÕES**. Reembolso, adiantamento ou pagamento não definem a origem; sem atividade classificada, o fallback neutro é **ENGENHARIA**.
- Reembolsos e adiantamentos usam `Atividade.diretorio_url` na seção **Link das despesas** para indicar onde o financeiro deve salvar comprovantes, memórias de cálculo e demais arquivos. O caminho é cadastrado em **Identificação → Diretório da atividade no servidor**.
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

## Padronização visual dos pagamentos — 10/09/2026

- A aba Pagamentos da atividade e o Controle de Pagamentos passaram a usar a mesma hierarquia: favorecido → categoria e total → parcela/depósito → valor e status → datas e comprovante → ação principal.
- Fornecedores, funcionários, reembolsos e adiantamentos usam os componentes compartilhados de `src/frontend/components/financeiro/FinancialCards.tsx`.
- O seletor compartilhado `PagamentoStatusSelect` é usado também no Controle de Pagamentos, eliminando a diferença visual entre pagamentos como os de José da Silva e Antônio Fábio.
- Ações de uso frequente permanecem visíveis. Edição, cancelamento/exclusão, alteração de forma de pagamento e remoção de comprovante ficam no menu “Mais ações”.
- Arquivos de contrato e memórias de reembolso/adiantamento aparecem em uma seção compacta e recolhível, com inclusão, download e exclusão preservados.
- Reembolsos e adiantamentos compartilham o mesmo cartão-base; as diferenças são apenas categoria, valores e ações permitidas pela regra existente.
- O Controle de Pagamentos deixou de depender de tabela larga e agora agrupa obrigações por favorecido, com cartões responsivos para desktop e telas menores.
- Não houve mudança de schema, API, status, regra financeira ou conteúdo persistido nesta etapa; foi uma refatoração da apresentação e da composição dos controles existentes.
- Validação: `npm run build:frontend` aprovado. A checagem TypeScript global continua acusando débitos antigos, sobretudo no monólito `SimuladorLPU.tsx`; nenhum novo erro foi encontrado nos arquivos desta refatoração.

## Fluxo de status da atividade e avanço — 15/09/2026

São **dois assuntos distintos**, e confundi-los foi a causa do travamento de Marabá:

**Tema 1 — status da atividade.** Fluxo único de cinco estados, o mesmo para Implantação e
Operação, e as mesmas colunas do Pipeline:

    PLANEJAMENTO → AGUARDANDO_LIBERACAO → EM_EXECUCAO → CONCLUIDA
                          ON_HOLD (transversal)

- Fonte única: `src/backend/services/status-atividade.service.ts`. O frontend espelha em
  `STATUS_OPERACIONAL` (`constants.tsx`) e `KANBAN_ORDEM` (`Atividades.tsx`).
- **Decisão: híbrido.** A automação alcança somente `EM_EXECUCAO` e `CONCLUIDA`, sempre por
  `proximoStatusAutomatico()` — que nunca regride e nunca tira ninguém de `ON_HOLD`.
  `AGUARDANDO_LIBERACAO` e `ON_HOLD` são manuais porque não deixam rastro no sistema que
  qualquer regra consiga inferir: são espera por terceiro e parada de obra.
- Controle manual: `StatusOperacionalControl.tsx`, no cabeçalho do cockpit. A observação
  digitada ali vai para `AtividadeStatusHistorico` e é o único registro do motivo.
- `PUT /api/atividades/:id` recusa com 400 qualquer status fora dos cinco.
- **`APC_LIBERADO` saiu do status da atividade.** Era um gate, não uma fase: obra liberada e
  parada e obra liberada com 60% construído apareciam iguais — foi exatamente onde Marabá
  encalhou. Liberar o APC agora leva direto a `EM_EXECUCAO`. O gate do "Start Cronograma"
  passou a olhar o **registro de APC** (`APC.status === 'APC_LIBERADO'`), que é outra coisa e
  continua existindo.
- Migração: `npx tsx src/backend/scripts/migrar-status-atividade.ts --aplicar`
  (`AGUARDANDO_APC→AGUARDANDO_LIBERACAO`, `APC_LIBERADO→EM_EXECUCAO`, `PAUSADA→ON_HOLD`,
  histórico incluído). Aplicada em 15/09/2026.
- Validação: `npx tsx src/backend/scripts/validar-status-atividade.ts` — 21/21, incluindo o
  teste de ponta a ponta contra o endpoint.

**Tema 2 — avanço físico.** O avanço continua sendo informado por etapa; o que passou a
existir é o **previsto pelas datas planejadas** ao lado dele. Uma etapa de 10/09 a 15/09 são
seis dias, logo ~17% ao dia; etapa sem data planejada entra neutra na média (devolve o próprio
avanço real) para não inventar desvio que ninguém pode explicar. A barra de avanço da aba
Planejamento ganhou o traço do previsto e a legenda "adiantado/atrasado N p.p."
(`previstoDoItem()` em `TabPlanejamento.tsx`).

## Referência dos reembolsos e adiantamentos — 15/09/2026

- `Reembolso.codigo` (`String? @unique`): `REE-2026-0041` para reembolso, `ADT-2026-0007` para
  adiantamento, seguindo o padrão de `DEM-YYYY-NNN`. Quatro dígitos porque reembolso é o
  lançamento de maior volume do sistema.
- Gerador: `src/backend/services/referencia-reembolso.service.ts`. Parte do **maior sequencial
  já emitido** no ano, não da contagem de linhas — contar linhas repetiria um código depois de
  qualquer exclusão.
- Os e-mails citavam `Reembolso 3f9a1c20`, um pedaço do UUID que ninguém dita por telefone nem
  procura no extrato. O rodapé usa `r.codigo` e só cai no fragmento antigo se o lançamento
  ainda não tiver código.
- Backfill dos lançamentos antigos: `npx tsx src/backend/scripts/backfill-codigo-reembolso.ts
  --aplicar`. Numera pela ordem de criação e pelo **ano de cada lançamento**, não pelo ano
  corrente. Aplicado em 15/09/2026: 5 lançamentos, 0 duplicados.
- A referência aparece no cartão do favorecido (`PrestacaoContasViagem.tsx`), na linha do
  Controle de Pagamentos e na busca daquela tela (`LinhaPagamento.referencia`).

## Modelo visual do e-mail financeiro — 15/09/2026

O template único que serve as seis modalidades passou a seguir o modelo
aprovado (cartão de 620px, cabeçalho marinho, três caixas de destaque).
Nenhum cálculo, valor, chave, favorecido, data, condição, destinatário, anexo ou
permissão mudou.

### O defeito do comentário HTML, corrigido na origem

Comentário HTML **não aninha**. Um bloco de documentação que citasse a sintaxe
de outro marcador por extenso encerrava-se no primeiro `-->` e despejava o resto
da prosa — paleta, nomes de arquivo, notas internas — no corpo do e-mail que
chega ao financeiro. Três camadas impedem isso:

1. **O template não guarda prosa.** A documentação vive em
   `email-corporativo.service.ts`, onde o comentário é de TypeScript e não pode
   vazar. No `.html` só restam marcadores funcionais.
2. **`removerComentariosNaoFuncionais()`** apaga, antes do envio, todo
   comentário que não seja `#SE:`/`#FIM:`, `ASSINATURA`, `FOOTER` ou condicional
   do Outlook. O filtro **equilibra as aberturas**: ao encontrar um `<!--` dentro
   do corpo de um comentário, continua consumindo fechamentos até fechar o bloco
   inteiro. Sem isso, um bloco mal formado deixaria a prosa seguinte solta no
   corpo, fora de qualquer comentário — e aí nada a distingue de conteúdo.
3. **`validar-acabamento-email.ts`** reprova prosa no template ou no corpo
   renderizado de qualquer um dos seis tipos.

Verificado por injeção de falha: com o defeito reintroduzido no template, o
corpo renderizado sai limpo e o validador acusa a origem.

### Composição

- Cartão de **960px** com borda `#E3E9F0`, cantos de 16px e 48px de recuo
  lateral, **sobre fundo branco**. Subiu de 620 → 720 → 960 em pedidos
  sucessivos, vendo o e-mail aberto no Outlook numa janela larga.
  O recuo acompanhou (40 → 48px) para o conteúdo não encostar na borda.
  A linha longa deixou de ser um risco de leitura porque quase todo o conteúdo
  vive em linhas rótulo/valor — o rótulo trava em um terço e o valor ocupa o
  resto. A prosa que sobra (abertura, observações, chamada de ação) é curta e
  não passa de duas linhas nessa largura.
  O azul claro da página foi retirado a pedido; a borda entrou no mesmo passo
  para o cartão não se dissolver no branco, já que perdeu o contraste de fundo.
- Cabeçalho `#08213F`: emblema + "LS OFFICE" à esquerda, selo
  `PAGAMENTO PREVISTO` com a data à direita, filete `#173C64`, e a linha
  `FINANCEIRO / {área}` — a área vem de `areaOrigem()`, a mesma função que monta
  o assunto, para cabeçalho e assunto não se contradizerem.
- Filete vermelho `#E2231A` de 3px.
- **Três caixas de destaque numa única linha de tabela**, com a cor de fundo na
  própria `<td>`. É isso que garante altura idêntica; tabelas internas com fundo
  próprio quebrariam o alinhamento. A caixa do favorecido some sem favorecido e
  a da chave some sem PIX, junto com o respectivo espaçador.
- Seções com título de 10px em `#1F6FE0`, caixa alta, `letter-spacing` 2.4px.
- Linhas rótulo/valor: **rótulo em um terço, valor começando no terço seguinte,
  alinhado à esquerda**, separador `#EEF2F7`. O valor esteve encostado na borda
  direita: com rótulo curto ("Operadora") e valor curto ("CLARO") abria-se um vão
  de meia largura no meio da linha, e o olho tinha de atravessar o vazio para
  ligar um ao outro. No terço, os valores ainda formam coluna — dá para comparar
  cifras — mas a informação ocupa o espaço.
- Rótulos em `#46566B`, não no cinza claro anterior: era secundário demais para
  um documento que o financeiro confere campo a campo.
- Bloco de anexos, chamada de ação com barra azul e rodapé marinho.
- **Caixa da chave PIX em marinho com aresta vermelha `#E2231A` de 5px** e o
  rótulo CHAVE PIX em vermelho claro. A caixa era marinho liso, igual ao
  cabeçalho e ao rodapé, e se dissolvia na estrutura justamente sendo a que
  carrega a ação. Bloco vermelho inteiro foi descartado: num e-mail financeiro
  ele é lido como pendência ou atraso, e aqui a chave é só o destino do dinheiro.
- Corpo em 15px, rótulos em 13,5px e títulos de seção em 11,5px.
- `<style>` com as media queries de 480px, as únicas regras não inline. No
  celular as caixas empilham por `.col` com `margin-bottom` (não `padding`, que
  ficaria dentro da cor de fundo) e `box-sizing:border-box`.

### Logo

O cabeçalho é marinho e a logo cadastrada em `EmpresaConfig` é o lockup quadrado
com o fundo **branco gravado no arquivo** — sobre o marinho viraria um quadrado
branco. O e-mail usa `EMBLEMA_LS_TRANSPARENTE` (`src/backend/assets/marca-ls.ts`),
o mesmo símbolo com fundo removido, sem recorte, deformação nem recoloração.

Tamanho: **100 × 100 px**, que é 2,65 cm nos 96 dpi do motor do Word — a medida
pedida, conferida no painel Tamanho do próprio Outlook. Largura e altura vão
também como atributo `width`/`height`, e não só no `style`: o Outlook dimensiona
imagem pelo atributo. O PNG de origem tem 256px, então a 100px ele ainda é
renderizado com folga de densidade e não serrilha.

### Dados que mudaram de lugar (nenhum se perdeu)

- **CPF/CNPJ** saiu das linhas bancárias e virou a legenda da caixa FAVORECIDO.
- **Valor total contratado** saiu das condições financeiras e virou o
  complemento sob o valor em destaque (`de R$ X contratados`), que é onde ele
  diz o que precisa dizer: este número não é o processo inteiro.
- **Referência do processo** foi para o rodapé.

Cada um aparece **uma única vez**, conferido por `validar-unicidade-email`.

### Assinatura

Havendo assinatura pessoal, ela substitui o bloco institucional no lugar dele,
dentro do cartão. Antes era anexada ao fim do documento: como o template é uma
tabela centralizada sem `</body>`, a imagem de 590px caía fora do cartão e
abaixo do rodapé. E-mails sem os marcadores `ASSINATURA`/`FOOTER` (faturamento)
mantêm o comportamento antigo.

### Exceções deliberadas ao modelo

- **Sem a assinatura "Disciplina hoje. Conexões para o amanhã."** — foi removida
  do sistema a pedido, em etapa anterior. Reativá-la é uma linha no cabeçalho.
- A linha em branco de **Caminho** em "Onde arquivar" continua aparecendo vazia
  na programação de pagamento e na formalização no cartão: é regra de negócio —
  quem envia preenche no próprio Outlook antes de disparar.
- Não há parte `text/plain` no `.eml`; o HTML é a única parte. Valor, chave e
  condições são texto real, então a conversão automática do cliente os carrega.

### Filetes: o que o Outlook fez com eles

A primeira renderização vista no Outlook (compose, 15/09) mostrou o separador de
1px do cabeçalho saindo com ~14px de altura — uma barra, não um filete.

Causa: o motor do Word **ignora `font-size:0` e `line-height:0`**. O `&nbsp;`
dentro da célula volta à entrelinha padrão e empurra a altura, mesmo com
`height:1px` no style. A correção usa as três coisas que o Word respeita:
atributo `height`, `font-size`/`line-height` explícitos em px,
`mso-line-height-rule:exactly`, e `&#8203;` (largura zero) no lugar do `&nbsp;`.

Aplicado aos dois filetes horizontais, às duas barras verticais dos blocos de
aviso, ao espaçador de 36px e aos espaçadores de 14px entre as caixas. O
validador reprova qualquer filete que volte a depender de `font-size:0`.

Outros comportamentos observados nesse mesmo Outlook, que **não** são defeito:
os cantos arredondados somem (o Word não suporta `border-radius`) e as palavras
em caixa alta aparecem sublinhadas na janela de composição — é o corretor
ortográfico, não chega ao destinatário.

### Verificação

`validar-template-email`, `validar-acabamento-email`, `validar-email-reembolso`,
`validar-email-pagamento`, `validar-unicidade-email` e `validar-eml-cid`: todos
aprovados. Prévias por `npx tsx src/backend/scripts/previa-rodrigo.ts <pasta>`.

Renderização medida em Chrome a 375, 380, 960 e 1020px nos cinco cenários, com
**zero rolagem horizontal** — medida por harness em iframe, porque o Chrome
headless no Windows tem largura mínima de janela (~504px) e um screenshot a 390
apenas recorta uma página diagramada mais larga.

**Outlook Desktop não foi testado**: não há cliente neste ambiente e navegador
não substitui o motor do Word. A estrutura é TABLE + CSS inline, sem flex, grid,
JavaScript nem webfont, mas o acabamento no Outlook continua por confirmar — em
especial as media queries, que o Outlook desktop ignora (lá o e-mail renderiza
sempre na composição de 960px).

## Corrigir e excluir pagamentos · detalhamento do serviço — 15/09/2026

### O que faltava

A aba Pagamentos não tinha como desfazer um lançamento errado. O menu oferecia
**"Excluir solicitação"**, que devolve a parcela para `PENDENTE` e a mantém no
contrato — útil para cancelar um pedido ao financeiro, inútil para uma linha
lançada errada. Não havia nada para apagar a parcela nem a contratação, e
`PUT/DELETE /api/contratacoes/:id` sequer existiam. O `DELETE` de parcela existia
no backend desde sempre, sem nenhuma porta na interface.

### O que passou a existir

- `PUT /api/contratacoes/:id` — `editarContratacao`: valor contratado, finalidade
  e detalhamento. Não toca em parcela; ao mudar o valor, chama `reconciliarSaldo`.
- `DELETE /api/contratacoes/:id` — `removerContratacao`: apaga a contratação com
  parcelas, solicitações, anexos e o contrato gerado, em transação.
- Na interface: **Editar contratação** e **Excluir contratação** no menu do
  favorecido, com painel de edição embutido no próprio cartão; e **Excluir
  pagamento** no menu da parcela, ligado ao `DELETE` que já existia.

### O que eles recusam, e por quê

Pagamento efetuado é fato financeiro. Apagá-lo esconderia dinheiro que saiu do
caixa, então:

- excluir contratação com qualquer parcela `PAGO`/`COMPROVANTE_RECEBIDO`/
  `CONFERIDO` responde 400 dizendo **quantos pagamentos e quanto** já saíram, e
  aponta o caminho certo — cancelar a contratação, não excluí-la;
- excluir parcela paga responde 400 (guarda que já existia em `removerParcela`);
- baixar o valor contratado abaixo do que já foi pago responde 400 com o número
  na mão.

A interface nem oferece "Excluir contratação" quando há pagamento efetuado; a
recusa do backend é a segunda barreira, não a primeira.

### Detalhamento do serviço

`Produto / Serviço` é código de catálogo: `MAO_DE_OBRA` vale igualmente para o
serralheiro, o eletricista e o ajudante. A `Descrição` do e-mail é montada desse
código mais o título da atividade ("Mão de obra — Implantação Collo"), e por isso
não distingue uma contratação da outra.

`ContratacaoFornecedor.observacoes` já existia no schema e era preenchido em
adiantamento e reembolso, mas **o formulário de contratação comum não tinha o
campo** e **o e-mail nunca lia esse valor** — só as observações digitadas na hora
do envio.

Agora: o campo **"Detalhamento do serviço"** aparece no formulário de contratação
e no painel de edição, e sai no e-mail como a linha `Detalhamento`, logo abaixo
de `Descrição`, dentro de "Identificação da demanda". Só aparece quando
acrescenta — repetir o que o catálogo já disse não ajuda a conferir.

### Verificação

`npx tsx src/backend/scripts/validar-crud-contratacao.ts` — 17 verificações
contra a API em execução, incluindo as três recusas. O teste cria os próprios
registros e apaga tudo no fim; confirmado que não sobra resíduo no banco.
`npm run build:frontend` aprovado e os seis validadores de e-mail no verde.

## Auditoria da aba Pagamentos — 15/09/2026

Leitura completa das duas seções financeiras (fornecedores e reembolsos/
adiantamentos), feita para parar de corrigir de forma pingada. O método foi
cruzar **o que a API oferece** com **o que a interface expõe**, e comparar as
duas seções entre si — elas manipulam dinheiro do mesmo jeito e não podem ter
respostas diferentes para a mesma pergunta: "posso apagar isto?".

### Achado 1 — Editar/excluir existia no backend e não na tela

`PUT /api/reembolsos/:id` e `DELETE /api/reembolsos/:id` existiam desde sempre.
O cartão do favorecido só oferecia "Adicionar depósito". Agora tem menu com
**Editar** (favorecido e motivo, em painel embutido) e **Excluir**.

### Achado 2 — A guarda de exclusão do reembolso olhava o lugar errado

`deleteReembolso` conferia apenas `reembolso.status`. Esse status é **derivado**
dos depósitos e fica `AGUARDANDO_PAGAMENTO` enquanto um depósito já está `PAGO`
— ou seja, **dinheiro que já saiu do caixa passava pela verificação**. A
conferência passou a olhar os depósitos, que é onde o pagamento acontece, e a
recusa informa quantos e quanto.

### Achado 3 — Exclusão quebrava com erro cru do banco

`PrestacaoContasPagamento.pagamento` referencia `ReembolsoPagamento` **sem**
`onDelete: Cascade`. Excluir um reembolso cujo depósito estivesse vinculado a uma
prestação consolidada falhava com erro de chave estrangeira, sem dizer nada ao
usuário. Agora há guarda explícita, com a instrução de desvincular a prestação.

### Achado 4 — Duas cópias da mesma regra de sincronização

`pagamentos.controller.ts` tinha uma cópia de `sincronizarResumoPagamentos`.
As duas calculavam o mesmo status pelas mesmas regras, mas só a original zerava
`valor_adiantado`, `data_solicitacao` e `data_prevista` quando o último depósito
saía. **A mesma ação deixava o cabeçalho em estados diferentes conforme a tela
usada** — aba da atividade ou Controle de Pagamentos. A cópia foi removida;
a regra agora é uma só, exportada de `reembolso.controller.ts`.

### Achado 5 — Assimetria entre as duas seções

A parcela de contratação tinha "Excluir solicitação" (devolve a `PENDENTE`
mantendo a linha); o depósito de reembolso não tinha equivalente, e a única
saída era excluir o depósito inteiro. Agora tem **Cancelar solicitação**.

### Achado 6 — Cancelar deixava data órfã

Voltar o depósito para `PENDENTE` não limpava `data_solicitacao` nem
`data_pagamento`: o depósito ficava "pendente" exibindo a data de uma
solicitação que não valia mais. As datas agora saem junto.

### Matriz final

| Entidade | Criar | Editar | Excluir | Guarda |
|---|---|---|---|---|
| Contratação | sim | **novo** | **novo** | parcela paga |
| Parcela | sim | valor, datas | **novo** | parcela paga |
| Reembolso/adiantamento | sim | **novo** | **novo** | depósito pago, prestação vinculada |
| Depósito | sim | valor e dados | sim | depósito pago, prestação vinculada |

Em todos os casos a interface esconde a exclusão quando há pagamento efetuado, e
o backend recusa — a tela é a primeira barreira, nunca a única.

### Verificação

`validar-crud-contratacao.ts` (17 verificações) e `validar-crud-reembolso.ts`
(16), ambos contra a API em execução, criando os próprios registros e apagando
tudo no fim. Confirmado que não sobra resíduo no banco. `build:frontend`
aprovado e os seis validadores de e-mail no verde.

### Fica registrado, não implementado

- `PrestacaoContasPagamento` sem `onDelete: Cascade` é a causa-raiz do achado 3.
  Corrigir no schema exige `db push` e decisão sobre o que deve acontecer com a
  prestação quando o depósito some — é decisão de negócio, não de código.
- A tela de Controle de Pagamentos oferece um conjunto de ações diferente do da
  aba da atividade para os mesmos registros. Unificá-las é o próximo passo
  natural desta auditoria.

## Mudança de valor da atividade — 17/09/2026

Quando o valor total muda depois das parcelas lançadas, o caminho é **corrigir o
contrato, não a parcela**. Editar a parcela direto é recusado — a soma passaria
do contratado — e a recusa já diz o que fazer.

Corrigido o contrato, `reconciliarSaldo` ajusta o saldo em aberto sozinho:
contrato de 1.600 (entrada 1.000 + saldo 600) para 3.500 → a entrada permanece e
o saldo vira 2.500, com o percentual acompanhando. A entrada não é tocada porque
já foi prometida; quem absorve a diferença é o saldo, a parcela que ainda não foi
prometida a ninguém.

### Buraco encontrado e fechado

`reconciliarSaldo` só tratava **aumento** (`if (restante <= 0.01) return;`).
Baixar o contrato era aceito sem ajuste nenhum: um contrato de 1.200 ficava com
3.500 em parcelas. O defeito estava no `editarContratacao` adicionado na
auditoria anterior — a guarda conferia o **já pago**, não o **já alocado**.

Agora a função trata as duas direções: o excedente é absorvido pelo saldo em
aberto, e o saldo é excluído se zerar. Abaixo do que já está comprometido nas
demais parcelas, `editarContratacao` recusa dizendo quanto está comprometido —
não há o que encolher, e aceitar quebraria a soma.

Validado por `validar-ajuste-valor-contrato.ts`, que reproduz o caso real
(Rodrigo Barbosa Sobral, 1.600 → 3.500) nas duas direções, com 16 verificações
contra a API em execução.

## Valor da atividade × valor contratado — 17/09/2026

**Os dois não devem ser sincronizados.** São grandezas diferentes de propósito:

- `Atividade.valor_contrato` é a **receita** — o que a LS fatura do cliente.
- `Atividade.valor_orcado` é o **custo previsto**.
- A soma das `ContratacaoFornecedor` é o **custo comprometido** — o que a LS paga
  aos fornecedores.

Igualar receita e custo zeraria a margem, que é exatamente o que a aba Resultado
existe para medir. Em ATV-2026-003, por exemplo, a receita é R$ 83.770,85 contra
R$ 23.375,00 de custo contratado: a diferença é o resultado da obra, não um erro
de cadastro.

### O que faltava de verdade

Nada avisava quando o custo contratado passava do orçado, nem quando passava da
própria receita. Contratar era um ato cego: dava para comprometer qualquer valor
sem que a tela dissesse uma palavra.

O diagnóstico encontrou o caso concreto: **ATV-2026-002 tem R$ 1.400,00 de custo
comprometido com receita e orçado zerados** — uma atividade que só tem despesa
registrada, e nenhum aviso em lugar nenhum.

### O painel de custo

A aba Pagamentos ganhou um painel no topo da lista, que é onde a decisão de
contratar acontece:

- neutro enquanto o custo cabe no orçado;
- **âmbar** quando passa do orçado, dizendo em quanto;
- **vermelho** quando passa da receita, dizendo que a atividade está dando
  prejuízo e em quanto;
- **âmbar** também quando não há receita nem orçado preenchidos — porque aí não
  existe com o que comparar, e o silêncio anterior escondia justamente isso.

O painel é informativo: não bloqueia a contratação. Estourar o orçado é uma
decisão legítima de obra, e quem decide precisa da informação, não de um
impedimento.

## Onde ficou o comentário da alteração de valor — 17/09/2026

A pergunta tinha resposta desconfortável: **em lugar nenhum**. Três achados:

1. **A edição de valor não tinha campo de motivo.** Nem na parcela, nem na
   contratação. Quem escrevia a justificativa escrevia em outro campo — e depois
   não achava o texto.
2. **`SolicitacaoPagamento.motivo` é gravado e nunca exibido.** O campo "Motivo /
   observação para o financeiro", do diálogo Solicitar pagamento, vai para o
   banco e não volta em nenhuma tela. É escrita sem leitura.
3. **`AuditLog` existe no schema desde o começo e nunca teve uma escrita.** A
   tabela de auditoria do sistema estava vazia — zero linhas, zero chamadas.

### O que passou a existir

- `src/backend/services/registro-alteracao.service.ts` — a única porta de escrita
  do `AuditLog`. Guarda **antes, depois e motivo**, não só o motivo: a conferência
  não pode depender da memória de quem escreveu. A gravação nunca derruba a
  operação que a gerou.
- `editarParcela` e `editarContratacao` aceitam `motivo` e registram sempre —
  com motivo ou sem. Alteração sem justificativa continua permitida (proibir
  emperraria correção de digitação), mas nunca passa sem registro.
- `GET /api/contratacoes/:id/historico` — devolve as alterações da contratação e
  das suas parcelas, mais recentes primeiro, com o alvo em linguagem humana
  ("Contratação", "ENTRADA") em vez do id da tabela.
- Na interface: campo **Motivo da alteração** nos dois editores e
  **Histórico de alterações** no menu do favorecido, mostrando data, alvo,
  valor anterior → novo, autor e motivo.

Quando não há registro, o painel diz por quê: *"O histórico passou a ser gravado
agora; mudanças anteriores a isso não ficaram registradas."* — em vez de um vazio
que o usuário leria como perda de dado.

### Decisão: a auditoria sobrevive à exclusão

Excluir a contratação **não** apaga as linhas de auditoria dela. É o
comportamento certo para um registro de auditoria — apagar o rastro junto com o
objeto anularia o propósito. Consequência prática: o histórico de uma contratação
excluída continua no banco e não é mais acessível pela tela, já que o endpoint
parte da contratação. Se isso virar um problema de volume ou de privacidade, a
solução é uma tela de auditoria por atividade, não cascata na exclusão.

### Verificação

`validar-historico-alteracao.ts` — 17 verificações contra a API em execução:
motivo volta inteiro, antes/depois preservados, ordenação, alteração sem motivo
registrada com `motivo: null` (não inventado). Resíduo de auditoria dos testes
limpo após a execução.

### Fica registrado, não implementado

O motivo da **solicitação de pagamento** (achado 2) continua invisível. Ele já
está no banco; falta decidir onde cabe na tela do pagamento — provavelmente junto
das datas de solicitação, que é o contexto dele.

## Anexos do pagamento: um mecanismo só — 17/09/2026

O cartão de pagamento tinha **dois mecanismos de anexo independentes**, e eles se
contradiziam na tela: o botão "Adicionar comprovante" mostrava o arquivo em verde
enquanto a faixa "Documentos", logo abaixo, dizia *comprovante pendente* — sobre
o mesmo pagamento.

| | Caminho antigo | Faixa Documentos |
|---|---|---|
| Armazenamento | `comprovante_url` (uma URL no registro) | `PaymentAttachment` (tabela) |
| Arquivos | um só | vários, com tipo |
| Validação | nenhuma | SHA-256, fora da pasta pública |
| Usado por | Controle de Pagamentos | aba da atividade |

### Auditoria antes de mexer

Exigida pelo CLAUDE.md, e decisiva: **9 registros usam o campo legado** (5
parcelas + 4 depósitos, mais 3 cabeçalhos de reembolso) contra **2 no mecanismo
novo**. O legado é o que está em uso — e é a única cópia daqueles arquivos.

### O que foi feito

- **O upload duplicado saiu.** A faixa Documentos é o único lugar de anexo. O
  botão "Adicionar comprovante" e o indicador "Sem comprovante" do cabeçalho
  foram removidos dos dois cartões: uma afirmação, num lugar só.
- **O arquivo legado continua vivo e visível.** Aparece na faixa como
  *"Comprovante (arquivo anterior)"*, com download, e conta para o status de
  conferência. `removerComprovante` continua no menu. Nada foi migrado nem
  apagado.
- **Terceiro tipo de anexo: `OUTRO_DOCUMENTO`** — foto do serviço, orçamento,
  ordem de serviço assinada. Antes esses arquivos entravam como "comprovante" e
  sujavam a conferência: o cartão dizia que havia comprovante quando havia uma
  foto. A lista agora mostra o tipo ao lado do nome.
- **`LinhaPagamento.tem_comprovante`** — derivado das duas origens. O filtro
  "Pagos sem comprovante" e o indicador vermelho do Controle de Pagamentos liam
  só `comprovante_url`, então um comprovante anexado pela aba da atividade não
  saía daquele filtro. Uma consulta agregada resolve, sem N+1.

### O que deliberadamente não foi feito

Migrar os 9 arquivos legados para `PaymentAttachment`. Exigiria mover bytes entre
storages e há risco de perda sem ganho imediato — os dois já são exibidos juntos
e contam igual. Fica como decisão de manutenção, não de interface.

O Controle de Pagamentos continua gravando no campo legado ao anexar. Unificar
também a escrita é o passo seguinte; o que importava agora era que **a leitura
nunca mais se contradiga**, e isso está fechado.

## Anexar comprovante e o status do pagamento — 19/09/2026

Diagnóstico dos dois pagamentos que se comportaram diferente na tela:

| | Elexsandro dos Santos Braga | Alex Café Mendonça |
|---|---|---|
| Onde está o arquivo | `comprovante_url` (legado) | `PaymentAttachment` |
| Como aparece | *Comprovante (arquivo anterior)* | nome do arquivo, com excluir |
| Anexado por | Controle de Pagamentos | faixa Documentos |

A diferença de exibição é a esperada, e os dois contam igual para a conferência.
O arquivo legado não tem nome nem exclusão individual porque o campo guarda só
uma URL — não havia metadado para exibir.

### O defeito real: os dois caminhos tinham efeitos diferentes

- **Caminho legado** (`anexarComprovante`): grava a URL **e avança o status** para
  `COMPROVANTE_RECEBIDO`, preenchendo `data_pagamento` se faltava.
- **Faixa Documentos** (`storePaymentAttachments`): guardava o arquivo e **não
  tocava no status**.

Ou seja: anexar pela faixa deixava o pagamento parecendo que nada havia sido
anexado, e quem anexava tinha de trocar o status na mão — sem nenhuma pista de
que precisava. Era isso que estava por trás de "não reconheceu automaticamente".

### Correção

A regra virou `aplicarComprovanteRecebido()` em
`payment-attachment.service.ts`, chamada pelos **dois** caminhos. `CONFERIDO` não
regride. Só `COMPROVANTE_PAGAMENTO` dispara o avanço: nota fiscal e foto do
serviço são documentação e não afirmam que o dinheiro saiu.

## Realce das abas da atividade — 19/09/2026

As abas (Identificação, Planejamento, Pagamentos…) só mudavam a cor do texto ao
passar o mouse. Agora recebem fundo `hsl(var(--primary) / 0.07)` — exatamente o
`T.bgHover` que a barra lateral usa —, com cantos superiores arredondados. A aba
ativa leva `bg-primary/10`, mais forte, para continuar distinta de uma aba apenas
apontada pelo mouse.

A escolha de repetir o azul da sidebar é deliberada: a aba e o item de menu são a
mesma ação — escolher onde se está — e devem responder do mesmo jeito.

## O e-mail saía sem dizer o que estava sendo pago — 24/09/2026

O reembolso REE-2026-0004 tem motivo preenchido e visível na tela — *"Pagamento
para o Técnico Paulo Martins referente a contratação de um serralheiro..."* — e
o e-mail chegava ao financeiro **sem nenhuma descrição da despesa**.

### Causa: duas supressões que se anulavam

No bloco de identificação havia:

```
mesmoTexto(d.descricao, d.motivo_reembolso) ? '' : linha('Descrição', …)
mesmoTexto(d.motivo_reembolso, d.descricao) ? '' : linha('Motivo', …)
```

Cada linha se apagava quando era igual à outra. Com textos iguais, **as duas
somem** — a intenção de cada regra era evitar repetição, mas juntas elas
deletavam as duas cópias em vez de manter uma.

No reembolso isso era garantido, não eventual: `reembolso.controller.ts` manda o
mesmo `r.motivo` nos dois campos (`descricao` e `motivo_reembolso`). Todo e-mail
de reembolso saía sem dizer o que estava sendo pago.

A justificativa escrita na supressão — *"a descrição já é o texto de abertura do
bloco"* — era verdade numa versão antiga, quando `introducao()` repetia a
descrição. Hoje a abertura é uma frase fixa por modalidade e não repete nada; o
comentário sobreviveu à mudança que o invalidou.

### Correção

`Descrição` passa a sair **sempre** que houver texto. `Motivo` continua saindo só
quando acrescenta algo diferente. Duas regras de supressão mútua viram uma
unidirecional, e o texto nunca mais pode desaparecer por completo.

### Verificação

`validar-motivo-no-email.ts` — cobre os quatro cenários (textos iguais, textos
diferentes, só o motivo, nenhum dos dois) e confere que **as seis modalidades**
dizem o que está sendo pago. Conferido também contra o registro real
REE-2026-0004: o motivo agora sai sob o rótulo `Descrição`.

## Projeto de atividades e rateio nominal — 25/09/2026

Caso que originou tudo: 25 vistorias de energia da Oi, orçadas num orçamento só,
com um adiantamento único para pagar os técnicos. As atividades **já estavam
lançadas** quando se percebeu que formavam um projeto.

### Não nasceu entidade nova

`Acionamento` já era 1:N com Atividade, com modelo e rotas prontos — e **zero
registros, zero atividades vinculadas, nenhuma tela**. Construído e nunca usado.
No Blueprint ele é "solicitação bruta recebida do cliente, 1:N com Atividade", que
é exatamente o que um lote de 25 vistorias é. Virou **Projeto** na interface.

### Schema

| Entidade | Campo | Regra |
|---|---|---|
| `Reembolso` | `atividade_id` agora opcional, `+acionamento_id` | um ou outro, nunca os dois, nunca nenhum |
| `ReembolsoDespesa` | `+atividade_id`, `+funcionario_id`, `+supplier_id` | a linha de rateio |
| `Budget` | `+acionamento_id` | o orçamento único do lote |
| `Acionamento` | `+reembolsos`, `+orcamentos` | relações inversas |

O prestador é polimórfico — funcionário da LS **ou** fornecedor externo, no
máximo um —, mesma solução que `ContratacaoFornecedor` e `Reembolso` já usavam.

### Rateio manual, não automático

Dividir por 25 em partes iguais seria ficção: uma vistoria pode dar o dobro de
trabalho da outra. Cada linha da prestação diz **quanto, em qual site e para qual
prestador**, e é assim que o custo desce do projeto para a obra. Sem isso a
margem de cada vistoria sairia sem mão de obra.

### Guardas

- despesa não pode somar mais do que foi adiantado;
- a linha só aceita atividade **do próprio processo** — num adiantamento de
  projeto, uma das agrupadas nele. Sem isto o custo de uma vistoria da Oi poderia
  cair numa obra da Claro e as duas margens sairiam erradas sem ninguém notar;
- funcionário e fornecedor na mesma linha é recusado;
- tirar do grupo **não apaga** a atividade: desvincula.

### Bug corrigido no caminho: código sequencial repetido

Cinco lugares geravam código com `count + 1` — contam as linhas e somam um.
Depois de qualquer exclusão a contagem recua e o código **repete**. A base já
tinha dois `ATV-2026-003` com títulos diferentes; com um lote de 25 criadas de
uma vez, viraria conferência impossível.

`codigo-sequencial.service.ts` passa a derivar do maior sequencial **já emitido**,
e os cinco pontos (ATV, ACI, DEM, FAT e o ATV criado pelo acionamento) usam a
mesma regra. Exclusão não recicla código: um código que circulou em e-mail ou
planilha não pode reaparecer em outro registro.

`reparar-codigos-duplicados.ts` corrigiu o caso existente — mantendo o código no
registro mais antigo, que é o que provavelmente já circulou, e renumerando o
outro (`ATV-2026-003` → `ATV-2026-008`, "Reparo sistema Indoor").

### Interface

- **Visão Projetos** na aba Atividades, com receita, contratado, adiantado e
  quanto ainda falta ratear — em âmbar enquanto sobrar dinheiro sem dono, porque
  enquanto sobrar a margem por atividade está incompleta.
- **Agrupar em lote**: seleção múltipla na lista → projeto novo ou existente.
- **Ratear entre as atividades**: painel no cartão do adiantamento, com site e
  prestador por linha, mostrando quanto falta para fechar.

### Verificação

`validar-projeto-rateio.ts` — 22 verificações contra a API em execução,
reproduzindo o caso real de ponta a ponta: códigos únicos, agrupar e desagrupar
sem apagar atividade, as três recusas, e o custo caindo na vistoria certa. Cria
os próprios registros e apaga tudo no fim.
