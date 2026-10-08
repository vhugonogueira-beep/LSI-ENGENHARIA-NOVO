// Tipo de site unificado (decisão de 08/10/2026): um campo só na atividade,
// guardado em Atividade.tipo_obra, juntando o antigo "tipo de obra" e o
// "tipo de site". Dele saem, sem nova escolha:
//   - os documentos da matriz (tipoObraDocumental);
//   - o tipo da PV Highline (tipoHighlineDoTipoSite → tipo_site_highline);
//   - a estrutura do cadastro do site (estruturaDoTipoSite → Site.tipo_site).
// Espelhado no frontend em components/atividades/TipoObraCampo.tsx.

export const TIPOS_SITE_UNIFICADO: { valor: string; rotulo: string; highline: string | null; estrutura: string | null }[] = [
    { valor: 'BTS', rotulo: 'BTS', highline: 'BTS', estrutura: 'BTS' },
    { valor: 'ROOF_TOP', rotulo: 'Roof Top', highline: 'Roof Top', estrutura: 'Roof Top' },
    { valor: 'COLLO', rotulo: 'Collo - BTS', highline: 'Collo - BTS', estrutura: 'BTS' },
    { valor: 'COLLO_RT', rotulo: 'Collo RT', highline: 'Collo RT', estrutura: 'Roof Top' },
    { valor: 'RETROFIT', rotulo: 'Retrofit', highline: null, estrutura: null },
    { valor: 'REFORCO_EV_FUNDACAO', rotulo: 'Reforço / fundação', highline: 'Reforço', estrutura: null },
    { valor: 'SLS', rotulo: 'SLS', highline: null, estrutura: null },
    { valor: 'INDOOR', rotulo: 'Indoor', highline: null, estrutura: 'Indoor' },
    { valor: 'POSTE_STREET', rotulo: 'Poste / Street', highline: null, estrutura: 'Poste/Street' },
    { valor: 'OUTROS', rotulo: 'Outros', highline: null, estrutura: null },
];
const POR_VALOR = new Map(TIPOS_SITE_UNIFICADO.map(t => [t.valor, t]));

/** Tipo da PV Highline (BTS, Roof Top, Collo - BTS, Collo RT, Reforço) ou null. */
export const tipoHighlineDoTipoSite = (tipo?: string | null) => (tipo ? POR_VALOR.get(tipo)?.highline ?? null : null);

/** Estrutura física para o cadastro do site (BTS, Roof Top, Indoor, Poste/Street) ou null. */
export const estruturaDoTipoSite = (tipo?: string | null) => (tipo ? POR_VALOR.get(tipo)?.estrutura ?? null : null);

/** Tipo usado na matriz documental: Collo RT segue os documentos de Collo; texto livre vale como Outros. */
export function tipoObraDocumental(tipo?: string | null): string | null {
    if (!tipo) return null;
    if (tipo === 'COLLO_RT') return 'COLLO';
    return POR_VALOR.has(tipo) ? tipo : 'OUTROS';
}

/** Caminho inverso, para quem só tem o tipo da PV Highline gravado. */
export function tipoSiteDoHighline(highline?: string | null): string | null {
    return TIPOS_SITE_UNIFICADO.find(t => t.highline === highline)?.valor ?? null;
}
