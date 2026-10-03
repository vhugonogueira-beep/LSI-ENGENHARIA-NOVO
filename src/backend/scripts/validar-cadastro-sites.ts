/**
 * Cadastro único de sites (03/10/2026):
 *
 *   - chave = detentora + ID; repetido é recusado; UF e município obrigatórios;
 *   - coordenadas em decimal e em graus/minutos/segundos;
 *   - acionamento da Claro e depois da Vivo no mesmo lugar → um site só,
 *     com os IDs das duas operadoras (e mais de um ID por operadora);
 *   - operadora dona da torre: o ID dela é o da detentora;
 *   - busca pelo ID da operadora e pelo ID anterior (troca de detentora);
 *   - tipo da PV Highline sai do tipo do site + tipo de obra;
 *   - site com atividade não é excluído.
 *
 * Cria os próprios registros e apaga tudo no fim.
 *
 *   npx tsx src/backend/scripts/validar-cadastro-sites.ts
 */
import './_sessao-teste';

const API = process.env.API_URL || 'http://localhost:3001/api';
const cabecalho = { 'Content-Type': 'application/json' };
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
const post = (caminho: string, corpo: unknown) => json(caminho, { method: 'POST', headers: cabecalho, body: JSON.stringify(corpo) });
const put = (caminho: string, corpo: unknown) => json(caminho, { method: 'PUT', headers: cabecalho, body: JSON.stringify(corpo) });
const detalhe = (r: { status: number; corpo: any }) => `HTTP ${r.status} ${r.corpo?.error || ''}`;

function atividade(extra: Record<string, unknown>) {
    return post('/atividades', {
        titulo: `Teste sites ${SUFIXO}`, tipo_demanda: 'OPERACAO', subtipo_demanda: 'VISTORIA',
        modelo_operacao: 'EXECUCAO_DIRETA', descricao: TESTE, ...extra,
    });
}

async function main() {
    const ID = `TSTS${SUFIXO}`;
    const criados = { sites: [] as string[], atividades: [] as string[] };
    try {
        console.log('\n── Cadastro');
        const site = await post('/sites', {
            detentora: 'highline', id_site_detentora: ` ${ID.toLowerCase()} `, uf: 'PA', cidade: 'maraba',
            tipo_site: 'BTS', endereco: 'Rodovia BR-230, km 5', cep: '68500000',
            coordenadas: `5°22'10"S 49°07'05"O`,
            proprietario_nome: 'Fulano', proprietario_telefone: '94999990000',
        });
        conferir('site criado', site.status === 201, detalhe(site));
        if (site.ok) criados.sites.push(site.corpo.id);
        conferir('detentora e ID normalizados (maiúsculo, sem espaço)', site.corpo.detentora === 'HIGHLINE' && site.corpo.id_site_detentora === ID, JSON.stringify([site.corpo.detentora, site.corpo.id_site_detentora]));
        conferir('município gravado com o nome oficial do IBGE', site.corpo.cidade === 'Marabá', site.corpo.cidade);
        conferir('coordenadas em graus convertidas (S e O negativos)',
            Math.abs(site.corpo.latitude - -5.369444) < 1e-5 && Math.abs(site.corpo.longitude - -49.118056) < 1e-5,
            `${site.corpo.latitude}, ${site.corpo.longitude}`);
        conferir('CEP formatado', site.corpo.cep === '68500-000', site.corpo.cep);

        const repetido = await post('/sites', { detentora: 'HIGHLINE', id_site_detentora: ID, uf: 'PA', cidade: 'Marabá' });
        conferir('mesma detentora + ID é recusado', repetido.status === 409, detalhe(repetido));
        const semMunicipio = await post('/sites', { detentora: 'IHS', id_site_detentora: `${ID}X`, uf: 'PA' });
        conferir('sem município é recusado', semMunicipio.status === 400, detalhe(semMunicipio));
        const municipioErrado = await post('/sites', { detentora: 'IHS', id_site_detentora: `${ID}X`, uf: 'PA', cidade: 'Cidade Inventada' });
        conferir('município fora da UF é recusado', municipioErrado.status === 400, detalhe(municipioErrado));

        const decimal = await put(`/sites/${site.corpo.id}`, { coordenadas: '-5,3694, -49,1181' });
        conferir('coordenadas decimais com vírgula aceitas', decimal.ok && decimal.corpo.latitude === -5.3694 && decimal.corpo.longitude === -49.1181, `${decimal.corpo.latitude}, ${decimal.corpo.longitude}`);
        const invalida = await put(`/sites/${site.corpo.id}`, { coordenadas: '200, 10' });
        conferir('latitude fora do intervalo é recusada', invalida.status === 400, detalhe(invalida));

        console.log('\n── Claro e depois Vivo no mesmo site');
        const claro = await atividade({ sharing: 'HIGHLINE', id_site_sharing: ID, operadora: 'CLARO', id_site_operadora: `PAMBA${SUFIXO}` });
        conferir('atividade da Claro criada', claro.status === 201, detalhe(claro));
        if (claro.ok) criados.atividades.push(claro.corpo.id);
        conferir('aponta para o site cadastrado', claro.corpo.site_id === site.corpo.id);
        conferir('UF e município vêm do site', claro.corpo.estado === 'PA' && claro.corpo.municipio === 'Marabá', `${claro.corpo.estado} ${claro.corpo.municipio}`);

        const vivo = await atividade({ sharing: 'HIGHLINE', id_site_sharing: ID, operadora: 'VIVO', id_site_operadora: `PAVV${SUFIXO}` });
        if (vivo.ok) criados.atividades.push(vivo.corpo.id);
        conferir('atividade da Vivo cai no MESMO site', vivo.ok && vivo.corpo.site_id === site.corpo.id, detalhe(vivo));

        const segundoIdClaro = await post(`/sites/${site.corpo.id}/operadoras`, { operadora: 'CLARO', id_site: `PAMBB${SUFIXO}`, tecnologia: '5G' });
        conferir('segundo ID da Claro (outra tecnologia)', segundoIdClaro.status === 201, detalhe(segundoIdClaro));
        const repetidoClaro = await post(`/sites/${site.corpo.id}/operadoras`, { operadora: 'CLARO', id_site: `PAMBB${SUFIXO}` });
        const ficha = await json(`/sites/${site.corpo.id}`);
        const ids = (ficha.corpo.operadoras || []).map((o: any) => `${o.operadora}:${o.id_site}`).sort();
        conferir('ID repetido não duplica', repetidoClaro.ok && ids.length === 3, ids.join(' '));
        conferir('site tem 2 IDs Claro e 1 Vivo', ids.filter((i: string) => i.startsWith('CLARO')).length === 2 && ids.some((i: string) => i.startsWith('VIVO')), ids.join(' '));
        conferir('ficha lista as 2 atividades', ficha.corpo.atividades?.length === 2, String(ficha.corpo.atividades?.length));

        const porVivo = await json(`/sites/procurar?id=pavv${SUFIXO.toLowerCase()}`);
        conferir('busca pelo ID da Vivo acha o site', porVivo.corpo?.site?.id === site.corpo.id && porVivo.corpo?.encontradoPor === 'OPERADORA', JSON.stringify(porVivo.corpo?.encontradoPor));

        console.log('\n── Site novo pela atividade');
        const semLocal = await atividade({ sharing: 'IHS', id_site_sharing: `${ID}N`, operadora: 'TIM', id_site_operadora: `TIM${SUFIXO}` });
        conferir('site novo sem UF/município é recusado', semLocal.status === 400, detalhe(semLocal));
        const dono = await atividade({ sharing: 'CLARO', id_site_sharing: `${ID}C`, operadora: 'CLARO', estado: 'SP', municipio: 'Campinas' });
        if (dono.ok) { criados.atividades.push(dono.corpo.id); criados.sites.push(dono.corpo.site_id); }
        conferir('operadora dona da torre: ID dela = ID da detentora', dono.ok && dono.corpo.id_site_operadora === `${ID}C`, detalhe(dono));
        const fichaDono = await json(`/sites/${dono.corpo.site_id}`);
        conferir('site da Claro criado com o ID Claro', fichaDono.corpo.detentora === 'CLARO' && fichaDono.corpo.operadoras?.[0]?.id_site === `${ID}C`, JSON.stringify(fichaDono.corpo.operadoras));

        console.log('\n── Tipo da PV Highline');
        const pv = await atividade({
            tipo_demanda: 'IMPLANTACAO', subtipo_demanda: null, modelo_operacao: 'MEDIANTE_APROVACAO', tipo_obra: 'COLLO',
            sharing: 'HIGHLINE', id_site_sharing: ID, operadora: 'TIM', id_site_operadora: `PATM${SUFIXO}`,
        });
        if (pv.ok) criados.atividades.push(pv.corpo.id);
        conferir('BTS + obra Collo → "Collo - BTS" sem escolher na mão', pv.ok && pv.corpo.tipo_site_highline === 'Collo - BTS', `${detalhe(pv)} ${pv.corpo.tipo_site_highline}`);

        console.log('\n── Troca de detentora');
        const troca = await put(`/sites/${site.corpo.id}`, { detentora: 'IHS', id_site_detentora: `IHS${SUFIXO}` });
        conferir('detentora trocada', troca.ok && troca.corpo.detentora === 'IHS', detalhe(troca));
        const pelaAntiga = await json(`/sites/procurar?id=${ID}&detentora=HIGHLINE`);
        conferir('ID antigo da Highline continua achando o site', pelaAntiga.corpo?.site?.id === site.corpo.id && pelaAntiga.corpo?.encontradoPor === 'ID_ANTERIOR', JSON.stringify(pelaAntiga.corpo?.encontradoPor));
        const nova = await atividade({ sharing: 'HIGHLINE', id_site_sharing: ID, operadora: 'VIVO', id_site_operadora: `PAVV${SUFIXO}` });
        if (nova.ok) criados.atividades.push(nova.corpo.id);
        conferir('atividade aberta pelo ID antigo cai no mesmo site', nova.ok && nova.corpo.site_id === site.corpo.id, detalhe(nova));

        console.log('\n── Exclusão');
        const comAtividade = await json(`/sites/${site.corpo.id}`, { method: 'DELETE' });
        conferir('site com atividade não é excluído', comAtividade.status === 409, detalhe(comAtividade));
    } finally {
        for (const id of criados.atividades) {
            await json(`/atividades/${id}`, { method: 'DELETE', headers: cabecalho, body: JSON.stringify({ motivo: TESTE }) });
        }
        for (const id of criados.sites) {
            const r = await json(`/sites/${id}`, { method: 'DELETE' });
            if (r.status !== 204) console.log(`   (limpeza) site ${id}: ${detalhe(r)}`);
        }
    }
    console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
    process.exitCode = falhas ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
