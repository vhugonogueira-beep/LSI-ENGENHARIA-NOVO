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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Controle de Pagamentos â€” a fila Ãºnica do que a LS Office deve pagar.
//
// Junta parcelas de contrato com fornecedor e reembolsos de despesa adiantada.
// SÃ£o tabelas diferentes no banco, mas uma obrigaÃ§Ã£o financeira sÃ³: separÃ¡-las
// na tela faria alguÃ©m acompanhar metade e perder a outra de vista.
//
// O comprovante Ã© anexado aqui, na mesma linha do pagamento â€” Ã© o que fecha o
// ciclo e o que a controladoria cobra depois.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


const S = {
  card: { background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, padding: "14px 16px" } as React.CSSProperties,
  input: { padding: "8px 10px", fontSize: 12, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg3, color: T.txPri, outline: "none", boxSizing: "border-box" } as React.CSSProperties,
  btn: { padding: "7px 13px", fontSize: 11.5, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg1, cursor: "pointer", color: T.txPri, fontWeight: 700 } as React.CSSProperties,
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
  if (!v) return "â€”";
  const data = new Date(v);
  return data.toLocaleDateString("pt-BR", v.includes("T00:00:00") ? { timeZone: "UTC" } : undefined);
};
const ORIGEM_LABEL: Record<Linha['origem'], string> = { PARCELA: 'CONTRATAÃ‡ÃƒO', REEMBOLSO: 'REEMBOLSO', ADIANTAMENTO: 'ADIANTAMENTO' };
const corOrigem = (origem: Linha['origem']) => origem === 'ADIANTAMENTO' ? T.cyan : origem === 'REEMBOLSO' ? T.purple : T.blue;
const tipoLabel = (tipo: string) => tipo === 'ADIANTAMENTO_VIAGEM' ? 'Adiantamento de viagem' : tipo.replace(/_/g, ' ');

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
        fr.onerror = () => falha(new Error("NÃ£o consegui ler o arquivo"));
        fr.readAsDataURL(arquivo);
      });
      const origemApi = l.deposito_numero ? "DEPOSITO" : l.origem;
      const r = await fetch(`/api/pagamentos/${origemApi}/${l.id}/comprovante`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivo_base64: base64 }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao anexar");
      await carregar();
      notify(`Comprovante anexado â€” ${l.favorecido}.`);
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
      ? `Excluir a solicitaÃ§Ã£o de ${moeda(l.valor)}? A parcela continuarÃ¡ no contrato como PENDENTE.`
      : `Excluir o depÃ³sito de ${moeda(l.valor)}?`;
    if (!confirm(texto)) return;
    try {
      const url = parcela
        ? `/api/contratacoes/parcelas/${l.id}/cancelar-solicitacao`
        : `/api/reembolsos/pagamentos/${l.id}`;
      const r = await fetch(url, {
        method: parcela ? "POST" : "DELETE",
        headers: parcela ? { "Content-Type": "application/json" } : undefined,
        body: parcela ? JSON.stringify({ motivo_cancelamento: "SolicitaÃ§Ã£o excluÃ­da no Controle de Pagamentos" }) : undefined,
      });
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao excluir a solicitaÃ§Ã£o");
      await carregar(); notify(parcela ? "SolicitaÃ§Ã£o cancelada; parcela devolvida para pendente." : "DepÃ³sito excluÃ­do.");
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

  const seletorModulo = <div style={{ display: "flex", gap: 8, borderBottom: `1px solid ${T.brBase}`, padding: "0 22px" }}>
    <button onClick={() => setModulo("PAGAMENTOS")} style={{ ...S.btn, border: "none", borderBottom: modulo === "PAGAMENTOS" ? `2px solid ${T.blue}` : "2px solid transparent", borderRadius: 0, color: modulo === "PAGAMENTOS" ? T.blue : T.txMut }}>Pagamentos</button>
    <button onClick={() => setModulo("PRESTACOES")} style={{ ...S.btn, border: "none", borderBottom: modulo === "PRESTACOES" ? `2px solid ${T.cyan}` : "2px solid transparent", borderRadius: 0, color: modulo === "PRESTACOES" ? T.cyan : T.txMut }}>PrestaÃ§Ãµes de contas</button>
  </div>;

  if (modulo === "PRESTACOES") return <div>{seletorModulo}<PrestacaoContasViagem standalone /></div>;

  return (
    <div>{seletorModulo}<div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      {toast && <div style={{ position: "fixed", bottom: 20, right: 20, background: T.green, color: "#052e1b", padding: "10px 18px", borderRadius: 8, zIndex: 9999, fontWeight: 700, fontSize: 12 }}>{toast}</div>}

      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: T.txPri, margin: 0 }}>Controle de Pagamentos</h1>
        <p style={{ fontSize: 12, color: T.txMut, margin: "5px 0 0" }}>
          Parcelas de contrato e reembolsos na mesma fila. O comprovante Ã© anexado na prÃ³pria linha.
        </p>
      </div>

      {erro && (
        <div style={{ ...S.card, borderColor: T.red + "66", background: T.red + "12", color: "#fca5a5", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
          <span>{erro}</span>
          <button onClick={() => setErro("")} style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontWeight: 700 }}>âœ•</button>
        </div>
      )}

      {resumo && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <Kpi rotulo="A pagar" valor={moeda(resumo.aPagar)} cor={T.amber} />
          <Kpi rotulo="Pago" valor={moeda(resumo.pago)} cor={T.green} />
          <Kpi rotulo="Total" valor={moeda(resumo.total)} cor={T.blue} />
          <Kpi rotulo="Pagos sem comprovante" valor={String(resumo.semComprovante)} cor={resumo.semComprovante > 0 ? T.red : T.txMut} />
          {/* Formalizações não entram em "A pagar": o dinheiro já saiu. O que
              falta nelas é documento, e isso tem indicador próprio. */}
          {resumo.formalizacoesPendentesDocumento > 0 && (
            <Kpi rotulo="Formalizações sem documento" valor={String(resumo.formalizacoesPendentesDocumento)} cor={T.amber} />
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por favorecido, atividade ou site..."
          style={{ ...S.input, flex: 1, minWidth: 220 }} />
        {filtros.map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)} style={{ ...S.btn, ...(filtro === f.id ? S.btnBlue : {}) }}>{f.rotulo}</button>
        ))}
      </div>

      <div className="space-y-4">
        {grupos.map(([favorecido, pagamentos]) => {
          const totalGrupo = pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0);
          const categorias = Array.from(new Set(pagamentos.map(pagamento => ORIGEM_LABEL[pagamento.origem]))).join(" · ");
          const documento = pagamentos.find(pagamento => pagamento.documento)?.documento;
          return (
            <FinancialBeneficiaryCard
              key={favorecido}
              name={favorecido}
              category={categorias}
              total={moeda(totalGrupo)}
              totalLabel="Total no filtro"
              status={<span className="rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{pagamentos.length} {pagamentos.length === 1 ? "pagamento" : "pagamentos"}</span>}
            >
              {documento && <div className="px-1 text-[10px] text-muted-foreground">Documento: {documento}</div>}
              {pagamentos.map(l => {
                const pago = PAGOS.includes(l.status);
                const faltaComprovante = pago && !l.tem_comprovante;
                // A referencia vem primeiro: e por ela que o financeiro
                // identifica o lancamento no extrato e no e-mail.
                const contexto = [
                  l.referencia,
                  l.descricao,
                  l.atividade?.codigo,
                  l.atividade?.site,
                ].filter(Boolean).join(" · ");
                const forma = l.forma_pagamento?.replace("CARTAO_CREDITO", "CARTÃO DE CRÉDITO").replace("TED", "TRANSFERÊNCIA") || "FORMA NÃO INFORMADA";
                const detalhePagamento = l.cartao
                  ? l.cartao
                  : l.forma_pagamento === "PIX" && l.pix
                    ? `PIX ${l.pix}`
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
                  ? <a href={l.comprovante_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg border border-emerald-500/40 px-3 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/10">Ver comprovante</a>
                  : <button
                      type="button"
                      onClick={() => inputs.current[l.id]?.click()}
                      disabled={enviandoId === l.id}
                      className={`h-8 rounded-lg border px-3 text-[11px] font-bold disabled:opacity-50 ${faltaComprovante ? "border-red-400/60 text-red-400 hover:bg-red-500/10" : "border-border text-foreground hover:bg-secondary"}`}
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
                      method={<span style={{ color: corOrigem(l.origem) }}>{forma}{detalhePagamento ? ` · ${detalhePagamento}` : ""}</span>}
                      context={contexto}
                      requestedAt={dataCurta(l.data_solicitacao)}
                      expectedAt={dataCurta(l.data_prevista)}
                      paidAt={l.data_pagamento ? dataCurta(l.data_pagamento) : undefined}
                      receipt={{ attached: Boolean(l.comprovante_url) }}
                      status={<PagamentoStatusSelect value={l.status} onChange={status => mudarStatus(l, status)} />}
                      primaryAction={acaoPrincipal}
                      actions={acoes}
                    >
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                        <span className="font-semibold" style={{ color: corOrigem(l.origem) }}>{ORIGEM_LABEL[l.origem]}</span>
                        {l.documento && <span>{l.documento}</span>}
                        {(l.processo_tipo === 'PAYMENT_FORMALIZATION' || l.formalizacao_posterior) && <span className="text-amber-400">Pagamento já realizado · formalização documental, sem novo pagamento{l.fatura_referencia ? ` · ${l.fatura_referencia}` : ""}</span>}
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
        <div className="px-1 text-[10.5px] text-muted-foreground">
          Mostrando {visiveis.length} de {linhas.length}. Anexar o comprovante marca o pagamento como concluído.
        </div>
      </div>
      {editando && <div style={{ position: "fixed", inset: 0, zIndex: 9500, background: "#000b", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setEditando(null)}>
        <div style={{ ...S.card, width: "100%", maxWidth: 480, padding: 20 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}><div><h2 style={{ margin: 0, color: T.txPri, fontSize: 16 }}>Editar pagamento solicitado</h2><p style={{ margin: "4px 0 0", color: T.txMut, fontSize: 11 }}>{editando.linha.favorecido}</p></div><button onClick={() => setEditando(null)} style={{ ...S.btn, padding: "4px 8px" }}>âœ•</button></div>
          {erro && <div style={{ marginBottom: 12, padding: "8px 10px", border: `1px solid ${T.red}66`, borderRadius: 7, background: `${T.red}12`, color: T.red, fontSize: 11 }}>{erro}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ color: T.txSec, fontSize: 11 }}>Valor<input type="number" min="0.01" step="0.01" value={editando.valor} onChange={e => setEditando({ ...editando, valor: e.target.value })} style={{ ...S.input, display: "block", width: "100%", marginTop: 5 }}/></label>
            <span/>
            <label style={{ color: T.txSec, fontSize: 11 }}>Data da solicitaÃ§Ã£o<input type="date" value={editando.data_solicitacao} onChange={e => setEditando({ ...editando, data_solicitacao: e.target.value })} style={{ ...S.input, display: "block", width: "100%", marginTop: 5 }}/></label>
            <label style={{ color: T.txSec, fontSize: 11 }}>Data prevista<input type="date" value={editando.data_prevista} onChange={e => setEditando({ ...editando, data_prevista: e.target.value })} style={{ ...S.input, display: "block", width: "100%", marginTop: 5 }}/></label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}><button onClick={() => setEditando(null)} style={S.btn}>Cancelar</button><button onClick={salvarEdicao} style={{ ...S.btn, ...S.btnBlue }}>Salvar alteraÃ§Ãµes</button></div>
        </div>
      </div>}
    </div></div>
  );
}


function Kpi({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.brBase}`, borderTop: `3px solid ${cor}`, borderRadius: 10, padding: "11px 15px" }}>
      <div style={{ fontSize: 9.5, color: T.txMut, fontWeight: 700, letterSpacing: "0.06em" }}>{rotulo.toUpperCase()}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color: cor, marginTop: 4 }}>{valor}</div>
    </div>
  );
}
