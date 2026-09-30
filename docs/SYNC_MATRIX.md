# Matriz de sincronização — Blueprint x implementação

Blueprint LSI (v4, 12/09/2026): https://claude.ai/code/artifact/8eebd04f-dc2e-4cb4-8752-05d444a7b4a8
A seção 23 do Blueprint documenta esta refatoração; as seções 05, 14 e 21 foram revisadas contra o código.

| Tema | Fonte canônica | API/serviço | Tela | Estado |
|---|---|---|---|---|
| LS Office | `EmpresaConfig` | `/api/empresa` | Configurações | Implementado |
| Perfil | `User` | `/api/profile` | Meu Perfil | Implementado |
| Assinatura | `UserEmailSignature` + storage | `/api/profile/email-signature` | Meu Perfil | Implementado; nenhuma assinatura cadastrada ainda — e-mails saem com o fallback institucional |
| Clientes/sharings/operadoras | `Contratante` | `/api/clientes` | Clientes | Implementado; localStorage aguarda export |
| Roteamento | `EmailRoutingConfig` | `/api/email-config/routing` | Configurações > Comunicação | Implementado |
| Processo financeiro | `ParcelaPagamento.processo_tipo` | contratação/pagamentos | Atividades/Controle | Implementado |
| Finalidades | `PAYMENT_PURPOSES` | `payment-domain.service.ts` | Fluxo financeiro | Base central implementada |
| Desembolso x formalização | `isDesembolsoPendente()` | `payment-domain.service.ts` | Controle de Pagamentos / status_financeiro | Implementado; formalização não entra em "a pagar" |
| Documentos financeiros | `PaymentAttachment` + storage | `/api/payment-attachments` | parcelas/depósitos | Implementado |
| Memória de cálculo | `ReembolsoArquivo` + storage | reembolsos | reembolsos | Preservado |
| Assunto inteligente | `Atividade.tipo_demanda` | serviços de e-mail | prévias | Implementado |
| Prestação consolidada | `PrestacaoContasConsolidada` | `/api/prestacoes-contas` | prestação de contas | Preservado |
| Localidades IBGE | `municipios-ibge.json` + `utils/uf.ts` | `/api/localidades` | Fornecedores, Atividades, Clientes, Funcionários | Implementado 30/09; Blueprint v5 seção 24 |
| Comprovante pendente | `ParcelaPagamento`/`ReembolsoPagamento` + `PaymentAttachment` | `/api/atividades/carteira` (`comprovantes_pendentes`) | Carteira de atividades | Implementado 30/09; Blueprint v5 seção 24 |
| Controle de acesso | `User` + `UserPermissao` + `AprovacaoPagamento` | `/api/usuarios`, `/api/aprovacoes-pagamento`, `/api/auth/convite`; porteiro `controleDeAcesso` + política em `permissoes.service.ts` | Usuários e acessos, Aceitar convite, fila no Controle de Pagamentos | Backend e interface implementados 30/09 (`validar-controle-acesso.ts`, 48 OK); Blueprint v6 seção 10; detalhe em `docs/HANDOFF-CONTROLE-ACESSO.md` |
