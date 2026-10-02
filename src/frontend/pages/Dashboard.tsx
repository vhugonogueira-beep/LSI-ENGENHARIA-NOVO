import { useState, useEffect, useCallback } from 'react';
import { Layers, PencilLine, Send, CheckCircle2, Banknote, Play, Trophy, Plus } from 'lucide-react';
// Mesmos rótulos das telas de Atividades — evita a Visão Geral chamar o mesmo
// status por outro nome.
import { STATUS_OPERACIONAL } from '../components/atividades/constants';
// Paleta unica do sistema (src/frontend/theme.ts), com tema claro e escuro.
import { T } from '../theme';


// Ausência não tem cor nem número: zero sai como "—" (docs/DESIGN-SYSTEM.md).
function fmtMoeda(v?: number | null) {
  if (v == null || v === 0) return null;
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
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: T.bg0, color: T.txPri }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: 12, color: T.txMut, margin: '4px 0 0' }}>Visão geral de orçamentos, atividades e receita</p>
      </div>

      {orfaos > 0 && (
        <div style={{
          marginBottom: 18, padding: '10px 14px', borderRadius: 10,
          background: `${T.amber}12`, border: `1px solid ${T.amber}55`, fontSize: 12, color: T.txSec,
        }}>
          <strong style={{ color: T.amber }}>{orfaos} orçamento(s) sem atividade</strong>, do fluxo antigo, quando
          o orçamento podia ser criado solto. Não entram nos indicadores abaixo.
        </div>
      )}

      {/* ── KPI Row — Orçamentos ── */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={secaoStyle}>Orçamentos das atividades</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[
            { label: 'Total',            value: totalOrc,               icon: <Layers size={16} aria-hidden /> },
            { label: 'Rascunhos',        value: rascunhos,              icon: <PencilLine size={16} aria-hidden /> },
            { label: 'Enviados',         value: enviados,               icon: <Send size={16} aria-hidden /> },
            { label: 'Aprovados',        value: aprovados,              icon: <CheckCircle2 size={16} aria-hidden /> },
            { label: 'Receita aprovada', value: fmtMoeda(receitaAprov), icon: <Banknote size={16} aria-hidden />, small: true },
          ].map(k => (
            <KpiCard key={k.label} {...k} loading={loading} />
          ))}
        </div>
      </div>

      {/* ── KPI Row — Atividades ── */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ ...secaoStyle, marginTop: 20 }}>Atividades</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total de atividades',          value: totalAtividades,             icon: <Layers size={16} aria-hidden /> },
            { label: 'Em execução',                  value: emExecucao,                  icon: <Play size={16} aria-hidden /> },
            { label: 'Valor contratado',             value: fmtMoeda(receitaAtividades), icon: <Banknote size={16} aria-hidden />, small: true },
            { label: 'Sharing com mais atividades',  value: topSharing(porSharing),      icon: <Trophy size={16} aria-hidden />, small: true },
          ].map(k => (
            <KpiCard key={k.label} {...k} loading={loading} />
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ── Últimos Orçamentos ── */}
        <div style={{ background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.brBase}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.txPri }}>Últimos orçamentos</span>
            {onNavigateTo && (
              <button onClick={() => onNavigateTo('historico')} style={linkBtnStyle}>
                Ver todos os orçamentos
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
                    <Plus size={14} aria-hidden /> Criar primeiro orçamento
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
                      <div style={{ fontSize: 11, color: T.txMut, marginTop: 2, display: 'flex', gap: 12 }}>
                        <span className="font-id">{b.site?.id_site ?? '—'}</span>
                        <span>{fmtData(b.created_at)}</span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
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

        {/* ── Pipeline de Atividades ── */}
        <div style={{ background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.brBase}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.txPri }}>Pipeline de atividades</span>
            {onNavigateTo && (
              <button onClick={() => onNavigateTo('atividades')} style={linkBtnStyle}>
                Abrir atividades
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
                    <Plus size={14} aria-hidden /> Criar primeira atividade
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
                    <div style={{ width: 80, fontSize: 11, color: count > 0 ? T.txSec : T.txMut, fontWeight: 600, flexShrink: 0 }}>{info.label}</div>
                    <div style={{ flex: 1, background: T.bg3, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: info.color, borderRadius: 4, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ width: 24, textAlign: 'right', fontSize: 12, fontWeight: 700, color: count > 0 ? T.txPri : T.txMut }}>{count > 0 ? count : '—'}</div>
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
          <div style={{ fontSize: 13, fontWeight: 700, color: T.txPri, marginBottom: 14 }}>Atividades por sharing</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {porSharing.map(s => (
              <div key={s.sharing} style={{
                background: T.bg3, border: `1px solid ${T.brBase}`, borderRadius: 10,
                padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: T.txPri }}>{s._count}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.txSec }}>{s.sharing}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function KpiCard({ label, value, icon, loading, small }: { label: string; value: any; icon: React.ReactNode; loading?: boolean; small?: boolean }) {
  // Zero, vazio e "sem dado" aparecem como "—" em texto apagado.
  const vazio = value == null || value === 0 || value === '—';
  return (
    <div style={{
      background: T.bg2, border: `1px solid ${T.brBase}`, borderRadius: 12,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ color: T.txMut, flexShrink: 0, display: 'flex' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: T.txMut, fontWeight: 600 }}>{label}</div>
        <div style={{
          fontSize: small ? 15 : 24, fontWeight: 700, color: vazio ? T.txMut : T.txPri,
          lineHeight: 1.1, marginTop: 2,
        }}>
          {loading ? '…' : vazio ? '—' : value}
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

const secaoStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: T.txMut, margin: '0 0 10px',
};

const linkBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: T.blue, fontSize: 12, fontWeight: 600, padding: 0,
  display: 'inline-flex', alignItems: 'center', gap: 4,
};
