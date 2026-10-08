import { TIPOS_OBRA } from './constants';

// Tipo de site unificado (08/10/2026): um campo só, que junta o antigo "tipo de
// obra", o "tipo de site" e o "tipo de site Highline". Gravado em tipo_obra; o
// backend tira dele os documentos, o tipo da PV Highline e a estrutura do site
// (utils/tipo-site.ts). "Outros" abre a digitação; o texto vale como Outros na
// matriz documental (só os documentos gerais).

const ROTULO: Record<string, string> = {
    BTS: 'BTS', ROOF_TOP: 'Roof Top', COLLO: 'Collo - BTS', COLLO_RT: 'Collo RT', RETROFIT: 'Retrofit',
    REFORCO_EV_FUNDACAO: 'Reforço / fundação', SLS: 'SLS', INDOOR: 'Indoor', POSTE_STREET: 'Poste / Street', OUTROS: 'Outros (digitar)',
};
/** Tipos que a PV Highline aceita — os demais deixam a implantação Highline sem PV. */
export const TIPOS_SITE_PV_HIGHLINE = ['BTS', 'ROOF_TOP', 'COLLO', 'COLLO_RT', 'REFORCO_EV_FUNDACAO'];

/** Nome para exibir: o rótulo da lista ou o texto digitado. */
export const rotuloTipoSite = (v?: string | null) => (v ? (v === 'OUTROS' ? 'Outros' : ROTULO[v] || v) : '');

/** Estrutura do cadastro do site → tipo de site unificado (para pré-preencher). */
export const tipoSiteDaEstrutura = (estrutura?: string | null) =>
    ({ BTS: 'BTS', 'Roof Top': 'ROOF_TOP', Indoor: 'INDOOR', 'Poste/Street': 'POSTE_STREET' } as Record<string, string>)[estrutura || ''] || '';
const PADRAO = TIPOS_OBRA.filter(t => t !== 'OUTROS');

/** "Outros" ou um tipo digitado: algo que não é um dos tipos da lista. */
export const ehTipoObraLivre = (v?: string | null) => Boolean(v) && !PADRAO.includes(v!);

export default function TipoObraCampo({ value, onChange, className, classeTexto }: {
    value: string;
    onChange: (v: string) => void;
    className: string;
    /** Classe do campo de digitação, quando diferente do seletor. */
    classeTexto?: string;
}) {
    const livre = ehTipoObraLivre(value);
    const texto = livre && value !== 'OUTROS' ? value : '';
    return (
        <div className="flex flex-col gap-2">
            <select className={className} value={livre ? 'OUTROS' : value} aria-label="Tipo de site"
                onChange={e => onChange(e.target.value)}>
                <option value="">—</option>
                {TIPOS_OBRA.map(t => <option key={t} value={t}>{ROTULO[t] || t}</option>)}
            </select>
            {livre && (
                <input className={classeTexto || className} value={texto} required autoFocus={!texto}
                    aria-label="Qual o tipo de site?" placeholder="Qual o tipo de site? Ex.: Torre autoportante, Greenfield metálico"
                    // Vazio volta a ser "Outros" (o campo continua aberto); com texto, grava o texto.
                    onChange={e => onChange(e.target.value.trimStart() || 'OUTROS')} />
            )}
        </div>
    );
}
