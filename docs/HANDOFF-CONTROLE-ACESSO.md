# Handoff — Controle de acesso (30/09/2026)

Leia com `AGENTS.md` antes de criar rota, tela com ação sensível ou mexer em login.

## Princípio

- **Todo mundo logado vê o sistema inteiro.** `GET` só exige sessão.
- O que muda de pessoa para pessoa são as **ações**, agrupadas em 8 permissões.
  ADMIN tem todas; excluir registro e gerir usuários é **exclusivo do ADMIN**.
- A regra vale no **backend**. O front esconde botões só por conforto
  (`usePermissao`, `useEhAdmin` em `src/frontend/lib/permissoes.tsx`).

## Peças

| Peça | Onde |
|---|---|
| Catálogo de permissões, modelos, política por rota | `src/backend/services/permissoes.service.ts` |
| Porteiro de `/api` (sessão + permissão) | `controleDeAcesso` em `src/backend/middleware/auth.middleware.ts`, montado no `server.ts` antes das rotas |
| Convite, aceite, login | `auth.service.ts`, `auth.controller.ts` (`/api/auth/convite/:token`) |
| Gestão de usuários (ADMIN) | `/api/usuarios` — `usuarios.controller.ts` |
| Aprovação de pagamento | `aprovacao-pagamento.service.ts` + `/api/aprovacoes-pagamento` |
| Sessão no navegador | `src/frontend/lib/sessao.ts` (instalado no `main.tsx`) |
| Telas | Configurações → **Usuários e acessos** (`UsuariosAcessos.tsx`), `/convite/:token` (`AceitarConvite.tsx`), fila em Controle de Pagamentos (`FilaAprovacoes.tsx`), Meu Perfil → Acesso |

### Política por rota — fechada por padrão

`POLITICA` lista `[método, regex do caminho, exigência]`. Rota que **altera dado**
e não casa com nenhuma regra só passa para ADMIN. Ao criar rota nova, acrescente
a regra ali — senão ela nasce restrita, que é o erro seguro.

Públicas: `/api/health`, `/api/auth/login`, `/api/auth/convite/*`, `/api/localidades/*`.

O usuário é **relido do banco a cada requisição** (`carregarUsuarioSessao`):
suspender ou tirar permissão vale na hora, sem esperar o token de 8h vencer.
`req.user` mantém os campos antigos (`userId`, `tenantId`, `email`, `nome`,
`role`) e ganhou `permissoes`, `aprovacao_pagamento`, `limite_pagamento`.

### Permissões

| Chave | Cobre |
|---|---|
| `atividades.gerenciar` | atividades, projetos, demandas, APC, cronograma, execução, documentação |
| `orcamentos.gerenciar` | budgets, negociações, LPUs, BDI, índices, importação |
| `pagamentos.solicitar` | contratações, parcelas, reembolsos/adiantamentos, prestação, e-mails de solicitação, **anexos e comprovantes** |
| `pagamentos.baixar` | marcar PAGO / COMPROVANTE_RECEBIDO / CONFERIDO; analisar prestação de contas |
| `pagamentos.aprovar` | decidir a fila de aprovação; quem tem nunca precisa de aprovação |
| `faturamento.gerenciar` | POs, linhas e lotes de faturamento |
| `cadastros.gerenciar` | fornecedores, funcionários, qualificações, clientes, sites |
| `configuracoes.gerenciar` | empresa, contas, cartões, comunicação, modelos de contrato |

Anexar comprovante ficou em `solicitar`, e não em `baixar`, de propósito: quem
recebe o comprovante e resolve o alerta de "comprovante pendente" é o engenheiro.

Modelos de preenchimento: Engenheiro de projetos, Financeiro e Somente consulta.

## Convite

1. ADMIN cadastra nome, e-mail, cargo, permissões e regra de aprovação.
2. O sistema cria o usuário como `CONVIDADO`, com senha impossível, e devolve **uma vez** o link
   `/convite/<token>`, que vale 72h. No banco fica só o `sha256` do token.
3. O ADMIN copia o link ou manda pelo Outlook (`mailto:`), porque o sistema não envia e-mail direto.
4. A pessoa define a senha (mínimo de 8 caracteres, com letras e números) e entra. O link morre ali.
5. O mesmo mecanismo serve para **redefinir senha**: `POST /api/usuarios/:id/link`.

Status: `CONVIDADO` → `ATIVO` ⇄ `SUSPENSO`. Não existe exclusão de usuário, para
o histórico continuar dizendo quem fez o quê. O sistema recusa que alguém tire
o próprio ADMIN ou se suspenda, e recusa que fique sem nenhum ADMIN ativo.

## Aprovação de pagamento

Regra por usuário (`User.aprovacao_pagamento`): `NUNCA`, `SEMPRE` ou `ACIMA_DO_LIMITE`
(com `limite_pagamento` em reais, por solicitação). ADMIN e quem tem `pagamentos.aprovar`
não passam por aprovação.

Todo ponto que tira um pagamento de PENDENTE chama `autorizarSolicitacao`:

- parcela: `solicitar-pagamento`, `PUT /parcelas/:id/status` e o e-mail de solicitação;
- depósito/reembolso: criar com `data_solicitacao`, editar a data de solicitação,
  `PUT .../status` e o e-mail.

Sem autonomia e sem aprovação válida, o pagamento **fica PENDENTE**, nasce uma
`AprovacaoPagamento` PENDENTE (um pedido por pagamento, sem duplicar) e a API
responde 409 com a explicação. Na criação, a resposta é 201 com o campo `aviso`.
Depois de aprovado, a pessoa repete a solicitação e ela passa. A aprovação vale
**para o valor aprovado**: se o valor subir, precisa aprovar de novo. Quem pediu
não aprova o próprio pedido, nem sendo ADMIN. Recusar exige motivo, e o motivo
aparece na aba Pagamentos da atividade.

Formalização (`PAYMENT_FORMALIZATION`) não passa por aprovação: o dinheiro já saiu.

## E-mail por usuário

- Assinatura: continua em Meu Perfil (ver `HANDOFF-ASSINATURA-EMAIL.md`).
- `User.email_cc_padrao`: CC pessoal somado ao roteamento global em
  `resolveEmailRouting(..., usuarioId)`, só quando o CC não foi editado na prévia.
  A própria pessoa edita em Meu Perfil; o ADMIN, em Usuários e acessos.
- "Responsável pela solicitação" já saía do usuário logado.

## Segurança corrigida no caminho

- Só 9 das 33 rotas exigiam login. Agora todas exigem.
- Excluir atividade, mexer em PO e cancelar faturamento confiavam no `autor`
  enviado pelo corpo da requisição. Agora o autor vem da sessão, e a checagem nega
  por padrão (`role !== 'ADMIN'`).
- O segredo JWT tinha um valor fixo no código, que ficou no histórico do git.
  Ele saiu do código e é lido do `.env` na hora do uso: os imports do
  `server.ts` rodam antes do `dotenv.config()`.
- Links `<a href="/api/...">` são interceptados e baixados com o token.

## Pendências

- **Trocar o valor de `JWT_SECRET` no `.env`** por um aleatório longo. O valor
  atual é igual ao que estava no código e, portanto, está no histórico do git.
  Trocar derruba todas as sessões uma vez.
- Desativar as contas genéricas `admin@`, `comercial@` e `operacoes@` quando o Victor confirmar.
  Os papéis `COMERCIAL` e `OPERACOES` delas são tratados como USUARIO sem permissões (consulta).
- Não há limite de tentativas de login.
- O tenant ainda sai de `prisma.tenant.findFirst()` em vários controllers. Com um tenant só,
  funciona; num multi-tenant, teria de vir de `req.user.tenantId`.
- Scripts em `src/backend/scripts/` que chamam a API usam `_sessao-teste.ts`.
  Bateria de acesso: `validar-controle-acesso.ts` (48 verificações).
