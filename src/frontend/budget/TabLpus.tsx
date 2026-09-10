import React, { useState, useEffect, useCallback, useMemo } from "react";
import { LpuTemplate } from "./types";
import { lerTemplatesLocaisPendentes, marcarMigracaoConcluida } from "./lpuTemplates";

// ─────────────────────────────────────────────────────────────────────────────
// Bases (LPUs) — tela única, ligada ao banco.
//
// Naturezas de base, que não se misturam:
//
//   PV_CLIENTE   a PV do cliente. Código, descrição, categoria e unidade vêm do
//                documento dele; o preço é o que a LS Office COBRA desse cliente.
//   LPU_LS_OFFICE     o que CUSTA para a LS executar ou adquirir (custo de mercado).
//   FORNECEDOR   tabela de um fornecedor específico.
//
// A diferença entre o preço da PV e o custo da LSOC é a margem.
//
// Por isso as colunas mudam conforme a base selecionada: um número solto numa
// coluna "Valor" esconderia de qual dos conceitos ele é.
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  bg0: "#07090f", bg1: "#0e1117", bg2: "#13181f", bg3: "#1a2030", bg4: "#222a3a",
  brSub: "#1e2840", brBase: "#2d3a52", brStrong: "#3d5070",
  txPri: "#f0f4fa", txSec: "#b4c5d8", txMut: "#7c94b0", txDis: "#506480",
  blue: "#3b82f6", green: "#34d399", amber: "#fbbf24", red: "#f87171", purple: "#a78bfa", cyan: "#67e8f9"
};

const S = {
  card: { background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, padding: "14px 16px", boxShadow: "0 6px 16px rgba(0, 0, 0, 0.35)" } as React.CSSProperties,
  input: { padding: "8px 10px", fontSize: 12, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg3, color: T.txPri, outline: "none", width: "100%", boxSizing: "border-box", transition: "all 0.15s" } as React.CSSProperties,
  label: { fontSize: 10, color: T.txSec, display: "block", marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" } as React.CSSProperties,
  btn: { padding: "8px 14px", fontSize: 12, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg1, cursor: "pointer", color: T.txPri, fontWeight: 700, transition: "all 0.15s" } as React.CSSProperties,
  btnBlue: { background: T.blue, color: "#fff", borderColor: T.blue } as React.CSSProperties,
};

const UNIDADES = ["Vb", "un", "Unid", "Unid.", "Pç", "m", "m²", "m³", "Km", "Kg", "kg", "H/H"];
const TIPOS_CUSTO = ["SERVICO", "MATERIAL", "MO", "VERBA"];
const ROTULO_CUSTO: Record<string, string> = { SERVICO: "Serviço", MATERIAL: "Material", MO: "Mão de obra", VERBA: "Verba" };

// Cada natureza de base tem cor, rótulo e explicação próprios.
const NATUREZA: Record<string, { grupo: string; cor: string; explica: string }> = {
  PV_CLIENTE: {
    grupo: "PV do Cliente",
    cor: T.cyan,
    explica: "Itens oficiais do cliente — código, descrição, categoria e unidade exatamente como estão no documento dele — com o preço que a LS Office COBRA desse cliente por item. É esta base que alimenta a composição da PV dentro da Atividade.",
  },
  LPU_LS_OFFICE: {
    grupo: "LPU LS Office Geral",
    cor: T.green,
    explica: "A LPU padrão da LS Office. Valor venda é o que a LS pratica na venda; custo LS é o que ela paga na compra. A diferença entre os dois é a margem do item.",
  },
  FORNECEDOR: {
    grupo: "LPUs de Fornecedor",
    cor: T.purple,
    explica: "Preço que um fornecedor específico cobra da LS Office. Usado na contratação e na comparação de custo.",
  },
};
const ORDEM_GRUPOS = ["PV_CLIENTE", "LPU_LS_OFFICE", "FORNECEDOR"];
const natureza = (o: string) => NATUREZA[o] || NATUREZA.FORNECEDOR;

interface Base {
  id: string;
  nome_lpu: string;
  origem: string;
  tipo: string | null;
  versao: string;
  regiao: string;
  status: string;
  supplier?: { id: string; nome: string } | null;
  contratante?: { id: string; nome: string } | null;
  _count?: { items: number };
}

interface Derivado {
  id: string;
  valor_unitario: number;
  custo_ls: number | null;
  valor_venda: number | null;
  fonte: string | null;
  uf: string | null;
  observacoes: string | null;
  pricebook: { id: string; nome_lpu: string; origem: string };
}

interface Item {
  id: string;
  codigo_item: string | null;
  codigo_origem: string | null;
  descricao: string;
  detalhamento: string | null;
  subtipo: string | null;
  unidade: string;
  valor_unitario: number;
  custo_ls: number | null;
  valor_venda: number | null;
  regiao: string;
  uf: string | null;
  fonte: string | null;
  pv_item_id: string | null;
  codigo_duplicado: boolean;
  tipo_custo: string;
  obrigatorio: boolean;
  observacoes: string | null;
  data_referencia: string | null;
  highline_template_row: number | null;
  derivados?: Derivado[];
}

interface GrupoDuplicado {
  codigo: string;
  descricoesDistintas: boolean;
  ocorrencias: { id: string; descricao: string; highline_template_row: number | null }[];
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const th = (w?: number, alinha?: "right" | "center"): React.CSSProperties =>
  ({ padding: "9px 8px", fontWeight: 700, fontSize: 9.5, letterSpacing: "0.05em", ...(w ? { width: w } : {}), ...(alinha ? { textAlign: alinha } : {}) });
const td = (): React.CSSProperties => ({ padding: "7px 8px", verticalAlign: "top" });

export default function TabLpus() {
  const [bases, setBases] = useState<Base[]>([]);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [carregandoBases, setCarregandoBases] = useState(true);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [erro, setErro] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("TODAS");
  const [filtroValor, setFiltroValor] = useState<"TODOS" | "COM" | "SEM">("TODOS");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  // Edição por linha, sob demanda: num catálogo estrutural de centenas de itens,
  // campos sempre abertos convidam a alteração acidental.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Partial<Item>>({});
  const [novo, setNovo] = useState<Partial<Item>>({});
  const [pendentes, setPendentes] = useState<LpuTemplate[]>([]);
  const [migrando, setMigrando] = useState(false);
  const [duplicados, setDuplicados] = useState<GrupoDuplicado[]>([]);
  const [verDuplicados, setVerDuplicados] = useState(false);

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const carregarBases = useCallback(async () => {
    setCarregandoBases(true);
    try {
      const r = await fetch("/api/pricebooks");
      const lista: Base[] = r.ok ? await r.json() : [];
      setBases(lista);
      setBaseId(atual => atual || (lista.find(b => b.origem === "PV_CLIENTE")?.id ?? lista[0]?.id ?? null));
    } catch (e: any) {
      setErro(e.message || "Falha ao carregar as bases");
    } finally {
      setCarregandoBases(false);
    }
  }, []);

  useEffect(() => { carregarBases(); }, [carregarBases]);
  useEffect(() => { setPendentes(lerTemplatesLocaisPendentes()); }, []);

  const base = bases.find(b => b.id === baseId) || null;
  const ehPv = base?.origem === "PV_CLIENTE";
  const ehLsoc = base?.origem === "LPU_LS_OFFICE";

  useEffect(() => {
    if (!baseId) { setItens([]); setDuplicados([]); return; }
    let cancelado = false;
    (async () => {
      setCarregandoItens(true);
      setVerDuplicados(false);
      try {
        const daPv = bases.find(b => b.id === baseId)?.origem === "PV_CLIENTE";
        const [ri, rd] = await Promise.all([
          fetch(`/api/pricebooks/${baseId}/items?limit=2000${daPv ? "&comDerivados=1" : ""}`),
          fetch(`/api/pricebooks/${baseId}/duplicidades`),
        ]);
        const d = ri.ok ? await ri.json() : { items: [] };
        const dup = rd.ok ? await rd.json() : { grupos: [] };
        if (cancelado) return;
        setItens(Array.isArray(d) ? d : (d.items || []));
        setDuplicados(dup.grupos || []);
        setBusca(""); setCategoria("TODAS"); setFiltroValor("TODOS");
      } catch (e: any) {
        if (!cancelado) setErro(e.message);
      } finally {
        if (!cancelado) setCarregandoItens(false);
      }
    })();
    return () => { cancelado = true; };
  }, [baseId, bases]);

  async function salvarCampo(item: Item, campo: keyof Item, valor: any) {
    if (item[campo] === valor) return;
    setSalvandoId(item.id);
    try {
      const corpo: any = { [campo]: valor };
      if (campo === "valor_unitario" || campo === "custo_ls" || campo === "valor_venda") {
        corpo.data_referencia = new Date().toISOString();
      }
      // Mexeu no preço da PV: a origem deixa de ser a média histórica. Registrar
      // isso evita a linha continuar dizendo "média de N PVs" com outro valor.
      if (campo === "valor_unitario" && ehPv) {
        corpo.observacoes = `Ajustado manualmente em ${new Date().toLocaleDateString("pt-BR")}`;
      }
      const r = await fetch(`/api/pricebooks/items/${item.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao salvar");
      const atualizado = await r.json();
      setItens(a => a.map(i => (i.id === item.id
        ? { ...i, [campo]: valor, observacoes: atualizado.observacoes, data_referencia: atualizado.data_referencia }
        : i)));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvandoId(null);
    }
  }

  async function adicionarItem() {
    if (!baseId || !novo.descricao) { notify("Preencha ao menos a descrição"); return; }
    try {
      const r = await fetch(`/api/pricebooks/${baseId}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo_item: novo.codigo_item || null,
          descricao: novo.descricao,
          subtipo: novo.subtipo || null,
          unidade: novo.unidade || "Vb",
          tipo_custo: novo.tipo_custo || "SERVICO",
          valor_unitario: Number(novo.valor_unitario) || 0,
          custo_ls: ehLsoc ? Number(novo.custo_ls) || 0 : undefined,
          valor_venda: ehLsoc ? Number(novo.valor_venda) || 0 : undefined,
          uf: novo.uf || null,
          fonte: novo.fonte || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao criar o item");
      const criado: Item = await r.json();
      setItens(a => [criado, ...a]);
      setNovo({});
      notify("Item adicionado à base.");
    } catch (e: any) { setErro(e.message); }
  }

  function abrirEdicao(item: Item) {
    setEditandoId(item.id);
    setRascunho({
      codigo_item: item.codigo_item,
      descricao: item.descricao,
      subtipo: item.subtipo,
      unidade: item.unidade,
      detalhamento: item.detalhamento,
    });
  }

  function fecharEdicao() {
    setEditandoId(null);
    setRascunho({});
  }

  async function salvarEdicao(item: Item) {
    const descricao = (rascunho.descricao || "").trim();
    if (!descricao) { notify("A descrição não pode ficar vazia."); return; }

    const campos = {
      codigo_item: (rascunho.codigo_item || "").trim() || null,
      descricao,
      subtipo: (rascunho.subtipo || "").trim() || null,
      unidade: (rascunho.unidade || "").trim() || item.unidade,
      detalhamento: (rascunho.detalhamento || "").trim() || null,
    };

    setSalvandoId(item.id);
    try {
      const r = await fetch(`/api/pricebooks/items/${item.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(campos),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao salvar o item");
      setItens(a => a.map(i => (i.id === item.id ? { ...i, ...campos } : i)));
      fecharEdicao();
      notify("Item atualizado.");
      // Mudou código: a duplicidade pode ter surgido ou sumido.
      if (campos.codigo_item !== item.codigo_item && baseId) {
        const rd = await fetch(`/api/pricebooks/${baseId}/duplicidades`);
        if (rd.ok) setDuplicados((await rd.json()).grupos || []);
      }
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvandoId(null);
    }
  }

  // Enter salva, Esc cancela — editar 266 linhas no mouse é castigo.
  const teclas = (item: Item) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); salvarEdicao(item); }
    if (e.key === "Escape") { e.preventDefault(); fecharEdicao(); }
  };

  async function removerItem(item: Item) {
    if (!confirm(`Remover "${item.descricao}" desta base?`)) return;
    try {
      const r = await fetch(`/api/pricebooks/items/${item.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao remover");
      setItens(a => a.filter(i => i.id !== item.id));
      notify("Item removido.");
    } catch (e: any) { setErro(e.message); }
  }

  async function migrarLocais() {
    setMigrando(true); setErro("");
    try {
      const r = await fetch("/api/pricebooks/importar-locais", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: pendentes }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao importar");
      const res = await r.json();
      marcarMigracaoConcluida();
      setPendentes([]);
      await carregarBases();
      notify(`${res.criadas.length} base(s) criada(s) e ${res.itensGravados} item(ns) trazido(s) do navegador para o banco.`);
    } catch (e: any) { setErro(e.message); } finally { setMigrando(false); }
  }

  const categorias = useMemo(
    () => ([...new Set(itens.map(i => i.subtipo).filter(Boolean))] as string[]),
    [itens],
  );

  // Qual número decide "com/sem valor" depende da natureza da base.
  const valorDoItem = useCallback(
    (i: Item) => (ehLsoc ? (i.custo_ls ?? 0) : i.valor_unitario),  // na LSOC o gargalo é o custo
    [ehLsoc],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return itens.filter(i => {
      if (categoria !== "TODAS" && i.subtipo !== categoria) return false;
      if (filtroValor === "COM" && !(valorDoItem(i) > 0)) return false;
      if (filtroValor === "SEM" && valorDoItem(i) > 0) return false;
      if (!termo) return true;
      return `${i.codigo_item || ""} ${i.descricao}`.toLocaleLowerCase("pt-BR").includes(termo);
    });
  }, [itens, busca, categoria, filtroValor, valorDoItem]);

  const comValor = itens.filter(i => valorDoItem(i) > 0).length;
  const itensDuplicados = new Set(duplicados.flatMap(g => g.ocorrencias.map(o => o.id)));

  const grupos = ORDEM_GRUPOS
    .map(origem => ({ origem, ...natureza(origem), itens: bases.filter(b => b.origem === origem) }))
    .filter(g => g.itens.length > 0);
  // Bases com origem fora das quatro conhecidas não podem sumir da lista.
  const conhecidas = new Set(ORDEM_GRUPOS);
  const outras = bases.filter(b => !conhecidas.has(b.origem));
  if (outras.length) grupos.push({ origem: "OUTRAS", grupo: "Outras bases", cor: T.txMut, explica: "", itens: outras });

  return (
    <div style={{ padding: 20, animation: "fadeIn 0.3s ease", display: "flex", flexDirection: "column", height: "calc(100vh - 40px)", boxSizing: "border-box", gap: 12 }}>
      {toast && <div style={{ position: "fixed", bottom: 20, right: 20, background: T.green, color: "#052e1b", padding: "10px 18px", borderRadius: 8, zIndex: 9999, fontWeight: 700, fontSize: 12, boxShadow: "0 4px 14px rgba(0,0,0,0.4)" }}>{toast}</div>}

      {pendentes.length > 0 && (
        <div style={{ ...S.card, borderColor: T.amber + "77", background: T.amber + "12", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "11px 16px" }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: T.amber }}>{pendentes.length} LPU(s) ainda estão só no seu navegador</div>
            <div style={{ fontSize: 11, color: T.txSec, marginTop: 2 }}>
              Só existem nesta máquina e não chegam na Atividade. Entram como base de <strong>Preço Cliente</strong>; nada já preenchido é sobrescrito.
            </div>
          </div>
          <button onClick={migrarLocais} disabled={migrando} style={{ ...S.btn, ...S.btnBlue, opacity: migrando ? 0.6 : 1 }}>
            {migrando ? "Importando..." : "Trazer para o banco"}
          </button>
        </div>
      )}

      {erro && (
        <div style={{ ...S.card, borderColor: T.red + "66", background: T.red + "12", color: "#fca5a5", fontSize: 12, display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 14px" }}>
          <span>{erro}</span>
          <button onClick={() => setErro("")} style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 14, flex: 1, overflow: "hidden" }}>
        {/* ── Lista de bases, agrupada por natureza ── */}
        <div style={{ ...S.card, width: 264, display: "flex", flexDirection: "column", gap: 10, padding: 14, overflow: "hidden", flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 13, color: T.txPri, display: "flex", alignItems: "center", gap: 8 }}>
            <span>📚</span> Bases e LPUs
          </h3>
          <div className="scroll-min" style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 13 }}>
            {carregandoBases && <div style={{ color: T.txMut, fontSize: 12 }}>Carregando...</div>}
            {grupos.map(g => (
              <div key={g.origem}>
                <div style={{ fontSize: 9.5, fontWeight: 800, color: g.cor, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5 }}>{g.grupo}</div>
                {g.itens.map(b => {
                  const ativa = b.id === baseId;
                  return (
                    <button key={b.id} onClick={() => setBaseId(b.id)} style={{
                      width: "100%", textAlign: "left", marginBottom: 4, cursor: "pointer",
                      padding: "8px 10px", borderRadius: 8, fontSize: 11.5,
                      background: ativa ? g.cor + "22" : T.bg3,
                      border: `1px solid ${ativa ? g.cor : T.brSub}`,
                      borderLeft: `3px solid ${ativa ? g.cor : "transparent"}`,
                      color: ativa ? T.txPri : T.txSec, fontWeight: ativa ? 700 : 500,
                    }}>
                      <div style={{ lineHeight: 1.3 }}>{b.nome_lpu}</div>
                      <div style={{ fontSize: 10, color: T.txMut, marginTop: 3 }}>
                        {b._count?.items ?? 0} itens
                        {b.tipo ? ` · ${b.tipo === "IMPLANTACAO" ? "Implantação" : "Operação"}` : ""}
                        {b.supplier ? ` · ${b.supplier.nome}` : b.contratante ? ` · ${b.contratante.nome}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── Conteúdo da base ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
          {!base && !carregandoBases && <div style={{ ...S.card, color: T.txMut, fontSize: 12 }}>Selecione uma base à esquerda.</div>}

          {base && (
            <>
              <div style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", padding: "12px 16px", borderTop: `3px solid ${natureza(base.origem).cor}` }}>
                <div style={{ minWidth: 280, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.txPri }}>{base.nome_lpu}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", color: natureza(base.origem).cor, border: `1px solid ${natureza(base.origem).cor}66`, background: natureza(base.origem).cor + "1a", borderRadius: 20, padding: "2px 9px", textTransform: "uppercase" }}>
                      {natureza(base.origem).grupo}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: T.txMut, marginTop: 5, lineHeight: 1.5, maxWidth: 720 }}>{natureza(base.origem).explica}</div>
                  <div style={{ fontSize: 10.5, color: T.txDis, marginTop: 5 }}>
                    {base.versao} · {base.regiao} · {base.status}
                    {base.supplier ? ` · Fornecedor: ${base.supplier.nome}` : ""}
                    {base.contratante ? ` · Contratante: ${base.contratante.nome}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 9 }}>
                  <Indicador rotulo="ITENS" valor={String(itens.length)} cor={T.blue} />
                  {ehPv && <Indicador rotulo="CATEGORIAS" valor={String(categorias.length)} cor={T.cyan} />}
                  {ehLsoc && <Indicador rotulo="COM VENDA" valor={String(itens.filter(i => (i.valor_venda || 0) > 0).length)} cor={T.amber} />}
                  <Indicador rotulo={ehLsoc ? "COM CUSTO" : "COM PREÇO"} valor={String(comValor)} cor={T.green} />
                  <Indicador rotulo={ehLsoc ? "SEM CUSTO" : "A PREENCHER"} valor={String(itens.length - comValor)} cor={T.red} />
                </div>
              </div>

              {duplicados.length > 0 && (
                <div style={{ ...S.card, padding: "10px 14px", borderColor: T.amber + "66", background: T.amber + "0e" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: T.amber }}>
                      ⚠ {duplicados.length} código(s) repetido(s) no documento original
                    </span>
                    <span style={{ fontSize: 11, color: T.txSec, flex: 1, minWidth: 260 }}>
                      Nada foi fundido nem sobrescrito — cada ocorrência mantém a descrição original até o cadastro ser normalizado.
                    </span>
                    <button onClick={() => setVerDuplicados(v => !v)} style={{ ...S.btn, padding: "5px 11px", fontSize: 11 }}>
                      {verDuplicados ? "Ocultar" : "Ver quais"}
                    </button>
                  </div>
                  {verDuplicados && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {duplicados.map(g => (
                        <div key={g.codigo} style={{ background: T.bg3, borderRadius: 8, padding: "8px 11px", border: `1px solid ${T.brSub}` }}>
                          <div style={{ fontSize: 11.5, fontWeight: 800, color: T.txPri, fontFamily: "monospace" }}>
                            {g.codigo}
                            <span style={{ marginLeft: 8, fontFamily: "inherit", fontWeight: 600, color: g.descricoesDistintas ? T.amber : T.txMut }}>
                              {g.descricoesDistintas ? "itens diferentes com o mesmo código" : "linha repetida"}
                            </span>
                          </div>
                          {g.ocorrencias.map(o => (
                            <div key={o.id} style={{ fontSize: 11, color: T.txSec, marginTop: 3 }}>
                              <span style={{ color: T.txDis }}>linha {o.highline_template_row ?? "—"}</span> · {o.descricao}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* filtros — categorias oficiais da PV */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por código ou descrição..."
                  style={{ ...S.input, flex: 1, minWidth: 190, width: "auto" }} />
                <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ ...S.input, width: 235 }}>
                  <option value="TODAS">Todas as categorias ({categorias.length})</option>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {(["TODOS", "COM", "SEM"] as const).map(f => (
                  <button key={f} onClick={() => setFiltroValor(f)} style={{ ...S.btn, padding: "8px 12px", ...(filtroValor === f ? S.btnBlue : {}) }}>
                    {f === "TODOS" ? "Todos" : f === "COM" ? (ehLsoc ? "Com custo" : "Com preço") : (ehLsoc ? "Sem custo" : "Sem preço")}
                  </button>
                ))}
              </div>

              {/* novo item */}
              <div style={{ ...S.card, display: "flex", gap: 8, alignItems: "end", padding: "11px 14px", flexWrap: "wrap" }}>
                <div style={{ width: 96 }}><label style={S.label}>Código</label><input style={S.input} value={novo.codigo_item || ""} onChange={e => setNovo({ ...novo, codigo_item: e.target.value })} /></div>
                <div style={{ flex: 1, minWidth: 190 }}><label style={S.label}>Descrição *</label><input style={S.input} value={novo.descricao || ""} onChange={e => setNovo({ ...novo, descricao: e.target.value })} /></div>
                <div style={{ width: 168 }}><label style={S.label}>Categoria</label>
                  <input style={S.input} list="categorias-pv" value={novo.subtipo || ""} onChange={e => setNovo({ ...novo, subtipo: e.target.value })} />
                  <datalist id="categorias-pv">{categorias.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div style={{ width: 82 }}><label style={S.label}>Unid.</label>
                  <select style={S.input} value={novo.unidade || "Vb"} onChange={e => setNovo({ ...novo, unidade: e.target.value })}>
                    {UNIDADES.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                {ehLsoc ? (
                  <>
                    <div style={{ width: 124 }}><label style={S.label}>Valor venda</label><input style={S.input} type="number" step="0.01" min="0" value={novo.valor_venda ?? ""} onChange={e => setNovo({ ...novo, valor_venda: Number(e.target.value) })} /></div>
                    <div style={{ width: 116 }}><label style={S.label}>Custo LS</label><input style={S.input} type="number" step="0.01" min="0" value={novo.custo_ls ?? ""} onChange={e => setNovo({ ...novo, custo_ls: Number(e.target.value) })} /></div>
                    <div style={{ width: 58 }}><label style={S.label}>UF</label><input style={S.input} maxLength={2} value={novo.uf || ""} onChange={e => setNovo({ ...novo, uf: e.target.value.toUpperCase() })} /></div>
                    <div style={{ width: 132 }}><label style={S.label}>Fonte</label><input style={S.input} value={novo.fonte || ""} onChange={e => setNovo({ ...novo, fonte: e.target.value })} /></div>
                  </>
                ) : ehPv ? (
                  <div style={{ width: 132 }}><label style={S.label}>Preço LS ao cliente</label><input style={S.input} type="number" step="0.01" min="0" value={novo.valor_unitario ?? ""} onChange={e => setNovo({ ...novo, valor_unitario: Number(e.target.value) })} /></div>
                ) : (
                  <>
                    <div style={{ width: 118 }}><label style={S.label}>Tipo de custo</label>
                      <select style={S.input} value={novo.tipo_custo || "SERVICO"} onChange={e => setNovo({ ...novo, tipo_custo: e.target.value })}>
                        {TIPOS_CUSTO.map(t => <option key={t} value={t}>{ROTULO_CUSTO[t]}</option>)}
                      </select>
                    </div>
                    <div style={{ width: 118 }}><label style={S.label}>Preço</label><input style={S.input} type="number" step="0.01" min="0" value={novo.valor_unitario ?? ""} onChange={e => setNovo({ ...novo, valor_unitario: Number(e.target.value) })} /></div>
                  </>
                )}
                <button onClick={adicionarItem} style={{ ...S.btn, ...S.btnBlue, height: 34 }}>+ Adicionar</button>
              </div>

              {/* tabela */}
              <div style={{ ...S.card, padding: 0, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div className="scroll-min" style={{ overflow: "auto", flex: 1 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                    <thead style={{ position: "sticky", top: 0, background: T.bg3, zIndex: 1 }}>
                      <tr style={{ textAlign: "left", color: T.txMut }}>
                        <th style={th(104)}>CÓDIGO</th>
                        <th style={th()}>DESCRIÇÃO</th>
                        <th style={th(146)}>{ehLsoc ? "FAMÍLIA" : "CATEGORIA"}</th>
                        <th style={th(56)}>UNID.</th>
                        {ehPv && <>
                          <th style={{ ...th(124, "right"), color: T.amber }}>PREÇO LS AO CLIENTE</th>
                          <th style={{ ...th(196), color: T.txMut }}>ORIGEM DO PREÇO</th>
                          <th style={{ ...th(104, "right"), color: T.green }}>CUSTO LS</th>
                          <th style={{ ...th(114, "right"), color: T.cyan }}>MARGEM</th>
                        </>}
                        {ehLsoc && <>
                          <th style={{ ...th(124, "right"), color: T.amber }}>VALOR VENDA</th>
                          <th style={{ ...th(112, "right"), color: T.green }}>CUSTO LS</th>
                          <th style={{ ...th(112, "right"), color: T.cyan }}>MARGEM</th>
                        </>}
                        {!ehPv && !ehLsoc && <>
                          <th style={th(104)}>TIPO CUSTO</th>
                          <th style={{ ...th(120, "right"), color: T.amber }}>PREÇO CLIENTE</th>
                          <th style={th(186)}>ORIGEM DO PREÇO</th>
                        </>}
                        <th style={th(62)}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {carregandoItens && <tr><td colSpan={11} style={{ padding: 30, textAlign: "center", color: T.txMut }}>Carregando itens...</td></tr>}
                      {!carregandoItens && visiveis.map(item => {
                        const dup = itensDuplicados.has(item.id) || item.codigo_duplicado;
                        // O preço mora no próprio item da PV; o custo vem da LPU LS Office Geral ligada.
                        const preco = item.valor_unitario;
                        const custo = item.derivados?.find(d => d.pricebook.origem === "LPU_LS_OFFICE")?.custo_ls ?? 0;
                        const margem = preco > 0 && custo > 0 ? preco - custo : null;
                        const editando = editandoId === item.id;
                        // Margem da LPU LS Office Geral: venda − compra. Só existe quando os dois lados estão preenchidos.
                        const margemLsoc = (item.valor_venda || 0) > 0 && (item.custo_ls || 0) > 0
                          ? (item.valor_venda || 0) - (item.custo_ls || 0)
                          : null;
                        return (
                          <tr key={item.id} style={{
                            borderTop: `1px solid ${T.brSub}`,
                            opacity: salvandoId === item.id ? 0.5 : 1,
                            background: editando ? T.blue + "12" : undefined,
                          }}>
                            <td style={td()}>
                              {editando ? (
                                <input autoFocus value={rascunho.codigo_item || ""} onChange={e => setRascunho({ ...rascunho, codigo_item: e.target.value })}
                                  onKeyDown={teclas(item)} style={{ ...S.input, padding: "5px 6px", fontSize: 11, fontFamily: "monospace" }} />
                              ) : (
                                <>
                                  <span style={{ fontFamily: "monospace", fontWeight: 700, color: dup ? T.amber : T.txSec }}>{item.codigo_item || "—"}</span>
                                  {dup && <span title="Código repetido no documento original" style={{ marginLeft: 5, color: T.amber, fontSize: 10 }}>⚠</span>}
                                  {item.codigo_origem && (
                                    <div style={{ fontSize: 9.5, color: T.txDis, marginTop: 2 }} title="Linha na planilha de origem">
                                      linha {item.codigo_origem}
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                            <td style={{ ...td(), color: T.txPri }}>
                              {editando ? (
                                <>
                                  <input value={rascunho.descricao || ""} onChange={e => setRascunho({ ...rascunho, descricao: e.target.value })}
                                    onKeyDown={teclas(item)} style={{ ...S.input, padding: "5px 6px", fontSize: 11.5 }} />
                                  <input value={rascunho.detalhamento || ""} placeholder="detalhamento / configuração (opcional)"
                                    onChange={e => setRascunho({ ...rascunho, detalhamento: e.target.value })} onKeyDown={teclas(item)}
                                    style={{ ...S.input, padding: "4px 6px", fontSize: 10.5, marginTop: 4 }} />
                                </>
                              ) : (
                                <>
                                  {item.descricao}
                                  {item.detalhamento && <div style={{ fontSize: 10, color: T.txDis, marginTop: 2 }}>{item.detalhamento}</div>}
                                </>
                              )}
                            </td>
                            <td style={{ ...td(), color: T.txMut }}>
                              {editando ? (
                                <>
                                  <input list="categorias-pv" value={rascunho.subtipo || ""} onChange={e => setRascunho({ ...rascunho, subtipo: e.target.value })}
                                    onKeyDown={teclas(item)} style={{ ...S.input, padding: "5px 6px", fontSize: 11 }} />
                                </>
                              ) : (item.subtipo || "—")}
                            </td>
                            <td style={{ ...td(), color: T.txMut }}>
                              {editando ? (
                                <select value={rascunho.unidade || item.unidade} onChange={e => setRascunho({ ...rascunho, unidade: e.target.value })}
                                  onKeyDown={teclas(item)} style={{ ...S.input, padding: "5px 4px", fontSize: 11 }}>
                                  {[...new Set([item.unidade, ...UNIDADES])].map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              ) : item.unidade}
                            </td>

                            {ehPv && <>
                              <td style={{ padding: "4px 8px", textAlign: "right" }}>
                                <CampoNumero valor={item.valor_unitario} cor={T.amber} aoSalvar={v => salvarCampo(item, "valor_unitario", v)} />
                              </td>
                              <td style={{ ...td(), color: T.txDis, fontSize: 10, lineHeight: 1.4 }}>
                                {item.observacoes || (preco > 0 ? "preenchido nesta tela" : "—")}
                              </td>
                              <td style={{ ...td(), textAlign: "right", color: custo > 0 ? T.green : T.txDis, fontWeight: custo > 0 ? 700 : 400 }}>{custo > 0 ? moeda(custo) : "—"}</td>
                              <td style={{ ...td(), textAlign: "right" }}>
                                {margem == null
                                  ? <span style={{ color: T.txDis }}>—</span>
                                  : <span style={{ color: margem >= 0 ? T.cyan : T.red, fontWeight: 700 }}>
                                    {moeda(margem)}<span style={{ color: T.txMut, fontWeight: 500, marginLeft: 5, fontSize: 10 }}>{((margem / preco) * 100).toFixed(1)}%</span>
                                  </span>}
                              </td>
                            </>}

                            {ehLsoc && <>
                              <td style={{ padding: "4px 8px", textAlign: "right" }}>
                                <CampoNumero valor={item.valor_venda} cor={T.amber} aoSalvar={v => salvarCampo(item, "valor_venda", v)} />
                              </td>
                              <td style={{ padding: "4px 8px", textAlign: "right" }}>
                                <CampoNumero valor={item.custo_ls} cor={T.green} aoSalvar={v => salvarCampo(item, "custo_ls", v)} />
                              </td>
                              <td style={{ ...td(), textAlign: "right" }}>
                                {margemLsoc == null
                                  ? <span style={{ color: T.txDis }} title="Precisa de valor de venda e custo LS">—</span>
                                  : <span style={{ color: margemLsoc >= 0 ? T.cyan : T.red, fontWeight: 700 }}>
                                    {moeda(margemLsoc)}
                                    <span style={{ color: T.txMut, fontWeight: 500, marginLeft: 5, fontSize: 10 }}>
                                      {((margemLsoc / (item.valor_venda || 1)) * 100).toFixed(0)}%
                                    </span>
                                  </span>}
                              </td>
                            </>}

                            {!ehPv && !ehLsoc && <>
                              <td style={{ padding: "4px 8px" }}>
                                <select value={item.tipo_custo || "SERVICO"} onChange={e => salvarCampo(item, "tipo_custo", e.target.value)}
                                  style={{ ...S.input, padding: "5px 6px", fontSize: 11 }}>
                                  {TIPOS_CUSTO.map(t => <option key={t} value={t}>{ROTULO_CUSTO[t]}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: "4px 8px", textAlign: "right" }}>
                                <CampoNumero valor={item.valor_unitario} cor={T.amber} aoSalvar={v => salvarCampo(item, "valor_unitario", v)} />
                              </td>
                              <td style={{ ...td(), color: T.txDis, fontSize: 10 }}>{item.observacoes || (item.valor_unitario > 0 ? "preenchido nesta tela" : "—")}</td>
                            </>}

                            <td style={{ padding: "4px 6px", whiteSpace: "nowrap", textAlign: "right" }}>
                              {editando ? (
                                <>
                                  <button onClick={() => salvarEdicao(item)} title="Salvar (Enter)"
                                    style={{ background: "none", border: "none", color: T.green, cursor: "pointer", fontSize: 13 }}>✓</button>
                                  <button onClick={fecharEdicao} title="Cancelar (Esc)"
                                    style={{ background: "none", border: "none", color: T.txMut, cursor: "pointer", fontSize: 13 }}>✕</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => abrirEdicao(item)} title="Editar código, descrição, categoria e unidade"
                                    style={{ background: "none", border: "none", color: T.txMut, cursor: "pointer", fontSize: 12 }}>✏️</button>
                                  <button onClick={() => removerItem(item)} title="Remover item"
                                    style={{ background: "none", border: "none", color: T.txDis, cursor: "pointer", fontSize: 12 }}>🗑</button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!carregandoItens && visiveis.length === 0 && (
                        <tr><td colSpan={11} style={{ padding: 30, textAlign: "center", color: T.txMut }}>Nenhum item encontrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "7px 14px", borderTop: `1px solid ${T.brSub}`, fontSize: 10.5, color: T.txMut, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span>Mostrando {visiveis.length} de {itens.length} itens. Os campos são salvos ao sair.</span>
                  {ehPv && <span>O custo LS vem da LPU LS Office Geral ligada a este item — só o preço é editado aqui.</span>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CampoNumero({ valor, cor, aoSalvar }: { valor: number | null; cor: string; aoSalvar: (v: number) => void }) {
  const vazio = !(valor && valor > 0);
  return (
    <input type="number" step="0.01" min="0"
      defaultValue={vazio ? "" : valor!}
      placeholder="a preencher"
      onBlur={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) aoSalvar(v); }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{
        width: 104, padding: "6px 8px", fontSize: 11.5, textAlign: "right", borderRadius: 6,
        background: vazio ? "transparent" : T.bg3, color: vazio ? T.txMut : cor, fontWeight: 700,
        border: `1px solid ${vazio ? T.brSub : T.brBase}`, outline: "none",
      }} />
  );
}

function Indicador({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  return (
    <div style={{ background: T.bg3, border: `1px solid ${T.brBase}`, borderTop: `3px solid ${cor}`, borderRadius: 10, padding: "7px 13px", minWidth: 84 }}>
      <div style={{ fontSize: 9, color: T.txMut, fontWeight: 700, letterSpacing: "0.07em" }}>{rotulo}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: cor }}>{valor}</div>
    </div>
  );
}
