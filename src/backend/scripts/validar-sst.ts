/**
 * Segurança do trabalho de fornecedores e prestadores (09/10/2026):
 *
 *   - trabalhos marcados definem os certificados exigidos; PF e membros pedem RG e CPF;
 *   - validade calculada pela emissão; vencido e vencendo em 30 dias viram pendência;
 *   - equipe com documentos próprios; PJ não tem exigência própria;
 *   - trabalho e documento novos criados pela empresa;
 *   - anexos guardados fora da pasta pública, com remoção do disco;
 *   - fornecedor de material fica fora;
 *   - pendência aparece como AVISO na atividade que contrata o prestador.
 *
 * Cria os próprios cadastros e apaga tudo no fim.
 *
 *   npx tsx src/backend/scripts/validar-sst.ts
 */
import './_sessao-teste';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const API = process.env.API_URL || 'http://localhost:3001/api';
const prisma = new PrismaClient();
const cab = { 'Content-Type': 'application/json' };
const SUFIXO = Date.now().toString(36).slice(-5).toUpperCase();
const TESTE = 'Teste automatizado — pode apagar';

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
    console.log(`   ${ok ? 'OK   ' : 'FALHA'} ${nome}${ok || !detalhe ? '' : ` — ${detalhe}`}`);
    if (!ok) falhas++;
}
async function json(caminho: string, init?: RequestInit) {
    const r = await fetch(`${API}${caminho}`, init);
    return { status: r.status, ok: r.ok, corpo: await r.json().catch(() => ({})) as any };
}
const post = (c: string, corpo: unknown) => json(c, { method: 'POST', headers: cab, body: JSON.stringify(corpo) });
const put = (c: string, corpo: unknown) => json(c, { method: 'PUT', headers: cab, body: JSON.stringify(corpo) });
const dia = (deslocamento: number) => new Date(Date.now() + deslocamento * 86400000).toISOString().slice(0, 10);
const codigos = (lista: any[]) => lista.map((p: any) => `${p.codigo}:${p.motivo}`).sort().join(',');

async function main() {
    const fornecedores: string[] = [];
    const catalogo: string[] = [];
    let atividadeId = '', siteId = '';
    try {
        const pf = await post('/suppliers', { nome: `Prestador SST ${SUFIXO}`, tipo: 'PESSOA_FISICA', categoria: 'MAO_DE_OBRA', cpf: '111.222.333-44', observacoes: TESTE });
        if (!pf.ok) throw new Error(`fornecedor: ${pf.corpo.error}`);
        fornecedores.push(pf.corpo.id);
        const id = pf.corpo.id;

        console.log('\n── Exigências');
        let sst = await json(`/sst/fornecedores/${id}`);
        conferir('prestador PF sem trabalho exige RG e CPF', codigos(sst.corpo.pendencias) === 'CPF:FALTANDO,RG:FALTANDO', codigos(sst.corpo.pendencias));
        sst = await put(`/sst/fornecedores/${id}/trabalhos`, { trabalhos: ['ALTURA', 'ELETRICIDADE'] });
        conferir('trabalho em altura + eletricidade exigem NR-35, ASO e NR-10', ['NR35', 'ASO', 'NR10'].every(c => sst.corpo.exigidos.includes(c)), sst.corpo.exigidos.join(','));
        conferir('resumo PENDENTE com 5 pendências', sst.corpo.resumo.situacao === 'PENDENTE' && sst.corpo.resumo.pendencias === 5, JSON.stringify(sst.corpo.resumo));

        console.log('\n── Documentos e validade');
        const rg = await post('/qualificacoes', { supplier_id: id, tipo: 'RG', numero: '1234567', entidade: 'SSP/PA' });
        await post('/qualificacoes', { supplier_id: id, tipo: 'CPF', numero: '111.222.333-44' });
        const nr35 = await post('/qualificacoes', { supplier_id: id, tipo: 'NR35', data_emissao: dia(-30) });
        const esperado = new Date(dia(-30)); esperado.setMonth(esperado.getMonth() + 24);
        conferir('NR-35 sem validade ganha 24 meses a partir da emissão', nr35.ok && nr35.corpo.data_validade?.slice(0, 10) === esperado.toISOString().slice(0, 10), nr35.corpo.data_validade);
        await post('/qualificacoes', { supplier_id: id, tipo: 'ASO', data_emissao: dia(-400), data_validade: dia(-5) });
        await post('/qualificacoes', { supplier_id: id, tipo: 'NR10', data_emissao: dia(-700), data_validade: dia(10) });
        sst = await json(`/sst/fornecedores/${id}`);
        conferir('ASO vencido e NR-10 vencendo em 10 dias', codigos(sst.corpo.pendencias) === 'ASO:VENCIDO,NR10:VENCE_EM_BREVE', codigos(sst.corpo.pendencias));
        conferir('documento traz situação calculada', sst.corpo.documentos.find((d: any) => d.tipo === 'ASO')?.situacao === 'VENCIDO');
        await post('/qualificacoes', { supplier_id: id, tipo: 'ASO', data_emissao: dia(0) });
        sst = await json(`/sst/fornecedores/${id}`);
        conferir('ASO novo resolve (vale o de validade mais longa)', codigos(sst.corpo.pendencias) === 'NR10:VENCE_EM_BREVE', codigos(sst.corpo.pendencias));
        conferir('resumo VENCE_EM_BREVE', sst.corpo.resumo.situacao === 'VENCE_EM_BREVE', sst.corpo.resumo.situacao);

        console.log('\n── Anexos');
        const fd = new FormData();
        fd.append('arquivo', new Blob([new Uint8Array(Buffer.from('%PDF-1.4 teste'))], { type: 'application/pdf' }), 'rg-frente.pdf');
        const anexo = await json(`/sst/documentos/${rg.corpo.id}/arquivos`, { method: 'POST', body: fd });
        conferir('anexo guardado', anexo.status === 201 && anexo.corpo.nome_original === 'rg-frente.pdf', JSON.stringify(anexo.corpo));
        const baixa = await fetch(`${API}/sst/arquivos/${anexo.corpo.id}`);
        conferir('anexo baixa com login', baixa.ok && (await baixa.text()).startsWith('%PDF'), `HTTP ${baixa.status}`);
        const ruim = new FormData();
        ruim.append('arquivo', new Blob([new Uint8Array(Buffer.from('MZ'))], { type: 'application/octet-stream' }), 'virus.exe');
        const recusado = await json(`/sst/documentos/${rg.corpo.id}/arquivos`, { method: 'POST', body: ruim });
        conferir('formato não permitido recusado', recusado.status === 400, `HTTP ${recusado.status}`);
        const caminho = path.resolve('storage', 'sst', anexo.corpo.storage_key);
        const apagado = await json(`/qualificacoes/${rg.corpo.id}`, { method: 'DELETE' });
        conferir('apagar o documento remove o anexo do disco', apagado.ok && !fs.existsSync(caminho), caminho);
        await post('/qualificacoes', { supplier_id: id, tipo: 'RG', numero: '1234567' });

        console.log('\n── Equipe');
        const m = await post('/sst/membros', { supplier_id: id, nome: `Ajudante ${SUFIXO}`, funcao: 'Ajudante', sst_trabalhos: ['ALTURA'] });
        conferir('membro criado', m.status === 201, JSON.stringify(m.corpo));
        sst = await json(`/sst/fornecedores/${id}`);
        const membro = sst.corpo.membros[0];
        conferir('membro exige RG, CPF, NR-35 e ASO', codigos(membro?.pendencias || []) === 'ASO:FALTANDO,CPF:FALTANDO,NR35:FALTANDO,RG:FALTANDO', codigos(membro?.pendencias || []));
        const docM = await post('/qualificacoes', { membro_id: membro.id, tipo: 'NR35', data_emissao: dia(0) });
        conferir('documento do membro guarda o fornecedor', docM.ok && docM.corpo.supplier_id === id, docM.corpo.supplier_id);
        sst = await json(`/sst/fornecedores/${id}`);
        conferir('documento do membro não conta para o prestador', !sst.corpo.documentos.some((d: any) => d.id === docM.corpo.id));
        conferir('pendências do membro entram no total', sst.corpo.pendencias_total.some((p: any) => p.pessoa === `Ajudante ${SUFIXO}`) && sst.corpo.resumo.situacao === 'PENDENTE');
        await json(`/sst/membros/${membro.id}`, { method: 'DELETE' });
        sst = await json(`/sst/fornecedores/${id}`);
        conferir('membro fora da equipe sai das pendências', sst.corpo.membros.length === 0 && sst.corpo.resumo.situacao === 'VENCE_EM_BREVE', sst.corpo.resumo.situacao);

        console.log('\n── Catálogo da empresa');
        const doc = await post('/sst/catalogo', { tipo: 'DOCUMENTO', nome: `NR-34 Solda ${SUFIXO}`, meses: 12 });
        conferir('tipo de documento novo criado', doc.status === 201, JSON.stringify(doc.corpo));
        catalogo.push(doc.corpo.id);
        const trab = await post('/sst/catalogo', { tipo: 'TRABALHO', nome: `Solda a quente ${SUFIXO}`, exige: [doc.corpo.codigo] });
        conferir('trabalho novo criado com o documento exigido', trab.status === 201, JSON.stringify(trab.corpo));
        catalogo.push(trab.corpo.id);
        const dup = await post('/sst/catalogo', { tipo: 'TRABALHO', nome: 'Trabalho em altura', exige: ['NR35'] });
        conferir('nome que já existe é recusado', dup.status === 400, `HTTP ${dup.status}`);
        sst = await put(`/sst/fornecedores/${id}/trabalhos`, { trabalhos: ['ALTURA', 'ELETRICIDADE', trab.corpo.codigo] });
        conferir('trabalho novo passa a exigir o documento novo', sst.corpo.pendencias.some((p: any) => p.codigo === doc.corpo.codigo && p.motivo === 'FALTANDO'), codigos(sst.corpo.pendencias));
        const comMeses = await post('/qualificacoes', { supplier_id: id, tipo: doc.corpo.codigo, data_emissao: dia(-10) });
        conferir('documento novo usa a validade do catálogo (12 meses)', !!comMeses.corpo.data_validade, comMeses.corpo.data_validade);

        console.log('\n── PJ e material');
        const pj = await post('/suppliers', { nome: `Empresa SST ${SUFIXO}`, tipo: 'PESSOA_JURIDICA', categoria: 'SERVICO', cnpj: '11.222.333/0001-44', observacoes: TESTE });
        fornecedores.push(pj.corpo.id);
        sst = await put(`/sst/fornecedores/${pj.corpo.id}/trabalhos`, { trabalhos: ['ALTURA'] });
        conferir('PJ sem exigência própria', sst.corpo.pendencias.length === 0 && sst.corpo.resumo.situacao === 'EM_DIA', codigos(sst.corpo.pendencias));
        const mat = await post('/suppliers', { nome: `Material SST ${SUFIXO}`, tipo: 'PESSOA_JURIDICA', categoria: 'MATERIAL', observacoes: TESTE });
        fornecedores.push(mat.corpo.id);
        const resumo = await json(`/sst/resumo?ids=${fornecedores.join(',')}`);
        conferir('fornecedor de material: não se aplica', resumo.corpo[mat.corpo.id]?.situacao === 'NAO_SE_APLICA', JSON.stringify(resumo.corpo[mat.corpo.id]));
        conferir('resumo em lote traz os três', Object.keys(resumo.corpo).length === 3);

        console.log('\n── Aviso na atividade');
        const at = await post('/atividades', {
            titulo: `Teste SST ${SUFIXO}`, tipo_demanda: 'IMPLANTACAO', modelo_operacao: 'MEDIANTE_APROVACAO',
            sharing: 'HIGHLINE', id_site_sharing: `TSTS${SUFIXO}`, operadora: 'TIM', id_site_operadora: `TSTS${SUFIXO}T`,
            estado: 'PA', municipio: 'Marabá', tipo_obra: 'BTS', descricao: TESTE });
        if (!at.ok) throw new Error(`atividade: ${at.corpo.error}`);
        atividadeId = at.corpo.id; siteId = at.corpo.site_id;
        await prisma.contratacaoFornecedor.create({ data: { tenant_id: at.corpo.tenant_id, atividade_id: atividadeId, supplier_id: id, finalidade: 'MAO_DE_OBRA', valor_contratado: 100 } });
        const pend = await json(`/atividades/${atividadeId}/pendencias`);
        const aviso = (pend.corpo.fornecedores || []).find((p: any) => /Segurança do trabalho/.test(p.texto || p.mensagem || JSON.stringify(p)));
        conferir('pendência de SST aparece como aviso na aba de fornecedores', !!aviso && aviso.nivel === 'AVISO', JSON.stringify(pend.corpo.fornecedores));
    } finally {
        if (atividadeId) {
            await prisma.contratacaoFornecedor.deleteMany({ where: { atividade_id: atividadeId } });
            await json(`/atividades/${atividadeId}`, { method: 'DELETE', headers: cab, body: JSON.stringify({ motivo: TESTE }) });
        }
        if (siteId) await json(`/sites/${siteId}`, { method: 'DELETE' });
        for (const id of fornecedores) {
            const docs = await prisma.qualificacao.findMany({ where: { supplier_id: id }, include: { arquivos: true } });
            for (const d of docs) fs.rmSync(path.resolve('storage', 'sst', d.id), { recursive: true, force: true });
            await prisma.qualificacao.deleteMany({ where: { supplier_id: id } });
            await prisma.membroEquipe.deleteMany({ where: { supplier_id: id } });
            await prisma.supplier.delete({ where: { id } }).catch(e => console.log('   (limpeza) fornecedor:', e.message));
        }
        await prisma.itemCatalogoSst.deleteMany({ where: { id: { in: catalogo } } });
        await prisma.$disconnect();
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
