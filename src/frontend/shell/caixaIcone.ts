import type { Paleta } from '../theme';

// Movido de SimuladorLPU.tsx (Fase 4 — extração do shell), sem alteração.
// `menu` = caixa de icone dentro do menu lateral. No item ativo o fundo ja e
// azul solido, entao a caixa some e o icone fica branco; fora do menu o
// comportamento antigo (veu da cor de acento) e preservado.
export const caixaIcone = (p: Paleta, menu = false) => (c: string, active = false) => ({
    width: 28,
    height: 28,
    borderRadius: 8,
    background: active ? (menu ? "transparent" : `${c}15`) : p.bg1,
    border: `1px solid ${active ? (menu ? "transparent" : `${c}40`) : p.brBase}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    color: active ? (menu ? "#FFFFFF" : c) : p.txSec,
    transition: "all 0.2s",
});
