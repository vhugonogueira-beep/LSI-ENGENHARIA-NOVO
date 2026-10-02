import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { STATUS_OPERACIONAL, StatusPill } from './constants';
import { T } from '../../theme';
import { SOLIDO, VEU, TOM_STATUS, tomDe } from '../../lib/cores';

/**
 * Controle manual do status operacional da atividade.
 *
 * Existia só a pílula, de leitura. As automações alcançam apenas EM_EXECUCAO e
 * CONCLUIDA — `Aguardando liberação` e `On hold` não deixam rastro nenhum no
 * sistema que uma regra consiga inferir, então dependem de alguém dizer. Sem
 * este controle esses dois estados eram inalcançáveis pela interface.
 *
 * A observação vai para `AtividadeStatusHistorico` (campo `observacao_status`
 * no PUT). É o único lugar onde fica registrado *por que* a obra parou.
 */
export default function StatusOperacionalControl({
    atividadeId, status, onSaved,
}: { atividadeId: string; status: string; onSaved: () => void }) {
    const [aberto, setAberto] = useState(false);
    const [escolhido, setEscolhido] = useState<string | null>(null);
    const [observacao, setObservacao] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const caixa = useRef<HTMLDivElement>(null);

    // Fecha ao clicar fora — o painel cobre conteúdo da tela.
    useEffect(() => {
        if (!aberto) return;
        const fora = (e: MouseEvent) => {
            if (caixa.current && !caixa.current.contains(e.target as Node)) fechar();
        };
        document.addEventListener('mousedown', fora);
        return () => document.removeEventListener('mousedown', fora);
    }, [aberto]);

    function fechar() {
        setAberto(false);
        setEscolhido(null);
        setObservacao('');
        setErro('');
    }

    async function salvar() {
        if (!escolhido) return;
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch(`/api/atividades/${atividadeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status_operacional: escolhido,
                    observacao_status: observacao.trim() || null,
                }),
            });
            if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                setErro(j.error || 'Não foi possível alterar o status.');
                return;
            }
            fechar();
            onSaved();
        } catch {
            setErro('Falha de conexão.');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="relative" ref={caixa}>
            <button
                type="button"
                onClick={() => (aberto ? fechar() : setAberto(true))}
                className="inline-flex items-center gap-1 rounded-full transition-opacity hover:opacity-80"
                title="Alterar status operacional"
                aria-label="Alterar status operacional"
                aria-expanded={aberto}
            >
                <StatusPill status={status} map={STATUS_OPERACIONAL} />
                <ChevronDown size={14} style={{ color: T.txMut }} aria-hidden />
            </button>

            {aberto && (
                <div
                    className="absolute right-0 z-30 mt-2 w-72 rounded-xl p-2 shadow-lg"
                    style={{ background: T.bg2, border: `1px solid ${T.brBase}` }}
                >
                    <div className="px-2 py-1.5 text-xs font-semibold" style={{ color: T.txMut }}>
                        Status operacional
                    </div>

                    {Object.entries(STATUS_OPERACIONAL).map(([id, info]) => {
                        const atual = id === status;
                        const marcado = id === escolhido;
                        return (
                            <button
                                key={id}
                                type="button"
                                disabled={atual}
                                onClick={() => setEscolhido(id)}
                                aria-pressed={marcado}
                                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors disabled:cursor-default ${marcado ? VEU[tomDe(TOM_STATUS, id)] : ''}`}
                                style={{ color: atual ? T.txDis : T.txPri }}
                            >
                                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${SOLIDO[tomDe(TOM_STATUS, id)]}`} aria-hidden />
                                <span className="flex-1">{info.label}</span>
                                {atual && <span className="text-[11px]" style={{ color: T.txDis }}>atual</span>}
                            </button>
                        );
                    })}

                    {escolhido && (
                        <div className="mt-2 border-t px-2 pt-2" style={{ borderColor: T.brSub }}>
                            <textarea
                                value={observacao}
                                onChange={e => setObservacao(e.target.value)}
                                rows={2}
                                placeholder="Motivo (opcional) — fica no histórico"
                                aria-label="Motivo da mudança de status"
                                className="w-full resize-none rounded-lg px-2 py-1.5 text-sm outline-none"
                                style={{ background: T.bg1, border: `1px solid ${T.brBase}`, color: T.txPri }}
                            />
                            {erro && <div className="mt-1 text-xs" style={{ color: T.red }}>{erro}</div>}
                            <div className="mt-2 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={fechar}
                                    className="rounded-lg px-3 py-1.5 text-sm"
                                    style={{ color: T.txSec }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={salvar}
                                    disabled={salvando}
                                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                                    style={{ background: T.blue }}
                                >
                                    {salvando ? 'Salvando...' : 'Registrar'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
