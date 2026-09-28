# Handoff — assinatura global de e-mail por usuário

Última atualização: 11/09/2026

## Regra funcional

Todo e-mail gerado pelo LSI deve incorporar, ao final do corpo, a assinatura ativa do usuário autenticado que solicitou a geração. A assinatura não pertence à tela de Pagamentos, à empresa nem ao template corporativo: pertence ao `User`.

Nos e-mails financeiros, a origem exibida no assunto também é global e vem de
`Atividade.tipo_demanda`: **IMPLANTAÇÃO** para `IMPLANTACAO` e **OPERAÇÕES** para
`OPERACAO`. O tipo financeiro (pagamento, adiantamento ou reembolso) nunca deve
ser usado para inferir essa classificação.
Quando a atividade não estiver classificada, o fallback neutro é **ENGENHARIA** —
nunca assumir uma das duas origens por conveniência.

Não inserir nomes, contatos ou imagens pessoais diretamente nos templates. Um usuário sem assinatura cadastrada continua gerando o e-mail normalmente, sem herdar assinatura de outra pessoa.

## Auditoria da arquitetura existente

- Usuário: modelo Prisma `User`.
- Sessão: JWT; `requireAuth` valida o Bearer token e disponibiliza `userId`, `tenantId`, `nome`, `email` e `role` em `req.user`.
- Frontend: token em `localStorage` (`ls_auth_token`); chamadas protegidas usam `src/frontend/lib/authFetch.ts`.
- Template financeiro central: `src/backend/services/email-corporativo.service.ts`, usado por pagamento de fornecedor/funcionário, formalização de cartão, reembolso e adiantamento.
- Implementações de composição por módulo:
  - `contratacao.controller.ts`: programação/solicitação de pagamento e `.eml`;
  - `reembolso.controller.ts`: reembolso, adiantamento e `.eml`;
  - `faturamento-linha.service.ts`: e-mail de solicitação de faturamento com tabela própria.
- Não existe envio SMTP automático. O sistema oferece prévia, cópia formatada e, nos fluxos de pagamento/reembolso, arquivo `.eml` para abrir no Outlook.
- A prévia textual duplicada criada por `solicitarPagamento` foi removida. Depois de programar a parcela, a interface abre o gerador corporativo autenticado, que passa pelo mesmo compositor global.

## Modelo e armazenamento

`UserEmailSignature` possui relação 1:1 com `User` e registra:

- `user_id` e `tenant_id`;
- `storage_key`;
- nome original, MIME type e tamanho;
- estado ativo;
- datas de criação e atualização.

Os bytes ficam em `storage/email-signatures/<tenant>/<user>/...`. O banco não guarda Base64. O serviço responsável é `src/backend/services/email-signature.service.ts`.

Formatos permitidos: PNG, JPEG e WEBP, até 5 MB. O backend valida a assinatura binária real do arquivo; não confia apenas na extensão ou no MIME enviado pelo navegador.

## Composição compartilhada

`composeEmailForUser(html, user, mode)` é a porta de entrada comum:

- `preview`: inclui a imagem como data URI, permitindo visualização autenticada sem URL pública;
- `cid`: usa `cid:` para a imagem inline do `.eml`.

`buildOutlookEml(...)` cria um `multipart/related`, inclui a imagem como parte MIME inline e mantém `X-Unsent: 1`, para o Outlook abrir uma nova mensagem editável.

O marcador `<!-- LSI:USER_EMAIL_SIGNATURE -->` torna a composição idempotente e evita assinatura duplicada. Quando existe assinatura pessoal, o bloco textual institucional antigo do template é substituído.

Todo novo gerador de e-mail deve:

1. exigir `requireAuth` na rota;
2. validar o `tenantId` do objeto acessado;
3. montar o corpo funcional;
4. chamar `composeEmailForUser` antes de devolver a prévia;
5. usar `buildOutlookEml` quando oferecer “Abrir no Outlook”.

## API e interface

Rotas autenticadas em `/api/profile`:

- `GET /email-signature` — metadados da assinatura do usuário atual;
- `GET /email-signature/image` — imagem do próprio usuário, sem cache;
- `POST /email-signature` — upload multipart no campo `arquivo`;
- `DELETE /email-signature` — remoção da própria assinatura.

A interface fica em **Meu Perfil → Assinatura de e-mail**, implementada por `src/frontend/components/perfil/MinhaAssinaturaEmail.tsx` e montada por `src/frontend/pages/MeuPerfil.tsx`. Configurações trata apenas da LS Office (empresa, contas, cartões e roteamento) e não expõe assinatura. Ela permite visualizar, adicionar, substituir e remover a assinatura.

## Cobertura atual

- Programação e solicitação de pagamento de fornecedor ou funcionário;
- formalização de compra no cartão;
- reembolso;
- adiantamento;
- solicitação de faturamento;
- prévias HTML;
- cópia formatada;
- `.eml` de pagamento, reembolso e adiantamento.

Links `mailto:` usados apenas para abrir o endereço de um contato não são e-mails gerados pelo LSI e não passam pelo compositor.

## Validação

O script `src/backend/scripts/validar-assinatura-email.ts` cria temporariamente uma assinatura mínima, valida upload/metadados/visualização, isolamento entre usuários, prévias dos módulos, fallback sem assinatura e CID no Outlook, e remove a assinatura de teste ao final.

Resultado em 11/09/2026:

```json
{"ok":true,"invalidImageRejected":true,"payment":true,"reimbursement":"ADIANTAMENTO","outlookCid":true,"noSignatureFallback":true,"billing":true}
```

Builds de backend e frontend aprovados. Backup anterior: `prisma/backups/dev-before-assinatura-global-2026-09-11.db`.

## Pendência externa

A arte de Victor Hugo foi exibida na conversa, mas o arquivo binário original não está disponível no workspace nem em `storage/email-signatures`. Para cadastrá-la sem reconstrução ou perda de fidelidade, anexar o PNG/JPG/WEBP original e fazer o upload em **Configurações → Minha assinatura**. Não substituir por imagem gerada por IA.
