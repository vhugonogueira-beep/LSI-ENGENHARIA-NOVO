import { TIPOS_OBRA } from './constants';

// Tipo de obra com "Outros" aberto para digitação (08/10/2026). O texto digitado
// é gravado no próprio tipo_obra; para a matriz documental ele se comporta como
// "Outros" (só os documentos gerais, sem tipo), já que nenhum requisito é de
// "Outros" especificamente.

const ROTULO: Record<string, string> = {
    BTS: 'BTS', COLLO: 'Collo', RETROFIT: 'Retrofit', REFORCO_EV_FUNDACAO: 'Reforço / fundação', SLS: 'SLS', OUTROS: 'Outros (digitar)',
};
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
            <select className={className} value={livre ? 'OUTROS' : value} aria-label="Tipo de obra"
                onChange={e => onChange(e.target.value)}>
                <option value="">—</option>
                {TIPOS_OBRA.map(t => <option key={t} value={t}>{ROTULO[t] || t}</option>)}
            </select>
            {livre && (
                <input className={classeTexto || className} value={texto} required autoFocus={!texto}
                    aria-label="Qual o tipo de obra?" placeholder="Qual o tipo de obra? Ex.: Torre autoportante, Rooftop metálico"
                    // Vazio volta a ser "Outros" (o campo continua aberto); com texto, grava o texto.
                    onChange={e => onChange(e.target.value.trimStart() || 'OUTROS')} />
            )}
        </div>
    );
}
