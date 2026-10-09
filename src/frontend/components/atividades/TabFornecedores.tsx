import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Settings, Paperclip, Trash2, Mail, Copy, X } from 'lucide-react';
import type { AtividadeDetalhe } from './AtividadeCockpit';
import { Card, Field, PrimaryButton, GhostButton, inputClass, ErrorBanner, EmptyState } from './ui';
import { fmtData, fmtMoeda } from './constants';
import PrestacaoContasViagem from './PrestacaoContasViagem';
import PagamentoStatusSelect from './PagamentoStatusSelect';
import { FinancialActionMenu, FinancialAttachments, FinancialBeneficiaryCard, FinancialPaymentCard, type FinancialAction } from '../financeiro/FinancialCards';
import { authFetch, downloadAuthenticatedFile } from '../../lib/authFetch';
import PaymentAttachments from '../financeiro/PaymentAttachments';
import FuncionarioFormModal from '../cadastros/FuncionarioFormModal';
import FornecedorFormModal from '../cadastros/FornecedorFormModal';
import AvisoSemAssinatura from '../perfil/AvisoSemAssinatura';
import { usePermissao } from '../../lib/permissoes';

const CONTRATO_STATUS = ['GERADO', 'ENVIADO', 'ASSINADO'];
const CONTRATO_STATUS_LABEL: Record<string, string> = { GERADO: 'Gerado', ENVIADO: 'Enviado', ASSINADO: 'Assinado' };
const CONTRATO_STATUS_TOM: Record<string, string> = { GERADO: 'bg-muted text-muted-foreground', ENVIADO: 'bg-warn/15 text-warn', ASSINADO: 'bg-ok/15 text-ok' };
const PARCELA_TIPO_LABEL: Record<string, string> = { UNICA: 'Parcela única', ENTRADA: 'Entrada', SALDO: 'Saldo', PARCELA: 'Parcela', ADIANTAMENTO: 'Adiantamento' };

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
    processo_tipo: 'PAYMENT_REQUEST', formalizacao_posterior: false, data_pagamento_realizado: '', fatura_referencia: '',
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
    // Cadastro sem sair do pagamento, com as mesmas janelas da aba Pessoas e
    // Fornecedores: "Novo cadastro" (material / prestador / funcionário).
    const [cadastro, setCadastro] = useState<'PESSOA' | 'FUNCIONARIO' | null>(null);
    const podeCadastrar = usePermissao('cadastros.gerenciar');
    const [form, setForm] = useState(FORM_INIT);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    // E-mail de programacao de pagamento no template corporativo, por parcela.
    const [emailPagamento, setEmailPagamento] = useState<any | null>(null);
    const [, setGerandoEmail] = useState<string | null>(null);
    const [parcelaDoEmail, setParcelaDoEmail] = useState<string | null>(null);
    // Edicao do valor da parcela: adiantar parte do saldo e comum, e o contrato
    // nao muda por isso. Parcela paga nao entra em edicao (o backend recusa).
    const [editandoParcela, setEditandoParcela] = useState<string | null>(null);
    // Edição da contratação: guarda o id e os campos em edição, para o painel
    // abrir dentro do próprio cartão do favorecido.
    const [editandoContratacao, setEditandoContratacao] = useState<{ id: string; valor: string; observacoes: string; motivo: string } | null>(null);
    // Motivo da alteração de valor da parcela e histórico aberto por contratação.
    const [motivoParcela, setMotivoParcela] = useState('');
    const [historico, setHistorico] = useState<{ id: string; itens: any[] } | null>(null);
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
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [template, setTemplate] = useState<{ id: string; corpo_html: string } | null>(null);
    const [templateDraft, setTemplateDraft] = useState('');
    const [salvandoTemplate, setSalvandoTemplate] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [cR, sR, fR, eR] = await Promise.all([
                authFetch(`/api/contratacoes?atividade_id=${atividade.id}`),
                authFetch('/api/suppliers?limit=200'),
                authFetch('/api/funcionarios'),
                authFetch('/api/empresa'),
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
                const criado = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(criado.error || 'Erro ao criar adiantamento');
                // Acima do limite de quem pediu, o processo nasce PENDENTE e vai para aprovação.
                if (criado.aviso) alert(criado.aviso);
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
                    processo_tipo: form.processo_tipo,
                    formalizacao_posterior: form.processo_tipo === 'PAYMENT_FORMALIZATION',
                    data_pagamento: form.processo_tipo === 'PAYMENT_FORMALIZATION' ? form.data_pagamento_realizado : null,
                    data_compra_cartao: form.processo_tipo === 'PAYMENT_FORMALIZATION' && form.forma_pagamento === 'CARTAO_CREDITO' ? form.data_pagamento_realizado : null,
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
            const r = await authFetch(novaSolicitacao
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
            await r.json();
            setProgramacao(null);
            await load();
            if (novaSolicitacao) await gerarEmailPagamento(programacao.parcelaId);
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

    /**
     * Exclui a parcela — a linha de pagamento em si, não só a solicitação.
     *
     * "Excluir solicitação" devolve a parcela para PENDENTE e ela continua no
     * contrato; era a única exclusão disponível, e não dava conta de uma linha
     * lançada errada. O backend recusa parcela já paga.
     */
    async function excluirParcela(p: any) {
        if (!confirm(`Excluir o pagamento de ${fmtMoeda(p.valor)} (${p.tipo})?\n\nA linha sai do contrato e o valor volta para o saldo não alocado. Esta ação não pode ser desfeita.`)) return;
        setErro('');
        try {
            const r = await fetch(`/api/contratacoes/parcelas/${p.id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao excluir o pagamento');
            await load();
        } catch (e: any) { setErro(e.message); }
    }

    /** Exclui a contratação inteira: parcelas, contrato gerado e anexos. */
    async function excluirContratacao(c: any) {
        const nome = c.supplier?.nome || c.funcionario?.nome || 'este favorecido';
        if (!confirm(`Excluir a contratação de ${nome} no valor de ${fmtMoeda(c.valor_contratado)}?\n\nSaem junto as ${(c.parcelas || []).length} parcela(s) e o contrato gerado. Esta ação não pode ser desfeita.`)) return;
        setErro('');
        try {
            const r = await fetch(`/api/contratacoes/${c.id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao excluir a contratação');
            await load();
        } catch (e: any) { setErro(e.message); }
    }

    /** Edita valor contratado e detalhamento sem recriar a contratação. */
    async function salvarContratacao(id: string, dados: { valor_contratado?: number; observacoes?: string | null; motivo?: string | null }) {
        setErro('');
        try {
            const r = await fetch(`/api/contratacoes/${id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados),
            });
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao salvar a contratação');
            setEditandoContratacao(null);
            await load();
        } catch (e: any) { setErro(e.message); }
    }

    /** Abre o histórico de alterações de valor da contratação e das parcelas. */
    async function verHistorico(contratacaoId: string) {
        if (historico?.id === contratacaoId) { setHistorico(null); return; }
        setErro('');
        try {
            const r = await fetch(`/api/contratacoes/${contratacaoId}/historico`);
            if (!r.ok) throw new Error((await r.json()).error || 'Erro ao carregar o histórico');
            setHistorico({ id: contratacaoId, itens: await r.json() });
        } catch (e: any) { setErro(e.message); }
    }

    async function salvarValorParcela(parcelaId: string) {
        const valor = Number(String(valorParcela).replace(',', '.'));
        if (!Number.isFinite(valor) || valor <= 0) { setErro('Informe um valor maior que zero'); return; }
        setErro('');
        try {
            const r = await fetch(`/api/contratacoes/parcelas/${parcelaId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ valor, motivo: motivoParcela.trim() || null }),
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
            const r = await authFetch(`/api/contratacoes/parcelas/${parcelaId}/email`, {
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

    async function abrirEmailNoOutlook() {
        if (!parcelaDoEmail) return;
        try {
            const query = linkDiretorio ? `?link_diretorio=${encodeURIComponent(linkDiretorio)}` : '';
            await downloadAuthenticatedFile(`/api/contratacoes/parcelas/${parcelaDoEmail}/email.eml${query}`, 'PROGRAMACAO_PAGAMENTO.eml');
        } catch (e: any) { setErro(e.message); }
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

    // O upload por aqui foi removido: gravava em `comprovante_url` com storage
    // próprio, paralelo à faixa Documentos, e era a origem da contradição entre
    // "comprovante anexado" no cartão e "comprovante pendente" logo abaixo.
    // `removerComprovante` continua, porque o arquivo legado ainda existe em 9
    // registros e precisa poder ser retirado.
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
                <GhostButton onClick={abrirModeloContrato}><Settings size={14} className="inline mr-1" aria-hidden />Modelo de contrato</GhostButton>
                <PrimaryButton onClick={() => setShowForm(v => !v)}><Plus size={14} className="inline mr-1" aria-hidden />Novo pagamento</PrimaryButton>
            </div>
        }>
            <ErrorBanner message={erro} />
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx" className="hidden" onChange={onArquivoSelecionado} />

            {cadastro === 'PESSOA' && (
                <FornecedorFormModal onClose={() => setCadastro(null)} onEscolherFuncionario={() => setCadastro('FUNCIONARIO')} onSaved={sup => {
                    // Entra na lista e já fica escolhido como favorecido, com a forma de pagamento dele.
                    setSuppliers(lista => [...lista.filter(x => x.id !== sup.id), sup].sort((a, b) => a.nome.localeCompare(b.nome)));
                    setForm(atual => ({ ...atual, favorecido: `supplier:${sup.id}`, forma_pagamento: sup.forma_pagamento || '', cartao_id: '' }));
                    setCadastro(null);
                }} />
            )}
            {cadastro === 'FUNCIONARIO' && (
                <FuncionarioFormModal onClose={() => setCadastro(null)} onSaved={f => {
                    setFuncionarios(lista => [...lista, f].sort((a, b) => a.nome.localeCompare(b.nome)));
                    const forma = f.forma_pagamento || (f.pix_chave ? 'PIX' : 'TED');
                    setForm(atual => ({ ...atual, favorecido: `funcionario:${f.id}`, forma_pagamento: forma, cartao_id: '' }));
                    setCadastro(null);
                }} />
            )}
            {showForm && (
                <div className="border border-border rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Favorecido">
                            <div className="flex gap-2">
                            <select className={`${inputClass} min-w-0 flex-1`} value={form.favorecido} onChange={e => {
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
                                    {funcionarios.map(f => <option key={f.id} value={`funcionario:${f.id}`}>{f.nome}{f.cargo ? ` (${f.cargo})` : ''}</option>)}
                                </optgroup>
                            </select>
                            {podeCadastrar && (
                                <button type="button" onClick={() => setCadastro('PESSOA')} title="Cadastrar fornecedor, prestador ou funcionário"
                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-semibold hover:bg-secondary/60">
                                    <Plus size={14} aria-hidden /> Cadastrar
                                </button>
                            )}
                            </div>
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
                        {!['ADIANTAMENTO_VIAGEM', 'REEMBOLSO'].includes(form.finalidade) && <Field label="Processo financeiro">
                            <select className={inputClass} value={form.processo_tipo} onChange={e => setForm(f => ({
                                ...f,
                                processo_tipo: e.target.value,
                                formalizacao_posterior: e.target.value === 'PAYMENT_FORMALIZATION',
                                percentual_entrada: e.target.value === 'PAYMENT_FORMALIZATION' ? '0' : f.percentual_entrada,
                                percentual_saldo: e.target.value === 'PAYMENT_FORMALIZATION' ? '100' : f.percentual_saldo,
                                data_pagamento_realizado: e.target.value === 'PAYMENT_FORMALIZATION' ? (f.data_pagamento_realizado || hojeLocal()) : '',
                            }))}>
                                <option value="PAYMENT_REQUEST">Solicitação de pagamento</option>
                                <option value="PAYMENT_FORMALIZATION">Formalização de pagamento já realizado</option>
                            </select>
                        </Field>}
                        <Field label={form.finalidade === 'ADIANTAMENTO_VIAGEM' ? 'Valor do adiantamento (R$)' : form.finalidade === 'REEMBOLSO' ? 'Valor do reembolso (R$)' : 'Valor contratado (R$)'}>
                            <input type="number" step="0.01" className={inputClass} value={form.valor_contratado} onChange={e => setForm(f => ({ ...f, valor_contratado: e.target.value }))} />
                        </Field>
                        {form.finalidade === 'ADIANTAMENTO_VIAGEM' ? <>
                        <Field label="Destino da viagem"><input className={inputClass} value={form.destino} onChange={e => setForm(f => ({ ...f, destino: e.target.value }))} placeholder="Cidade/UF ou trecho" /></Field>
                        <Field label="Início da viagem"><input type="date" className={inputClass} value={form.data_inicio_viagem} onChange={e => setForm(f => ({ ...f, data_inicio_viagem: e.target.value }))} /></Field>
                        <Field label="Fim da viagem"><input type="date" className={inputClass} value={form.data_fim_viagem} onChange={e => setForm(f => ({ ...f, data_fim_viagem: e.target.value }))} /></Field>
                        <Field label="Motivo e observações"><input className={inputClass} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></Field>
                        </> : form.finalidade === 'REEMBOLSO' ? <>
                        <Field label="Data da despesa"><input type="date" className={inputClass} value={form.data_despesa} onChange={e => setForm(f => ({ ...f, data_despesa: e.target.value }))} /></Field>
                        <Field label="Motivo do reembolso"><input className={inputClass} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Descreva a despesa reembolsada" /></Field>
                        </> : form.processo_tipo === 'PAYMENT_FORMALIZATION' ? <>
                            <Field label="Data do pagamento realizado"><input type="date" className={inputClass} value={form.data_pagamento_realizado} onChange={e => setForm(f => ({ ...f, data_pagamento_realizado: e.target.value }))}/></Field>
                            <Field label="Referência (opcional)"><input className={inputClass} value={form.fatura_referencia} onChange={e => setForm(f => ({ ...f, fatura_referencia: e.target.value }))} placeholder="Ex.: fatura/cartão/pedido"/></Field>
                            <Field label="Forma utilizada">
                                <select className={inputClass} value={form.forma_pagamento} onChange={e => setForm(f => ({ ...f, forma_pagamento: e.target.value, cartao_id: e.target.value === 'CARTAO_CREDITO' ? (f.cartao_id || cartoes[0]?.id || '') : '' }))}>
                                    <option value="">Selecione...</option><option value="PIX">PIX</option><option value="TED">Transferência bancária</option><option value="CARTAO_CREDITO">Cartão de crédito corporativo</option><option value="BOLETO">Boleto</option><option value="DINHEIRO">Dinheiro</option>
                                </select>
                            </Field>
                            {form.forma_pagamento === 'CARTAO_CREDITO' && <Field label="Cartão corporativo"><select className={inputClass} value={form.cartao_id} onChange={e => setForm(f=>({...f,cartao_id:e.target.value}))}><option value="">Selecione...</option>{cartoes.map(c=><option key={c.id} value={c.id}>{c.bandeira} •••• {c.final}{c.apelido?` (${c.apelido})`:''}</option>)}</select></Field>}
                        </> : <><Field label="Gatilho do saldo">
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
                                    {cartoes.map(c => <option key={c.id} value={c.id}>{c.bandeira} •••• {c.final}{c.apelido ? ` (${c.apelido})` : ''}</option>)}
                                </select>
                            </Field>
                        </>}
                        {/* O "Produto / Serviço" é código de catálogo: MAO_DE_OBRA serve
                            para o serralheiro, o eletricista e o ajudante igualmente.
                            Quem confere o pagamento precisa saber qual dos três foi, e
                            é este campo que vai para o e-mail, logo abaixo da descrição. */}
                        <Field label="Detalhamento do serviço">
                            <input className={inputClass} value={form.observacoes}
                                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                                placeholder="Ex.: Serralheiro — fabricação e instalação de grades e portão de acesso" />
                        </Field>
                        </>}
                        {['ADIANTAMENTO_VIAGEM', 'REEMBOLSO'].includes(form.finalidade) && <>
                            <Field label="Data da solicitação"><input type="date" className={inputClass} value={form.data_solicitacao} onChange={e => setForm(f => ({ ...f, data_solicitacao: e.target.value }))}/></Field>
                            <Field label="Data prevista para pagamento"><input type="date" className={inputClass} value={form.data_prevista} onChange={e => setForm(f => ({ ...f, data_prevista: e.target.value }))}/></Field>
                        </>}
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                        <GhostButton onClick={() => setShowForm(false)}>Cancelar</GhostButton>
                        <PrimaryButton onClick={criar} disabled={salvando || !form.favorecido || !form.valor_contratado || !form.forma_pagamento || (form.forma_pagamento === 'CARTAO_CREDITO' && !form.cartao_id) || (form.processo_tipo === 'PAYMENT_FORMALIZATION' && !form.data_pagamento_realizado) || (form.finalidade === 'ADIANTAMENTO_VIAGEM' && !form.destino) || (['ADIANTAMENTO_VIAGEM', 'REEMBOLSO'].includes(form.finalidade) && (!form.data_solicitacao || !form.data_prevista))}>{form.processo_tipo === 'PAYMENT_FORMALIZATION' ? 'Registrar formalização' : 'Registrar'}</PrimaryButton>
                    </div>
                </div>
            )}

            {/* Painel de custo da atividade.
                O valor da atividade e o valor das contratações são grandezas
                diferentes de propósito: `valor_contrato` é a RECEITA — o que a LS
                fatura do cliente — e a contratação é o CUSTO — o que a LS paga ao
                fornecedor. Igualar os dois zeraria a margem, que é justamente o
                que a aba Resultado existe para medir.
                O que faltava era o contrário: nada avisava quando o custo
                contratado passava do orçado, nem quando passava da própria
                receita. Contratar era um ato cego — e é aqui, na hora de
                contratar, que o aviso serve. */}
            {contratacoes.length > 0 && (() => {
                const comprometido = contratacoes
                    .filter((c: any) => c.status !== 'CANCELADA')
                    .reduce((s: number, c: any) => s + Number(c.valor_contratado || 0), 0);
                const orcado = Number(atividade.valor_orcado || 0);
                const receita = Number(atividade.valor_contrato || 0);
                const passouOrcado = orcado > 0 && comprometido > orcado;
                const passouReceita = receita > 0 && comprometido > receita;
                const semReferencia = orcado <= 0 && receita <= 0;
                const tom = passouReceita
                    ? 'border-destructive/40 bg-destructive/5 text-destructive'
                    : passouOrcado || semReferencia
                        ? 'border-warn/30 bg-warn/5 text-warn'
                        : 'border-border bg-secondary/30 text-muted-foreground';
                return (
                    <div className={`mb-3 rounded-lg border px-3.5 py-2.5 text-[11px] ${tom}`}>
                        <span className="font-semibold">Custo contratado {comprometido ? fmtMoeda(comprometido) : '—'}</span>
                        {orcado > 0 && <span className="ml-4">Orçado {fmtMoeda(orcado)}</span>}
                        {receita > 0 && <span className="ml-4">Receita {fmtMoeda(receita)}</span>}
                        {passouReceita && <div className="mt-1 font-semibold">O custo contratado passou a receita da atividade em {fmtMoeda(comprometido - receita)}. Esta atividade está dando prejuízo.</div>}
                        {!passouReceita && passouOrcado && <div className="mt-1 font-semibold">O custo contratado passou o orçado em {fmtMoeda(comprometido - orcado)}.</div>}
                        {semReferencia && <div className="mt-1 font-semibold">A atividade não tem receita nem custo orçado preenchidos, então não há com o que comparar este custo.</div>}
                    </div>
                );
            })()}

            {contratacoes.length === 0 ? (
                <EmptyState text="Nenhum pagamento lançado para esta atividade. Use Novo pagamento para começar." />
            ) : (
                <div className="flex flex-col gap-3">
                    {contratacoes.map(c => {
                        const arquivos = c.contrato?.arquivos || [];
                        const alocado = (c.parcelas || []).reduce((s: number, p: any) => s + p.valor, 0);
                        const diferenca = Math.round((c.valor_contratado - alocado) * 100) / 100;
                        const edicao = editandoContratacao?.id === c.id ? editandoContratacao : null;
                        const registros = historico && historico.id === c.id ? historico.itens : null;
                        const temPagamento = (c.parcelas || []).some((p: any) => ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(p.status));
                        const contratoActions: FinancialAction[] = [
                            ...(!c.contrato
                                ? [{ label: gerandoContrato === c.id ? 'Gerando contrato...' : 'Gerar contrato', onClick: () => gerarContrato(c.id), disabled: gerandoContrato === c.id }]
                                : [
                                    { label: 'Ver / baixar contrato', href: `/api/contratos/${c.contrato.id}/export/html` },
                                    { label: anexandoContrato === c.contrato.id ? 'Enviando assinado...' : 'Anexar contrato assinado', onClick: () => clicarAnexarContrato(c.contrato.id), disabled: anexandoContrato === c.contrato.id },
                                ]),
                            { label: historico?.id === c.id ? 'Ocultar histórico' : 'Histórico de alterações', onClick: () => verHistorico(c.id) },
                            { label: 'Editar contratação', onClick: () => setEditandoContratacao({ id: c.id, valor: String(c.valor_contratado), observacoes: c.observacoes || '', motivo: '' }) },
                            // Com pagamento efetuado a exclusão esconderia dinheiro que
                            // saiu do caixa; o backend recusa, e aqui nem se oferece.
                            ...(!temPagamento ? [{ label: 'Excluir contratação', onClick: () => excluirContratacao(c), tone: 'danger' as const }] : []),
                        ];
                        return <FinancialBeneficiaryCard
                            key={c.id}
                            name={c.supplier?.nome || c.funcionario?.nome || 'Favorecido'}
                            category={FINALIDADE_LABEL[c.finalidade] || c.finalidade.replace(/_/g, ' ').toLowerCase()}
                            total={fmtMoeda(c.valor_contratado)}
                            status={c.contrato && <select aria-label="Status do contrato" value={c.contrato.status} onChange={e => mudarStatusContrato(c.contrato.id, e.target.value)} className={`rounded-md border-0 px-2 py-1 text-[11px] font-semibold ${CONTRATO_STATUS_TOM[c.contrato.status] || CONTRATO_STATUS_TOM.GERADO}`}>{CONTRATO_STATUS.map(s => <option key={s} value={s}>{CONTRATO_STATUS_LABEL[s]}</option>)}</select>}
                            headerActions={<FinancialActionMenu actions={contratoActions}/>}
                        >
                            {edicao && <div className="mb-3 rounded-lg border border-border bg-secondary/30 p-3">
                                <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                                    <label className="text-xs">
                                        <span className="mb-1 block text-muted-foreground">Valor contratado</span>
                                        <input autoFocus type="number" step="0.01" min="0" className={`${inputClass} h-9 text-sm`}
                                            value={edicao.valor}
                                            onChange={e => setEditandoContratacao(v => v && ({ ...v, valor: e.target.value }))}/>
                                    </label>
                                    <label className="text-xs">
                                        <span className="mb-1 block text-muted-foreground">Detalhamento do serviço</span>
                                        <input className={`${inputClass} h-9 text-sm`}
                                            value={edicao.observacoes}
                                            onChange={e => setEditandoContratacao(v => v && ({ ...v, observacoes: e.target.value }))}
                                            placeholder="Ex.: Serralheiro — fabricação e instalação de grades e portão"/>
                                    </label>
                                </div>
                                <label className="mt-3 block text-xs">
                                    <span className="mb-1 block text-muted-foreground">Motivo da alteração</span>
                                    <input className={`${inputClass} h-9 text-sm`}
                                        value={edicao.motivo}
                                        onChange={e => setEditandoContratacao(v => v && ({ ...v, motivo: e.target.value }))}
                                        placeholder="Ex.: escopo ampliado — total da atividade passou para R$ 3.500,00"/>
                                </label>
                                <div className="mt-3 flex justify-end gap-2">
                                    <button type="button" onClick={() => setEditandoContratacao(null)} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground">Cancelar</button>
                                    <button onClick={() => salvarContratacao(c.id, {
                                        valor_contratado: Number(String(edicao.valor).replace(',', '.')),
                                        observacoes: edicao.observacoes.trim() || null,
                                        motivo: edicao.motivo.trim() || null,
                                    })} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Salvar</button>
                                </div>
                            </div>}
                            {c.observacoes && !edicao && <div className="px-1 pb-2 text-[11px] text-muted-foreground">{c.observacoes}</div>}
                            {registros && <div className="mb-3 rounded-lg border border-border bg-secondary/20 p-3">
                                <div className="mb-2 text-xs font-semibold text-muted-foreground">Histórico de alterações</div>
                                {registros.length === 0
                                    ? <div className="text-[11px] text-muted-foreground">Nenhuma alteração registrada. O histórico passou a ser gravado agora; mudanças anteriores a isso não ficaram registradas.</div>
                                    : <div className="flex flex-col gap-2">{registros.map((h: any) => (
                                        <div key={h.id} className="border-l-2 border-border pl-2.5 text-[11px]">
                                            <div className="flex flex-wrap gap-x-3 text-muted-foreground">
                                                <span>{fmtData(h.criado_em)}</span>
                                                <strong className="text-foreground">{h.alvo}</strong>
                                                {h.antes?.valor != null && h.depois?.valor != null && <span>De {fmtMoeda(h.antes.valor)} para <strong className="text-foreground">{fmtMoeda(h.depois.valor)}</strong></span>}
                                                {h.antes?.valor_contratado != null && h.depois?.valor_contratado != null && <span>De {fmtMoeda(h.antes.valor_contratado)} para <strong className="text-foreground">{fmtMoeda(h.depois.valor_contratado)}</strong></span>}
                                                {h.user_id && <span>{h.user_id}</span>}
                                            </div>
                                            {h.motivo && <div className="mt-0.5 text-foreground">{h.motivo}</div>}
                                        </div>
                                    ))}</div>}
                            </div>}
                            {Math.abs(diferenca) >= 0.01 && <div className="rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[11px] text-warn">Valor ainda não alocado em parcelas: <strong>{fmtMoeda(diferenca)}</strong></div>}
                            {c.contrato && <FinancialAttachments count={arquivos.length} label="Arquivos do contrato" addAction={<button type="button" onClick={() => clicarAnexarContrato(c.contrato.id)} className="text-[11px] font-semibold text-primary hover:underline">Adicionar</button>}>
                                {arquivos.map((a: any) => <div key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-secondary/30 px-2.5 py-2 text-xs"><a href={`/api/contratos/arquivos/${a.id}/download`} className="flex min-w-0 items-center gap-1.5 text-primary hover:underline"><Paperclip size={14} aria-hidden/><span className="truncate">{a.nome_original}</span></a><button type="button" onClick={() => removerArquivoContrato(a.id)} aria-label="Excluir arquivo do contrato" title="Excluir arquivo do contrato" className="text-muted-foreground hover:text-destructive"><Trash2 size={14} aria-hidden/></button></div>)}
                            </FinancialAttachments>}
                            {(c.parcelas || []).map((p: any) => {
                                const pago = ['PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(p.status);
                                const formalizacao = p.processo_tipo === 'PAYMENT_FORMALIZATION' || p.formalizacao_posterior;
                                const forma = p.forma_pagamento || c.supplier?.forma_pagamento || (c.funcionario?.pix_chave ? 'PIX' : 'TED');
                                const actions: FinancialAction[] = [
                                    { label: formalizacao ? 'Gerar e-mail de formalização' : 'Gerar e-mail de pagamento', onClick: () => gerarEmailPagamento(p.id) },
                                    ...(!pago ? [
                                        { label: 'Editar valor', onClick: () => { setEditandoParcela(p.id); setDividindo(null); setValorParcela(String(p.valor)); setMotivoParcela(''); } },
                                        { label: 'Adiantar percentual', onClick: () => { setDividindo(p.id); setEditandoParcela(null); setValorParcela(''); } },
                                    ] : []),
                                    ...(p.tipo === 'PARCELA' && (c.parcelas || []).length > 1 && !pago ? [{ label: 'Desfazer adiantamento', onClick: () => desfazerAdiantamento(p), tone: 'danger' as const }] : []),
                                    ...Object.entries(FORMA_LABEL).filter(([valor]) => valor !== forma).map(([valor, rotulo]) => ({ label: `Alterar forma para ${rotulo}`, onClick: () => mudarFormaParcela(p, valor) })),
                                    ...(p.status !== 'PENDENTE' ? [{ label: 'Editar datas', onClick: () => abrirProgramacao(p) }] : []),
                                    ...(p.comprovante_url ? [{ label: 'Remover comprovante', onClick: () => removerComprovante(p), tone: 'danger' as const }] : []),
                                    ...(!['PENDENTE', 'PAGO', 'COMPROVANTE_RECEBIDO', 'CONFERIDO'].includes(p.status) ? [{ label: 'Excluir solicitação', onClick: () => cancelarSolicitacaoPagamento(p), tone: 'danger' as const }] : []),
                                    // Excluir a LINHA, não só a solicitação: é o que
                                    // resolve um pagamento lançado errado.
                                    ...(!pago ? [{ label: 'Excluir pagamento', onClick: () => excluirParcela(p), tone: 'danger' as const }] : []),
                                ];
                                // O anexo acontece só na faixa Documentos, logo abaixo.
                                // Havia aqui um segundo caminho de upload, com storage
                                // próprio: anexar por ele não registrava na faixa, e o
                                // cartão dizia "comprovante anexado" enquanto a faixa
                                // dizia "pendente" sobre o mesmo pagamento.
                                const primaryAction = formalizacao ? null : p.status === 'PENDENTE'
                                    ? <GhostButton onClick={() => abrirProgramacao(p)}>Solicitar pagamento</GhostButton>
                                    : null;
                                return <FinancialPaymentCard key={p.id} title={formalizacao ? 'Formalização' : (PARCELA_TIPO_LABEL[p.tipo] || p.tipo)} percentage={`${p.percentual}%`} amount={fmtMoeda(p.valor)} method={<>{FORMA_LABEL[forma] || forma}{p.cartao_bandeira && p.cartao_final ? <span className="ml-2">{p.cartao_bandeira} •••• {p.cartao_final}</span> : null}</>} context={formalizacao ? `Pagamento já realizado, pendente de documentos${p.fatura_referencia ? ` (${p.fatura_referencia})` : ''}` : undefined} requestedAt={p.data_solicitacao ? fmtData(p.data_solicitacao) : undefined} expectedAt={p.data_prevista ? fmtData(p.data_prevista) : undefined} paidAt={p.data_pagamento ? fmtData(p.data_pagamento) : undefined} status={<PagamentoStatusSelect value={p.status} onChange={status => mudarStatusParcela(p, status)}/>} primaryAction={primaryAction} actions={actions}>
                                    <PaymentAttachments ownerType="PARCELA" ownerId={p.id} comprovanteLegado={p.comprovante_url} requiresFiscal={['CABO','METALICO','QTM','ETM','MATERIAL_CIVIL','MATERIAL_ELETRICO','EQUIPAMENTO'].includes(c.finalidade)} onChange={load}/>
                                    {dividindo === p.id && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-2 text-xs"><span>Adiantar</span><input autoFocus aria-label="Percentual a adiantar" type="number" step="1" min="0" max="100" className={`${inputClass} h-8 w-20 text-right text-xs`} value={valorParcela} onChange={e => setValorParcela(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setDividindo(null); if (e.key === 'Enter') dividirParcela(p.id, p.valor, c.valor_contratado); }}/><span>% = <strong className="text-foreground">{fmtMoeda(Math.round((c.valor_contratado * (Number(String(valorParcela).replace(',', '.')) || 0) / 100) * 100) / 100)}</strong></span>{[10,20,30,40,50].map(v => <button type="button" key={v} onClick={() => setValorParcela(String(v))} className="rounded border border-border px-2 py-1 text-[11px]">{v}%</button>)}<button type="button" onClick={() => dividirParcela(p.id, p.valor, c.valor_contratado)} className="font-semibold text-primary">Aplicar</button><button type="button" onClick={() => setDividindo(null)} className="text-muted-foreground">Cancelar</button></div>}
                                    {editandoParcela === p.id && <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-2 text-xs">
                                        <div className="flex flex-wrap items-center gap-2"><span>R$</span><input autoFocus aria-label="Valor do pagamento" type="number" step="0.01" min="0" className={`${inputClass} h-8 w-32 text-right text-xs`} value={valorParcela} onChange={e => setValorParcela(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setEditandoParcela(null); if (e.key === 'Enter') salvarValorParcela(p.id); }}/><button type="button" onClick={() => salvarValorParcela(p.id)} className="font-semibold text-primary">Salvar</button><button type="button" onClick={() => setEditandoParcela(null)} className="text-muted-foreground">Cancelar</button></div>
                                        {/* Sem este campo, o motivo da mudança de valor não tinha
                                            onde ser escrito — e quem escrevia em outro lugar não
                                            achava o texto depois. */}
                                        <input className={`${inputClass} mt-2 h-8 w-full text-xs`} value={motivoParcela} onChange={e => setMotivoParcela(e.target.value)} placeholder="Motivo da alteração (fica no histórico)" aria-label="Motivo da alteração"/>
                                    </div>}
                                </FinancialPaymentCard>;
                            })}
                        </FinancialBeneficiaryCard>;
                    })}
                </div>
            )}

            {programacao && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9000] p-4" onClick={() => setProgramacao(null)}>
                    <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4">
                            <div><h3 className="text-base font-bold">Programar pagamento</h3><p className="text-xs text-muted-foreground mt-1">Estas datas aparecerão no Controle de Pagamentos.</p></div>
                            <button type="button" onClick={() => setProgramacao(null)} aria-label="Fechar" title="Fechar" className="text-muted-foreground hover:text-foreground"><X size={16} aria-hidden/></button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Data da solicitação">
                                <input type="date" className={inputClass} value={programacao.data_solicitacao} onChange={e => setProgramacao(p => p && ({ ...p, data_solicitacao: e.target.value }))}/>
                            </Field>
                            <Field label="Data prevista para pagamento">
                                <input type="date" className={inputClass} value={programacao.data_prevista} onChange={e => setProgramacao(p => p && ({ ...p, data_prevista: e.target.value }))}/>
                            </Field>
                            {programacao.statusAtual === 'PENDENTE' && <div className="col-span-2"><Field label="Motivo ou observação para o financeiro">
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
                        <h3 className="text-base font-bold mb-1">Modelo de contrato de prestação de serviço</h3>
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
                            aria-label="Modelo de contrato"
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <GhostButton onClick={() => setShowTemplateModal(false)}>Cancelar</GhostButton>
                            <PrimaryButton onClick={salvarModeloContrato} disabled={salvandoTemplate}>{salvandoTemplate ? 'Salvando...' : 'Salvar modelo'}</PrimaryButton>
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
                                    Revise e copie. O envio é manual, de propósito: pagamento não sai daqui sem alguém conferir.
                                </p>
                            </div>
                            <button type="button" onClick={() => setEmailPagamento(null)} aria-label="Fechar" title="Fechar" className="text-muted-foreground hover:text-foreground"><X size={16} aria-hidden /></button>
                        </div>

                        <div className="px-5 py-3 border-b border-border space-y-2 text-xs">
                            <div className="flex flex-wrap gap-x-6 gap-y-1">
                                {emailPagamento.para && (
                                    <span><span className="text-muted-foreground">Para:</span> <strong>{emailPagamento.para}</strong></span>
                                )}
                                {emailPagamento.cc && <span><span className="text-muted-foreground">CC:</span> <strong>{emailPagamento.cc}</strong></span>}
                                {emailPagamento.responsavel && <span><span className="text-muted-foreground">Responsável:</span> <strong>{emailPagamento.responsavel.nome}</strong></span>}
                                <span><span className="text-muted-foreground">Favorecido:</span> <strong>{emailPagamento.resumo?.fornecedor}</strong></span>
                                {emailPagamento.resumo?.razao_social && emailPagamento.resumo.razao_social !== emailPagamento.resumo.fornecedor && (
                                    <span><span className="text-muted-foreground">Razão social:</span> <strong>{emailPagamento.resumo.razao_social}</strong></span>
                                )}
                            </div>
                            {emailPagamento.anexos?.length > 0 && <div className="text-muted-foreground">Anexos reais no .eml: <strong className="text-foreground">{emailPagamento.anexos.map((a:any)=>a.nome).join('; ')}</strong></div>}
                            {emailPagamento.resumo?.documentos_pendentes?.length > 0 && <div className="rounded border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-warn">Formalização incompleta: {emailPagamento.resumo.documentos_pendentes.join(', ')}</div>}
                            {emailPagamento.sem_assinatura && <AvisoSemAssinatura />}
                            {emailPagamento.routing_pendente && <div className="rounded border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-warn">Nenhum destinatário cadastrado para este tipo de e-mail — o .eml sai com o campo Para vazio. Cadastre em Configurações → Comunicação.</div>}
                            <div className="flex items-start gap-2">
                                <span className="text-muted-foreground shrink-0 pt-0.5">Assunto:</span>
                                <span className="text-xs break-all">{emailPagamento.assunto}</span>
                                <button
                                    type="button"
                                    onClick={() => { navigator.clipboard.writeText(emailPagamento.assunto); setCopiado('assunto'); setTimeout(() => setCopiado(''), 2500); }}
                                    className="shrink-0 flex items-center gap-1 text-primary hover:underline"
                                >
                                    <Copy size={14} aria-hidden /> {copiado === 'assunto' ? 'Copiado' : 'Copiar assunto'}
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1">
                                <span className="text-muted-foreground">Contratado <strong className="text-foreground">{emailPagamento.resumo?.valor_total ? fmtMoeda(emailPagamento.resumo.valor_total) : '—'}</strong></span>
                                <span className="text-muted-foreground">Já pago <strong className="text-foreground">{emailPagamento.resumo?.valor_pago ? fmtMoeda(emailPagamento.resumo.valor_pago) : '—'}</strong></span>
                                <span className="text-muted-foreground">{emailPagamento.resumo?.formalizacao_posterior ? 'Compra formalizada' : 'Esta programação'} <strong className="text-foreground">{emailPagamento.resumo?.valor_pagamento ? fmtMoeda(emailPagamento.resumo.valor_pagamento) : '—'}</strong></span>
                                <span className="text-muted-foreground">Saldo <strong className={(emailPagamento.resumo?.saldo || 0) < 0 ? 'text-crit' : 'text-foreground'}>{emailPagamento.resumo?.saldo ? fmtMoeda(emailPagamento.resumo.saldo) : '—'}</strong></span>
                            </div>
                            {emailPagamento.resumo?.sem_dados_bancarios && (
                                <div className="mt-1 rounded border border-crit/45 bg-crit/10 px-2.5 py-1.5 text-crit">
                                    Este fornecedor não tem banco nem PIX cadastrado. O e-mail sai sem os dados para pagamento. Cadastre em Fornecedores.
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-auto bg-[#F4F6F8] p-3">
                            <iframe
                                title="Prévia do e-mail"
                                srcDoc={emailPagamento.html}
                                className="w-full bg-white border-0"
                                style={{ height: 1500 }}
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
                            <GhostButton onClick={() => setEmailPagamento(null)}>Fechar</GhostButton>
                            <button
                                type="button"
                                onClick={abrirEmailNoOutlook}
                                className="h-9 px-3 rounded-lg border border-border bg-secondary hover:bg-secondary/70 text-sm font-semibold flex items-center gap-2"
                                title="Baixa um .eml — abrir no Outlook cria a mensagem pronta para enviar"
                            >
                                <Mail size={15} aria-hidden /> Abrir no Outlook
                            </button>
                            <PrimaryButton onClick={() => copiarEmail(emailPagamento.html, emailPagamento.assunto)}>
                                {copiado === 'corpo' ? 'Copiado' : 'Copiar e-mail'}
                            </PrimaryButton>
                        </div>
                    </div>
                </div>
            )}

            <PrestacaoContasViagem atividade={atividade} refreshKey={adiantamentoRefresh} />

        </Card>
    );
}
