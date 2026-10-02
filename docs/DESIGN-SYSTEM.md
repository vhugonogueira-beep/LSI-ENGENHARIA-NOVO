# Design system do LSI

Decisão de 02/10/2026, a partir da análise geral de design (skill frontend-design).
Vale para toda tela nova e para toda tela que for tocada. Fonte dos valores:
`src/frontend/index.css` (tokens CSS), `tailwind.config.js` (nomes Tailwind) e
`src/frontend/theme.ts` (objeto `T`, para as telas em estilo inline).

## Objeto e princípio

ERP de obras de infraestrutura de telecom (torres, postes, sites), usado por
engenheiros no escritório e em campo e pelo financeiro. O trabalho de cada
tela é dizer **o que está pendente e qual o próximo passo**.

- **Pendente primeiro.** Lista, cabeçalho e cartão começam pelo que exige ação.
  O resto fica quieto.
- **Um só elemento marcante por tela.** No LSI, o identificador da obra (Site
  ID, código da atividade) é a âncora de cada linha. Todo o resto é disciplina.
- **Ausência não tem cor.** Zero, vazio e "sem dado" aparecem como "—" em
  `text-muted-foreground`.
- **Cor é informação.** Cada dimensão tem sua família de cor (seção Cor).

## Cor — viva, mas sempre com significado

Revisão de 02/10/2026: a primeira versão economizou cor demais e o sistema
ficou neutro (a carteira inteira cinza, porque Planejamento era cinza). A regra
agora é: **cada dimensão do trabalho tem a sua família de cor, e a mesma coisa
tem a mesma cor em toda tela.** A cor vira atalho de leitura. Fonte única:
`src/frontend/lib/cores.ts` (mapas `TOM_*` e classes `CHIP`, `TEXTO`,
`SOLIDO`, `VEU`, `FAIXA`, `TOPO`; `hexTom()` para telas inline).

| Dimensão | Cores |
|---|---|
| Status da obra | Planejamento índigo · Aguardando liberação âmbar · Em execução azul · Concluído verde · On hold violeta |
| Área | Implantação azul · Operação teal |
| Operadora | Vivo violeta · Claro rosa · TIM azul · Oi âmbar |
| Sharing | Highline ciano · IHS laranja · Winity violeta · SBA teal |
| Ramo do fornecedor | Material verde · Mão de obra azul · Serviço violeta · Transporte laranja · Locação âmbar … |
| Módulo (menu e cabeçalho da página) | Atividades azul · Fornecedores teal · Pagamentos laranja · Faturamento verde · Orçamento/LPUs âmbar · Dashboards violeta/índigo · Clientes rosa |

Onde a cor aparece: faixa à esquerda da linha/cartão (`border-l-4` + `FAIXA`),
pílula (`CHIP`), cabeçalho de coluna (`VEU` + `TOPO`), barra de avanço
(`SOLIDO`), caixa do ícone do módulo (`VEU` + `TEXTO`).

Estado de alerta continua com os tokens próprios, que vencem a cor da
dimensão quando há problema:

| Papel | Tailwind | Quando |
|---|---|---|
| Marca / ação | `primary` (#1768D5) | botão principal, link, item ativo |
| Em dia / pago | `ok` | concluído, pago, aprovado |
| Atenção | `warn` | pendente, vence em breve |
| Crítico | `crit` | atrasado, recusado, estouro, erro |
| Informativo | `info` | dica |

Continua valendo: **ausência não tem cor** (zero e vazio são "—" apagado),
**nenhum hex novo no código** (use `lib/cores.ts`, os tokens ou `T`) e cor
**não substitui texto** — toda pílula colorida diz o que é.

## Tipografia

- **IBM Plex Sans** em tudo. **IBM Plex Mono** (`className="font-id"` ou
  `font-mono`) só para identificadores: Site ID, código de LPU, ATV-2026-003,
  número de PO, chave PIX. Não para rótulos nem números comuns.
- Escala única: **11 · 12 · 13 · 15 · 18 · 24 · 32 px**
  - Tailwind: `text-2xs` 11 · `text-xs` 12 · `text-sm` 13 · `text-base` 15 ·
    `text-lg` 18 · `text-2xl` 24 · `text-3xl` 32. `text-[11px]` também vale 11.
  - Inline: `fontSize` só com esses valores.
- Pesos: 400, 500, 600, 700. Nada de 800/900 (a fonte não tem; sai sintetizado).
- Números em tabela são tabulares (já é o padrão do `body`).

## Ícones

Só `lucide-react`, tamanho 14–16 em texto corrido, `aria-hidden` quando
decorativo. **Nada de emoji como ícone** (🏭 👷 📍 💳 🗑 ✏️ ✅ ⚠️): muda de desenho
entre sistemas, não segue o tema e dá cara de rascunho. Emoji só se for conteúdo
digitado pelo usuário.

## Texto

- Frase em caixa normal. **Sem caixa alta decorativa** (`uppercase`,
  `textTransform: 'uppercase'`, `tracking-wide` em rótulo). Sigla continua sigla
  (PO, RFI, CNPJ, UF).
- Botão diz o que acontece: "Solicitar pagamento", "Anexar comprovante",
  "Salvar alterações". **Sem "→"** no texto de botão ou link.
- Metadado não vira cadeia "A · B · C". Use elementos separados com espaço, ou
  rótulo + valor.
- Vazio convida à ação ("Nenhuma PO anexada. Anexar PO"). Erro diz o que houve e
  como resolver, sem pedir desculpa.

## Acessibilidade

- Botão só com ícone tem `aria-label` **e** `title` com o verbo ("Excluir
  fornecedor", "Fechar").
- Elemento clicável é `<button>` ou `<a>`, não `div`/`span` com `onClick`.
- Foco de teclado visível (global, em `index.css`; não reescrever `outline`).
- Movimento: respeita `prefers-reduced-motion` (global). Sem animação de
  entrada em cada seção.
- Campo de formulário com `<label>` associado.

## Forma

- Raio: `rounded-lg` (8px) para cartão e campo, `rounded-md` para controle
  pequeno, `rounded-full` só para pílula de status e avatar.
- Sombra: só para o que flutua (modal, menu). Cartão no fluxo usa borda, não
  sombra. Sem brilho colorido (`0 4px 20px cor40`).

## O que não muda

- Os geradores de documento (`gerarPdf*.ts`, planilhas Excel, e-mails) seguem o
  layout do cliente/da LS e **não** seguem este sistema.
- O tema troca recarregando a página (ver `theme.ts`): os estilos inline são
  resolvidos no carregamento do módulo.
