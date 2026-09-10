import { useEffect, useRef, useState } from 'react';
import { Calculator, Copy, Download, FileArchive, FileCheck2, FileSpreadsheet, Mail, Paperclip, Plus, Trash2, X } from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { fmtData, fmtMoeda } from './constants';
import PagamentoStatusSelect from './PagamentoStatusSelect';
import PrestacaoConsolidadaPanel from './PrestacaoConsolidadaPanel';
import { GhostButton, PrimaryButton, inputClass } from './ui';

const FORMA_LABEL: Record<string, string> = { PIX: 'PIX', TED: 'Transferência bancária', BOLETO: 'Boleto', DINHEIRO: 'Dinheiro' };
const PAGOS = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'];
const EXTENSOES_COMPACTADAS = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'];
const tamanhoArquivo = (bytes?: number) => {
  const valor = Number(bytes || 0);
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
  return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
};
const hojeLocal = () => {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function PrestacaoContasViagem({ atividade, refreshKey = 0, standalone = false }: { atividade?: AtividadeDetalhe; refreshKey?: number; standalone?: boolean }) {
  const [itens, setItens] = useState<any[]>([]);
  const [editor, setEditor] = useState<any | null>(null);
  const [email, setEmail] = useState<any | null>(null);
  const [emailContexto, setEmailContexto] = useState<any | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [anexando, setAnexando] = useState<string | null>(null);
  const comprovanteRef = useRef<HTMLInputElement>(null);
  const memoriaRef = useRef<HTMLInputElement>(null);
  const alvoComprovanteRef = useRef<any | null>(null);
  const alvoMemoriaRef = useRef<any | null>(null);

  const carregar = async () => {
    const r = await fetch(`/api/reembolsos${atividade ? `?atividade_id=${atividade.id}` : ''}`);
    const d = r.ok ? await r.json() : [];
    setItens(Array.isArray(d) ? d : []);
  };
  useEffect(() => { carregar(); }, [atividade?.id, refreshKey]);

  const abrirEditor = (processo: any, pagamento?: any) => {
    setErro('');
    setEditor({
    processoId: processo.id,
    natureza: processo.natureza,
    pagamentoId: pagamento?.id || null,
    numero: pagamento?.numero || ((processo.pagamentos || []).length + 1),
    valor: pagamento ? String(pagamento.valor) : '',
    forma_pagamento: pagamento?.forma_pagamento || processo.forma_pagamento || 'PIX',
    data_solicitacao: pagamento?.data_solicitacao ? String(pagamento.data_solicitacao).slice(0, 10) : hojeLocal(),
    data_prevista: pagamento?.data_prevista ? String(pagamento.data_prevista).slice(0, 10) : '',
    observacoes: pagamento?.observacoes || '',
    bloqueiaValor: pagamento ? PAGOS.includes(pagamento.status) || (pagamento.prestacoes || []).length > 0 : false,
    });
  };

  const salvarPagamento = async () => {
    if (!editor || !Number(editor.valor) || Number(editor.valor) <= 0) { setErro('Informe o valor do depósito'); return; }
    setSalvando(true); setErro('');
    try {
      const url = editor.pagamentoId ? `/api/reembolsos/pagamentos/${editor.pagamentoId}` : `/api/reembolsos/${editor.processoId}/pagamentos`;
      const r = await fetch(url, { method: editor.pagamentoId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editor) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Erro ao salvar depósito');
      setEditor(null); await carregar();
    } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
  };
  const mudarStatus = async (processo: any, pagamento: any, status: string) => {
    if (pagamento.status === 'PENDENTE' && status === 'SOLICITADO') { abrirEditor(processo, pagamento); return; }
    const r = await fetch(`/api/reembolsos/pagamentos/${pagamento.id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!r.ok) { setErro((await r.json()).error || 'Erro ao alterar status'); return; } await carregar();
  };
  const excluirPagamento = async (pagamento: any) => {
    if (!confirm(`Excluir o depósito ${pagamento.numero}?`)) return;
    const r = await fetch(`/api/reembolsos/pagamentos/${pagamento.id}`, { method: 'DELETE' });
    if (!r.ok) { setErro((await r.json()).error || 'Erro ao excluir depósito'); return; } await carregar();
  };

  const gerarEmail = async (processo: any, pagamento: any) => {
    setErro(''); setEmail(null); setEmailContexto({ processo, pagamento });
    const cacheKey = Date.now();
    const r = await fetch(`/api/reembolsos/${processo.id}/email?_=${cacheKey}`, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pagamento_id: pagamento.id }) });
    const d = await r.json(); if (!r.ok) { setErro(d.error || 'Erro ao gerar e-mail'); return; } setEmail({ ...d, cacheKey });
  };

  const escolherComprovante = (processo: any, pagamento: any) => { alvoComprovanteRef.current = { processo, pagamento }; comprovanteRef.current?.click(); };
  const anexarComprovante = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; const alvo = alvoComprovanteRef.current; e.target.value = '';
    if (!file || !alvo) return; setAnexando(alvo.pagamento.id); setErro('');
    try {
      const arquivo_base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Não foi possível ler o comprovante')); reader.readAsDataURL(file); });
      const r = await fetch(`/api/pagamentos/DEPOSITO/${alvo.pagamento.id}/comprovante`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ arquivo_base64 }) });
      if (!r.ok) throw new Error((await r.json()).error || 'Erro ao anexar comprovante'); await carregar();
    } catch (e: any) { setErro(e.message); } finally { setAnexando(null); }
  };
  const removerComprovante = async (pagamento: any) => {
    if (!confirm('Remover o comprovante deste depósito?')) return;
    const r = await fetch(`/api/pagamentos/DEPOSITO/${pagamento.id}/comprovante`, { method: 'DELETE' });
    if (!r.ok) { setErro((await r.json()).error || 'Erro ao remover comprovante'); return; } await carregar();
  };

  const escolherMemoria = (processo: any) => { alvoMemoriaRef.current = processo; memoriaRef.current?.click(); };
  const anexarMemoria = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); const processo = alvoMemoriaRef.current; e.target.value = '';
    if (!files.length || !processo) return; setAnexando(`memoria:${processo.id}`); setErro('');
    try {
      for (const file of files) {
        const formData = new FormData(); formData.append('arquivo', file);
        const r = await fetch(`/api/reembolsos/${processo.id}/arquivos-calculo`, { method: 'POST', body: formData });
        if (!r.ok) throw new Error(`${file.name}: ${(await r.json()).error || 'erro ao anexar'}`);
      }
    } catch (e: any) { setErro(e.message); } finally { await carregar(); setAnexando(null); }
  };
  const removerMemoria = async (arquivo: any) => {
    if (!confirm(`Remover ${arquivo.nome_original}?`)) return;
    const r = await fetch(`/api/reembolsos/arquivos/${arquivo.id}`, { method: 'DELETE' });
    if (!r.ok) { setErro((await r.json()).error || 'Erro ao remover arquivo'); return; } await carregar();
  };

  if (!itens.length && !standalone) return null;
  return <section className={standalone ? 'p-5' : 'mt-5 border-t border-border pt-4'}>
    <input ref={comprovanteRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={anexarComprovante}/>
    <input ref={memoriaRef} type="file" multiple className="hidden" onChange={anexarMemoria}/>
    <div className="flex items-center gap-2 mb-3"><Calculator size={17} className="text-sky-400"/><div><h3 className={standalone ? 'text-lg font-bold' : 'text-sm font-bold'}>Reembolsos, adiantamentos e prestação de contas</h3>{standalone && <p className="text-xs text-muted-foreground">Pagamentos, documentos de cálculo e prestações consolidadas.</p>}</div></div>
    {erro && <div className="mb-3 rounded bg-red-500/10 p-2 text-sm text-red-400">{erro}</div>}
    {!itens.length ? <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">Nenhum reembolso ou adiantamento registrado.</div> : <div className="flex flex-col gap-3">{itens.map(processo => {
      const adiantamento = processo.natureza === 'ADIANTAMENTO';
      return <div key={processo.id} className="border border-border rounded-lg p-3">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2"><div><b className="text-sm">{processo.favorecido_nome}</b><div className="text-xs text-muted-foreground">{processo.atividade?.codigo ? `${processo.atividade.codigo} · ` : ''}{adiantamento ? (processo.destino || 'Destino não informado') : (processo.motivo || 'Reembolso de despesa')}</div></div><div className="flex items-center gap-2"><span className="text-[10px] font-semibold text-sky-400">{adiantamento ? 'ADIANTAMENTO' : 'REEMBOLSO'}</span><GhostButton onClick={() => escolherMemoria(processo)} disabled={anexando === `memoria:${processo.id}`} title="Selecione um ou vários arquivos de qualquer formato, inclusive ZIP, RAR e 7Z, até 100 MB cada"><FileSpreadsheet size={13} className="inline mr-1"/>{anexando === `memoria:${processo.id}` ? 'Enviando...' : ((processo.arquivos || []).length ? 'Adicionar arquivos' : 'Anexar arquivos')}</GhostButton><GhostButton onClick={() => abrirEditor(processo)}><Plus size={13} className="inline mr-1"/>Adicionar depósito</GhostButton></div></div>

        {(processo.arquivos || []).length > 0 && <div className="mb-3 rounded-lg border border-border/70 bg-secondary/20 p-2"><div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Arquivos anexados ({processo.arquivos.length})</div><div className="flex flex-col gap-1.5">{processo.arquivos.map((arquivo: any) => {
          const extensao = String(arquivo.nome_original || '').split('.').pop()?.toLowerCase() || '';
          const IconeArquivo = EXTENSOES_COMPACTADAS.includes(extensao) ? FileArchive : FileSpreadsheet;
          const downloadUrl = `/api/reembolsos/arquivos/${arquivo.id}/download`;
          return <div key={arquivo.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 bg-card/60 px-2.5 py-2 text-[11px]"><div className="flex min-w-0 items-center gap-2"><IconeArquivo size={15} className="shrink-0 text-emerald-400"/><div className="min-w-0"><a className="block truncate font-semibold text-primary hover:underline" href={downloadUrl} download title={`Baixar ${arquivo.nome_original}`}>{arquivo.nome_original}</a><span className="text-[10px] text-muted-foreground">{extensao ? extensao.toUpperCase() : 'ARQUIVO'} · {tamanhoArquivo(arquivo.tamanho_bytes)}</span></div></div><div className="flex shrink-0 items-center gap-3"><a className="flex items-center gap-1 font-semibold text-primary hover:underline" href={downloadUrl} download><Download size={13}/>Baixar</a><button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-red-400" onClick={() => removerMemoria(arquivo)}><Trash2 size={13}/>Excluir</button></div></div>;
        })}</div></div>}

        <div className="flex flex-col gap-1.5">{(processo.pagamentos || []).map((pagamento: any) => <div key={pagamento.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-2.5 py-2">
          <div className="min-w-0 text-xs flex items-center gap-2 flex-wrap"><span className="font-semibold">DEPÓSITO {pagamento.numero}</span><strong>{fmtMoeda(pagamento.valor)}</strong><span className="border-l border-border pl-2 text-sky-400 font-semibold">{FORMA_LABEL[pagamento.forma_pagamento] || pagamento.forma_pagamento || 'Forma não informada'}</span><span className={pagamento.comprovante_url ? 'text-emerald-400' : 'text-muted-foreground'}>{pagamento.comprovante_url ? 'Comprovante anexado' : 'Sem comprovante'}</span>{(pagamento.data_solicitacao || pagamento.data_prevista || pagamento.data_pagamento) && <span className="border-l border-border pl-2 text-[10px] text-muted-foreground">Solicitado: {pagamento.data_solicitacao ? fmtData(pagamento.data_solicitacao) : '—'} · Previsto: {pagamento.data_prevista ? fmtData(pagamento.data_prevista) : '—'} · Pago: {pagamento.data_pagamento ? fmtData(pagamento.data_pagamento) : '—'}</span>}{(pagamento.prestacoes || []).length > 0 && <span className="text-[10px] text-violet-400">Prestação consolidada vinculada</span>}</div>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0"><button onClick={() => gerarEmail(processo, pagamento)} className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"><Mail size={13}/>E-mail de {adiantamento ? 'adiantamento' : 'reembolso'}</button>{pagamento.comprovante_url ? <><a href={pagamento.comprovante_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:underline"><FileCheck2 size={13}/>Ver comprovante</a><button onClick={() => removerComprovante(pagamento)} className="text-[11px] text-muted-foreground hover:text-red-400">Remover</button></> : <button onClick={() => escolherComprovante(processo, pagamento)} disabled={anexando === pagamento.id} className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary disabled:opacity-50"><Paperclip size={13}/>{anexando === pagamento.id ? 'Enviando...' : 'Anexar comprovante'}</button>}<button onClick={() => abrirEditor(processo, pagamento)} className="text-[11px] text-muted-foreground hover:text-primary hover:underline">Editar valor/dados</button>{!PAGOS.includes(pagamento.status) && !(pagamento.prestacoes || []).length && <button onClick={() => excluirPagamento(pagamento)} title="Excluir solicitação/depósito" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-400"><Trash2 size={12}/>Excluir</button>}<PagamentoStatusSelect value={pagamento.status} onChange={status => mudarStatus(processo, pagamento, status)}/></div>
        </div>)}{!(processo.pagamentos || []).length && <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-amber-400">Este registro ainda não possui depósitos. Adicione o primeiro pagamento.</div>}</div>
      </div>;
    })}</div>}

    <PrestacaoConsolidadaPanel atividadeId={atividade?.id} processos={itens} onRefresh={carregar}/>

    {editor && <div className="fixed inset-0 z-[2150] bg-black/75 flex items-center justify-center p-4"><div className="bg-card border border-border rounded-xl w-full max-w-lg p-5"><div className="flex justify-between mb-4"><div><h2 className="font-bold">{editor.pagamentoId ? `Editar depósito ${editor.numero}` : 'Adicionar depósito'}</h2><p className="text-xs text-muted-foreground mt-1">Cada depósito possui agendamento, status e comprovante próprios.</p></div><button onClick={() => setEditor(null)}><X/></button></div>{erro && <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-400">{erro}</div>}<div className="grid grid-cols-2 gap-3"><label className="text-xs">Valor do depósito<input type="number" step="0.01" disabled={editor.bloqueiaValor} className={`${inputClass} mt-1`} value={editor.valor} onChange={e => setEditor({ ...editor, valor: e.target.value })}/></label><label className="text-xs">Forma de pagamento<select className={`${inputClass} mt-1`} value={editor.forma_pagamento} onChange={e => setEditor({ ...editor, forma_pagamento: e.target.value })}><option value="PIX">PIX</option><option value="TED">Transferência bancária</option><option value="BOLETO">Boleto</option><option value="DINHEIRO">Dinheiro</option></select></label><label className="text-xs">Data da solicitação<input type="date" className={`${inputClass} mt-1`} value={editor.data_solicitacao} onChange={e => setEditor({ ...editor, data_solicitacao: e.target.value })}/></label><label className="text-xs">Data prevista<input type="date" className={`${inputClass} mt-1`} value={editor.data_prevista} onChange={e => setEditor({ ...editor, data_prevista: e.target.value })}/></label><label className="text-xs col-span-2">Observações<input className={`${inputClass} mt-1`} value={editor.observacoes} onChange={e => setEditor({ ...editor, observacoes: e.target.value })}/></label></div><div className="flex justify-end gap-2 mt-5"><GhostButton onClick={() => setEditor(null)}>Cancelar</GhostButton><PrimaryButton onClick={salvarPagamento} disabled={salvando || !editor.valor}>{editor.pagamentoId ? 'Salvar' : 'Adicionar depósito'}</PrimaryButton></div></div></div>}

    {email && <div className="fixed inset-0 z-[2200] bg-black/75 flex items-center justify-center p-4"><div className="bg-card border border-border rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col"><div className="p-4 border-b border-border flex justify-between gap-3"><div><h2 className="font-bold">E-mail financeiro · Depósito {emailContexto?.pagamento?.numero}</h2><p className="text-xs text-muted-foreground mt-1">{email.assunto}</p></div><button onClick={() => setEmail(null)}><X/></button></div><div className="flex-1 overflow-auto bg-[#F4F6F8] p-3"><iframe title="Prévia do e-mail" srcDoc={email.html} className="w-full bg-white border-0" style={{ height: 1400 }}/></div><div className="p-4 border-t border-border flex justify-end gap-2"><GhostButton onClick={() => setEmail(null)}>Fechar</GhostButton><a href={`/api/reembolsos/${emailContexto?.processo?.id}/email.eml?pagamento_id=${emailContexto?.pagamento?.id}&_=${email.cacheKey}`} className="h-9 px-3 border border-border bg-secondary text-sm font-semibold flex items-center gap-2"><Mail size={14}/>Abrir no Outlook</a><PrimaryButton onClick={async () => { await navigator.clipboard.writeText(email.html); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}><Copy size={14} className="inline mr-1"/>{copiado ? 'Copiado' : 'Copiar e-mail'}</PrimaryButton></div></div></div>}
  </section>;
}
