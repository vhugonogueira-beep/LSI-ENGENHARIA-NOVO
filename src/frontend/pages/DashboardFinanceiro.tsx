import React, { useState, useEffect, useCallback } from "react";
import { STATUS_OPERACIONAL, STATUS_FATURAMENTO } from "../components/atividades/constants";
// Paleta unica do sistema (src/frontend/theme.ts), com tema claro e escuro.
import { T } from '../theme';
// Cor com significado (docs/DESIGN-SYSTEM.md): cada indicador tem a sua.
import { TOM_SHARING, TOM_STATUS, hexTom, tomDe, type Tom } from '../lib/cores';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Financeiro — controladoria sobre o modelo real (Atividade,
// ContratacaoFornecedor, ParcelaPagamento, FaturamentoLinha).
//
// Substitui a versão que rodava em localStorage sobre `ls_projetos`, um cadastro
// paralelo que não conversava com o resto do sistema.
//
// A cadeia é a da seção 14 do Blueprint. Custo COMPROMETIDO ≠ custo PAGO: o que
// foi contratado conta inteiro, mesmo que só a entrada tenha saído do caixa.
// ─────────────────────────────────────────────────────────────────────────────


const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const nomeMes = (k: string) => {
  if (k === "TODOS") return "Todas as atividades";
  const [mm, yyyy] = k.split("/");
  return `${MESES[Number(mm) - 1]} ${yyyy}`;
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const moedaExata = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

interface Resumo {
  mes: string; aliquota: number;
  receitaBruta: number; impostos: number; receitaLiquida: number;
  custoComprometido: number; custoPago: number; custoAPagar: number;
  resultadoProjetado: number; resultadoRealizado: number;
  margemProjetada: number; margemRealizada: number; desvio: number;
  faturado: number; recebido: number; aReceber: number;
  atividades: any[];
  contagem: { total: number; semValorComercial: number; semContratacao: number };
  mesesDisponiveis: string[];
}

export default function DashboardFinanceiro() {
  const [mes, setMes] = useState("TODOS");
  const [dados, setDados] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/controladoria?mes=${encodeURIComponent(mes)}`);
      if (!r.ok) throw new Error((await r.json()).error || "Erro ao apurar");
      setDados(await r.json());
    } catch (e: any) { setErro(e.message); } finally { setCarregando(false); }
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando && !dados) return <div style={{ padding: 40, color: T.txMut }}>Apurando...</div>;
  if (erro) return <div style={{ padding: 24, color: T.red }}>{erro}</div>;
  if (!dados) return null;

  const semCusto = dados.contagem.semContratacao === dados.contagem.total && dados.contagem.total > 0;

  return (
    <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: T.txPri, margin: 0 }}>Dashboard Financeiro</h1>
          <p style={{ fontSize: 12, color: T.txMut, margin: "5px 0 0" }}>
            Controladoria por atividade, com impostos a {pct(dados.aliquota * 100)} (cadastro da empresa)
          </p>
        </div>
        <select value={mes} onChange={e => setMes(e.target.value)} aria-label="Período"
          style={{ padding: "8px 12px", fontSize: 12, border: `1px solid ${T.brBase}`, borderRadius: 8, background: T.bg3, color: T.txPri, minWidth: 200 }}>
          <option value="TODOS">Todas as atividades</option>
          {dados.mesesDisponiveis.map(m => <option key={m} value={m}>{nomeMes(m)}</option>)}
        </select>
      </div>

      {dados.contagem.total === 0 && (
        <Aviso cor={T.txMut}>Nenhuma atividade em {nomeMes(mes)}.</Aviso>
      )}

      {semCusto && (
        <Aviso cor={T.amber}>
          <strong>Custo ainda não cadastrado.</strong> Nenhuma das {dados.contagem.total} atividade(s) tem
          contratação de fornecedor registrada, então o custo é zero de verdade, não estimativa.
          A margem abaixo é o teto: ela cai conforme você contratar fornecedores na aba
          <em> Planejamento</em> da atividade.
        </Aviso>
      )}
      {dados.contagem.semValorComercial > 0 && (
        <Aviso cor={T.txMut}>
          {dados.contagem.semValorComercial} de {dados.contagem.total} atividade(s) sem valor comercial —
          não entram na receita até o orçamento ser aprovado.
        </Aviso>
      )}

      {/* Cadeia da seção 14 */}
      <div style={{ background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, padding: "16px 18px" }}>
        <h2 style={{ fontSize: 12, fontWeight: 600, color: T.txMut, margin: "0 0 14px" }}>Da receita bruta à margem</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
          <Etapa tom="green" rotulo="Receita bruta" valor={dados.receitaBruta} />
          <Sinal>−</Sinal>
          <Etapa tom="slate" rotulo="Impostos" valor={dados.impostos} />
          <Sinal>=</Sinal>
          <Etapa tom="cyan" rotulo="Receita líquida" valor={dados.receitaLiquida} />
          <Sinal>−</Sinal>
          <Etapa tom="orange" rotulo="Custo comprometido" valor={dados.custoComprometido} />
          <Sinal>=</Sinal>
          <Etapa tom="indigo" rotulo="Resultado" valor={dados.resultadoProjetado} alerta={dados.resultadoProjetado < 0 ? T.red : undefined} destaque />
        </div>
      </div>

      {/* Custo e caixa */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Kpi tom="orange" rotulo="Custo comprometido" valor={dados.custoComprometido ? moeda(dados.custoComprometido) : null} nota="contratado, pago ou não" />
        <Kpi tom="green" rotulo="Custo pago" valor={dados.custoPago ? moeda(dados.custoPago) : null} nota="já saiu do caixa" />
        <Kpi tom="amber" rotulo="Custo a pagar" valor={dados.custoAPagar ? moeda(dados.custoAPagar) : null} nota="comprometido − pago" />
        <Kpi tom="violet" rotulo="Margem projetada" valor={dados.margemProjetada ? pct(dados.margemProjetada) : null} alerta={dados.margemProjetada < 0 ? T.red : undefined} nota="sobre receita bruta" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Kpi tom="cyan" rotulo="Faturado" valor={dados.faturado ? moeda(dados.faturado) : null} nota="linhas de PO faturadas" />
        <Kpi tom="green" rotulo="Recebido" valor={dados.recebido ? moeda(dados.recebido) : null} nota="baixa financeira" />
        <Kpi tom="blue" rotulo="A receber" valor={dados.aReceber ? moeda(dados.aReceber) : null} nota="faturado − recebido" />
        <Kpi tom="indigo" rotulo="Atividades" valor={dados.contagem.total ? String(dados.contagem.total) : null} nota={nomeMes(dados.mes)} />
      </div>

      {/* Por atividade */}
      <div style={{ background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.brBase}`, fontSize: 13, fontWeight: 700, color: T.txPri }}>
          Resultado por atividade
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ background: T.bg3, color: T.txMut }}>
              <tr style={{ textAlign: "left" }}>
                <th style={th(112)}>Código</th>
                <th style={th()}>Atividade</th>
                <th style={th(96)}>Sharing</th>
                <th style={th(126)}>Operacional</th>
                <th style={th(126)}>Faturamento</th>
                <th style={{ ...th(112), textAlign: "right" }}>Receita</th>
                <th style={{ ...th(112), textAlign: "right" }}>Comprometido</th>
                <th style={{ ...th(100), textAlign: "right" }}>Pago</th>
                <th style={{ ...th(126), textAlign: "right" }}>Margem</th>
              </tr>
            </thead>
            <tbody>
              {dados.atividades.map(a => {
                const op = STATUS_OPERACIONAL[a.status_operacional];
                const fat = STATUS_FATURAMENTO[a.status_faturamento];
                return (
                  <tr key={a.id} style={{ borderTop: `1px solid ${T.brSub}` }}>
                    <td className="font-id" style={{ ...td(), fontWeight: 600, color: T.txSec }}>{a.codigo}</td>
                    <td style={{ ...td(), color: T.txPri }}>{a.titulo}</td>
                    <td style={{ ...td(), color: a.sharing ? hexTom(tomDe(TOM_SHARING, a.sharing)) : T.txMut, fontWeight: 600 }}>{a.sharing || "—"}</td>
                    <td style={td()}><Pill info={op} bruto={a.status_operacional} cor={hexTom(tomDe(TOM_STATUS, a.status_operacional))} /></td>
                    <td style={td()}><Pill info={fat} bruto={a.status_faturamento} /></td>
                    <td style={{ ...td(), textAlign: "right", color: a.receita > 0 ? T.txPri : T.txMut, fontWeight: 700 }}>
                      {a.receita > 0 ? moedaExata(a.receita) : "—"}
                    </td>
                    <td style={{ ...td(), textAlign: "right", color: a.comprometido > 0 ? T.txPri : T.txMut }}>
                      {a.comprometido > 0 ? moedaExata(a.comprometido) : "—"}
                    </td>
                    <td style={{ ...td(), textAlign: "right", color: a.pago > 0 ? T.txPri : T.txMut }}>
                      {a.pago > 0 ? moedaExata(a.pago) : "—"}
                    </td>
                    <td style={{ ...td(), textAlign: "right" }}>
                      {a.receita > 0
                        ? <span style={{ color: a.margem >= 0 ? T.txPri : T.red, fontWeight: 700 }}>
                          {moedaExata(a.margem)}
                          <span style={{ color: T.txMut, fontWeight: 500, marginLeft: 6, fontSize: 11 }}>{pct(a.margemPercentual ?? 0)}</span>
                        </span>
                        : <span style={{ color: T.txMut }}>—</span>}
                    </td>
                  </tr>
                );
              })}
              {dados.atividades.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 30, textAlign: "center", color: T.txMut }}>Nenhuma atividade no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11, color: T.txDis, lineHeight: 1.6 }}>
        Receita = valor de contrato da atividade (ou o orçado, quando ainda não há contrato).
        Comprometido = soma das contratações de fornecedor, independente de pagamento.
        Pago = parcelas com status pago, comprovante recebido ou conferido.
      </div>
    </div>
  );
}

const th = (w?: number): React.CSSProperties =>
  ({ padding: "9px 10px", fontWeight: 600, fontSize: 12, ...(w ? { width: w } : {}) });
const td = (): React.CSSProperties => ({ padding: "8px 10px", verticalAlign: "middle" });

function Pill({ info, bruto, cor: corTom }: { info?: { label: string; color: string }; bruto: string; cor?: string }) {
  const cor = corTom || info?.color || T.txMut;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: `${cor}1a`, color: cor, whiteSpace: "nowrap" }}>
      {info?.label || bruto}
    </span>
  );
}

// Valor neutro; só o resultado negativo ganha cor. Zero aparece como "—".
// O rótulo leva um ponto na cor da etapa, para casar com os KPIs abaixo.
function Etapa({ rotulo, valor, alerta, destaque, tom = "slate" }: { rotulo: string; valor: number; alerta?: string; destaque?: boolean; tom?: Tom }) {
  return (
    <div style={{ minWidth: 150, padding: "2px 4px" }}>
      <div style={{ fontSize: 12, color: T.txMut, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: hexTom(tom), flexShrink: 0 }} />
        {rotulo}
      </div>
      <div style={{ fontSize: destaque ? 24 : 18, fontWeight: 700, color: !valor ? T.txMut : alerta || T.txPri, marginTop: 3 }}>{valor ? moeda(valor) : "—"}</div>
    </div>
  );
}

function Sinal({ children }: { children: React.ReactNode }) {
  return <div style={{ color: T.txDis, fontSize: 15, padding: "18px 12px 0", fontWeight: 700 }}>{children}</div>;
}

function Kpi({ rotulo, valor, alerta, nota, tom = "slate" }: { rotulo: string; valor: string | null; alerta?: string; nota?: string; tom?: Tom }) {
  const cor = hexTom(tom);
  return (
    <div style={{ background: T.bg2, border: `1px solid ${alerta ? alerta + "66" : T.brBase}`, borderTop: `2px solid ${alerta || cor}`, borderRadius: 10, padding: "11px 15px" }}>
      <div style={{ fontSize: 12, color: T.txMut, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: cor, flexShrink: 0 }} />
        {rotulo}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: valor == null ? T.txMut : alerta || T.txPri, marginTop: 4 }}>{valor ?? "—"}</div>
      {nota && <div style={{ fontSize: 11, color: T.txDis, marginTop: 3 }}>{nota}</div>}
    </div>
  );
}

function Aviso({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <div style={{ background: cor + "12", border: `1px solid ${cor}55`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: T.txSec, lineHeight: 1.55 }}>
      {children}
    </div>
  );
}
