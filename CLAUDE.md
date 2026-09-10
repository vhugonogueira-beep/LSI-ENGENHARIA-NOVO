# Contexto obrigatório do LS Office ERP

Antes de alterar este projeto, leia integralmente:

1. `AGENTS.md` — arquitetura, regras permanentes e fluxo de trabalho.
2. `docs/HANDOFF-ATIVIDADES-PAGAMENTOS.md` — decisões funcionais, implementação e pendências das telas de atividades, pagamentos, reembolsos, adiantamentos e prestação de contas.

O sistema deve permanecer coerente com o **Blueprint LSI**. O link do Artifact ainda não foi salvo neste repositório; peça-o ao usuário antes de tomar uma decisão que altere o fluxo funcional documentado.

Não remova os campos antigos de `Reembolso` nem as rotas legadas de prestação individual sem antes auditar os dados existentes e concluir a migração. Eles são mantidos temporariamente como camada de compatibilidade.
