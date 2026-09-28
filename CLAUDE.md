# Contexto obrigatório do LS Office ERP

Antes de alterar este projeto, leia integralmente:

> Continuidade da refatoração sistêmica: `docs/HANDOFF-REFATORACAO-SISTEMICA-2026-09-11.md` e `docs/SYNC_MATRIX.md`.

1. `AGENTS.md` — arquitetura, regras permanentes e fluxo de trabalho.
2. `docs/HANDOFF-ATIVIDADES-PAGAMENTOS.md` — decisões funcionais, implementação e pendências das telas de atividades, pagamentos, reembolsos, adiantamentos e prestação de contas.
3. `docs/HANDOFF-ASSINATURA-EMAIL.md` — arquitetura obrigatória da assinatura global por usuário em todo e-mail gerado pelo LSI.

O sistema deve permanecer coerente com o **Blueprint LSI** — a especificação funcional viva,
publicada como Claude Artifact:

> https://claude.ai/code/artifact/8eebd04f-dc2e-4cb4-8752-05d444a7b4a8

Leia a seção relevante antes de alterar fluxo, schema ou regra de negócio. Quando a
implementação divergir do que está lá, **atualize o artifact na mesma URL** — não deixe
código e especificação descolarem.

Não remova os campos antigos de `Reembolso` nem as rotas legadas de prestação individual sem antes auditar os dados existentes e concluir a migração. Eles são mantidos temporariamente como camada de compatibilidade.
