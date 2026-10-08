import AvisoSemAssinatura from '../perfil/AvisoSemAssinatura';
import { useEffect, useRef, useState } from 'react';
import { Calculator, Copy, Download, FileArchive, FileSpreadsheet, Mail, Plus, Trash2, X } from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { fmtData, fmtMoeda } from './constants';
import PagamentoStatusSelect from './PagamentoStatusSelect';
import PrestacaoConsolidadaPanel from './PrestacaoConsolidadaPanel';
import { GhostButton, PrimaryButton, inputClass } from './ui';
import { FinancialActionMenu, FinancialAttachments, FinancialBeneficiaryCard, FinancialPaymentCard, type FinancialAction } from '../financeiro/FinancialCards';
import PaymentAttachments from '../financeiro/PaymentAttachments';
import { authFetch, downloadAuthenticatedFile } from '../../lib/authFetch';

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
  // Edição do cabeçalho do processo, no próprio cartão do favorecido.
  const [editandoProcesso, setEditandoProcesso] = useState<{ id: string; favorecido_nome: string; motivo: string } | null>(null);
  // Rateio do adiantamento de projeto: cada linha diz quanto, em qual site e
  // para qual prestador. É por aqui que o dinheiro desce do projeto para a obra.
  const [rateio, setRateio] = useState<{ processoId: string; linhas: any[] } | null>(null);
  const [atividadesDoProjeto, setAtividadesDoProjeto] = useState<any[]>([]);
  const [prestadores, setPrestadores] = useState<{ funcionarios: any[]; suppliers: any[] }>({ funcionarios: [], suppliers: [] });

  const memoriaRef = useRef<HTMLInputElement>(null);
  const alvoMemoriaRef = useRef<any | null>(null);

  const carregar = async () => {
    const r = await fetch(`/api/reembolsos${atividade ? `?atividade_id=${atividade.id}` : ''}`);
    const d = r.ok ? await r.json() : [];
    setItens(Array.isArray(d) ? d : []);
  };
  useEffect(() => { carregar(); }, [atividade?.id, refreshKey]);

  /** Abre o rateio de um adiantamento de projeto. */
  const abrirRateio = async (processo: any) => {
    setErro('');
    try {
      const [fin, fun, sup] = await Promise.all([
        fetch(`/api/acionamentos/${processo.acionamento.id}/financeiro`),
        fetch('/api/funcionarios'),
        fetch('/api/suppliers?limit=200'),
      ]);
      setAtividadesDoProjeto(fin.ok ? (await fin.json()).atividades || [] : []);
      setPrestadores({
        funcionarios: fun.ok ? await fun.json() : [],
        suppliers: sup.ok ? ((await sup.json()).items || []) : [],
      });
      setRateio({
        processoId: processo.id,
        linhas: (processo.despesas || []).length
          ? processo.despesas.map((d: any) => ({
            data: d.data ? String(d.data).slice(0, 10) : '',
            descricao: d.descricao || '', valor: String(d.valor), categoria: d.categoria || 'OUTROS',
            atividade_id: d.atividade_id || '',
            // Um campo só na tela para os dois tipos de prestador; a origem vai
            // no prefixo e o payload separa na hora de salvar.
            prestador: d.funcionario_id ? `f:${d.funcionario_id}` : d.supplier_id ? `s:${d.supplier_id}` : '',
          }))
          : [{ data: hojeLocal(), descricao: '', valor: '', categoria: 'SERVICO', atividade_id: '', prestador: '' }],
      });
    } catch (e: any) { setErro(e.message); }
  };

  const salvarRateio = async () => {
    if (!rateio) return;
    setSalvando(true); setErro('');
    try {
      const despesas = rateio.linhas
        .filter(l => l.descricao || Number(String(l.valor).replace(',', '.')))
        .map(l => ({
          data: l.data || null, descricao: l.descricao, categoria: l.categoria,
          valor: Number(String(l.valor).replace(',', '.')),
          atividade_id: l.atividade_id || null,
          funcionario_id: l.prestador.startsWith('f:') ? l.prestador.slice(2) : null,
          supplier_id: l.prestador.startsWith('s:') ? l.prestador.slice(2) : null,
        }));
      const r = await fetch(`/api/reembolsos/${rateio.processoId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ despesas }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Erro ao salvar o rateio');
      setRateio(null);
      await carregar();
    } catch (e: any) { setErro(e.message); }
    finally { setSalvando(false); }
  };

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
      // Acima do limite de quem pediu, o depósito fica PENDENTE e vai para aprovação.
      if (d.aviso) alert(d.aviso);
      setEditor(null); await carregar();
    } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
  };
  const mudarStatus = async (processo: any, pagamento: any, status: string) => {
    if (pagamento.status === 'PENDENTE' && status === 'SOLICITADO') { abrirEditor(processo, pagamento); return; }
    const r = await fetch(`/api/reembolsos/pagamentos/${pagamento.id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!r.ok) { setErro((await r.json()).error || 'Erro ao alterar status'); return; } await carregar();
  };
  /**
   * Devolve o depósito para PENDENTE, desfazendo a solicitação.
   *
   * O cartão de contratação já tinha "Excluir solicitação"; o de reembolso não
   * tinha equivalente, e a única saída era excluir o depósito inteiro — que
   * apaga um dado que ainda serve.
   */
  const cancelarSolicitacaoDeposito = async (pagamento: any) => {
    if (!confirm(`Cancelar a solicitação do depósito ${pagamento.numero}?

O depósito continua no processo e volta para PENDENTE.`)) return;
    setErro('');
    const r = await fetch(`/api/reembolsos/pagamentos/${pagamento.id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PENDENTE' }),
    });
    if (!r.ok) { setErro((await r.json()).error || 'Erro ao cancelar a solicitação'); return; }
    await carregar();
  };

  /** Edita o cabeçalho: favorecido, motivo e dados bancários. */
  const salvarProcesso = async (id: string, dados: Record<string, unknown>) => {
    setErro('');
    const r = await fetch(`/api/reembolsos/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
    });
    if (!r.ok) { setErro((await r.json()).error || 'Erro ao salvar'); return; }
    setEditandoProcesso(null);
    await carregar();
  };

  /** Exclui o processo inteiro. O backend recusa se houver depósito pago. */
  const excluirProcesso = async (processo: any) => {
    const rotulo = processo.natureza === 'ADIANTAMENTO' ? 'adiantamento' : 'reembolso';
    const quantos = (processo.pagamentos || []).length;
    if (!confirm(`Excluir o ${rotulo} ${processo.codigo || ''} de ${processo.favorecido_nome}?

${quantos ? `Saem junto os ${quantos} depósito(s) e os arquivos anexados.` : 'O registro ainda não tem depósitos.'}
Esta ação não pode ser desfeita.`)) return;
    setErro('');
    const r = await fetch(`/api/reembolsos/${processo.id}`, { method: 'DELETE' });
    if (!r.ok) { setErro((await r.json()).error || 'Erro ao excluir'); return; }
    await carregar();
  };

  const excluirPagamento = async (pagamento: any) => {
    if (!confirm(`Excluir o depósito ${pagamento.numero}?`)) return;
    const r = await fetch(`/api/reembolsos/pagamentos/${pagamento.id}`, { method: 'DELETE' });
    if (!r.ok) { setErro((await r.json()).error || 'Erro ao excluir depósito'); return; } await carregar();
  };

  const gerarEmail = async (processo: any, pagamento: any) => {
    setErro(''); setEmail(null); setEmailContexto({ processo, pagamento });
    const cacheKey = Date.now();
    const r = await authFetch(`/api/reembolsos/${processo.id}/email?_=${cacheKey}`, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pagamento_id: pagamento.id }) });
    const d = await r.json(); if (!r.ok) { setErro(d.error || 'Erro ao gerar e-mail'); return; } setEmail({ ...d, cacheKey });
  };
  const abrirEmailNoOutlook = async () => {
    if (!emailContexto?.processo?.id || !emailContexto?.pagamento?.id) return;
    try {
      await downloadAuthenticatedFile(`/api/reembolsos/${emailContexto.processo.id}/email.eml?pagamento_id=${emailContexto.pagamento.id}&_=${email?.cacheKey || Date.now()}`, 'PAGAMENTO.eml');
    } catch (e: any) { setErro(e.message); }
  };

  // O upload de comprovante por aqui foi removido: gravava em `comprovante_url`
  // com storage próprio, paralelo à faixa Documentos, e era a origem da
  // contradição entre "comprovante anexado" no cartão e "comprovante pendente"
  // logo abaixo. O arquivo legado continua sendo exibido e removível.

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
    <input ref={memoriaRef} type="file" multiple className="hidden" onChange={anexarMemoria}/>
    <div className="flex items-center gap-2 mb-3"><Calculator size={16} className="text-info" aria-hidden/><div><h3 className={standalone ? 'text-lg font-bold' : 'text-sm font-bold'}>Reembolsos, adiantamentos e prestação de contas</h3>{standalone && <p className="text-xs text-muted-foreground">Pagamentos, documentos de cálculo e prestações consolidadas.</p>}</div></div>
    {erro && <div className="mb-3 rounded bg-crit/10 p-2 text-sm text-crit">{erro}</div>}
    {!itens.length ? <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">Nenhum reembolso ou adiantamento registrado.</div> : <div className="flex flex-col gap-4">{itens.map(processo => {
      const adiantamento = processo.natureza === 'ADIANTAMENTO';
      const arquivos = processo.arquivos || [];
      const total = (processo.pagamentos || []).reduce((s: number, p: any) => s + Number(p.valor || 0), 0) || Number(adiantamento ? processo.valor_adiantado : processo.valor_total);
      const edicaoProcesso = editandoProcesso?.id === processo.id ? editandoProcesso : null;
      return <FinancialBeneficiaryCard key={processo.id} name={processo.favorecido_nome} category={processo.codigo || (adiantamento ? 'Adiantamento' : 'Reembolso')} total={fmtMoeda(total)} totalLabel="Programado" status={<span className="rounded-full bg-info/10 px-2.5 py-1 text-[11px] font-semibold text-info">{adiantamento ? 'Adiantamento' : 'Reembolso'}</span>} headerActions={<div className="flex items-center gap-2">
        <GhostButton onClick={() => abrirEditor(processo)}><Plus size={14} className="inline mr-1" aria-hidden/>Adicionar depósito</GhostButton>
        <FinancialActionMenu actions={[
          ...(processo.acionamento ? [{ label: 'Ratear entre as atividades', onClick: () => abrirRateio(processo) }] : []),
          { label: `Editar ${adiantamento ? 'adiantamento' : 'reembolso'}`, onClick: () => setEditandoProcesso({ id: processo.id, favorecido_nome: processo.favorecido_nome || '', motivo: processo.motivo || '' }) },
          // Com depósito pago a exclusão esconderia dinheiro que saiu do caixa;
          // o backend recusa, e aqui nem se oferece.
          ...((processo.pagamentos || []).some((pg: any) => PAGOS.includes(pg.status))
            ? []
            : [{ label: `Excluir ${adiantamento ? 'adiantamento' : 'reembolso'}`, onClick: () => excluirProcesso(processo), tone: 'danger' as const }]),
        ]}/>
      </div>}>
        {rateio && rateio.processoId === processo.id && (() => {
          const emRateio = rateio;
          const totalRateado = emRateio.linhas.reduce((t, l) => t + (Number(String(l.valor).replace(',', '.')) || 0), 0);
          const teto = Number(processo.valor_adiantado || processo.valor_total || 0);
          return <div className="mb-3 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <strong className="text-xs">Rateio entre as atividades do projeto</strong>
              <span className="text-muted-foreground"><span className="font-id mr-2">{processo.acionamento?.codigo}</span>{processo.acionamento?.titulo}</span>
              <span className="ml-auto">
                Rateado <strong>{totalRateado ? fmtMoeda(totalRateado) : '—'}</strong> de {fmtMoeda(teto)}
                {teto - totalRateado > 0.009 && <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 font-semibold text-warn">Faltam {fmtMoeda(teto - totalRateado)}</span>}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr className="text-left text-muted-foreground">
                  <th className="p-1">Data</th><th className="p-1">Descrição</th>
                  <th className="p-1">Site ou atividade</th><th className="p-1">Prestador</th>
                  <th className="p-1 text-right">Valor</th><th><span className="sr-only">Ações</span></th>
                </tr></thead>
                <tbody>{emRateio.linhas.map((l, i) => {
                  const troca = (campo: string, valor: string) => setRateio(v => v && ({ ...v, linhas: v.linhas.map((x, j) => j === i ? { ...x, [campo]: valor } : x) }));
                  return <tr key={i} className="border-t border-border/60">
                    <td className="p-1"><input type="date" className={`${inputClass} h-8 text-[11px]`} value={l.data} onChange={e => troca('data', e.target.value)}/></td>
                    <td className="p-1"><input className={`${inputClass} h-8 text-[11px]`} value={l.descricao} onChange={e => troca('descricao', e.target.value)} placeholder="Ex.: diária do técnico"/></td>
                    <td className="p-1">
                      <select className={`${inputClass} h-8 text-[11px]`} value={l.atividade_id} onChange={e => troca('atividade_id', e.target.value)}>
                        <option value="">— sem atividade —</option>
                        {atividadesDoProjeto.map(a => <option key={a.id} value={a.id}>{a.site || a.codigo} — {a.titulo}</option>)}
                      </select>
                    </td>
                    <td className="p-1">
                      <select className={`${inputClass} h-8 text-[11px]`} value={l.prestador} onChange={e => troca('prestador', e.target.value)}>
                        <option value="">— sem prestador —</option>
                        <optgroup label="Funcionários LS">{prestadores.funcionarios.map(f => <option key={f.id} value={`f:${f.id}`}>{f.nome}</option>)}</optgroup>
                        <optgroup label="Fornecedores">{prestadores.suppliers.map(f => <option key={f.id} value={`s:${f.id}`}>{f.nome}</option>)}</optgroup>
                      </select>
                    </td>
                    <td className="p-1"><input type="number" step="0.01" className={`${inputClass} h-8 w-24 text-right text-[11px]`} value={l.valor} onChange={e => troca('valor', e.target.value)}/></td>
                    <td className="p-1"><button type="button" aria-label="Excluir linha do rateio" title="Excluir linha do rateio" className="px-1 text-muted-foreground hover:text-crit" onClick={() => setRateio(v => v && ({ ...v, linhas: v.linhas.filter((_, j) => j !== i) }))}><Trash2 size={14} aria-hidden/></button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => setRateio(v => v && ({ ...v, linhas: [...v.linhas, { data: hojeLocal(), descricao: '', valor: '', categoria: 'SERVICO', atividade_id: '', prestador: '' }] }))}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"><Plus size={14} aria-hidden/>Adicionar linha</button>
              <button onClick={() => setRateio(null)} className="ml-auto rounded-lg px-3 py-1.5 text-[11px] text-muted-foreground">Cancelar</button>
              <button onClick={salvarRateio} disabled={salvando} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60">
                {salvando ? 'Salvando...' : 'Salvar rateio'}
              </button>
            </div>
          </div>;
        })()}
        {edicaoProcesso && <div className="mb-3 rounded-lg border border-border bg-secondary/30 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">Favorecido</span>
              <input autoFocus className={`${inputClass} h-9 text-sm`} value={edicaoProcesso.favorecido_nome}
                onChange={e => setEditandoProcesso(v => v && ({ ...v, favorecido_nome: e.target.value }))}/>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">{adiantamento ? 'Motivo do adiantamento' : 'Motivo do reembolso'}</span>
              <input className={`${inputClass} h-9 text-sm`} value={edicaoProcesso.motivo}
                onChange={e => setEditandoProcesso(v => v && ({ ...v, motivo: e.target.value }))}
                placeholder="Descreva a despesa"/>
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setEditandoProcesso(null)} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground">Cancelar</button>
            <button onClick={() => salvarProcesso(processo.id, { favorecido_nome: edicaoProcesso.favorecido_nome, motivo: edicaoProcesso.motivo || null })}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Salvar</button>
          </div>
        </div>}
        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">{processo.atividade?.codigo && <span className="font-id">{processo.atividade.codigo}</span>}<span>{adiantamento ? (processo.destino || 'Destino não informado') : (processo.motivo || 'Reembolso de despesa')}</span></div>
        <FinancialAttachments count={arquivos.length} addAction={<button type="button" onClick={() => escolherMemoria(processo)} disabled={anexando === `memoria:${processo.id}`} className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50">{anexando === `memoria:${processo.id}` ? 'Enviando...' : 'Adicionar'}</button>}>
          {arquivos.map((arquivo: any) => {
            const extensao = String(arquivo.nome_original || '').split('.').pop()?.toLowerCase() || '';
            const IconeArquivo = EXTENSOES_COMPACTADAS.includes(extensao) ? FileArchive : FileSpreadsheet;
            const downloadUrl = `/api/reembolsos/arquivos/${arquivo.id}/download`;
            return <div key={arquivo.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/30 px-2.5 py-2 text-[11px]"><div className="flex min-w-0 items-center gap-2"><IconeArquivo size={15} className="shrink-0 text-muted-foreground" aria-hidden/><div className="min-w-0"><span className="block truncate font-semibold text-foreground">{arquivo.nome_original}</span><span className="text-[11px] text-muted-foreground">{extensao ? extensao.toUpperCase() : 'Arquivo'}<span className="ml-2">{tamanhoArquivo(arquivo.tamanho_bytes)}</span></span></div></div><div className="flex shrink-0 items-center gap-3"><a className="flex items-center gap-1 font-semibold text-primary hover:underline" href={downloadUrl} download><Download size={14} aria-hidden/>Baixar</a><button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-crit" onClick={() => removerMemoria(arquivo)}><Trash2 size={14} aria-hidden/>Excluir</button></div></div>;
          })}
        </FinancialAttachments>
        {(processo.pagamentos || []).map((pagamento: any) => {
          const actions: FinancialAction[] = [
            { label: `Gerar e-mail de ${adiantamento ? 'adiantamento' : 'reembolso'}`, onClick: () => gerarEmail(processo, pagamento) },
            { label: 'Editar valor e dados', onClick: () => abrirEditor(processo, pagamento) },
            ...(pagamento.comprovante_url ? [{ label: 'Remover comprovante', onClick: () => removerComprovante(pagamento), tone: 'danger' as const }] : []),
            ...(!PAGOS.includes(pagamento.status) && pagamento.status !== 'PENDENTE' ? [{ label: 'Cancelar solicitação', onClick: () => cancelarSolicitacaoDeposito(pagamento), tone: 'danger' as const }] : []),
            ...(!PAGOS.includes(pagamento.status) && !(pagamento.prestacoes || []).length ? [{ label: 'Excluir depósito', onClick: () => excluirPagamento(pagamento), tone: 'danger' as const }] : []),
          ];
          // Mesmo motivo da parcela: o anexo acontece só na faixa Documentos.
          const primaryAction = null;
          return <FinancialPaymentCard key={pagamento.id} title={`Depósito ${pagamento.numero}`} amount={fmtMoeda(pagamento.valor)} method={FORMA_LABEL[pagamento.forma_pagamento] || pagamento.forma_pagamento || 'Forma não informada'} context={(pagamento.prestacoes || []).length ? 'Prestação consolidada vinculada' : undefined} requestedAt={pagamento.data_solicitacao ? fmtData(pagamento.data_solicitacao) : undefined} expectedAt={pagamento.data_prevista ? fmtData(pagamento.data_prevista) : undefined} paidAt={pagamento.data_pagamento ? fmtData(pagamento.data_pagamento) : undefined} status={<PagamentoStatusSelect value={pagamento.status} onChange={status => mudarStatus(processo, pagamento, status)}/>} primaryAction={primaryAction} actions={actions}><PaymentAttachments ownerType="DEPOSITO" ownerId={pagamento.id} comprovanteLegado={pagamento.comprovante_url}/></FinancialPaymentCard>;
        })}
        {!(processo.pagamentos || []).length && <div className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-warn">Este registro ainda não possui depósitos. Adicione o primeiro pagamento.</div>}
      </FinancialBeneficiaryCard>;
    })}</div>}

    <PrestacaoConsolidadaPanel atividadeId={atividade?.id} processos={itens} onRefresh={carregar}/>

    {editor && <div className="fixed inset-0 z-[2150] bg-black/75 flex items-center justify-center p-4"><div className="bg-card border border-border rounded-xl w-full max-w-lg p-5"><div className="flex justify-between mb-4"><div><h2 className="font-bold">{editor.pagamentoId ? `Editar depósito ${editor.numero}` : 'Adicionar depósito'}</h2><p className="text-xs text-muted-foreground mt-1">Cada depósito possui agendamento, status e comprovante próprios.</p></div><button type="button" onClick={() => setEditor(null)} aria-label="Fechar" title="Fechar" className="text-muted-foreground hover:text-foreground"><X size={16} aria-hidden/></button></div>{erro && <div className="mb-3 rounded border border-crit/40 bg-crit/10 p-2 text-xs text-crit">{erro}</div>}<div className="grid grid-cols-2 gap-3"><label className="text-xs">Valor do depósito<input type="number" step="0.01" disabled={editor.bloqueiaValor} className={`${inputClass} mt-1`} value={editor.valor} onChange={e => setEditor({ ...editor, valor: e.target.value })}/></label><label className="text-xs">Forma de pagamento<select className={`${inputClass} mt-1`} value={editor.forma_pagamento} onChange={e => setEditor({ ...editor, forma_pagamento: e.target.value })}><option value="PIX">PIX</option><option value="TED">Transferência bancária</option><option value="BOLETO">Boleto</option><option value="DINHEIRO">Dinheiro</option></select></label><label className="text-xs">Data da solicitação<input type="date" className={`${inputClass} mt-1`} value={editor.data_solicitacao} onChange={e => setEditor({ ...editor, data_solicitacao: e.target.value })}/></label><label className="text-xs">Data prevista<input type="date" className={`${inputClass} mt-1`} value={editor.data_prevista} onChange={e => setEditor({ ...editor, data_prevista: e.target.value })}/></label><label className="text-xs col-span-2">Observações<input className={`${inputClass} mt-1`} value={editor.observacoes} onChange={e => setEditor({ ...editor, observacoes: e.target.value })}/></label></div><div className="flex justify-end gap-2 mt-5"><GhostButton onClick={() => setEditor(null)}>Cancelar</GhostButton><PrimaryButton onClick={salvarPagamento} disabled={salvando || !editor.valor}>{editor.pagamentoId ? 'Salvar' : 'Adicionar depósito'}</PrimaryButton></div></div></div>}

    {email && <div className="fixed inset-0 z-[2200] bg-black/75 flex items-center justify-center p-4"><div className="bg-card border border-border rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col"><div className="p-4 border-b border-border flex justify-between gap-3"><div><h2 className="font-bold">E-mail financeiro do depósito {emailContexto?.pagamento?.numero}</h2><p className="text-xs text-muted-foreground mt-1">{email.assunto}</p><p className="text-xs text-muted-foreground mt-1"><span className="text-muted-foreground">Para:</span> <strong className="text-foreground">{email.para || '—'}</strong>{email.cc ? <span className="ml-4">CC: <strong className="text-foreground">{email.cc}</strong></span> : null}{email.responsavel ? <span className="ml-4">Responsável: <strong className="text-foreground">{email.responsavel.nome}</strong></span> : null}</p>{email.sem_assinatura && <AvisoSemAssinatura className="mt-2"/>}{email.routing_pendente && <p className="mt-2 rounded border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs text-warn">Nenhum destinatário cadastrado para este tipo de e-mail — o .eml sai com o campo Para vazio. Cadastre em Configurações → Comunicação.</p>}</div><button type="button" onClick={() => setEmail(null)} aria-label="Fechar" title="Fechar" className="text-muted-foreground hover:text-foreground"><X size={16} aria-hidden/></button></div><div className="flex-1 overflow-auto bg-[#F4F6F8] p-3"><iframe title="Prévia do e-mail" srcDoc={email.html} className="w-full bg-white border-0" style={{ height: 1400 }}/></div><div className="p-4 border-t border-border flex justify-end gap-2"><GhostButton onClick={() => setEmail(null)}>Fechar</GhostButton><button type="button" onClick={abrirEmailNoOutlook} className="h-9 px-3 border border-border bg-secondary text-sm font-semibold flex items-center gap-2"><Mail size={14} aria-hidden/>Abrir no Outlook</button><PrimaryButton onClick={async () => { await navigator.clipboard.writeText(email.html); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}><Copy size={14} className="inline mr-1" aria-hidden/>{copiado ? 'Copiado' : 'Copiar e-mail'}</PrimaryButton></div></div></div>}
  </section>;
}
