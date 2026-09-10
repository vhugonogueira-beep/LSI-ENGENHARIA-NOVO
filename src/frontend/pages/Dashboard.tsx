import { useState, useEffect, useCallback } from 'react';
// Mesmos rótulos das telas de Atividades — evita a Visão Geral chamar o mesmo
// status por outro nome.
import { STATUS_OPERACIONAL } from '../components/atividades/constants';

const T = {
  bg0: '#07090f', bg1: '#0e1117', bg2: '#13181f', bg3: '#1a2030',
  brSub: '#1e2840', brBase: '#2d3a52',
  txPri: '#f0f4fa', txSec: '#b4c5d8', txMut: '#7c94b0', txDis: '#506480',
  blue: '#3b82f6', green: '#34d399', amber: '#fbbf24', red: '#f87171',
  purple: '#a78bfa', indigo: '#6366f1', cyan: '#67e8f9',
};

function fmtMoeda(v?: number | null) {
  if (v == null || v === 0) return 'R$ 0';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function fmtData(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const STATUS_ORCAMENTO: Record<string, { label: string; color: string }> = {
  RASCUNHO:  { label: 'Rascunho',  color: T.txMut  },
  ENVIADO:   { label: 'Enviado',   color: T.blue   },
  APROVADO:  { label: 'Aprovado',  color: T.green  },
  REPROVADO: { label: 'Reprovado', color: T.red    },
  REVISAO:   { label: 'Revisão',   color: T.amber  },
};

interface DashboardProps {
  onNavigateTo?: (tab: string) => void;
}

export function Dashboard({ onNavigateTo }: DashboardProps) {
  const [budgets, setBudgets] = useState<any[]>([]);
  // Atividade é a entidade central do Blueprint; Demanda é o modelo antigo, que
  // esta tela lia até set/2026 — por isso mostrava números de outro cadastro.
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orfaos, setOrfaos] = useState(0);

  const load = useCallback(async () => {
    try {
      const [bResp, dResp] = await Promise.all([
        fetch('/api/budgets'),
        fetch('/api/atividades/stats'),
      ]);
      if (bResp.ok) {
        const todos = await bResp.json();
        // Orçamento agora nasce dentro da Atividade. Os soltos sao resquicio do
        // fluxo antigo e inflavam os indicadores com obra que nao existe.
        setBudgets(Array.isArray(todos) ? todos.filter((b: any) => b.atividade_id) : []);
        setOrfaos(Array.isArray(todos) ? todos.filter((b: any) => !b.atividade_id).length : 0);
      }
      if (dResp.ok) setStats(await dResp.json());
    } catch {
      // backend offline — mostra zeros
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── KPIs de orçamentos
  const totalOrc      = budgets.length;
  const rascunhos     = budgets.filter(b => b.status === 'RASCUNHO').length;
  const enviados      = budgets.filter(b => b.status === 'ENVIADO').length;
  const aprovados     = budgets.filter(b => b.status === 'APROVADO').length;
  const receitaAprov  = budgets.filter(b => b.status === 'APROVADO').reduce((s: number, b: any) => s + (b.valor_total ?? 0), 0);

  // ── KPIs de atividades
  const porOperacional = (stats?.porOperacional ?? []) as { status_operacional: string; _count: number }[];
  const porSharing = (stats?.porSharing ?? []) as { sharing: string; _count: number }[];
  const totalAtividades = stats?.totais?._count ?? 0;
  const emExecucao = porOperacional.find(s => s.status_operacional === 'EM_EXECUCAO')?._count ?? 0;
  const receitaAtividades = stats?.totais?._sum?.valor_contrato ?? 0;

  // ── Últimos orçamentos (5)
  const ultimosOrc = [...budgets]
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .slice(0, 5);



  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: T.bg0, color: T.txPri, fontFamily: "'Inter','DM Sans',system-ui,sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: 12, color: T.txMut, margin: '4px 0 0' }}>Visão geral — Orçamentos · Atividades · Receita</p>
      </div>

      {orfaos > 0 && (
        <div style={{
          marginBottom: 18, padding: '10px 14px', borderRadius: 10,
          background: `${T.amber}12`, border: `1px solid ${T.amber}55`, fontSize: 12, color: T.txSec,
        }}>
          <strong style={{ color: T.amber }}>{orfaos} orçamento(s) sem atividade</strong> — do fluxo antigo, quando
          o orçamento podia ser criado solto. Não entram nos indicadores acima.
        </div>
      )}

      {/* ── KPI Row — Orçamentos ── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.txDis, marginBottom: 10 }}>ORÇAMENTOS DAS ATIVIDADES</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[
            { label: 'Total',     value: totalOrc,            color: T.blue,   icon: '◈' },
            { label: 'Rascunhos', value: rascunhos,           color: T.txMut,  icon: '✎' },
            { label: 'Enviados',  value: enviados,            color: T.cyan,   icon: '↗' },
            { label: 'Aprovados', value: aprovados,           color: T.green,  icon: '✓' },
            { label: 'Receita Aprovada', value: fmtMoeda(receitaAprov), color: T.amber, icon: '$', small: true },
          ].map(k => (
            <KpiCard key={k.label} {...k} loading={loading} />
          ))}
        </div>
      </div>

      {/* ── KPI Row — Demandas ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.txDis, marginBottom: 10, marginTop: 20 }}>ATIVIDADES</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total Atividades', value: totalAtividades,              color: T.indigo, icon: '◈' },
            { label: 'Em Execução',      value: emExecucao,                   color: T.blue,   icon: '▶' },
            { label: 'Valor Contratado', value: fmtMoeda(receitaAtividades),  color: T.green,  icon: '$', small: true },
            { label: 'Sharing em +',     value: topSharing(porSharing),       color: T.purple, icon: '★', small: true },
          ].map(k => (
            <KpiCard key={k.label} {...k} loading={loading} />
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ── Últimos Orçamentos ── */}
        <div style={{ background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.brBase}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.txPri }}>Últimos Orçamentos</span>
            {onNavigateTo && (
              <button onClick={() => onNavigateTo('historico')} style={linkBtnStyle}>
                Ver todos →
              </button>
            )}
          </div>
          {loading ? (
            <div style={{ padding: '28px 18px', color: T.txMut, fontSize: 13, textAlign: 'center' }}>Carregando...</div>
          ) : ultimosOrc.length === 0 ? (
            <div style={{ padding: '28px 18px', color: T.txMut, fontSize: 13, textAlign: 'center' }}>
              Nenhum orçamento criado ainda.
              {onNavigateTo && (
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => onNavigateTo('orcv2')} style={{ ...linkBtnStyle, fontSize: 13 }}>
                    + Criar primeiro orçamento
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              {ultimosOrc.map((b, i) => {
                const st = STATUS_ORCAMENTO[b.status] ?? { label: b.status, color: T.txMut };
                return (
                  <div key={b.id} style={{
                    padding: '11px 18px',
                    borderBottom: i < ultimosOrc.length - 1 ? `1px solid ${T.brSub}` : 'none',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.txPri, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {b.assunto || b.contratante?.nome || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: T.txMut, marginTop: 2 }}>
                        {b.site?.id_site ?? '—'} · {fmtData(b.created_at)}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                      background: `${st.color}18`, color: st.color, flexShrink: 0,
                    }}>
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Pipeline de Demandas ── */}
        <div style={{ background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.brBase}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.txPri }}>Pipeline de Atividades</span>
            {onNavigateTo && (
              <button onClick={() => onNavigateTo('atividades')} style={linkBtnStyle}>
                Abrir →
              </button>
            )}
          </div>
          {loading ? (
            <div style={{ padding: '28px 18px', color: T.txMut, fontSize: 13, textAlign: 'center' }}>Carregando...</div>
          ) : porOperacional.length === 0 ? (
            <div style={{ padding: '28px 18px', color: T.txMut, fontSize: 13, textAlign: 'center' }}>
              Nenhuma atividade cadastrada.
              {onNavigateTo && (
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => onNavigateTo('atividades')} style={{ ...linkBtnStyle, fontSize: 13 }}>
                    + Criar primeira atividade
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(STATUS_OPERACIONAL).map(([key, info]) => {
                const item = porOperacional.find(s => s.status_operacional === key);
                const count = item?._count ?? 0;
                const maxCount = Math.max(...porOperacional.map(s => s._count), 1);
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 80, fontSize: 11, color: info.color, fontWeight: 600, flexShrink: 0 }}>{info.label}</div>
                    <div style={{ flex: 1, background: T.bg3, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: info.color, borderRadius: 4, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ width: 24, textAlign: 'right', fontSize: 12, fontWeight: 700, color: count > 0 ? info.color : T.txDis }}>{count}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── Por Sharing ── */}
      {!loading && porSharing.length > 0 && (
        <div style={{ marginTop: 20, background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri, marginBottom: 14 }}>Atividades por Sharing</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {porSharing.map(s => (
              <div key={s.sharing} style={{
                background: T.bg3, border: `1px solid ${T.brBase}`, borderRadius: 10,
                padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: sharingColor(s.sharing), fontFamily: 'JetBrains Mono, monospace' }}>{s._count}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: sharingColor(s.sharing) }}>{s.sharing}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function KpiCard({ label, value, color, icon, loading, small }: { label: string; value: any; color: string; icon: string; loading?: boolean; small?: boolean }) {
  return (
    <div style={{
      background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        background: `${color}18`, border: `1px solid ${color}28`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, color,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 10, color: T.txDis, fontWeight: 600, letterSpacing: '0.04em' }}>{label.toUpperCase()}</div>
        <div style={{
          fontSize: small ? 15 : 26, fontWeight: 800, color: T.txPri,
          fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.1, marginTop: 2,
        }}>
          {loading ? '…' : value}
        </div>
      </div>
    </div>
  );
}

function topSharing(porSharing: { sharing: string; _count: number }[]) {
  if (!porSharing?.length) return '—';
  const top = [...porSharing].sort((a, b) => b._count - a._count)[0];
  return top ? `${top.sharing} (${top._count})` : '—';
}

function sharingColor(s: string) {
  if (s === 'HIGHLINE') return '#ef4444';
  if (s === 'IHS')      return '#f59e0b';
  if (s === 'WINITY')   return '#8b5cf6';
  if (s === 'SBA')      return '#06b6d4';
  return T.txMut;
}

const linkBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: T.blue, fontSize: 11, fontWeight: 600, padding: 0,
};
