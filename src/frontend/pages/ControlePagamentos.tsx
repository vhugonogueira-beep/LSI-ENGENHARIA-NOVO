import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import PrestacaoContasViagem from "../components/atividades/PrestacaoContasViagem";

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

const T = {
  bg1: "#0e1117", bg2: "#13181f", bg3: "#1a2030",
  brSub: "#1e2840", brBase: "#2d3a52",
  txPri: "#f0f4fa", txSec: "#b4c5d8", txMut: "#7c94b0", txDis: "#506480",
  blue: "#3b82f6", green: "#34d399", amber: "#fbbf24", red: "#f87171",
  purple: "#a78bfa", cyan: "#67e8f9",
};

const S = {
  card: { background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, padding: "14px 16px" } as React.CSSProperties,
  input: { padding: "8px 10px", fontSize: 12, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg3, color: T.txPri, outline: "none", boxSizing: "border-box" } as React.CSSProperties,
  btn: { padding: "7px 13px", fontSize: 11.5, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg1, cursor: "pointer", color: T.txPri, fontWeight: 700 } as React.CSSProperties,
  btnBlue: { background: T.blue, color: "#fff", borderColor: T.blue } as React.CSSProperties,
};

const STATUS: Record<string, { rotulo: string; cor: string }> = {
  PENDENTE: { rotulo: "Pendente", cor: T.txMut },
  SOLICITADO: { rotulo: "Solicitado", cor: T.amber },
  ENVIADO_FINANCEIRO: { rotulo: "Enviado ao financeiro", cor: T.blue },
  AGUARDANDO_PAGAMENTO: { rotulo: "Aguardando pagamento", cor: T.blue },
  PAGO: { rotulo: "Pago", cor: T.green },
  COMPROVANTE_RECEBIDO: { rotulo: "Comprovante recebido", cor: T.green },
  CONFERIDO: { rotulo: "Conferido", cor: T.cyan },
  CANCELADO: { rotulo: "Cancelado", cor: T.red },
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
  atividade: { id: string; codigo: string; titulo: string; site: string | null } | null;
  banco: string | null; agencia: string | null; conta: string | null; pix: string | null;
  solicitado_em: string | null;
  forma_pagamento: string | null;
  cartao: string | null;
  formalizacao_posterior: boolean;
  fatura_referencia: string | null;
  processo_id: string | null;
  deposito_numero: number | null;
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = (v: string | null) => {
  if (!v) return "—";
  const data = new Date(v);
  return data.toLocaleDateString("pt-BR", v.includes("T00:00:00") ? { timeZone: "UTC" } : undefined);
};
const ORIGEM_LABEL: Record<Linha['origem'], string> = { PARCELA: 'CONTRATAÇÃO', REEMBOLSO: 'REEMBOLSO', ADIANTAMENTO: 'ADIANTAMENTO' };
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
      if (filtro === "SEM_COMPROVANTE" && !(PAGOS.includes(l.status) && !l.comprovante_url)) return false;
      if (!termo) return true;
      return `${l.favorecido} ${l.descricao} ${l.forma_pagamento || ""} ${l.cartao || ""} ${l.fatura_referencia || ""} ${l.atividade?.codigo || ""} ${l.atividade?.site || ""}`
        .toLocaleLowerCase("pt-BR").includes(termo);
    });
  }, [linhas, filtro, busca]);

  const filtros = [
    { id: "A_PAGAR" as const, rotulo: "A pagar" },
    { id: "SEM_COMPROVANTE" as const, rotulo: "Pagos sem comprovante" },
    { id: "PAGOS" as const, rotulo: "Pagos" },
    { id: "TODOS" as const, rotulo: "Todos" },
  ];

  if (carregando && linhas.length === 0) return <div style={{ padding: 40, color: T.txMut }}>Carregando pagamentos...</div>;

  const seletorModulo = <div style={{ display: "flex", gap: 8, borderBottom: `1px solid ${T.brBase}`, padding: "0 22px" }}>
    <button onClick={() => setModulo("PAGAMENTOS")} style={{ ...S.btn, border: "none", borderBottom: modulo === "PAGAMENTOS" ? `2px solid ${T.blue}` : "2px solid transparent", borderRadius: 0, color: modulo === "PAGAMENTOS" ? T.blue : T.txMut }}>Pagamentos</button>
    <button onClick={() => setModulo("PRESTACOES")} style={{ ...S.btn, border: "none", borderBottom: modulo === "PRESTACOES" ? `2px solid ${T.cyan}` : "2px solid transparent", borderRadius: 0, color: modulo === "PRESTACOES" ? T.cyan : T.txMut }}>Prestações de contas</button>
  </div>;

  if (modulo === "PRESTACOES") return <div>{seletorModulo}<PrestacaoContasViagem standalone /></div>;

  return (
    <div>{seletorModulo}<div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      {toast && <div style={{ position: "fixed", bottom: 20, right: 20, background: T.green, color: "#052e1b", padding: "10px 18px", borderRadius: 8, zIndex: 9999, fontWeight: 700, fontSize: 12 }}>{toast}</div>}

      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: T.txPri, margin: 0 }}>Controle de Pagamentos</h1>
        <p style={{ fontSize: 12, color: T.txMut, margin: "5px 0 0" }}>
          Parcelas de contrato e reembolsos na mesma fila. O comprovante é anexado na própria linha.
        </p>
      </div>

      {erro && (
        <div style={{ ...S.card, borderColor: T.red + "66", background: T.red + "12", color: "#fca5a5", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
          <span>{erro}</span>
          <button onClick={() => setErro("")} style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}

      {resumo && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <Kpi rotulo="A pagar" valor={moeda(resumo.aPagar)} cor={T.amber} />
          <Kpi rotulo="Pago" valor={moeda(resumo.pago)} cor={T.green} />
          <Kpi rotulo="Total" valor={moeda(resumo.total)} cor={T.blue} />
          <Kpi rotulo="Pagos sem comprovante" valor={String(resumo.semComprovante)} cor={resumo.semComprovante > 0 ? T.red : T.txMut} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por favorecido, atividade ou site..."
          style={{ ...S.input, flex: 1, minWidth: 220 }} />
        {filtros.map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)} style={{ ...S.btn, ...(filtro === f.id ? S.btnBlue : {}) }}>{f.rotulo}</button>
        ))}
      </div>

      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead style={{ background: T.bg3, color: T.txMut }}>
              <tr style={{ textAlign: "left" }}>
                <th style={th(88)}>ORIGEM</th>
                <th style={th(190)}>FAVORECIDO</th>
                <th style={th()}>DESCRIÇÃO</th>
                <th style={th(130)}>ATIVIDADE</th>
                <th style={{ ...th(118), textAlign: "right" }}>VALOR</th>
                <th style={th(92)}>SOLICITADO</th>
                <th style={th(92)}>PREVISTO</th>
                <th style={th(92)}>PAGO EM</th>
                <th style={th(158)}>STATUS</th>
                <th style={th(178)}>COMPROVANTE</th>
                <th style={th(150)}>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(l => {
                const st = STATUS[l.status] || { rotulo: l.status, cor: T.txMut };
                const pago = PAGOS.includes(l.status);
                const faltaComprovante = pago && !l.comprovante_url;
                return (
                  <tr key={`${l.origem}-${l.id}`} style={{ borderTop: `1px solid ${T.brSub}`, opacity: enviandoId === l.id ? 0.5 : 1 }}>
                    <td style={td()}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 20,
                        background: corOrigem(l.origem) + "1a",
                        color: corOrigem(l.origem),
                      }}>{ORIGEM_LABEL[l.origem]}</span>
                    </td>
                    <td style={{ ...td(), color: T.txPri, fontWeight: 600 }}>
                      {l.favorecido}
                      {l.documento && <div style={{ fontSize: 10, color: T.txDis, marginTop: 2 }}>{l.documento}</div>}
                    </td>
                    <td style={{ ...td(), color: T.txSec }}>
                      {l.descricao}
                      <div style={{ fontSize: 10, color: T.txDis, marginTop: 2 }}>
                        {tipoLabel(l.tipo)}{l.deposito_numero ? ` · Depósito ${l.deposito_numero}` : ''} · {l.forma_pagamento?.replace('CARTAO_CREDITO', 'CARTÃO DE CRÉDITO').replace('TED', 'TRANSFERÊNCIA') || 'FORMA NÃO INFORMADA'}
                        {l.cartao ? ` · ${l.cartao}` : l.forma_pagamento === 'PIX' && l.pix ? ` · PIX ${l.pix}` : l.banco ? ` · ${l.banco} ${l.agencia || ""}/${l.conta || ""}` : ""}
                      </div>
                      {l.formalizacao_posterior && <div style={{ fontSize: 10, color: T.amber, marginTop: 2 }}>Compra já realizada · formalização sem novo pagamento{l.fatura_referencia ? ` · Fatura ${l.fatura_referencia}` : ''}</div>}
                    </td>
                    <td style={{ ...td(), color: T.txMut, fontSize: 11 }}>
                      {l.atividade ? l.atividade.codigo : "—"}
                      {l.atividade?.site && <div style={{ fontSize: 10, color: T.txDis }}>{l.atividade.site}</div>}
                    </td>
                    <td style={{ ...td(), textAlign: "right", color: T.txPri, fontWeight: 700 }}>{moeda(l.valor)}</td>
                    <td style={{ ...td(), color: l.data_solicitacao ? T.txSec : T.txDis }}>{dataCurta(l.data_solicitacao)}</td>
                    <td style={{ ...td(), color: T.txMut }}>{dataCurta(l.data_prevista)}</td>
                    <td style={{ ...td(), color: l.data_pagamento ? T.green : T.txDis, fontWeight: l.data_pagamento ? 700 : 400 }}>{dataCurta(l.data_pagamento)}</td>
                    <td style={{ padding: "5px 8px" }}>
                      <select value={l.status} onChange={e => mudarStatus(l, e.target.value)}
                        style={{ ...S.input, padding: "5px 6px", fontSize: 11, width: "100%", color: st.cor, fontWeight: 700 }}>
                        {Object.entries(STATUS)
                          .filter(([k]) => k !== "CANCELADO")
                          .map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <input ref={el => { inputs.current[l.id] = el; }} type="file" accept=".pdf,.png,.jpg,.jpeg"
                        style={{ display: "none" }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) anexar(l, f); e.target.value = ""; }} />
                      {l.comprovante_url ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <a href={l.comprovante_url} target="_blank" rel="noreferrer"
                            style={{ ...S.btn, padding: "5px 9px", fontSize: 11, color: T.green, textDecoration: "none", display: "inline-block" }}>
                            📎 Ver
                          </a>
                          <button onClick={() => removerComprovante(l)} title="Remover comprovante"
                            style={{ ...S.btn, padding: "5px 8px", fontSize: 11, color: T.txDis }}>✕</button>
                        </div>
                      ) : (
                        <button onClick={() => inputs.current[l.id]?.click()} disabled={enviandoId === l.id}
                          style={{ ...S.btn, padding: "5px 10px", fontSize: 11, ...(faltaComprovante ? { color: T.red, borderColor: T.red + "77" } : {}) }}>
                          {enviandoId === l.id ? "Enviando..." : faltaComprovante ? "⚠ Anexar comprovante" : "Anexar comprovante"}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      {!pago && <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        <button onClick={() => abrirEdicao(l)} style={{ ...S.btn, padding: "5px 8px", fontSize: 10.5 }}>Editar</button>
                        {((l.origem === "PARCELA" && l.status !== "PENDENTE") || (l.origem !== "PARCELA" && Boolean(l.deposito_numero))) &&
                          <button onClick={() => excluirSolicitacao(l)} style={{ ...S.btn, padding: "5px 8px", fontSize: 10.5, color: T.red }}>Excluir</button>}
                      </div>}
                    </td>
                  </tr>
                );
              })}
              {visiveis.length === 0 && (
                <tr><td colSpan={11} style={{ padding: 34, textAlign: "center", color: T.txMut }}>
                  {linhas.length === 0 ? "Nenhum pagamento cadastrado ainda." : "Nenhum pagamento neste filtro."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "8px 14px", borderTop: `1px solid ${T.brSub}`, fontSize: 10.5, color: T.txMut }}>
          Mostrando {visiveis.length} de {linhas.length}. Anexar o comprovante marca o pagamento como concluído.
        </div>
      </div>
      {editando && <div style={{ position: "fixed", inset: 0, zIndex: 9500, background: "#000b", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setEditando(null)}>
        <div style={{ ...S.card, width: "100%", maxWidth: 480, padding: 20 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}><div><h2 style={{ margin: 0, color: T.txPri, fontSize: 16 }}>Editar pagamento solicitado</h2><p style={{ margin: "4px 0 0", color: T.txMut, fontSize: 11 }}>{editando.linha.favorecido}</p></div><button onClick={() => setEditando(null)} style={{ ...S.btn, padding: "4px 8px" }}>✕</button></div>
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

const th = (w?: number): React.CSSProperties =>
  ({ padding: "9px 10px", fontWeight: 700, fontSize: 9.5, letterSpacing: "0.05em", ...(w ? { width: w } : {}) });
const td = (): React.CSSProperties => ({ padding: "8px 10px", verticalAlign: "top" });

function Kpi({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.brBase}`, borderTop: `3px solid ${cor}`, borderRadius: 10, padding: "11px 15px" }}>
      <div style={{ fontSize: 9.5, color: T.txMut, fontWeight: 700, letterSpacing: "0.06em" }}>{rotulo.toUpperCase()}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color: cor, marginTop: 4 }}>{valor}</div>
    </div>
  );
}
