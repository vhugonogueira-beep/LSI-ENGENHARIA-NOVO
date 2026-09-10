export interface UfDefinition {
    sigla: string;
    nome: string;
    regiao: 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul';
}

export const UFS: readonly UfDefinition[] = [
    { sigla: 'AC', nome: 'Acre', regiao: 'Norte' },
    { sigla: 'AL', nome: 'Alagoas', regiao: 'Nordeste' },
    { sigla: 'AP', nome: 'Amapá', regiao: 'Norte' },
    { sigla: 'AM', nome: 'Amazonas', regiao: 'Norte' },
    { sigla: 'BA', nome: 'Bahia', regiao: 'Nordeste' },
    { sigla: 'CE', nome: 'Ceará', regiao: 'Nordeste' },
    { sigla: 'DF', nome: 'Distrito Federal', regiao: 'Centro-Oeste' },
    { sigla: 'ES', nome: 'Espírito Santo', regiao: 'Sudeste' },
    { sigla: 'GO', nome: 'Goiás', regiao: 'Centro-Oeste' },
    { sigla: 'MA', nome: 'Maranhão', regiao: 'Nordeste' },
    { sigla: 'MT', nome: 'Mato Grosso', regiao: 'Centro-Oeste' },
    { sigla: 'MS', nome: 'Mato Grosso do Sul', regiao: 'Centro-Oeste' },
    { sigla: 'MG', nome: 'Minas Gerais', regiao: 'Sudeste' },
    { sigla: 'PA', nome: 'Pará', regiao: 'Norte' },
    { sigla: 'PB', nome: 'Paraíba', regiao: 'Nordeste' },
    { sigla: 'PR', nome: 'Paraná', regiao: 'Sul' },
    { sigla: 'PE', nome: 'Pernambuco', regiao: 'Nordeste' },
    { sigla: 'PI', nome: 'Piauí', regiao: 'Nordeste' },
    { sigla: 'RJ', nome: 'Rio de Janeiro', regiao: 'Sudeste' },
    { sigla: 'RN', nome: 'Rio Grande do Norte', regiao: 'Nordeste' },
    { sigla: 'RS', nome: 'Rio Grande do Sul', regiao: 'Sul' },
    { sigla: 'RO', nome: 'Rondônia', regiao: 'Norte' },
    { sigla: 'RR', nome: 'Roraima', regiao: 'Norte' },
    { sigla: 'SC', nome: 'Santa Catarina', regiao: 'Sul' },
    { sigla: 'SP', nome: 'São Paulo', regiao: 'Sudeste' },
    { sigla: 'SE', nome: 'Sergipe', regiao: 'Nordeste' },
    { sigla: 'TO', nome: 'Tocantins', regiao: 'Norte' },
];

function chaveUf(value: string): string {
    return value
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .toUpperCase();
}

const UF_POR_CHAVE = new Map<string, UfDefinition>();
for (const uf of UFS) {
    UF_POR_CHAVE.set(uf.sigla, uf);
    UF_POR_CHAVE.set(chaveUf(uf.nome), uf);
}

export function normalizarUf(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    return UF_POR_CHAVE.get(chaveUf(value))?.sigla || null;
}

export function regiaoPorUf(value: unknown): UfDefinition['regiao'] | null {
    const sigla = normalizarUf(value);
    return sigla ? UF_POR_CHAVE.get(sigla)?.regiao || null : null;
}
