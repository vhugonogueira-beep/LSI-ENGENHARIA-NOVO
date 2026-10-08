import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import PrestacaoContasViagem from "../components/atividades/PrestacaoContasViagem";
import PagamentoStatusSelect from "../components/atividades/PagamentoStatusSelect";
import {
  FinancialBeneficiaryCard,
  FinancialPaymentCard,
  type FinancialAction,
} from "../components/financeiro/FinancialCards";
// Paleta unica do sistema (src/frontend/theme.ts), com tema claro e escuro.
import { T } from '../theme';
import FilaAprovacoes from "../components/financeiro/FilaAprovacoes";
import PageHeader from "../components/PageHeader";
import { CreditCard, Search, X } from "lucide-react";
// Cor com significado (docs/DESIGN-SYSTEM.md): origem, KPI e módulo.
import { CHIP, FAIXA, TOM_MODULO, type Tom } from "../lib/cores";
import { FiltroPainel, FiltroLinha, CAMPO, ALTERNADOR, SEGMENTO } from "../components/FiltroPainel";

// ─────────────────────────────────────────────────────────────────────────────
// Controle de Pagamentos — a fila única do que a LS Office deve pagar.
//
// Junta parcelas de contrato com fornecedor e reembolsos de despesa adiantada.
// São tabelas diferentes no banco, mas uma obrigação financeira só: separá-las
// na tela faria alguém acompanhar metade e perder a outra de vista.
//
// O comprovante é anexado aqui, na mesma linha do pagamento — é o que fecha o
// ciclo e o que a controladoria cobra depois.
// ─────────────────────────────────────────────────────────────────────────────


const S = {
  card: { background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, padding: "14px 16px" } as React.CSSProperties,
  input: { padding: "8px 10px", fontSize: 12, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg3, color: T.txPri, outline: "none", boxSizing: "border-box" } as React.CSSProperties,
  btn: { padding: "7px 13px", fontSize: 12, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg1, cursor: "pointer", color: T.txPri, fontWeight: 700 } as React.CSSProperties,
  btnBlue: { background: T.blue, color: "#fff", borderColor: T.blue } as React.CSSProperties,
};

const PAGOS = ["PAGO", "COMPROVANTE_RECEBIDO", "CONFERIDO"];

interface Linha {
  id: string;
  origem: "PARCELA" | "REEMBOLSO" | "ADIANTAMENTO";
  favorecido: string;
  documento: string | null;
  descricao: string;
  tipo: string;
  valor: number;
  status: string;
  data_solicitacao: string | null;
  data_prevista: string | null;
  data_pagamento: string | null;
  comprovante_url: string | null;
  /** Comprovante em qualquer um dos dois lugares: campo antigo ou anexo. */
  tem_comprovante: boolean;
  atividade: { id: string; codigo: string; titulo: string; site: string | null } | null;
  banco: string | null; agencia: string | null; conta: string | null; pix: string | null;
  solicitado_em: string | null;
  forma_pagamento: string | null;
  cartao: string | null;
  formalizacao_posterior: boolean;
  processo_tipo: string;
  fatura_referencia: string | null;
  processo_id: string | null;
  deposito_numero: number | null;
  /** REE-2026-0041 / ADT-2026-0007. Parcela de contrato ainda vem nula. */
  referencia: string | null;
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = (v: string | null) => {
  if (!v) return "—";
  const data = new Date(v);
  return data.toLocaleDateString("pt-BR", v.includes("T00:00:00") ? { timeZone: "UTC" } : undefined);
};
const ORIGEM_LABEL: Record<Linha['origem'], string> = { PARCELA: 'Contratação', REEMBOLSO: 'Reembolso', ADIANTAMENTO: 'Adiantamento' };
/** Cor de cada origem: a faixa do cartão e a etiqueta dizem de onde vem o pagamento. */
const ORIGEM_TOM: Record<Linha['origem'], Tom> = { PARCELA: 'blue', REEMBOLSO: 'violet', ADIANTAMENTO: 'orange' };
/** Código do banco (TIPO_DO_X) em frase: "Tipo do x". */
const emFrase = (v: string) => { const t = v.replace(/_/g, ' ').toLocaleLowerCase('pt-BR'); return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1); };
const tipoLabel = (tipo: string) => tipo === 'ADIANTAMENTO_VIAGEM' ? 'Adiantamento de viagem' : emFrase(tipo);
const FORMA_LABEL: Record<string, string> = { PIX: 'PIX', TED: 'Transferência', CARTAO_CREDITO: 'Cartão de crédito' };
const formaLabel = (forma: string | null) => !forma ? 'Forma não informada' : FORMA_LABEL[forma] || emFrase(forma);

export default function ControlePagamentos() {
  const [modulo, setModulo] = useState<"PAGAMENTOS" | "PRESTACOES">("PAGAMENTOS");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resumo, setResumo] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"TODOS" | "A_PAGAR" | "PAGOS" | "SEM_COMPROVANTE">("A_PAGAR");
  const [busca, setBusca] = useState("");
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ linha: Linha; valor: string; data_solicitacao: string; data_prevista: string } | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/pagamentos");
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao carregar");
      const d = await r.json();
      setLinhas(d.linhas || []);
      setResumo(d.resumo || null);
    } catch (e: any) { setErro(e.message); } finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function anexar(l: Linha, arquivo: File) {
    if (arquivo.size > 15 * 1024 * 1024) { setErro("Arquivo acima de 15 MB."); return; }
    setEnviandoId(l.id); setErro("");
    try {
      const base64 = await new Promise<string>((ok, falha) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result));
        fr.onerror = () => falha(new Error("Não consegui ler o arquivo"));
        fr.readAsDataURL(arquivo);
      });
      const origemApi = l.deposito_numero ? "DEPOSITO" : l.origem;
      const r = await fetch(`/api/pagamentos/${origemApi}/${l.id}/comprovante`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivo_base64: base64 }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao anexar");
      await carregar();
      notify(`Comprovante anexado — ${l.favorecido}.`);
    } catch (e: any) { setErro(e.message); } finally { setEnviandoId(null); }
  }

  async function removerComprovante(l: Linha) {
    if (!confirm(`Remover o comprovante de ${l.favorecido}?`)) return;
    try {
      const origemApi = l.deposito_numero ? "DEPOSITO" : l.origem;
      const r = await fetch(`/api/pagamentos/${origemApi}/${l.id}/comprovante`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao remover");
      await carregar();
      notify("Comprovante removido.");
    } catch (e: any) { setErro(e.message); }
  }

  async function mudarStatus(l: Linha, status: string) {
    try {
      if (l.origem === "PARCELA" && status === "PENDENTE" && l.status !== "PENDENTE") {
        await excluirSolicitacao(l);
        return;
      }
      const url = l.origem === "PARCELA"
        ? `/api/contratacoes/parcelas/${l.id}/status`
        : l.deposito_numero
          ? `/api/reembolsos/pagamentos/${l.id}/status`
          : `/api/reembolsos/${l.id}/status`;
      const r = await fetch(url, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao mudar o status");
      await carregar();
    } catch (e: any) { setErro(e.message); }
  }

  function abrirEdicao(l: Linha) {
    setErro("");
    setEditando({
      linha: l,
      valor: String(l.valor),
      data_solicitacao: l.data_solicitacao ? l.data_solicitacao.slice(0, 10) : "",
      data_prevista: l.data_prevista ? l.data_prevista.slice(0, 10) : "",
    });
  }

  async function salvarEdicao() {
    if (!editando) return;
    const valor = Number(editando.valor.replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) { setErro("Informe um valor maior que zero"); return; }
    const l = editando.linha;
    const url = l.origem === "PARCELA"
      ? `/api/contratacoes/parcelas/${l.id}`
      : `/api/reembolsos/pagamentos/${l.id}`;
    try {
      const r = await fetch(url, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor, data_solicitacao: editando.data_solicitacao || null, data_prevista: editando.data_prevista || null }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao editar o pagamento");
      setEditando(null); await carregar(); notify("Pagamento atualizado.");
    } catch (e: any) { setErro(e.message); }
  }

  async function excluirSolicitacao(l: Linha) {
    const parcela = l.origem === "PARCELA";
    const texto = parcela
      ? `Excluir a solicitação de ${moeda(l.valor)}? A parcela continuará no contrato como PENDENTE.`
      : `Excluir o depósito de ${moeda(l.valor)}?`;
    if (!confirm(texto)) return;
    try {
      const url = parcela
        ? `/api/contratacoes/parcelas/${l.id}/cancelar-solicitacao`
        : `/api/reembolsos/pagamentos/${l.id}`;
      const r = await fetch(url, {
        method: parcela ? "POST" : "DELETE",
        headers: parcela ? { "Content-Type": "application/json" } : undefined,
        body: parcela ? JSON.stringify({ motivo_cancelamento: "Solicitação excluída no Controle de Pagamentos" }) : undefined,
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao excluir a solicitação");
      await carregar(); notify(parcela ? "Solicitação cancelada; parcela devolvida para pendente." : "Depósito excluído.");
    } catch (e: any) { setErro(e.message); }
  }

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return linhas.filter(l => {
      if (filtro === "A_PAGAR" && PAGOS.includes(l.status)) return false;
      if (filtro === "PAGOS" && !PAGOS.includes(l.status)) return false;
      if (filtro === "SEM_COMPROVANTE" && !(PAGOS.includes(l.status) && !l.tem_comprovante)) return false;
      if (!termo) return true;
      return `${l.referencia || ""} ${l.favorecido} ${l.descricao} ${l.forma_pagamento || ""} ${l.cartao || ""} ${l.fatura_referencia || ""} ${l.atividade?.codigo || ""} ${l.atividade?.site || ""}`
        .toLocaleLowerCase("pt-BR").includes(termo);
    });
  }, [linhas, filtro, busca]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Linha[]>();
    for (const linha of visiveis) {
      const existentes = mapa.get(linha.favorecido) || [];
      mapa.set(linha.favorecido, [...existentes, linha]);
    }
    return Array.from(mapa.entries());
  }, [visiveis]);

  const filtros = [
    { id: "A_PAGAR" as const, rotulo: "A pagar" },
    { id: "SEM_COMPROVANTE" as const, rotulo: "Pagos sem comprovante" },
    { id: "PAGOS" as const, rotulo: "Pagos" },
    { id: "TODOS" as const, rotulo: "Todos" },
  ];

  if (carregando && linhas.length === 0) return <div style={{ padding: 40, color: T.txMut }}>Carregando pagamentos...</div>;

  // As abas vêm logo abaixo do título da página, alinhadas com o conteúdo.
  const seletorModulo = <div role="tablist" aria-label="Seções" style={{ display: "flex", gap: 8, borderBottom: `1px solid ${T.brBase}` }}>
    <button onClick={() => setModulo("PAGAMENTOS")} style={{ ...S.btn, border: "none", borderBottom: modulo === "PAGAMENTOS" ? `2px solid ${T.blue}` : "2px solid transparent", borderRadius: 0, color: modulo === "PAGAMENTOS" ? T.blue : T.txMut }}>Pagamentos</button>
    <button onClick={() => setModulo("PRESTACOES")} style={{ ...S.btn, border: "none", borderBottom: modulo === "PRESTACOES" ? `2px solid ${T.blue}` : "2px solid transparent", borderRadius: 0, color: modulo === "PRESTACOES" ? T.blue : T.txMut }}>Prestações de contas</button>
  </div>;

  const cabecalho = <div className="[&>header]:mb-0">
    <PageHeader icone={CreditCard} tom={TOM_MODULO.pagamentos} titulo="Controle de pagamentos"
      descricao="Parcelas de contrato e reembolsos na mesma fila. O comprovante é anexado na própria linha." />
  </div>;

  if (modulo === "PRESTACOES") return <div className="p-8" style={{ display: "flex", flexDirection: "column", gap: 14 }}>{cabecalho}{seletorModulo}<PrestacaoContasViagem standalone /></div>;

  return (
    <div><div className="p-8" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {toast && <div role="status" style={{ position: "fixed", bottom: 20, right: 20, background: T.bg2, color: T.txPri, border: `1px solid ${T.green}`, borderLeft: `3px solid ${T.green}`, padding: "10px 18px", borderRadius: 8, zIndex: 9999, fontWeight: 600, fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>{toast}</div>}

      {/* O mb-6 do cabeçalho some dentro da coluna com gap: o espaço vem do gap. */}
      {cabecalho}
      {seletorModulo}

      <FilaAprovacoes onDecidido={carregar} />

      {erro && (
        <div role="alert" style={{ ...S.card, borderColor: T.red + "66", background: T.red + "12", color: T.red, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{erro}</span>
          <button onClick={() => setErro("")} aria-label="Fechar aviso" title="Fechar aviso" style={{ background: "none", border: "none", color: T.red, cursor: "pointer", display: "inline-flex", padding: 2 }}><X size={14} aria-hidden /></button>
        </div>
      )}

      {resumo && (
        // Colunas iguais, uma por indicador: os valores ficam na mesma linha.
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${resumo.formalizacoesPendentesDocumento > 0 ? 5 : 4}, minmax(0, 1fr))`, gap: 12 }}>
          <Kpi tom="amber" rotulo="A pagar" valor={resumo.aPagar ? moeda(resumo.aPagar) : null} />
          <Kpi tom="green" rotulo="Pago" valor={resumo.pago ? moeda(resumo.pago) : null} />
          <Kpi tom="indigo" rotulo="Total" valor={resumo.total ? moeda(resumo.total) : null} />
          <Kpi tom={resumo.semComprovante > 0 ? "rose" : "slate"} rotulo="Pagos sem comprovante" valor={resumo.semComprovante > 0 ? String(resumo.semComprovante) : null} alerta={resumo.semComprovante > 0 ? T.red : undefined} />
          {/* Formalizações não entram em "A pagar": o dinheiro já saiu. O que
              falta nelas é documento, e isso tem indicador próprio. */}
          {resumo.formalizacoesPendentesDocumento > 0 && (
            <Kpi tom="amber" rotulo="Formalizações sem documento" valor={String(resumo.formalizacoesPendentesDocumento)} alerta={T.amber} />
          )}
        </div>
      )}

      {/* Painel, contagem e lista num bloco só: o gap da coluna não se soma ao mb-4 do painel. */}
      <div>
      <FiltroPainel>
        <FiltroLinha rotulo="Buscar">
          <div className="relative min-w-[240px] flex-1">
            <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por favorecido, atividade ou site..." aria-label="Buscar pagamentos"
              className={`${CAMPO} w-full pl-9`} />
          </div>
        </FiltroLinha>
        <FiltroLinha rotulo="Mostrar">
          <div className={ALTERNADOR} role="group" aria-label="Situação do pagamento">
            {filtros.map(f => (
              <button key={f.id} onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id}
                className={`${SEGMENTO} ${filtro === f.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{f.rotulo}</button>
            ))}
          </div>
        </FiltroLinha>
      </FiltroPainel>

      {/* Contagem presa à lista que descreve, em cima dela. */}
      <div className="mb-2 flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
        <span><strong className="font-semibold tabular-nums text-foreground">{visiveis.length}</strong> de {linhas.length} pagamento(s) · {grupos.length} favorecido(s)</span>
        <span className="text-[11px]">Anexar o comprovante marca o pagamento como concluído.</span>
      </div>

      <div className="space-y-4">
        {grupos.map(([favorecido, pagamentos]) => {
          const totalGrupo = pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0);
          const categorias = Array.from(new Set(pagamentos.map(pagamento => ORIGEM_LABEL[pagamento.origem]))).join(", ");
          const documento = pagamentos.find(pagamento => pagamento.documento)?.documento;
          return (
            <FinancialBeneficiaryCard
              key={favorecido}
              name={favorecido}
              category={categorias}
              total={moeda(totalGrupo)}
              totalLabel="Total no filtro"
              status={<span className="rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{pagamentos.length} {pagamentos.length === 1 ? "pagamento" : "pagamentos"}</span>}
            >
              {documento && <div className="px-1 text-[11px] text-muted-foreground">Documento: <span className="font-id">{documento}</span></div>}
              {pagamentos.map(l => {
                const pago = PAGOS.includes(l.status);
                const faltaComprovante = pago && !l.tem_comprovante;
                // A referencia vem primeiro: e por ela que o financeiro
                // identifica o lancamento no extrato e no e-mail.
                const contexto = <span className="inline-flex flex-wrap gap-x-3">
                  {l.referencia && <span className="font-id">{l.referencia}</span>}
                  {l.descricao && <span>{l.descricao}</span>}
                  {l.atividade?.codigo && <span className="font-id">{l.atividade.codigo}</span>}
                  {l.atividade?.site && <span className="font-id">{l.atividade.site}</span>}
                </span>;
                const forma = formaLabel(l.forma_pagamento);
                const detalhePagamento = l.cartao
                  ? l.cartao
                  // A forma ("PIX") já sai ao lado; aqui vai só a chave.
                  : l.forma_pagamento === "PIX" && l.pix
                    ? l.pix
                    : l.banco
                      ? `${l.banco} ${l.agencia || ""}/${l.conta || ""}`
                      : "";
                const acoes: FinancialAction[] = [];
                if (!pago) acoes.push({ label: "Editar valor e datas", onClick: () => abrirEdicao(l) });
                if (l.comprovante_url) acoes.push({ label: "Remover comprovante", onClick: () => removerComprovante(l), tone: "danger" });
                if (!pago && ((l.origem === "PARCELA" && l.status !== "PENDENTE") || (l.origem !== "PARCELA" && Boolean(l.deposito_numero)))) {
                  acoes.push({
                    label: l.origem === "PARCELA" ? "Excluir solicitação" : "Excluir depósito",
                    onClick: () => excluirSolicitacao(l),
                    tone: "danger",
                  });
                }
                const acaoPrincipal = l.comprovante_url
                  ? <a href={l.comprovante_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg border border-ok/40 px-3 text-[11px] font-bold text-ok hover:bg-ok/10">Ver comprovante</a>
                  : <button
                      type="button"
                      onClick={() => inputs.current[l.id]?.click()}
                      disabled={enviandoId === l.id}
                      className={`h-8 rounded-lg border px-3 text-[11px] font-bold disabled:opacity-50 ${faltaComprovante ? "border-crit/60 text-crit hover:bg-crit/10" : "border-border text-foreground hover:bg-secondary"}`}
                    >
                      {enviandoId === l.id ? "Enviando..." : "Anexar comprovante"}
                    </button>;
                return (
                  <div key={`${l.origem}-${l.id}`} className={enviandoId === l.id ? "opacity-50" : ""}>
                    <input
                      ref={el => { inputs.current[l.id] = el; }}
                      type="file"
                      accept="*/*"
                      className="hidden"
                      onChange={e => {
                        const arquivo = e.target.files?.[0];
                        if (arquivo) anexar(l, arquivo);
                        e.target.value = "";
                      }}
                    />
                    <FinancialPaymentCard
                      title={l.deposito_numero ? `Depósito ${l.deposito_numero}` : tipoLabel(l.tipo)}
                      amount={moeda(l.valor)}
                      method={<span className="inline-flex flex-wrap gap-x-2"><span>{forma}</span>{detalhePagamento && <span className="font-id font-normal">{detalhePagamento}</span>}</span>}
                      context={contexto}
                      requestedAt={dataCurta(l.data_solicitacao)}
                      expectedAt={dataCurta(l.data_prevista)}
                      paidAt={l.data_pagamento ? dataCurta(l.data_pagamento) : undefined}
                      receipt={{ attached: Boolean(l.comprovante_url) }}
                      status={<PagamentoStatusSelect value={l.status} onChange={status => mudarStatus(l, status)} />}
                      primaryAction={acaoPrincipal}
                      actions={acoes}
                      stripe={FAIXA[ORIGEM_TOM[l.origem]]}
                    >
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className={`rounded-full px-2 py-px font-semibold ${CHIP[ORIGEM_TOM[l.origem]]}`}>{ORIGEM_LABEL[l.origem]}</span>
                        {l.documento && <span className="font-id">{l.documento}</span>}
                        {(l.processo_tipo === 'PAYMENT_FORMALIZATION' || l.formalizacao_posterior) && <>
                          <span className="text-warn">Pagamento já realizado: formalização documental, sem novo pagamento</span>
                          {l.fatura_referencia && <span>Fatura <span className="font-id">{l.fatura_referencia}</span></span>}
                        </>}
                      </div>
                    </FinancialPaymentCard>
                  </div>
                );
              })}
            </FinancialBeneficiaryCard>
          );
        })}
        {visiveis.length === 0 && (
          <div style={{ ...S.card, padding: 34, textAlign: "center", color: T.txMut }}>
            {linhas.length === 0 ? "Nenhum pagamento cadastrado ainda." : "Nenhum pagamento neste filtro."}
          </div>
        )}
      </div>
      </div>
      {editando && <div style={{ position: "fixed", inset: 0, zIndex: 9500, background: "#000b", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setEditando(null)}>
        <div style={{ ...S.card, width: "100%", maxWidth: 480, padding: 20 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}><div><h2 style={{ margin: 0, color: T.txPri, fontSize: 15 }}>Editar pagamento solicitado</h2><p style={{ margin: "4px 0 0", color: T.txMut, fontSize: 11 }}>{editando.linha.favorecido}</p></div><button onClick={() => setEditando(null)} aria-label="Fechar" title="Fechar" style={{ ...S.btn, padding: "4px 8px", display: "inline-flex", alignItems: "center" }}><X size={14} aria-hidden /></button></div>
          {erro && <div style={{ marginBottom: 12, padding: "8px 10px", border: `1px solid ${T.red}66`, borderRadius: 7, background: `${T.red}12`, color: T.red, fontSize: 11 }}>{erro}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ color: T.txSec, fontSize: 11 }}>Valor<input type="number" min="0.01" step="0.01" value={editando.valor} onChange={e => setEditando({ ...editando, valor: e.target.value })} style={{ ...S.input, display: "block", width: "100%", marginTop: 5 }}/></label>
            <span/>
            <label style={{ color: T.txSec, fontSize: 11 }}>Data da solicitação<input type="date" value={editando.data_solicitacao} onChange={e => setEditando({ ...editando, data_solicitacao: e.target.value })} style={{ ...S.input, display: "block", width: "100%", marginTop: 5 }}/></label>
            <label style={{ color: T.txSec, fontSize: 11 }}>Data prevista<input type="date" value={editando.data_prevista} onChange={e => setEditando({ ...editando, data_prevista: e.target.value })} style={{ ...S.input, display: "block", width: "100%", marginTop: 5 }}/></label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button onClick={() => setEditando(null)} style={S.btn}>Cancelar</button><button onClick={salvarEdicao} style={{ ...S.btn, ...S.btnBlue }}>Salvar alterações</button></div>
        </div>
      </div>}
    </div></div>
  );
}


/** Cada KPI tem a sua cor (faixa no topo e ponto no rótulo); o valor só ganha
 *  cor quando é alerta. Sem valor, "—" sem cor. */
function Kpi({ rotulo, valor, alerta, tom = "slate" }: { rotulo: string; valor: string | null; alerta?: string; tom?: Tom }) {
  void tom; // cartão neutro; a cor fica para o alerta (revisão de 08/10/2026)
  return (
    <div style={{ background: T.bg2, border: `1px solid ${alerta ? alerta + "66" : T.brBase}`, borderRadius: 10, padding: "11px 15px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: T.txMut, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", overflow: "hidden" }} title={rotulo}>
        {rotulo}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: valor == null ? T.txMut : alerta || T.txPri, marginTop: 4, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{valor ?? "—"}</div>
    </div>
  );
}
