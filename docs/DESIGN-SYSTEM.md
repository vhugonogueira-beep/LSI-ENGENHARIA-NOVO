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
  `text-muted-foreground`. Cor só para estado real.

## Cor

| Papel | Tailwind | `T` (inline) | Quando |
|---|---|---|---|
| Marca / ação | `primary` | `T.blue` (#1768D5) | botão principal, link, item ativo |
| Em dia / pago | `ok` | `T.green` | concluído, pago, aprovado |
| Atenção | `warn` | `T.amber` | pendente, vence em breve |
| Crítico | `crit` | `T.red` | atrasado, recusado, estouro, erro |
| Informativo | `info` | `T.blueL` | dica, contagem neutra |
| Texto | `foreground` / `muted-foreground` | `T.txPri` / `T.txMut` | |
| Superfície | `background` / `card` / `secondary` / `border` | `T.bg0..bg3` / `T.brBase` | |

`ok`, `warn`, `crit` e `info` acompanham o tema claro/escuro e aceitam opacidade
(`bg-warn/10`, `border-crit/40`). **Nenhum hex novo no código.** Valor em
dinheiro é neutro; ganha cor só quando é alerta (saldo negativo, custo acima do
orçado, pagamento atrasado).

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
