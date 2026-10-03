// Cadastro único de sites (decisão de 03/10/2026).
//
// O site é identificado pela DETENTORA + o ID do site nela. A detentora pode
// ser uma sharing (Highline, IHS...) ou uma operadora dona da torre. Quem usa
// o site (Claro, Vivo...) entra em SiteOperadora com o próprio ID, e a mesma
// operadora pode ter mais de um ID ali — o ID muda com a tecnologia.
//
// Um acionamento novo no mesmo lugar NÃO cria outro site: acha o existente
// pela detentora + ID e, se a operadora for nova, acrescenta o ID dela.

import { Prisma } from '@prisma/client';
import { prisma } from '../server';
import { normalizarUf } from '../utils/uf';
import { encontrarMunicipio } from './localidades.service';

export const DETENTORAS = ['HIGHLINE', 'IHS', 'WINITY', 'SBA', 'AMERICAN TOWER', 'PHOENIX', 'VIVO', 'CLARO', 'TIM', 'OI', 'OUTROS'];
export const OPERADORAS = ['VIVO', 'CLARO', 'TIM', 'OI', 'OUTROS'];
/** Lista única de tipo de site. O tipo da PV Highline sai dele + tipo de obra (tipoSiteHighline). */
export const TIPOS_SITE = ['BTS', 'Roof Top', 'Indoor', 'Poste/Street', 'Outro'];
export const TECNOLOGIAS = ['2G', '3G', '4G', '5G', 'OUTRA'];

type Cliente = Prisma.TransactionClient | typeof prisma;

/** IDs de site são comparados sem espaço e em maiúsculas: "pa mrb008 " = "PAMRB008". */
export function normalizarIdSite(valor: unknown): string {
    return String(valor ?? '').replace(/\s+/g, '').toUpperCase();
}

export function normalizarDetentora(valor: unknown): string {
    return String(valor ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Tipo de site da PV Highline a partir da lista única + tipo de obra:
 * Collo sobre BTS → "Collo - BTS", Collo em Roof Top → "Collo RT",
 * reforço de estrutura → "Reforço". Null quando não há correspondência.
 */
export function tipoSiteHighline(tipoSite?: string | null, tipoObra?: string | null): string | null {
    if (tipoObra === 'REFORCO_EV_FUNDACAO') return 'Reforço';
    const collo = tipoObra === 'COLLO';
    if (tipoSite === 'BTS') return collo ? 'Collo - BTS' : 'BTS';
    if (tipoSite === 'Roof Top') return collo ? 'Collo RT' : 'Roof Top';
    return null;
}

/** Caminho inverso, para migrar o que estava gravado nas atividades. */
export function tipoSiteDoHighline(tipoHighline?: string | null): string | null {
    if (tipoHighline === 'BTS' || tipoHighline === 'Collo - BTS') return 'BTS';
    if (tipoHighline === 'Roof Top' || tipoHighline === 'Collo RT') return 'Roof Top';
    return null;
}

// ── Coordenadas ───────────────────────────────────────────────────────────
// Aceita decimal ("-23.5505, -46.6333" ou com vírgula decimal "-23,5505 -46,6333")
// e graus/minutos/segundos ("23°33'01\"S 46°38'02\"W", com O/L em português).

const GMS = /(-)?\s*(\d{1,3}(?:[.,]\d+)?)\s*[°º]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’])?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:["″”]|''))?\s*([NSLOEW])?/gi;

const num = (v?: string) => (v ? Number(v.replace(',', '.')) : 0);

export function lerCoordenadas(texto: unknown): { latitude: number; longitude: number } {
    const s = String(texto ?? '').trim();
    if (!s) throw new Error('Coordenadas vazias');
    let lat: number | undefined;
    let lng: number | undefined;
    if (/[°º]/.test(s)) {
        const partes = [...s.matchAll(GMS)].filter(m => m[0].trim());
        if (partes.length !== 2) throw new Error('Coordenadas em graus precisam de latitude e longitude, ex.: 23°33\'01"S 46°38\'02"W');
        const [a, b] = partes.map(m => {
            let v = num(m[2]) + num(m[3]) / 60 + num(m[4]) / 3600;
            const hemisferio = (m[5] || '').toUpperCase();
            if (m[1] || hemisferio === 'S' || hemisferio === 'O' || hemisferio === 'W') v = -v;
            return { v, hemisferio };
        });
        // Quem vem marcado com L/O/E/W é longitude, mesmo escrito primeiro.
        const invertido = 'LOEW'.includes(a.hemisferio || '-') && 'NS'.includes(b.hemisferio || '-');
        [lat, lng] = invertido ? [b.v, a.v] : [a.v, b.v];
    } else {
        const m = s.match(/^(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
        if (!m) throw new Error('Coordenadas inválidas — use "-23.5505, -46.6333" ou 23°33\'01"S 46°38\'02"W');
        [lat, lng] = [num(m[1]), num(m[2])];
    }
    if (!Number.isFinite(lat) || Math.abs(lat!) > 90) throw new Error('Latitude fora do intervalo (-90 a 90)');
    if (!Number.isFinite(lng) || Math.abs(lng!) > 180) throw new Error('Longitude fora do intervalo (-180 a 180)');
    const arred = (v: number) => Math.round(v * 1e6) / 1e6;
    return { latitude: arred(lat!), longitude: arred(lng!) };
}

// ── Leitura ───────────────────────────────────────────────────────────────

const INCLUIR_LISTA = {
    operadoras: { orderBy: [{ operadora: 'asc' as const }, { id_site: 'asc' as const }] },
    idsAnteriores: { orderBy: { substituido_em: 'desc' as const } },
    _count: { select: { atividades: true } },
};

export async function listarSites(tenantId: string) {
    return prisma.site.findMany({
        where: { tenant_id: tenantId },
        include: INCLUIR_LISTA,
        orderBy: [{ detentora: 'asc' }, { id_site_detentora: 'asc' }],
    });
}

export async function obterSite(tenantId: string, id: string) {
    const site = await prisma.site.findFirst({
        where: { id, tenant_id: tenantId },
        include: {
            ...INCLUIR_LISTA,
            atividades: {
                select: {
                    id: true, codigo: true, titulo: true, tipo_demanda: true, subtipo_demanda: true,
                    operadora: true, id_site_operadora: true, status_operacional: true, data_abertura: true,
                },
                orderBy: { data_abertura: 'desc' },
            },
        },
    });
    if (!site) throw new ErroSite(404, 'Site não encontrado');
    return site;
}

/**
 * Acha o site por um ID qualquer: o da detentora (atual ou anterior) ou o de
 * uma operadora. Com `detentora`, procura só o ID dela — é o que a abertura de
 * atividade usa.
 */
export async function procurarSite(tenantId: string, id: unknown, detentora?: unknown) {
    const codigo = normalizarIdSite(id);
    if (!codigo) return null;
    const det = detentora ? normalizarDetentora(detentora) : '';
    const atual = await prisma.site.findFirst({
        where: { tenant_id: tenantId, id_site_detentora: codigo, ...(det ? { detentora: det } : {}) },
        include: INCLUIR_LISTA,
    });
    if (atual) return { site: atual, encontradoPor: 'DETENTORA' as const };
    const anterior = await prisma.siteIdAnterior.findFirst({
        where: { id_site_detentora: codigo, ...(det ? { detentora: det } : {}), site: { tenant_id: tenantId } },
        include: { site: { include: INCLUIR_LISTA } },
    });
    if (anterior) return { site: anterior.site, encontradoPor: 'ID_ANTERIOR' as const };
    if (det) return null;
    const daOperadora = await prisma.siteOperadora.findFirst({
        where: { id_site: codigo, site: { tenant_id: tenantId } },
        include: { site: { include: INCLUIR_LISTA } },
    });
    return daOperadora ? { site: daOperadora.site, encontradoPor: 'OPERADORA' as const } : null;
}

/**
 * Sites cujo ID (da detentora, anterior ou de operadora) contém o trecho
 * digitado — sugestões enquanto a pessoa digita, de qualquer detentora.
 */
export async function sugerirSites(tenantId: string, trecho: unknown) {
    const q = normalizarIdSite(trecho);
    if (q.length < 2) return [];
    return prisma.site.findMany({
        where: {
            tenant_id: tenantId,
            OR: [
                { id_site_detentora: { contains: q } },
                { operadoras: { some: { id_site: { contains: q } } } },
                { idsAnteriores: { some: { id_site_detentora: { contains: q } } } },
            ],
        },
        include: INCLUIR_LISTA,
        orderBy: [{ detentora: 'asc' }, { id_site_detentora: 'asc' }],
        take: 8,
    });
}

// ── Escrita ───────────────────────────────────────────────────────────────

export class ErroSite extends Error {
    constructor(public status: number, mensagem: string) { super(mensagem); }
}

const texto = (v: unknown) => (v === undefined ? undefined : (String(v ?? '').trim() || null));

/** Campos editáveis do cadastro, validados. Só o que veio no corpo entra. */
function dadosDoCorpo(corpo: any, exigirObrigatorios: boolean) {
    const dados: Record<string, any> = {};
    if (corpo.detentora !== undefined || exigirObrigatorios) {
        const det = normalizarDetentora(corpo.detentora);
        if (!det) throw new ErroSite(400, 'Informe a detentora do site');
        dados.detentora = det;
    }
    if (corpo.id_site_detentora !== undefined || exigirObrigatorios) {
        const id = normalizarIdSite(corpo.id_site_detentora);
        if (!id) throw new ErroSite(400, 'Informe o ID do site na detentora');
        dados.id_site_detentora = id;
        dados.id_site = id;
    }
    if (corpo.uf !== undefined || exigirObrigatorios) {
        const uf = normalizarUf(corpo.uf);
        if (!uf) throw new ErroSite(400, 'Informe a UF do site');
        dados.uf = uf;
    }
    if (corpo.cidade !== undefined || corpo.municipio !== undefined || exigirObrigatorios) {
        const nome = corpo.cidade ?? corpo.municipio;
        if (!String(nome ?? '').trim()) throw new ErroSite(400, 'Informe o município do site');
        dados.cidade = String(nome).trim();
    }
    if (corpo.tipo_site !== undefined) {
        const tipo = texto(corpo.tipo_site);
        if (tipo && !TIPOS_SITE.includes(tipo)) throw new ErroSite(400, `Tipo de site inválido. Use: ${TIPOS_SITE.join(', ')}`);
        dados.tipo_site = tipo;
    }
    for (const campo of ['endereco', 'bairro', 'proprietario_nome', 'proprietario_telefone', 'proprietario_email', 'proprietario_observacao', 'observacoes']) {
        if (corpo[campo] !== undefined) dados[campo] = texto(corpo[campo]);
    }
    if (corpo.cep !== undefined) {
        const cep = String(corpo.cep ?? '').replace(/\D/g, '');
        if (cep && cep.length !== 8) throw new ErroSite(400, 'CEP deve ter 8 dígitos');
        dados.cep = cep ? `${cep.slice(0, 5)}-${cep.slice(5)}` : null;
    }
    if (corpo.coordenadas !== undefined) {
        if (!String(corpo.coordenadas ?? '').trim()) { dados.latitude = null; dados.longitude = null; }
        else {
            try { Object.assign(dados, lerCoordenadas(corpo.coordenadas)); }
            catch (e: any) { throw new ErroSite(400, e.message); }
        }
    }
    return dados;
}

/** UF + município valem pelo nome oficial do IBGE. */
function conferirMunicipio(dados: Record<string, any>, ufAtual?: string | null) {
    if (dados.cidade === undefined && dados.uf === undefined) return;
    const uf = dados.uf ?? ufAtual;
    if (!dados.cidade) return;
    const oficial = encontrarMunicipio(uf, dados.cidade);
    if (!oficial) throw new ErroSite(400, `Município "${dados.cidade}" não encontrado em ${uf}`);
    dados.cidade = oficial.nome;
}

async function conferirChaveLivre(db: Cliente, tenantId: string, detentora: string, id: string, ignorarSiteId?: string) {
    const outro = await db.site.findFirst({
        where: { tenant_id: tenantId, detentora, id_site_detentora: id, ...(ignorarSiteId ? { NOT: { id: ignorarSiteId } } : {}) },
    });
    if (outro) throw new ErroSite(409, `Já existe o site ${detentora} ${id} — abra o cadastro dele`);
}

async function auditar(db: Cliente, tenantId: string, userId: string | null, siteId: string, acao: string, antes: unknown, depois: unknown) {
    await db.auditLog.create({
        data: {
            tenant_id: tenantId, entidade: 'Site', entidade_id: siteId, acao,
            antes_json: antes == null ? null : JSON.stringify(antes),
            depois_json: depois == null ? null : JSON.stringify(depois),
            user_id: userId,
        },
    });
}

export interface Autor { userId: string | null; email: string | null }

export async function criarSite(tenantId: string, corpo: any, autor: Autor) {
    const dados = dadosDoCorpo(corpo, true);
    conferirMunicipio(dados);
    return prisma.$transaction(async tx => {
        await conferirChaveLivre(tx, tenantId, dados.detentora, dados.id_site_detentora);
        const site = await tx.site.create({ data: { ...dados, tenant_id: tenantId, created_by: autor.email } as any });
        for (const op of Array.isArray(corpo.operadoras) ? corpo.operadoras : []) {
            await gravarIdOperadora(tx, site.id, op);
        }
        await auditar(tx, tenantId, autor.userId, site.id, 'SITE_CRIADO', null, dados);
        return site;
    });
}

export async function atualizarSite(tenantId: string, id: string, corpo: any, autor: Autor) {
    const atual = await prisma.site.findFirst({ where: { id, tenant_id: tenantId } });
    if (!atual) throw new ErroSite(404, 'Site não encontrado');
    const dados = dadosDoCorpo(corpo, false);
    conferirMunicipio(dados, atual.uf);
    return prisma.$transaction(async tx => {
        const novaDetentora = dados.detentora ?? atual.detentora;
        const novoId = dados.id_site_detentora ?? atual.id_site_detentora;
        const trocouChave = novaDetentora !== atual.detentora || novoId !== atual.id_site_detentora;
        if (trocouChave) {
            await conferirChaveLivre(tx, tenantId, novaDetentora!, novoId!, id);
            // Torre que mudou de dono: o ID antigo continua achando o site.
            if (atual.detentora && atual.id_site_detentora) {
                await tx.siteIdAnterior.create({
                    data: { site_id: id, detentora: atual.detentora, id_site_detentora: atual.id_site_detentora, registrado_por: autor.email },
                });
            }
        }
        const site = await tx.site.update({ where: { id }, data: dados });
        const antes = Object.fromEntries(Object.keys(dados).map(k => [k, (atual as any)[k]]));
        await auditar(tx, tenantId, autor.userId, id, trocouChave ? 'SITE_DETENTORA_ALTERADA' : 'SITE_ATUALIZADO', antes, dados);
        return site;
    });
}

/** Grava um ID de operadora no site; repetido não duplica. */
async function gravarIdOperadora(db: Cliente, siteId: string, corpo: any) {
    const operadora = normalizarDetentora(corpo?.operadora);
    const idSite = normalizarIdSite(corpo?.id_site);
    if (!operadora) throw new ErroSite(400, 'Informe a operadora');
    if (!idSite) throw new ErroSite(400, 'Informe o ID do site na operadora');
    const tecnologia = texto(corpo?.tecnologia)?.toUpperCase() || null;
    if (tecnologia && !TECNOLOGIAS.includes(tecnologia)) throw new ErroSite(400, `Tecnologia inválida. Use: ${TECNOLOGIAS.join(', ')}`);
    const existente = await db.siteOperadora.findFirst({ where: { site_id: siteId, operadora, id_site: idSite } });
    if (existente) {
        if (tecnologia && existente.tecnologia !== tecnologia) {
            return db.siteOperadora.update({ where: { id: existente.id }, data: { tecnologia } });
        }
        return existente;
    }
    return db.siteOperadora.create({ data: { site_id: siteId, operadora, id_site: idSite, tecnologia } });
}

export async function adicionarIdOperadora(tenantId: string, siteId: string, corpo: any, autor: Autor) {
    const site = await prisma.site.findFirst({ where: { id: siteId, tenant_id: tenantId } });
    if (!site) throw new ErroSite(404, 'Site não encontrado');
    const registro = await gravarIdOperadora(prisma, siteId, corpo);
    await auditar(prisma, tenantId, autor.userId, siteId, 'SITE_ID_OPERADORA_GRAVADO', null, registro);
    return registro;
}

export async function removerIdOperadora(tenantId: string, siteId: string, registroId: string, autor: Autor) {
    const registro = await prisma.siteOperadora.findFirst({ where: { id: registroId, site_id: siteId, site: { tenant_id: tenantId } } });
    if (!registro) throw new ErroSite(404, 'ID de operadora não encontrado neste site');
    await prisma.siteOperadora.delete({ where: { id: registroId } });
    await auditar(prisma, tenantId, autor.userId, siteId, 'SITE_ID_OPERADORA_REMOVIDO', registro, null);
}

/** Exclusão (rota só de administrador). Site com atividade não sai: é o histórico dela. */
export async function excluirSite(tenantId: string, id: string, autor: Autor) {
    const site = await prisma.site.findFirst({
        where: { id, tenant_id: tenantId },
        include: { _count: { select: { atividades: true, budgets: true, demandas: true } } },
    });
    if (!site) throw new ErroSite(404, 'Site não encontrado');
    const vinculos = site._count.atividades + site._count.budgets + site._count.demandas;
    if (vinculos > 0) {
        throw new ErroSite(409, `O site tem ${site._count.atividades} atividade(s) e outros ${site._count.budgets + site._count.demandas} registro(s) vinculados — não pode ser excluído`);
    }
    await prisma.$transaction(async tx => {
        await tx.site.delete({ where: { id } });
        await auditar(tx, tenantId, autor.userId, id, 'SITE_EXCLUIDO', { detentora: site.detentora, id_site_detentora: site.id_site_detentora }, null);
    });
}

// ── Atividade ↔ site ─────────────────────────────────────────────────────

export interface DadosSiteDaAtividade {
    detentora: unknown;
    id_site_detentora: unknown;
    operadora?: unknown;
    id_site_operadora?: unknown;
    uf?: unknown;
    municipio?: unknown;
    tipo_site?: unknown;
}

/**
 * Acha (ou cria) o site da atividade e grava nele o ID da operadora, se for
 * novo. Site novo exige UF e município — salvo na migração (`permitirIncompleto`),
 * que só copia o que as atividades antigas já tinham.
 */
export async function vincularSiteDaAtividade(
    db: Cliente, tenantId: string, d: DadosSiteDaAtividade, autor: Autor, permitirIncompleto = false,
) {
    const detentora = normalizarDetentora(d.detentora);
    const idDetentora = normalizarIdSite(d.id_site_detentora);
    if (!detentora || !idDetentora) return null;

    let site = await db.site.findFirst({ where: { tenant_id: tenantId, detentora, id_site_detentora: idDetentora } });
    if (!site) {
        const anterior = await db.siteIdAnterior.findFirst({
            where: { detentora, id_site_detentora: idDetentora, site: { tenant_id: tenantId } }, include: { site: true },
        });
        site = anterior?.site || null;
    }
    if (!site) {
        const uf = normalizarUf(d.uf);
        const nome = String(d.municipio ?? '').trim();
        if (!permitirIncompleto && (!uf || !nome)) {
            throw new ErroSite(400, `O site ${detentora} ${idDetentora} ainda não está cadastrado — informe UF e município para cadastrá-lo`);
        }
        const oficial = uf && nome ? encontrarMunicipio(uf, nome) : null;
        if (!permitirIncompleto && !oficial) throw new ErroSite(400, `Município "${nome}" não encontrado em ${uf}`);
        const tipo = typeof d.tipo_site === 'string' && TIPOS_SITE.includes(d.tipo_site) ? d.tipo_site : null;
        site = await db.site.create({
            data: {
                tenant_id: tenantId, detentora, id_site_detentora: idDetentora, id_site: idDetentora,
                uf: uf || null, cidade: oficial?.nome || nome || null, tipo_site: tipo, created_by: autor.email,
            },
        });
        await auditar(db, tenantId, autor.userId, site.id, 'SITE_CRIADO', null, { origem: 'ATIVIDADE', detentora, id_site_detentora: idDetentora });
    }

    // Site sem tipo ganha o que veio na atividade; tipo já gravado não é sobrescrito.
    if (!site.tipo_site && typeof d.tipo_site === 'string' && TIPOS_SITE.includes(d.tipo_site)) {
        site = await db.site.update({ where: { id: site.id }, data: { tipo_site: d.tipo_site } });
    }

    const operadora = normalizarDetentora(d.operadora);
    // Operadora dona da torre: o ID dela é o próprio ID da detentora.
    const idOperadora = normalizarIdSite(d.id_site_operadora) || (operadora && operadora === detentora ? idDetentora : '');
    if (operadora && idOperadora) {
        await gravarIdOperadora(db, site.id, { operadora, id_site: idOperadora });
    }
    return site;
}

/**
 * Liga ao cadastro único as atividades que ainda não têm site (migração de
 * 03/10/2026). Idempotente: rodar de novo só pega o que ficou de fora. Site
 * criado aqui copia o que a atividade tinha, mesmo sem UF ou município.
 */
export async function vincularAtividadesSemSite(tenantId: string, autor: Autor) {
    const pendentes = await prisma.atividade.findMany({
        where: { tenant_id: tenantId, site_id: null },
        select: { id: true, codigo: true, sharing: true, id_site_sharing: true, operadora: true, id_site_operadora: true, estado: true, municipio: true, tipo_site_highline: true },
        orderBy: { created_at: 'asc' },
    });
    const resultado = { atividades: pendentes.length, vinculadas: 0, sitesCriados: 0, semId: [] as string[] };
    const antes = await prisma.site.count({ where: { tenant_id: tenantId } });
    for (const a of pendentes) {
        await prisma.$transaction(async tx => {
            const site = await vincularSiteDaAtividade(tx, tenantId, {
                detentora: a.sharing, id_site_detentora: a.id_site_sharing, operadora: a.operadora,
                id_site_operadora: a.id_site_operadora, uf: a.estado, municipio: a.municipio,
                tipo_site: tipoSiteDoHighline(a.tipo_site_highline),
            }, autor, true);
            if (!site) { resultado.semId.push(a.codigo); return; }
            // Site antigo sem localização herda a da atividade.
            if ((!site.uf && a.estado) || (!site.cidade && a.municipio)) {
                await tx.site.update({ where: { id: site.id }, data: { uf: site.uf || normalizarUf(a.estado), cidade: site.cidade || a.municipio } });
            }
            await tx.atividade.update({ where: { id: a.id }, data: { site_id: site.id } });
            resultado.vinculadas++;
        });
    }
    resultado.sitesCriados = (await prisma.site.count({ where: { tenant_id: tenantId } })) - antes;
    return resultado;
}
