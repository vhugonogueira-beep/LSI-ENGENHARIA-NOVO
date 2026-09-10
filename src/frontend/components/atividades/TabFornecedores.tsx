import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Settings, FileText, Paperclip, Trash2, Mail, Copy, X } from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, Field, PrimaryButton, GhostButton, inputClass, ErrorBanner, EmptyState } from './ui';
import { fmtData, fmtMoeda } from './constants';
import PrestacaoContasViagem from './PrestacaoContasViagem';
import PagamentoStatusSelect from './PagamentoStatusSelect';

const CONTRATO_STATUS = ['GERADO', 'ENVIADO', 'ASSINADO'];
const CONTRATO_STATUS_LABEL: Record<string, string> = { GERADO: 'Gerado', ENVIADO: 'Enviado', ASSINADO: 'Assinado' };
const CONTRATO_STATUS_COLOR: Record<string, string> = { GERADO: '#94a3b8', ENVIADO: '#f59e0b', ASSINADO: '#22c55e' };

const FINALIDADES = ['CABO', 'METALICO', 'QTM', 'MAO_DE_OBRA', 'LOCACAO', 'MATERIAL_CIVIL', 'MATERIAL_ELETRICO', 'EQUIPAMENTO', 'TRANSPORTE', 'REEMBOLSO', 'ADIANTAMENTO_VIAGEM', 'OUTROS'];
const FINALIDADE_LABEL: Record<string, string> = {
    CABO: 'Cabo',
    METALICO: 'Metálico',
    QTM: 'QTM',
    MAO_DE_OBRA: 'Mão de obra',
    LOCACAO: 'Locação',
    MATERIAL_CIVIL: 'Material civil',
    MATERIAL_ELETRICO: 'Material elétrico',
    EQUIPAMENTO: 'Equipamento',
    TRANSPORTE: 'Transporte',
    REEMBOLSO: 'Reembolso',
    ADIANTAMENTO_VIAGEM: 'Adiantamento de viagem',
    OUTROS: 'Outros',
};
const FORM_INIT = {
    favorecido: '', finalidade: 'MAO_DE_OBRA', valor_contratado: '', percentual_entrada: '0', percentual_saldo: '100',
    gatilho_saldo: 'CONCLUSAO', observacoes: '', destino: '', data_inicio_viagem: '', data_fim_viagem: '',
    data_despesa: '', data_solicitacao: '', data_prevista: '', forma_pagamento: '', cartao_id: '',
    formalizacao_posterior: false, data_compra_cartao: '', fatura_referencia: '',
};
const FORMA_LABEL: Record<string, string> = {
    PIX: 'PIX', TED: 'Transferência bancária', CARTAO_CREDITO: 'Cartão de crédito corporativo',
    BOLETO: 'Boleto', DINHEIRO: 'Dinheiro',
};
const hojeLocal = () => {
    const agora = new Date();
    return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function TabFornecedores({ atividade }: { atividade: AtividadeDetalhe }) {
    const [contratacoes, setContratacoes] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [funcionarios, setFuncionarios] = useState<any[]>([]);
    const [cartoes, setCartoes] = useState<any[]>([]);
    const [adiantamentoRefresh, setAdiantamentoRefresh] = useState(0);
    const [programacao, setProgramacao] = useState<{ parcelaId: string; statusAtual: string; data_solicitacao: string; data_prevista: string; motivo: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(FORM_INIT);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [emailPreview, setEmailPreview] = useState<string | null>(null);
    // E-mail de programacao de pagamento no template corporativo, por parcela.
    const [emailPagamento, setEmailPagamento] = useState<any | null>(null);
    const [gerandoEmail, setGerandoEmail] = useState<string | null>(null);
    const [parcelaDoEmail, setParcelaDoEmail] = useState<string | null>(null);
    // Edicao do valor da parcela: adiantar parte do saldo e comum, e o contrato
    // nao muda por isso. Parcela paga nao entra em edicao (o backend recusa).
    const [editandoParcela, setEditandoParcela] = useState<string | null>(null);
    const [valorParcela, setValorParcela] = useState('');
    const [dividindo, setDividindo] = useState<string | null>(null);
    const [copiado, setCopiado] = useState('');
    // Link da pasta vem do cadastro da atividade; o e-mail sai com a linha em
    // branco quando nao houver, para quem envia preencher no Outlook.
    const linkDiretorio = atividade.diretorio_url || '';
    const [gerandoContrato, setGerandoContrato] = useState<string | null>(null);
    const [anexandoContrato, setAnexandoContrato] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const contratoAlvoRef = useRef<string | null>(null);
    const comprovanteInputRef = useRef<HTMLInputElement>(null);
    const comprovanteAlvoRef = useRef<any | null>(null);
    const [anexandoComprovante, setAnexandoComprovante] = useState<string | null>(null);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [template, setTemplate] = useState<{ id: string; corpo_html: string } | null>(null);
    const [templateDraft, setTemplateDraft] = useState('');
    const [salvandoTemplate, setSalvandoTemplate] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [cR, sR, fR, eR] = await Promise.all([
                fetch(`/api/contratacoes?atividade_id=${atividade.id}`),
                fetch('/api/suppliers?limit=200'),
                fetch('/api/funcionarios'),
                fetch('/api/empresa'),
            ]);
            setContratacoes(cR.ok ? await cR.json() : []);
            const sData = sR.ok ? await sR.json() : { items: [] };
            setSuppliers(sData.items || []);
            setFuncionarios(fR.ok ? await fR.json() : []);
            const empresa = eR.ok ? await eR.json() : null;
            setCartoes((empresa?.cartoes || []).filter((c: any) => c.ativo));
        } finally {
            setLoading(false);
        }
    }, [atividade.id]);

    useEffect(() => { load(); }, [load]);

    async function criar() {
        if (!form.forma_pagamento) {
            setErro('Informe a forma de pagamento');
            return;
        }
        if (['ADIANTAMENTO_VIAGEM', 'REEMBOLSO'].includes(form.finalidade)) {
            setSalvando(true);
            setErro('');
            try {
                const isFuncionario = form.favorecido.startsWith('funcionario:');
                const id = form.favorecido.split(':')[1];
                const pessoa = isFuncionario ? funcionarios.find(f => f.id === id) : suppliers.find(s => s.id === id);
                const r = await fetch('/api/reembolsos', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        atividade_id: atividade.id,
                        natureza: form.finalidade === 'ADIANTAMENTO_VIAGEM' ? 'ADIANTAMENTO' : 'REEMBOLSO',
                        funcionario_id: isFuncionario ? id : null,
                        supplier_id: isFuncionario ? null : id,
                        favorecido_nome: pessoa?.nome,
                        cpf_cnpj: isFuncionario ? pessoa?.cpf : (pessoa?.cnpj || pessoa?.cpf),
                        valor_adiantado: form.finalidade === 'ADIANTAMENTO_VIAGEM' ? Number(form.valor_contratado) : null,
                        destino: form.destino,
                        data_inicio_viagem: form.data_inicio_viagem || null,
                        data_fim_viagem: form.data_fim_viagem || null,
                        data_solicitacao: form.data_solicitacao || hojeLocal(),
                        data_prevista: form.data_prevista || null,
                        forma_pagamento: form.forma_pagamento,
                        motivo: form.observacoes || (form.finalidade === 'ADIANTAMENTO_VIAGEM' ? `Adiantamento de viagem · ${form.destino || atividade.codigo}` : 'Reembolso de despesa'),
                        data_despesa: form.data_despesa || null,
                        despesas: form.finalidade === 'REEMBOLSO' ? [{
                            data: form.data_despesa || null,
                            categoria: 'OUTROS',
                            descricao: form.observacoes || 'Reembolso de despesa',
                            valor: Number(form.valor_contratado),
                        }] : [],
                    }),
                });
                if (!r.ok) throw new Error((await r.json()).error || 'Erro ao criar adiantamento');
                setForm(FORM_INIT); setShowForm(false); setAdiantamentoRefresh(v => v + 1);
            } catch (e: any) { setErro(e.message); } finally { setSalvando(false); }
            return;
        }
        if (Math.round(parseFloat(form.percentual_entrada) + parseFloat(form.percentual_saldo)) !== 100) {
            setErro('Percentual de entrada + saldo deve somar 100');
            return;
        }
        setSalvando(true);
        setErro('');
        try {
            const r = await fetch('/api/contratacoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    atividade_id: atividade.id,
                    supplier_id: form.favorecido.startsWith('supplier:') ? form.favorecido.slice(9) : null,
                    funcionario_id: form.favorecido.startsWith('funcionario:') ? form.favorecido.slice(12) : null,
                    finalidade: form.finalidade,
                    valor_contratado: parseFloat(form.valor_contratado),
                    percentual_entrada: parseFloat(form.percentual_entrada),
                    percentual_saldo: parseFloat(form.percentual_saldo),
                    gatilho_saldo: form.gatilho_saldo,
                    observacoes: form.observacoes || null,
                    forma_pagamento: form.forma_pagamento,
                    cartao_id: form.forma_pagamento === 'CARTAO_CREDITO' ? form.cartao_id : null,
                    formalizacao_posterior: form.formalizacao_posterior,
                    data_compra_cartao: form.formalizacao_posterior ? form.data_compra_cartao : null,
                    fatura_referencia: form.fatura_referencia || null,
                }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao contratar fornecedor');
            setForm(FORM_INIT);
            setShowForm(false);
            await load();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    }

    function abrirProgramacao(p: any) {
        setProgramacao({
            parcelaId: p.id,
            statusAtual: p.status,
            data_solicitacao: p.data_solicitacao ? String(p.data_solicitacao).slice(0, 10) : hojeLocal(),
            data_prevista: p.data_prevista ? String(p.data_prevista).slice(0, 10) : '',
            motivo: '',
        });
    }

    async function salvarProgramacaoPagamento() {
        if (!programacao?.data_solicitacao || !programacao.data_prevista) {
            setErro('Informe a data da solicitação e a data prevista para pagamento');
            return;
        }
        setErro('');
        try {
            const novaSolicitacao = programacao.statusAtual === 'PENDENTE';
            const r = await fetch(novaSolicitacao
                ? `/api/contratacoes/parcelas/${programacao.parcelaId}/solicitar-pagamento`
                : `/api/contratacoes/parcelas/${programacao.parcelaId}`, {
                method: novaSolicitacao ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data_solicitacao: programacao.data_solicitacao,
                    data_prevista: programacao.data_prevista,
                    motivo: programacao.motivo || undefined,
                }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao programar pagamento');
            const data = await r.json();
            if (data.email_preview) setEmailPreview(data.email_preview);
            setProgramacao(null);
            await load();
        } catch (e: any) {
            setErro(e.message);
        }
    }

    /** Desfaz o adiantamento: apaga a parcela e o valor volta para o SALDO. */
    async function desfazerAdiantamento(p: any) {
        if (!confirm(`Desfazer o adiantamento de ${fmtMoeda(p.valor)}? O valor volta para o saldo pendente.`)) return;
        setErro('');
        try {
            const r = await fetch(`/api/contratacoes/parcelas/${p.id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao desfazer');
            await load();
        } catch (e: any) { setErro(e.message); }
    }

    async function salvarValorParcela(parcelaId: string) {
        const valor = Number(String(valorParcela).replace(',', '.'));
        if (!Number.isFinite(valor) || valor <= 0) { setErro('Informe um valor maior que zero'); return; }
        setErro('');
        try {
            const r = await fetch(`/api/contratacoes/parcelas/${parcelaId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ valor }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao alterar a parcela');
            setEditandoParcela(null);
            await load();
        } catch (e: any) { setErro(e.message); }
    }

    /**
     * Adianta uma fatia do contrato. O numero digitado e PERCENTUAL do valor
     * contratado — e assim que a LS negocia ("adiantar mais 30%") — e o restante
     * volta como SALDO pendente pela reconciliacao do backend.
     */
    async function dividirParcela(parcelaId: string, restante: number, contratado: number) {
        const pct = Number(String(valorParcela).replace(',', '.'));
        if (!Number.isFinite(pct) || pct <= 0) { setErro('Informe o percentual a adiantar'); return; }
        const valor = Math.round((contratado * pct / 100) * 100) / 100;
        if (valor > restante + 0.01) {
            setErro(`${pct}% do contrato são ${fmtMoeda(valor)}, mais que os ${fmtMoeda(restante)} desta parcela`);
            return;
        }
        setErro('');
        try {
            // So ajusta esta parcela: o backend devolve a diferenca como SALDO
            // pendente, mantendo a soma igual ao valor contratado.
            const r = await fetch(`/api/contratacoes/parcelas/${parcelaId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ valor, tipo: 'PARCELA' }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao ajustar a parcela');
            setDividindo(null);
            await load();
        } catch (e: any) { setErro(e.message); }
    }

    async function gerarEmailPagamento(parcelaId: string) {
        setGerandoEmail(parcelaId);
        setParcelaDoEmail(parcelaId);
        setErro('');
        try {
            const r = await fetch(`/api/contratacoes/parcelas/${parcelaId}/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ link_diretorio: linkDiretorio || null }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao gerar o e-mail');
            setEmailPagamento(await r.json());
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setGerandoEmail(null);
        }
    }

    /** Copia como HTML, para colar no Outlook/Gmail com a formatacao intacta. */
    async function copiarEmail(html: string, assunto: string) {
        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobTexto = new Blob([assunto], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobTexto })]);
            setCopiado('corpo');
        } catch {
            // Navegador sem suporte a HTML na area de transferencia: cai para texto.
            await navigator.clipboard.writeText(html);
            setCopiado('corpo');
        }
        setTimeout(() => setCopiado(''), 2500);
    }

    async function mudarStatusParcela(parcela: any, status: string) {
        if (status === 'SOLICITADO' && parcela.status === 'PENDENTE') {
            abrirProgramacao(parcela);
            return;
        }
        if (status === 'PENDENTE' && parcela.status !== 'PENDENTE') {
            await cancelarSolicitacaoPagamento(parcela);
            return;
        }
        await fetch(`/api/contratacoes/parcelas/${parcela.id}/status`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
        });
        await load();
    }

    async function gerarContrato(contratacaoId: string) {
        setGerandoContrato(contratacaoId);
        setErro('');
        try {
            const r = await fetch(`/api/contratos/contratacoes/${contratacaoId}`, { method: 'POST' });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao gerar contrato');
            await load();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setGerandoContrato(null);
        }
    }

    async function mudarStatusContrato(contratoId: string, status: string) {
        await fetch(`/api/contratos/${contratoId}/status`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
        });
        await load();
    }

    function clicarAnexarContrato(contratoId: string) {
        contratoAlvoRef.current = contratoId;
        fileInputRef.current?.click();
    }

    async function onArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        const contratoId = contratoAlvoRef.current;
        e.target.value = '';
        if (!file || !contratoId) return;
        setAnexandoContrato(contratoId);
        setErro('');
        try {
            const formData = new FormData();
            formData.append('arquivo', file);
            const r = await fetch(`/api/contratos/${contratoId}/arquivos`, { method: 'POST', body: formData });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao anexar o contrato assinado');
            await load();
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setAnexandoContrato(null);
        }
    }

    async function cancelarSolicitacaoPagamento(p: any) {
        if (!confirm(`Excluir a solicitação de ${fmtMoeda(p.valor)}? A parcela continuará no contrato e voltará para PENDENTE.`)) return;
        setErro('');
        try {
            const r = await fetch(`/api/contratacoes/parcelas/${p.id}/cancelar-solicitacao`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ motivo_cancelamento: 'Solicitação excluída pelo usuário antes do pagamento' }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao excluir a solicitação');
            await load();
        } catch (e: any) { setErro(e.message); }
    }

    function clicarAnexarComprovante(parcela: any) {
        comprovanteAlvoRef.current = parcela;
        comprovanteInputRef.current?.click();
    }

    async function onComprovanteSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        const parcela = comprovanteAlvoRef.current;
        e.target.value = '';
        if (!file || !parcela) return;
        setAnexandoComprovante(parcela.id);
        setErro('');
        try {
            const arquivo_base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(new Error('Não foi possível ler o comprovante'));
                reader.readAsDataURL(file);
            });
            const r = await fetch(`/api/pagamentos/PARCELA/${parcela.id}/comprovante`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ arquivo_base64 }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao anexar comprovante');
            await load();
        } catch (e: any) { setErro(e.message); }
        finally { setAnexandoComprovante(null); }
    }

    async function removerComprovante(parcela: any) {
        if (!confirm('Remover o comprovante anexado?')) return;
        const r = await fetch(`/api/pagamentos/PARCELA/${parcela.id}/comprovante`, { method: 'DELETE' });
        if (!r.ok) { setErro((await r.json()).error || 'Erro ao remover comprovante'); return; }
        await load();
    }

    async function mudarFormaParcela(parcela: any, forma_pagamento: string) {
        if (forma_pagamento === 'CARTAO_CREDITO' && !cartoes.length) {
            setErro('Cadastre um cartão corporativo em Configurações antes de selecioná-lo');
            return;
        }
        const r = await fetch(`/api/contratacoes/parcelas/${parcela.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ forma_pagamento, cartao_id: forma_pagamento === 'CARTAO_CREDITO' ? cartoes[0]?.id : null }),
        });
        if (!r.ok) { setErro((await r.json()).error || 'Erro ao alterar forma de pagamento'); return; }
        await load();
    }

    async function removerArquivoContrato(arquivoId: string) {
        if (!confirm('Remover este anexo?')) return;
        await fetch(`/api/contratos/arquivos/${arquivoId}`, { method: 'DELETE' });
        await load();
    }

    async function abrirModeloContrato() {
        setErro('');
        try {
            const r = await fetch('/api/contratos/templates');
            if (!r.ok) throw new Error('Erro ao carregar o modelo de contrato');
            const data = await r.json();
            setTemplate(data);
            setTemplateDraft(data.corpo_html);
            setShowTemplateModal(true);
        } catch (e: any) {
            setErro(e.message);
        }
    }

    async function salvarModeloContrato() {
        if (!template) return;
        setSalvandoTemplate(true);
        setErro('');
        try {
            const r = await fetch(`/api/contratos/templates/${template.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ corpo_html: templateDraft }),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao salvar o modelo');
            setShowTemplateModal(false);
        } catch (e: any) {
            setErro(e.message);
        } finally {
            setSalvandoTemplate(false);
        }
    }

    if (loading) return <div className="text-center py-10 text-muted-foreground text-sm">Carregando...</div>;

    return (
        <Card title="Pagamentos" action={
            <div className="flex gap-2">
                <GhostButton onClick={abrirModeloContrato}><Settings size={13} className="inline mr-1" />Modelo de Contrato</GhostButton>
                <PrimaryButton onClick={() => setShowForm(v => !v)}><Plus size={13} className="inline mr-1" />Novo Pagamento</PrimaryButton>
            </div>
        }>
            <ErrorBanner message={erro} />
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx" className="hidden" onChange={onArquivoSelecionado} />
            <input ref={comprovanteInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={onComprovanteSelecionado} />

            {showForm && (
                <div className="border border-border rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Favorecido">
                            <select className={inputClass} value={form.favorecido} onChange={e => {
                                const valor = e.target.value;
                                const isFuncionario = valor.startsWith('funcionario:');
                                const pessoa = isFuncionario
                                    ? funcionarios.find(f => f.id === valor.slice(12))
                                    : suppliers.find(s => s.id === valor.slice(9));
                                const forma = isFuncionario ? (pessoa?.forma_pagamento || (pessoa?.pix_chave ? 'PIX' : 'TED')) : (pessoa?.forma_pagamento || '');
                                setForm(f => ({ ...f, favorecido: valor, forma_pagamento: forma, cartao_id: forma === 'CARTAO_CREDITO' ? (cartoes[0]?.id || '') : '' }));
                            }}>
                                <option value="">Selecione...</option>
                                <optgroup label="Fornecedores e prestadores">
                                    {suppliers.map(s => <option key={s.id} value={`supplier:${s.id}`}>{s.nome}</option>)}
                                </optgroup>
                                <optgroup label="Funcionários LS">
                                    {funcionarios.map(f => <option key={f.id} value={`funcionario:${f.id}`}>{f.nome}{f.cargo ? ` · ${f.cargo}` : ''}</option>)}
                                </optgroup>
                            </select>
                        </Field>
                        <Field label="Finalidade">
                            <select className={inputClass} value={form.finalidade} onChange={e => setForm(f => ({
                                ...f, finalidade: e.target.value,
                                data_solicitacao: ['ADIANTAMENTO_VIAGEM', 'REEMBOLSO'].includes(e.target.value) ? (f.data_solicitacao || hojeLocal()) : f.data_solicitacao,
                                forma_pagamento: ['ADIANTAMENTO_VIAGEM', 'REEMBOLSO'].includes(e.target.value) && f.forma_pagamento === 'CARTAO_CREDITO' ? 'PIX' : f.forma_pagamento,
                                formalizacao_posterior: ['ADIANTAMENTO_VIAGEM', 'REEMBOLSO'].includes(e.target.value) ? false : f.formalizacao_posterior,
                            }))}>
                                {FINALIDADES.map(f => <option key={f} value={f}>{FINALIDADE_LABEL[f]}</option>)}
                            </select>
                        </Field>
                        <Field label={form.finalidade === 'ADIANTAMENTO_VIAGEM' ? 'Valor do adiantamento (R$)' : form.finalidade === 'REEMBOLSO' ? 'Valor do reembolso (R$)' : 'Valor contratado (R$)'}>
                            <input type="number" step="0.01" className={inputClass} value={form.valor_contratado} onChange={e => setForm(f => ({ ...f, valor_contratado: e.target.value }))} />
                        </Field>
                        {form.finalidade === 'ADIANTAMENTO_VIAGEM' ? <>
                        <Field label="Destino da viagem"><input className={inputClass} value={form.destino} onChange={e => setForm(f => ({ ...f, destino: e.target.value }))} placeholder="Cidade/UF ou trecho" /></Field>
                        <Field label="Início da viagem"><input type="date" className={inputClass} value={form.data_inicio_viagem} onChange={e => setForm(f => ({ ...f, data_inicio_viagem: e.target.value }))} /></Field>
                        <Field label="Fim da viagem"><input type="date" className={inputClass} value={form.data_fim_viagem} onChange={e => setForm(f => ({ ...f, data_fim_viagem: e.target.value }))} /></Field>
                        <Field label="Motivo / observações"><input className={inputClass} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></Field>
                        </> : form.finalidade === 'REEMBOLSO' ? <>
                        <Field label="Data da despesa"><input type="date" className={inputClass} value={form.data_despesa} onChange={e => setForm(f => ({ ...f, data_despesa: e.target.value }))} /></Field>
                        <Field label="Motivo do reembolso"><input className={inputClass} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Descreva a despesa reembolsada" /></Field>
                        </> : form.formalizacao_posterior ? null : <><Field label="Gatilho do Saldo">
                            <select className={inputClass} value={form.gatilho_saldo} onChange={e => setForm(f => ({ ...f, gatilho_saldo: e.target.value }))}>
                                <option value="INICIO">Início</option>
                                <option value="MARCO">Marco</option>
                                <option value="CONCLUSAO">Conclusão</option>
                            </select>
                        </Field>
                        <Field label="% Entrada">
                            <input type="number" className={inputClass} value={form.percentual_entrada} onChange={e => setForm(f => ({ ...f, percentual_entrada: e.target.value, percentual_saldo: String(100 - parseFloat(e.target.value || '0')) }))} />
                        </Field>
                        <Field label="% Saldo">
                            <input type="number" className={inputClass} value={form.percentual_saldo} onChange={e => setForm(f => ({ ...f, percentual_saldo: e.target.value }))} />
                        </Field>
                        <Field label="Forma de pagamento">
                            <select className={inputClass} value={form.forma_pagamento} onChange={e => setForm(f => ({
                                ...f, forma_pagamento: e.target.value,
                                cartao_id: e.target.value === 'CARTAO_CREDITO' ? (f.cartao_id || cartoes[0]?.id || '') : '',
                                formalizacao_posterior: e.target.value === 'CARTAO_CREDITO' ? f.formalizacao_posterior : false,
                            }))}>
                                <option value="">Selecione...</option>
                                <option value="PIX">PIX</option>
                                <option value="TED">Transferência bancária</option>
                                {!['ADIANTAMENTO_VIAGEM', 'REEMBOLSO'].includes(form.finalidade) && <option value="CARTAO_CREDITO">Cartão de crédito corporativo</option>}
                                <option value="BOLETO">Boleto</option>
                                <option value="DINHEIRO">Dinheiro</option>
                            </select>
                        </Field>
                        {form.forma_pagamento === 'CARTAO_CREDITO' && <>
                            <Field label="Cartão corporativo">
                                <select className={inputClass} value={form.cartao_id} onChange={e => setForm(f => ({ ...f, cartao_id: e.target.value }))}>
                                    <option value="">Selecione...</option>
                                    {cartoes.map(c => <option key={c.id} value={c.id}>{c.bandeira} •••• {c.final}{c.apelido ? ` · ${c.apelido}` : ''}</option>)}
                                </select>
                            </Field>
                            <label className="col-span-2 flex items-start gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                                <input type="checkbox" className="mt-0.5" checked={form.formalizacao_posterior} onChange={e => setForm(f => ({
                                    ...f, formalizacao_posterior: e.target.checked,
                                    percentual_entrada: e.target.checked ? '0' : f.percentual_entrada,
                                    percentual_saldo: e.target.checked ? '100' : f.percentual_saldo,
                                    data_compra_cartao: e.target.checked ? (f.data_compra_cartao || hojeLocal()) : '',
                                }))} />
                                <span><strong>Compra já realizada no cartão</strong><br/><span className="text-muted-foreground">Registra e formaliza a compra sem solicitar nova transferência ao fornecedor. O desembolso ocorre na quitação da fatura.</span></span>
                            </label>
                            {form.formalizacao_posterior && <>
                                <Field label="Data da compra"><input type="date" className={inputClass} value={form.data_compra_cartao} onChange={e => setForm(f => ({ ...f, data_compra_cartao: e.target.value }))}/></Field>
                                <Field label="Referência da fatura (opcional)"><input className={inputClass} value={form.fatura_referencia} onChange={e => setForm(f => ({ ...f, fatura_referencia: e.target.value }))} placeholder="Ex.: VISA 09/2026"/></Field>
                            </>}
                        </>}
                        </>}
                        {['ADIANTAMENTO_VIAGEM', 'REEMBOLSO'].includes(form.finalidade) && <>
                            <Field label="Data da solicitação"><input type="date" className={inputClass} value={form.data_solicitacao} onChange={e => setForm(f => ({ ...f, data_solicitacao: e.target.value }))}/></Field>
                            <Field label="Data prevista para pagamento"><input type="date" className={inputClass} value={form.data_prevista} onChange={e => setForm(f => ({ ...f, data_prevista: e.target.value }))}/></Field>
                        </>}
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                        <GhostButton onClick={() => setShowForm(false)}>Cancelar</GhostButton>
                        <PrimaryButton onClick={criar} disabled={salvando || !form.favorecido || !form.valor_contratado || !form.forma_pagamento || (form.forma_pagamento === 'CARTAO_CREDITO' && !form.cartao_id) || (form.formalizacao_posterior && !form.data_compra_cartao) || (form.finalidade === 'ADIANTAMENTO_VIAGEM' && !form.destino) || (['ADIANTAMENTO_VIAGEM', 'REEMBOLSO'].includes(form.finalidade) && (!form.data_solicitacao || !form.data_prevista))}>Registrar</PrimaryButton>
                    </div>
                </div>
            )}

            {contratacoes.length === 0 ? (
                <EmptyState text="Nenhum fornecedor contratado para esta atividade ainda." />
            ) : (
                <div className="flex flex-col gap-3">
                    {contratacoes.map(c => (
                        <div key={c.id} className="border border-border rounded-lg p-3">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="text-sm font-semibold">{c.supplier?.nome || c.funcionario?.nome}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {c.finalidade.replace(/_/g, ' ')} · Contratado <strong className="text-foreground">{fmtMoeda(c.valor_contratado)}</strong>
                                        {(() => {
                                            const alocado = (c.parcelas || []).reduce((s: number, p: any) => s + p.valor, 0);
                                            const dif = Math.round((c.valor_contratado - alocado) * 100) / 100;
                                            if (Math.abs(dif) < 0.01) return null;
                                            return <span className="text-amber-500"> · a alocar {fmtMoeda(dif)}</span>;
                                        })()}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!c.contrato ? (
                                        <GhostButton onClick={() => gerarContrato(c.id)} disabled={gerandoContrato === c.id}>
                                            <FileText size={13} className="inline mr-1" />{gerandoContrato === c.id ? 'Gerando...' : 'Gerar Contrato'}
                                        </GhostButton>
                                    ) : (
                                        <>
                                            <a href={`/api/contratos/${c.contrato.id}/export/html`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                                                <FileText size={13} />Ver / Baixar
                                            </a>
                                            <select
                                                value={c.contrato.status}
                                                onChange={e => mudarStatusContrato(c.contrato.id, e.target.value)}
                                                className="text-[10px] font-bold rounded px-1.5 py-1 border-0"
                                                style={{ background: `${CONTRATO_STATUS_COLOR[c.contrato.status]}22`, color: CONTRATO_STATUS_COLOR[c.contrato.status] }}
                                            >
                                                {CONTRATO_STATUS.map(s => <option key={s} value={s}>{CONTRATO_STATUS_LABEL[s]}</option>)}
                                            </select>
                                            <GhostButton onClick={() => clicarAnexarContrato(c.contrato.id)} disabled={anexandoContrato === c.contrato.id}>
                                                <Paperclip size={13} className="inline mr-1" />{anexandoContrato === c.contrato.id ? 'Enviando...' : 'Anexar Assinado'}
                                            </GhostButton>
                                        </>
                                    )}
                                </div>
                            </div>

                            {c.contrato?.arquivos?.length > 0 && (
                                <div className="flex flex-col gap-1 mb-2">
                                    {c.contrato.arquivos.map((a: any) => (
                                        <div key={a.id} className="flex items-center justify-between gap-2 text-xs bg-secondary/30 rounded px-2 py-1.5">
                                            <a href={`/api/contratos/arquivos/${a.id}/download`} className="text-primary hover:underline flex items-center gap-1.5 min-w-0">
                                                <Paperclip size={12} className="flex-shrink-0" /><span className="truncate">{a.nome_original}</span>
                                            </a>
                                            <button onClick={() => removerArquivoContrato(a.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0"><Trash2 size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5">
                                {c.parcelas.map((p: any) => (
                                    <div key={p.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-lg px-2.5 py-2">
                                        <div className="text-xs flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold">{p.tipo}</span>
                                            <span className="text-muted-foreground">({p.percentual}%)</span>
                                            {dividindo === p.id ? (
                                                <>
                                                    <span className="text-muted-foreground">adiantar</span>
                                                    <input
                                                        autoFocus type="number" step="1" min="0" max="100"
                                                        className={`${inputClass} h-7 w-16 text-right text-xs`}
                                                        value={valorParcela}
                                                        onChange={e => setValorParcela(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Escape') setDividindo(null);
                                                            if (e.key === 'Enter') dividirParcela(p.id, p.valor, c.valor_contratado);
                                                        }}
                                                    />
                                                    <span className="text-muted-foreground">% do contrato =</span>
                                                    <strong className="text-emerald-500">
                                                        {fmtMoeda(Math.round((c.valor_contratado * (Number(String(valorParcela).replace(',', '.')) || 0) / 100) * 100) / 100)}
                                                    </strong>
                                                    {[10, 20, 30, 40, 50].map(v => (
                                                        <button key={v} onClick={() => setValorParcela(String(v))}
                                                            className="px-1.5 border border-border text-[10px] text-muted-foreground hover:text-foreground">
                                                            {v}%
                                                        </button>
                                                    ))}
                                                    <button onClick={() => dividirParcela(p.id, p.valor, c.valor_contratado)} className="text-emerald-500 font-semibold hover:underline">aplicar</button>
                                                    <button onClick={() => setDividindo(null)} className="text-muted-foreground hover:underline">cancelar</button>
                                                    <span className="text-[10px] text-muted-foreground">o restante volta como SALDO</span>
                                                </>
                                            ) : editandoParcela === p.id ? (
                                                <>
                                                    <span className="text-muted-foreground">R$</span>
                                                    <input
                                                        autoFocus type="number" step="0.01" min="0"
                                                        className={`${inputClass} h-7 w-28 text-right text-xs`}
                                                        value={valorParcela}
                                                        onChange={e => setValorParcela(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Escape') setEditandoParcela(null);
                                                            if (e.key === 'Enter') salvarValorParcela(p.id);
                                                        }}
                                                    />
                                                    <button onClick={() => salvarValorParcela(p.id)} className="text-emerald-500 font-semibold hover:underline">salvar</button>
                                                    <button onClick={() => setEditandoParcela(null)} className="text-muted-foreground hover:underline">cancelar</button>
                                                </>
                                            ) : (
                                                <span className="font-semibold">{fmtMoeda(p.valor)}</span>
                                            )}
                                            {(p.data_solicitacao || p.data_prevista) && <span className="text-[10px] text-muted-foreground border-l border-border pl-2">
                                                Solicitado: {p.data_solicitacao ? fmtData(p.data_solicitacao) : '—'} · Previsto: {p.data_prevista ? fmtData(p.data_prevista) : '—'}
                                            </span>}
                                            <span className="text-[10px] font-semibold text-sky-400 border-l border-border pl-2 flex items-center gap-1">
                                                <select className="bg-transparent border-0 text-sky-400 font-semibold text-[10px]" value={p.forma_pagamento || c.supplier?.forma_pagamento || (c.funcionario?.pix_chave ? 'PIX' : 'TED')} onChange={e => mudarFormaParcela(p, e.target.value)}>
                                                    {Object.entries(FORMA_LABEL).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                                                </select>
                                                {p.cartao_bandeira && p.cartao_final ? ` · ${p.cartao_bandeira} •••• ${p.cartao_final}` : ''}
                                            </span>
                                            {p.formalizacao_posterior && <span className="text-[10px] text-amber-400">Compra formalizada após uso do cartão{p.fatura_referencia ? ` · Fatura ${p.fatura_referencia}` : ''}</span>}
                                            <span className={`text-[10px] ${p.comprovante_url ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                                                {p.comprovante_url ? 'Comprovante anexado' : 'Sem comprovante'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {!['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(p.status)
                                                && editandoParcela !== p.id && dividindo !== p.id && (
                                                <>
                                                    <button
                                                        onClick={() => { setEditandoParcela(p.id); setDividindo(null); setValorParcela(String(p.valor)); }}
                                                        title="Alterar o valor desta parcela sem mexer no contrato"
                                                        className="text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:underline"
                                                    >
                                                        Editar valor
                                                    </button>
                                                    <button
                                                        onClick={() => { setDividindo(p.id); setEditandoParcela(null); setValorParcela(''); }}
                                                        title="Adiantar parte agora e deixar o restante em uma nova parcela"
                                                        className="text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:underline"
                                                    >
                                                        Adiantar %
                                                    </button>
                                                    {p.tipo === 'PARCELA' && (c.parcelas || []).length > 1 && (
                                                        <button
                                                            onClick={() => desfazerAdiantamento(p)}
                                                            title="Devolve este valor ao saldo pendente"
                                                            className="text-[11px] font-semibold text-muted-foreground hover:text-red-400 hover:underline"
                                                        >
                                                            Desfazer
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                            <button
                                                onClick={() => gerarEmailPagamento(p.id)}
                                                disabled={gerandoEmail === p.id}
                                                title="Gerar e-mail de programacao de pagamento (template LS Office)"
                                                className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
                                            >
                                                <Mail size={13} /> {gerandoEmail === p.id ? 'Gerando...' : (p.formalizacao_posterior ? 'E-mail de formalização' : 'E-mail de pagamento')}
                                            </button>
                                            {p.comprovante_url ? <>
                                                <a href={p.comprovante_url} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-emerald-400 hover:underline flex items-center gap-1"><FileText size={12}/>Ver comprovante</a>
                                                <button onClick={() => removerComprovante(p)} className="text-[11px] text-muted-foreground hover:text-red-400">Remover</button>
                                            </> : (
                                                <button onClick={() => clicarAnexarComprovante(p)} disabled={anexandoComprovante === p.id} className="text-[11px] font-semibold text-muted-foreground hover:text-primary flex items-center gap-1 disabled:opacity-50">
                                                    <Paperclip size={12}/>{anexandoComprovante === p.id ? 'Enviando...' : 'Anexar comprovante'}
                                                </button>
                                            )}
                                            {p.status !== 'PENDENTE' && (
                                                <button onClick={() => abrirProgramacao(p)} className="text-[11px] text-muted-foreground hover:text-primary hover:underline">Editar datas</button>
                                            )}
                                            {!['PENDENTE', 'PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(p.status) && (
                                                <button
                                                    onClick={() => cancelarSolicitacaoPagamento(p)}
                                                    title="Cancela o pedido ao financeiro e mantém a parcela pendente no contrato"
                                                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-400"
                                                >
                                                    <Trash2 size={12}/> Excluir solicitação
                                                </button>
                                            )}
                                            {p.status === 'PENDENTE' && (
                                                <GhostButton onClick={() => abrirProgramacao(p)}>Solicitar Pagamento</GhostButton>
                                            )}
                                            <PagamentoStatusSelect value={p.status} onChange={status => mudarStatusParcela(p, status)} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {programacao && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9000] p-4" onClick={() => setProgramacao(null)}>
                    <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4">
                            <div><h3 className="text-base font-bold">Programar pagamento</h3><p className="text-xs text-muted-foreground mt-1">Estas datas aparecerão no Controle de Pagamentos.</p></div>
                            <button onClick={() => setProgramacao(null)} className="text-muted-foreground hover:text-foreground"><X size={18}/></button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Data da solicitação">
                                <input type="date" className={inputClass} value={programacao.data_solicitacao} onChange={e => setProgramacao(p => p && ({ ...p, data_solicitacao: e.target.value }))}/>
                            </Field>
                            <Field label="Data prevista para pagamento">
                                <input type="date" className={inputClass} value={programacao.data_prevista} onChange={e => setProgramacao(p => p && ({ ...p, data_prevista: e.target.value }))}/>
                            </Field>
                            {programacao.statusAtual === 'PENDENTE' && <div className="col-span-2"><Field label="Motivo / observação para o financeiro">
                                <textarea className={inputClass} rows={3} value={programacao.motivo} onChange={e => setProgramacao(p => p && ({ ...p, motivo: e.target.value }))} placeholder="Ex.: pagamento de mobilização, saldo após conclusão..." />
                            </Field></div>}
                        </div>
                        <div className="flex justify-end gap-2 mt-5"><GhostButton onClick={() => setProgramacao(null)}>Cancelar</GhostButton><PrimaryButton onClick={salvarProgramacaoPagamento} disabled={!programacao.data_solicitacao || !programacao.data_prevista}>Confirmar programação</PrimaryButton></div>
                    </div>
                </div>
            )}

            {showTemplateModal && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9000] p-4">
                    <div className="bg-card border border-border rounded-2xl w-full max-w-2xl p-6">
                        <h3 className="text-base font-bold mb-1">Modelo de Contrato de Prestação de Serviço</h3>
                        <p className="text-xs text-muted-foreground mb-3">
                            Texto/HTML padrão usado para gerar o contrato de qualquer fornecedor contratado. Use marcadores
                            como <code className="bg-secondary/60 px-1 rounded">{'{{fornecedor.nome}}'}</code>, <code className="bg-secondary/60 px-1 rounded">{'{{atividade.escopo}}'}</code>,{' '}
                            <code className="bg-secondary/60 px-1 rounded">{'{{contratacao.valor_contratado}}'}</code> — eles são substituídos pelos dados reais na hora de gerar.
                        </p>
                        <textarea
                            rows={16}
                            className={`${inputClass} font-mono text-xs resize-y`}
                            value={templateDraft}
                            onChange={e => setTemplateDraft(e.target.value)}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <GhostButton onClick={() => setShowTemplateModal(false)}>Cancelar</GhostButton>
                            <PrimaryButton onClick={salvarModeloContrato} disabled={salvandoTemplate}>{salvandoTemplate ? 'Salvando...' : 'Salvar Modelo'}</PrimaryButton>
                        </div>
                    </div>
                </div>
            )}

            {emailPagamento && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9000] p-4">
                    <div className="bg-card border border-border rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
                        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
                            <div className="min-w-0">
                                <h3 className="text-base font-bold">{emailPagamento.resumo?.formalizacao_posterior ? 'E-mail de formalização da compra' : 'E-mail de programação de pagamento'}</h3>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Revise e copie. O envio e manual, de proposito: pagamento nao sai daqui sem alguem conferir.
                                </p>
                            </div>
                            <button onClick={() => setEmailPagamento(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
                        </div>

                        <div className="px-5 py-3 border-b border-border space-y-2 text-xs">
                            <div className="flex flex-wrap gap-x-6 gap-y-1">
                                {emailPagamento.para && (
                                    <span><span className="text-muted-foreground">Para:</span> <strong>{emailPagamento.para}</strong></span>
                                )}
                                <span><span className="text-muted-foreground">Favorecido:</span> <strong>{emailPagamento.resumo?.fornecedor}</strong></span>
                                {emailPagamento.resumo?.razao_social && emailPagamento.resumo.razao_social !== emailPagamento.resumo.fornecedor && (
                                    <span><span className="text-muted-foreground">Razao social:</span> <strong>{emailPagamento.resumo.razao_social}</strong></span>
                                )}
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-muted-foreground shrink-0 pt-0.5">Assunto:</span>
                                <span className="font-mono text-[11px] break-all">{emailPagamento.assunto}</span>
                                <button
                                    onClick={() => { navigator.clipboard.writeText(emailPagamento.assunto); setCopiado('assunto'); setTimeout(() => setCopiado(''), 2500); }}
                                    className="shrink-0 flex items-center gap-1 text-primary hover:underline"
                                >
                                    <Copy size={12} /> {copiado === 'assunto' ? 'copiado' : 'copiar'}
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1">
                                <span className="text-muted-foreground">Contratado <strong className="text-foreground">{fmtMoeda(emailPagamento.resumo?.valor_total || 0)}</strong></span>
                                <span className="text-muted-foreground">Ja pago <strong className="text-foreground">{fmtMoeda(emailPagamento.resumo?.valor_pago || 0)}</strong></span>
                                <span className="text-emerald-500 font-semibold">{emailPagamento.resumo?.formalizacao_posterior ? 'Compra formalizada' : 'Esta programação'} {fmtMoeda(emailPagamento.resumo?.valor_pagamento || 0)}</span>
                                <span className="text-amber-500">Saldo {fmtMoeda(emailPagamento.resumo?.saldo || 0)}</span>
                            </div>
                            {emailPagamento.resumo?.sem_dados_bancarios && (
                                <div className="mt-1 rounded border border-red-500/45 bg-red-500/10 px-2.5 py-1.5 text-red-400">
                                    Este fornecedor nao tem banco nem PIX cadastrado. O e-mail sai sem os dados para pagamento.
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto bg-[#F4F6F8] p-3">
                            <iframe
                                title="Previa do e-mail"
                                srcDoc={emailPagamento.html}
                                className="w-full bg-white border-0"
                                style={{ height: 1500 }}
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
                            <GhostButton onClick={() => setEmailPagamento(null)}>Fechar</GhostButton>
                            <a
                                href={`/api/contratacoes/parcelas/${parcelaDoEmail}/email.eml${linkDiretorio ? `?link_diretorio=${encodeURIComponent(linkDiretorio)}` : ''}`}
                                className="h-9 px-3 border border-border bg-secondary hover:bg-secondary/70 text-sm font-semibold flex items-center gap-2"
                                title="Baixa um .eml — abrir no Outlook cria a mensagem pronta para enviar"
                            >
                                <Mail size={15} /> Abrir no Outlook
                            </a>
                            <PrimaryButton onClick={() => copiarEmail(emailPagamento.html, emailPagamento.assunto)}>
                                {copiado === 'corpo' ? 'Copiado' : 'Copiar e-mail'}
                            </PrimaryButton>
                        </div>
                    </div>
                </div>
            )}

            <PrestacaoContasViagem atividade={atividade} refreshKey={adiantamentoRefresh} />

            {emailPreview && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9000] p-4" onClick={() => setEmailPreview(null)}>
                    <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-bold mb-3">Solicitação de Pagamento gerada</h3>
                        <pre className="text-xs whitespace-pre-wrap bg-secondary/40 rounded-lg p-3 font-mono">{emailPreview}</pre>
                        <div className="flex justify-end mt-4">
                            <GhostButton onClick={() => setEmailPreview(null)}>Fechar</GhostButton>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}
