import { useState, useEffect, useCallback, useRef } from 'react';
import { Paperclip, Trash2, Upload, CheckCircle2, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, PrimaryButton, GhostButton, ErrorBanner, EmptyState } from './ui';
import { fmtMoeda } from './constants';

// Blueprint LSI, seções 25-27 — dentro da Atividade esta aba só cuida da PO: recebe-se o
// PDF do vendor e o sistema lê número, valor, data, fornecedor e descrições do próprio
// documento. A decisão de liberar para faturamento e o percentual a faturar acontecem na
// tela de Faturamento (barra lateral), que cruza as POs anexadas com as atividades.
const PO_STATUS_TOM: Record<string, string> = { AGUARDANDO: 'bg-muted text-muted-foreground', RECEBIDA: 'bg-warn/15 text-warn', VALIDADA: 'bg-primary/15 text-primary', LIBERADA: 'bg-ok/15 text-ok' };
const PO_STATUS_LABEL: Record<string, string> = { AGUARDANDO: 'Aguardando', RECEBIDA: 'Recebida', VALIDADA: 'Validada', LIBERADA: 'Liberada' };

export default function TabFaturamento({ atividade, onRefresh }: { atividade: AtividadeDetalhe; onRefresh: () => void }) {
    const [pos, setPos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [avisoLeitura, setAvisoLeitura] = useState(false);
    const [relendo, setRelendo] = useState<string | null>(null);
    const [linhas, setLinhas] = useState<Record<string, any[]>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const poAlvoRef = useRef<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`/api/pos?atividade_id=${atividade.id}`);
            const lista = r.ok ? await r.json() : [];
            setPos(lista);
            // as linhas trazem o saldo e a autorização — a mesma visão da tela de Faturamento
            const mapa: Record<string, any[]> = {};
            await Promise.all(lista.map(async (po: any) => {
                const lr = await fetch(`/api/pos/${po.id}/linhas`);
                mapa[po.id] = lr.ok ? await lr.json() : [];
            }));
            setLinhas(mapa);
        } finally {
            setLoading(false);
        }
    }, [atividade.id]);

    // Autorizar a linha para faturamento pode ser feito aqui ou na tela de Faturamento.
    async function alternarAutorizacao(linha: any) {
        setErro('');
        const r = await fetch(`/api/pos/linhas/${linha.id}/autorizacao`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autorizado: !linha.autorizado }),
        });
        if (!r.ok) { setErro((await r.json()).error || 'Erro ao mudar a autorização'); return; }
        await load();
    }

    useEffect(() => { load(); }, [load]);

    function novaPO() {
        poAlvoRef.current = null;
        fileInputRef.current?.click();
    }
    function anexarEmPO(poId: string) {
        poAlvoRef.current = poId;
        fileInputRef.current?.click();
    }

    async function onArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        const poId = poAlvoRef.current;
        e.target.value = '';
        if (!file) return;
        setEnviando(true);
        setErro('');
        setAvisoLeitura(false);
        try {
            const formData = new FormData();
            formData.append('arquivo', file);
            let r: Response;
            if (poId) {
                r = await fetch(`/api/pos/${poId}/arquivos`, { method: 'POST', body: formData });
            } else {
                formData.append('atividade_id', atividade.id);
                r = await fetch('/api/pos/upload', { method: 'POST', body: formData });
            }
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao enviar o PDF da PO');
            await r.json();
            setAvisoLeitura(true);
            await load();
            onRefresh();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setEnviando(false);
        }
    }

    // Reprocessa o PDF já anexado (útil para POs anexadas antes de uma melhoria no leitor).
    async function relerPdf(poId: string) {
        setRelendo(poId);
        setErro('');
        try {
            const r = await fetch(`/api/pos/${poId}/reler`, { method: 'POST' });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao reler o PDF');
            await load();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setRelendo(null);
        }
    }

    async function excluirPO(po: any) {
        let usuario: any = null;
        try { usuario = JSON.parse(localStorage.getItem('ls_auth_user') || 'null'); } catch { usuario = null; }
        if (usuario?.role && usuario.role !== 'ADMIN') {
            setErro('Apenas administradores podem excluir uma PO.');
            return;
        }
        const nome = po.numero ? `a PO ${po.numero}` : 'esta PO';
        if (!confirm(`Excluir ${nome}? O PDF anexado e as linhas lidas também são removidos.`)) return;
        setErro('');
        const r = await fetch(`/api/pos/${po.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autor: usuario ? { nome: usuario.nome, email: usuario.email, role: usuario.role } : undefined }),
        });
        if (!r.ok) {
            setErro((await r.json()).error || 'Erro ao excluir a PO');
            return;
        }
        await load();
        onRefresh();
    }

    async function removerArquivo(arquivoId: string) {
        if (!confirm('Remover este anexo?')) return;
        await fetch(`/api/pos/arquivos/${arquivoId}`, { method: 'DELETE' });
        await load();
    }

    async function atualizarCampo(poId: string, campo: string, valor: any) {
        setErro('');
        const r = await fetch(`/api/pos/${poId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [campo]: valor }),
        });
        if (!r.ok) setErro((await r.json()).error || 'Erro ao atualizar a PO');
        await load();
    }

    if (loading) return <div className="text-center py-10 text-muted-foreground text-sm">Carregando...</div>;

    return (
        <div>
            <ErrorBanner message={erro} />
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff" className="hidden" onChange={onArquivoSelecionado} />

            <Card
                title="Pedido de compra (PO)"
                action={<PrimaryButton onClick={novaPO} disabled={enviando}><Upload size={14} className="inline mr-1" aria-hidden />{enviando ? 'Lendo PDF...' : 'Anexar PDF da PO'}</PrimaryButton>}
            >
                <p className="text-xs text-muted-foreground mb-4">
                    Anexe o PDF da PO recebida do vendor — número, valor, data e descrições são lidos do próprio documento.
                    A liberação para faturamento e o percentual a faturar são definidos na tela de <strong>Faturamento</strong>.
                </p>

                {avisoLeitura && (
                    <div className="mb-4 p-2.5 rounded-lg border border-primary/40 bg-primary/10 text-xs flex items-center gap-1.5 font-semibold text-primary">
                        <CheckCircle2 size={14} aria-hidden /> PDF lido — confira os dados no cartão da PO abaixo.
                    </div>
                )}

                {pos.length === 0 ? (
                    <EmptyState text="Nenhuma PO anexada. Use Anexar PDF da PO para começar." />
                ) : (
                    <div className="flex flex-col gap-2">
                        {pos.map(po => (
                            <div key={po.id} className="bg-secondary/40 border border-border rounded-lg px-3 py-2.5">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    {/* a key força o remount dos campos quando a releitura do PDF muda os valores */}
                                    <div className="flex items-center gap-3" key={`${po.numero}|${po.valor}|${po.data}`}>
                                        <input
                                            defaultValue={po.numero || ''}
                                            onBlur={e => e.target.value !== (po.numero || '') && atualizarCampo(po.id, 'numero', e.target.value || null)}
                                            placeholder="Número da PO"
                                            aria-label="Número da PO"
                                            className="font-id bg-transparent border-b border-border/60 focus:border-primary text-sm font-medium w-36 py-0.5"
                                        />
                                        <input
                                            type="number" step="0.01"
                                            defaultValue={po.valor ?? ''}
                                            onBlur={e => parseFloat(e.target.value) !== po.valor && atualizarCampo(po.id, 'valor', e.target.value ? parseFloat(e.target.value) : null)}
                                            placeholder="Valor"
                                            aria-label="Valor da PO"
                                            className="bg-transparent border-b border-border/60 focus:border-primary text-sm w-32 py-0.5"
                                        />
                                        <input
                                            type="date"
                                            defaultValue={po.data ? po.data.substring(0, 10) : ''}
                                            onBlur={e => atualizarCampo(po.id, 'data', e.target.value || null)}
                                            aria-label="Data da PO"
                                            className="bg-transparent border-b border-border/60 focus:border-primary text-xs py-0.5 text-muted-foreground"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PO_STATUS_TOM[po.status] || PO_STATUS_TOM.AGUARDANDO}`}>{PO_STATUS_LABEL[po.status] || po.status}</span>
                                        {!!po.percentual_liberado && (
                                            <span className="text-[11px] text-ok font-semibold">{po.percentual_liberado}% liberado</span>
                                        )}
                                        {po.arquivos?.length > 0 && (
                                            <GhostButton onClick={() => relerPdf(po.id)} disabled={relendo === po.id}>
                                                <RefreshCw size={14} className="inline mr-1" aria-hidden />{relendo === po.id ? 'Lendo...' : 'Reler PDF'}
                                            </GhostButton>
                                        )}
                                        <GhostButton onClick={() => anexarEmPO(po.id)} disabled={enviando}>
                                            <Paperclip size={14} className="inline mr-1" aria-hidden />Anexar arquivo
                                        </GhostButton>
                                        <button type="button" onClick={() => excluirPO(po)} title="Excluir PO" aria-label="Excluir PO"
                                            className="text-muted-foreground hover:text-destructive p-1.5">
                                            <Trash2 size={14} aria-hidden />
                                        </button>
                                    </div>
                                </div>

                                {po.arquivos?.length > 0 && (
                                    <div className="flex flex-col gap-1 mt-2">
                                        {po.arquivos.map((a: any) => (
                                            <div key={a.id} className="flex items-center justify-between gap-2 text-xs bg-background/60 rounded px-2 py-1.5">
                                                <a href={`/api/pos/arquivos/${a.id}/download`} className="text-primary hover:underline flex items-center gap-1.5 min-w-0">
                                                    <Paperclip size={14} className="flex-shrink-0" aria-hidden /><span className="truncate">{a.nome_original}</span>
                                                </a>
                                                <button type="button" onClick={() => removerArquivo(a.id)} aria-label="Excluir arquivo" title="Excluir arquivo" className="text-muted-foreground hover:text-destructive flex-shrink-0"><Trash2 size={14} aria-hidden /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {linhas[po.id]?.length > 0 && (
                                    <div className="mt-3 border border-border rounded-lg overflow-x-auto">
                                        <div className="px-3 py-2 bg-secondary/50 text-[11px] font-semibold flex items-center justify-between">
                                            <span>Linhas da PO — autorização para faturamento</span>
                                            <span className="text-muted-foreground font-normal">
                                                O percentual a faturar é informado na tela de Faturamento
                                            </span>
                                        </div>
                                        <table className="w-full text-[11px] min-w-[640px]">
                                            <thead className="text-muted-foreground">
                                                <tr className="text-left border-b border-border">
                                                    <th className="py-1.5 px-2">Linha</th>
                                                    <th className="py-1.5 px-2">Serviço</th>
                                                    <th className="py-1.5 px-2 text-right">Valor</th>
                                                    <th className="py-1.5 px-2 text-right">Já faturado</th>
                                                    <th className="py-1.5 px-2 text-right">Pendente</th>
                                                    <th className="py-1.5 px-2 text-center">Autorização</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {linhas[po.id].map((l: any) => (
                                                    <tr key={l.id} className="border-b border-border/40 last:border-0">
                                                        <td className="py-1.5 px-2 font-id">{l.numero_linha}</td>
                                                        <td className="py-1.5 px-2">{l.descricao}</td>
                                                        <td className="py-1.5 px-2 text-right">{fmtMoeda(l.valor_total)}</td>
                                                        <td className={`py-1.5 px-2 text-right ${l.percentual_faturado > 0 ? 'text-ok' : 'text-muted-foreground'}`}>
                                                            {l.percentual_faturado > 0 ? `${l.percentual_faturado}%` : '—'}
                                                        </td>
                                                        <td className={`py-1.5 px-2 text-right ${l.percentual_pendente > 0 ? 'text-warn' : 'text-muted-foreground'}`}>
                                                            {l.percentual_pendente > 0 ? <>{l.percentual_pendente}%<span className="ml-2">{fmtMoeda(l.valor_pendente)}</span></> : '—'}
                                                        </td>
                                                        <td className="py-1.5 px-2 text-center">
                                                            <button type="button" onClick={() => alternarAutorizacao(l)}
                                                                title={l.autorizado ? 'Autorizado — clique para revogar' : 'Clique para autorizar esta linha'}
                                                                className={`cursor-pointer inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${l.autorizado
                                                                    ? 'bg-ok/15 text-ok border-ok/40 hover:bg-ok/25'
                                                                    : 'bg-warn/10 text-warn border-warn/40 hover:bg-warn/20'}`}>
                                                                {l.autorizado ? <><CheckCircle2 size={14} aria-hidden /> Autorizado</> : 'Autorizar'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                <DadosLidos po={po} />

                                {!po.leitura_json && po.arquivos?.length > 0 && (
                                    <div className="mt-2 border-t border-border/60 pt-2 text-[11px] text-warn">
                                        PDF anexado antes da leitura automática — clique em <strong>Reler PDF</strong> para extrair os dados do documento.
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
}

// Resumo completo do que foi extraído do PDF — fica sempre visível: quem recebeu a PO
// confere contra o documento e corrige nos campos editáveis acima se a leitura errar.
function DadosLidos({ po }: { po: any }) {
    const [aberto, setAberto] = useState(true);
    const [verTexto, setVerTexto] = useState(false);

    let leitura: any = null;
    try { leitura = po.leitura_json ? JSON.parse(po.leitura_json) : null; } catch { leitura = null; }
    if (!leitura) return null;

    const partes: [string, string, string?][] = [
        ['Emitente', leitura.emissor || '—', leitura.emissor_cnpj ? `CGC ${leitura.emissor_cnpj}` : undefined],
        ['Fornecedor', leitura.fornecedor || '—', leitura.fornecedor_cnpj ? `CGC ${leitura.fornecedor_cnpj}` : undefined],
        ['Site(s)', leitura.sites?.length ? leitura.sites.join(', ') : (leitura.site || '—')],
        ['Escopo', leitura.descricao || '—'],
        ['Condição de pagamento', leitura.condicao_pagamento || '—'],
    ];

    const confCor = leitura.confianca === 'ALTA' ? 'text-ok'
        : leitura.confianca === 'MEDIA' ? 'text-warn' : 'text-crit';

    const destaques: [string, string][] = [
        ['Nº da PO', leitura.numero || '—'],
        ['Data de emissão', leitura.data ? leitura.data.split('-').reverse().join('/') : '—'],
        ['Valor total', leitura.valor != null ? fmtMoeda(leitura.valor) : '—'],
        ['Linhas na PO', leitura.itens?.length ? String(leitura.itens.length) : '—'],
    ];

    return (
        <div className="mt-3 border border-border rounded-lg overflow-hidden">
            <button type="button" aria-expanded={aberto} onClick={() => setAberto(v => !v)} className="w-full flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 bg-secondary/50 hover:bg-secondary/70 text-left">
                {aberto ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                Resumo da PO — lido do PDF
                <span className={`ml-2 ${confCor}`}>Confiança {String(leitura.confianca || '').toLowerCase()}</span>
                {leitura.layout === 'HIGHLINE_ORDEM_DE_COMPRA' && (
                    <span className="ml-2 text-muted-foreground">Layout Highline reconhecido</span>
                )}
            </button>

            {aberto && (
                <div className="p-3 text-xs">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                        {destaques.map(([rot, val]) => (
                            <div key={rot} className="bg-background/60 border border-border/60 rounded px-2.5 py-2">
                                <div className="text-[11px] text-muted-foreground">{rot}</div>
                                <div className={`text-sm mt-0.5 ${val === '—' ? 'text-muted-foreground' : 'font-bold'} ${rot === 'Nº da PO' && val !== '—' ? 'font-id' : ''}`}>{val}</div>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        {partes.map(([rot, val, extra]) => (
                            <div key={rot} className="flex justify-between gap-3 border-b border-border/40 py-1.5">
                                <span className="text-muted-foreground whitespace-nowrap">{rot}</span>
                                <span className="font-medium text-right" title={val}>
                                    {val}
                                    {extra && <span className="block text-[11px] text-muted-foreground font-normal">{extra}</span>}
                                </span>
                            </div>
                        ))}
                    </div>

                    {leitura.itens?.length > 0 && (
                        <div className="mt-3">
                            <div className="text-muted-foreground mb-1">Itens da PO ({leitura.itens.length})</div>
                            <div className="border border-border rounded overflow-x-auto">
                                <table className="w-full text-[11px]">
                                    <thead className="bg-secondary/60 text-muted-foreground">
                                        <tr className="text-left">
                                            <th className="px-2 py-1.5 font-semibold">Item</th>
                                            <th className="px-2 py-1.5 font-semibold">Descrição</th>
                                            <th className="px-2 py-1.5 font-semibold">Un.</th>
                                            <th className="px-2 py-1.5 font-semibold text-right">Quant.</th>
                                            <th className="px-2 py-1.5 font-semibold">Site</th>
                                            <th className="px-2 py-1.5 font-semibold">Cidade</th>
                                            <th className="px-2 py-1.5 font-semibold">Projeto</th>
                                            <th className="px-2 py-1.5 font-semibold text-right">Preço unit.</th>
                                            <th className="px-2 py-1.5 font-semibold text-right">Valor total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leitura.itens.map((it: any, i: number) => (
                                            <tr key={i} className="border-t border-border/40 odd:bg-background/40">
                                                <td className="px-2 py-1.5 font-id">{it.item || '—'}</td>
                                                <td className="px-2 py-1.5">{it.descricao}</td>
                                                <td className="px-2 py-1.5">{it.unidade || '—'}</td>
                                                <td className="px-2 py-1.5 text-right">{it.quantidade ?? '—'}</td>
                                                <td className="px-2 py-1.5 font-id font-semibold">{it.site || '—'}</td>
                                                <td className="px-2 py-1.5 text-muted-foreground">{it.cidade || '—'}</td>
                                                <td className="px-2 py-1.5 text-muted-foreground">{it.projeto || '—'}</td>
                                                <td className="px-2 py-1.5 text-right">{it.valor_unitario != null ? fmtMoeda(it.valor_unitario) : '—'}</td>
                                                <td className="px-2 py-1.5 text-right font-semibold">{it.valor != null ? fmtMoeda(it.valor) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t border-border bg-secondary/40">
                                            <td colSpan={8} className="px-2 py-1.5 text-right font-semibold">Total da PO</td>
                                            <td className="px-2 py-1.5 text-right font-bold">{fmtMoeda(leitura.valor)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}

                    {leitura.valores_encontrados?.length > 1 && (
                        <div className="mt-2 text-[11px] text-muted-foreground">
                            Outros valores no documento: {leitura.valores_encontrados.slice(0, 6).map((v: number) => fmtMoeda(v)).join(', ')}
                        </div>
                    )}

                    <button type="button" onClick={() => setVerTexto(v => !v)} className="mt-2 text-[11px] text-muted-foreground hover:text-foreground underline">
                        {verTexto ? 'Ocultar' : 'Ver'} texto extraído do PDF
                    </button>
                    {verTexto && (
                        <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap bg-background/60 rounded p-2 text-[11px] leading-relaxed">
                            {leitura.texto_extraido}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}
