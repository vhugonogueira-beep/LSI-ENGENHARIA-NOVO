import React, { useState, useEffect, useCallback } from "react";
import { STATUS_OPERACIONAL, STATUS_FATURAMENTO } from "../components/atividades/constants";
// Paleta unica do sistema (src/frontend/theme.ts), com tema claro e escuro.
import { T } from '../theme';

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
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.txPri, margin: 0 }}>Dashboard Financeiro</h1>
          <p style={{ fontSize: 12, color: T.txMut, margin: "5px 0 0" }}>
            Controladoria por atividade · impostos a {pct(dados.aliquota * 100)} (cadastro da empresa)
          </p>
        </div>
        <select value={mes} onChange={e => setMes(e.target.value)}
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
          contratação de fornecedor registrada, então o custo é zero de verdade — não é estimativa.
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
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.09em", color: T.txDis, marginBottom: 14 }}>DA RECEITA BRUTA À MARGEM</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
          <Etapa rotulo="Receita bruta" valor={dados.receitaBruta} cor={T.blue} />
          <Sinal>−</Sinal>
          <Etapa rotulo="Impostos" valor={dados.impostos} cor={T.txMut} />
          <Sinal>=</Sinal>
          <Etapa rotulo="Receita líquida" valor={dados.receitaLiquida} cor={T.cyan} />
          <Sinal>−</Sinal>
          <Etapa rotulo="Custo comprometido" valor={dados.custoComprometido} cor={T.amber} />
          <Sinal>=</Sinal>
          <Etapa rotulo="Resultado" valor={dados.resultadoProjetado} cor={dados.resultadoProjetado >= 0 ? T.green : T.red} destaque />
        </div>
      </div>

      {/* Custo e caixa */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Kpi rotulo="Custo comprometido" valor={moeda(dados.custoComprometido)} cor={T.amber} nota="contratado, pago ou não" />
        <Kpi rotulo="Custo pago" valor={moeda(dados.custoPago)} cor={T.green} nota="já saiu do caixa" />
        <Kpi rotulo="Custo a pagar" valor={moeda(dados.custoAPagar)} cor={T.red} nota="comprometido − pago" />
        <Kpi rotulo="Margem projetada" valor={pct(dados.margemProjetada)} cor={dados.margemProjetada >= 0 ? T.green : T.red} nota="sobre receita bruta" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Kpi rotulo="Faturado" valor={moeda(dados.faturado)} cor={T.purple} nota="linhas de PO faturadas" />
        <Kpi rotulo="Recebido" valor={moeda(dados.recebido)} cor={T.green} nota="baixa financeira" />
        <Kpi rotulo="A receber" valor={moeda(dados.aReceber)} cor={T.cyan} nota="faturado − recebido" />
        <Kpi rotulo="Atividades" valor={String(dados.contagem.total)} cor={T.blue} nota={nomeMes(dados.mes)} />
      </div>

      {/* Por atividade */}
      <div style={{ background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.brBase}`, fontSize: 13, fontWeight: 700, color: T.txPri }}>
          Resultado por atividade
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead style={{ background: T.bg3, color: T.txMut }}>
              <tr style={{ textAlign: "left" }}>
                <th style={th(112)}>CÓDIGO</th>
                <th style={th()}>ATIVIDADE</th>
                <th style={th(96)}>SHARING</th>
                <th style={th(126)}>OPERACIONAL</th>
                <th style={th(126)}>FATURAMENTO</th>
                <th style={{ ...th(112), textAlign: "right" }}>RECEITA</th>
                <th style={{ ...th(112), textAlign: "right" }}>COMPROMETIDO</th>
                <th style={{ ...th(100), textAlign: "right" }}>PAGO</th>
                <th style={{ ...th(126), textAlign: "right" }}>MARGEM</th>
              </tr>
            </thead>
            <tbody>
              {dados.atividades.map(a => {
                const op = STATUS_OPERACIONAL[a.status_operacional];
                const fat = STATUS_FATURAMENTO[a.status_faturamento];
                return (
                  <tr key={a.id} style={{ borderTop: `1px solid ${T.brSub}` }}>
                    <td style={{ ...td(), fontFamily: "monospace", fontWeight: 700, color: T.txSec }}>{a.codigo}</td>
                    <td style={{ ...td(), color: T.txPri }}>{a.titulo}</td>
                    <td style={{ ...td(), color: T.txMut }}>{a.sharing}</td>
                    <td style={td()}><Pill info={op} bruto={a.status_operacional} /></td>
                    <td style={td()}><Pill info={fat} bruto={a.status_faturamento} /></td>
                    <td style={{ ...td(), textAlign: "right", color: a.receita > 0 ? T.txPri : T.txDis, fontWeight: 700 }}>
                      {a.receita > 0 ? moedaExata(a.receita) : "—"}
                    </td>
                    <td style={{ ...td(), textAlign: "right", color: a.comprometido > 0 ? T.amber : T.txDis }}>
                      {a.comprometido > 0 ? moedaExata(a.comprometido) : "—"}
                    </td>
                    <td style={{ ...td(), textAlign: "right", color: a.pago > 0 ? T.green : T.txDis }}>
                      {a.pago > 0 ? moedaExata(a.pago) : "—"}
                    </td>
                    <td style={{ ...td(), textAlign: "right" }}>
                      {a.receita > 0
                        ? <span style={{ color: a.margem >= 0 ? T.green : T.red, fontWeight: 700 }}>
                          {moedaExata(a.margem)}
                          <span style={{ color: T.txMut, fontWeight: 500, marginLeft: 6, fontSize: 10 }}>{pct(a.margemPercentual ?? 0)}</span>
                        </span>
                        : <span style={{ color: T.txDis }}>—</span>}
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

      <div style={{ fontSize: 10.5, color: T.txDis, lineHeight: 1.6 }}>
        Receita = valor de contrato da atividade (ou o orçado, quando ainda não há contrato).
        Comprometido = soma das contratações de fornecedor, independente de pagamento.
        Pago = parcelas com status pago, comprovante recebido ou conferido.
      </div>
    </div>
  );
}

const th = (w?: number): React.CSSProperties =>
  ({ padding: "9px 10px", fontWeight: 700, fontSize: 9.5, letterSpacing: "0.05em", ...(w ? { width: w } : {}) });
const td = (): React.CSSProperties => ({ padding: "8px 10px", verticalAlign: "middle" });

function Pill({ info, bruto }: { info?: { label: string; color: string }; bruto: string }) {
  const cor = info?.color || T.txMut;
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${cor}1a`, color: cor, whiteSpace: "nowrap" }}>
      {info?.label || bruto}
    </span>
  );
}

function Etapa({ rotulo, valor, cor, destaque }: { rotulo: string; valor: number; cor: string; destaque?: boolean }) {
  return (
    <div style={{ minWidth: 150, padding: "2px 4px" }}>
      <div style={{ fontSize: 9.5, color: T.txMut, fontWeight: 700, letterSpacing: "0.05em" }}>{rotulo.toUpperCase()}</div>
      <div style={{ fontSize: destaque ? 21 : 17, fontWeight: destaque ? 900 : 800, color: cor, marginTop: 3 }}>{moeda(valor)}</div>
    </div>
  );
}

function Sinal({ children }: { children: React.ReactNode }) {
  return <div style={{ color: T.txDis, fontSize: 16, padding: "18px 12px 0", fontWeight: 700 }}>{children}</div>;
}

function Kpi({ rotulo, valor, cor, nota }: { rotulo: string; valor: string; cor: string; nota?: string }) {
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.brBase}`, borderTop: `3px solid ${cor}`, borderRadius: 10, padding: "11px 15px" }}>
      <div style={{ fontSize: 9.5, color: T.txMut, fontWeight: 700, letterSpacing: "0.06em" }}>{rotulo.toUpperCase()}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color: cor, marginTop: 4 }}>{valor}</div>
      {nota && <div style={{ fontSize: 10, color: T.txDis, marginTop: 3 }}>{nota}</div>}
    </div>
  );
}

function Aviso({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <div style={{ background: cor + "12", border: `1px solid ${cor}55`, borderRadius: 10, padding: "10px 14px", fontSize: 11.5, color: T.txSec, lineHeight: 1.55 }}>
      {children}
    </div>
  );
}
