import { useEffect, useId, useState } from 'react';
import { chaveTexto } from '../atividades/constants';

export interface Municipio { codigo_ibge: string; nome: string; uf: string }

// Uma UF é baixada uma vez por sessão: o formulário abre e fecha várias vezes
// e a lista do IBGE não muda.
const cache = new Map<string, Promise<Municipio[]>>();

export function carregarMunicipios(uf: string): Promise<Municipio[]> {
    if (!uf) return Promise.resolve([]);
    if (!cache.has(uf)) {
        cache.set(uf, fetch(`/api/localidades/municipios?uf=${encodeURIComponent(uf)}`)
            .then(r => (r.ok ? r.json() : []))
            .catch(() => { cache.delete(uf); return []; }));
    }
    return cache.get(uf)!;
}

export function useMunicipios(uf?: string | null): Municipio[] {
    const [lista, setLista] = useState<Municipio[]>([]);
    useEffect(() => {
        let vivo = true;
        carregarMunicipios(uf || '').then(l => { if (vivo) setLista(l); });
        return () => { vivo = false; };
    }, [uf]);
    return lista;
}

/**
 * Campo de município ligado à base IBGE da UF escolhida.
 *
 * Aceita digitar com sugestão, e ao sair do campo troca o texto pelo nome
 * oficial ("labrea" → "Lábrea"). Valor que não existe na UF continua salvo —
 * há cadastro antigo com texto livre —, mas aparece sinalizado.
 */
export default function MunicipioInput({ uf, value, onChange, className, required }: {
    uf?: string | null;
    value: string;
    onChange: (nome: string, municipio: Municipio | null) => void;
    className?: string;
    required?: boolean;
}) {
    const id = useId();
    const municipios = useMunicipios(uf);
    const achar = (nome: string) => {
        const chave = chaveTexto(nome || '');
        return chave ? municipios.find(m => chaveTexto(m.nome) === chave) || null : null;
    };
    const foraDaBase = Boolean(uf && value?.trim() && municipios.length && !achar(value));

    return (
        <>
            <input
                list={id}
                className={className}
                required={required}
                value={value || ''}
                disabled={!uf}
                placeholder={uf ? `Digite para buscar (${municipios.length} em ${uf})` : 'Escolha a UF primeiro'}
                onChange={e => onChange(e.target.value, achar(e.target.value))}
                onBlur={() => { const m = achar(value); if (m && m.nome !== value) onChange(m.nome, m); }}
            />
            <datalist id={id}>
                {municipios.map(m => <option key={m.codigo_ibge} value={m.nome} />)}
            </datalist>
            {foraDaBase && (
                <span className="mt-1 block text-[11px] text-amber-500">Não consta na base IBGE de {uf} — confira a grafia.</span>
            )}
        </>
    );
}
