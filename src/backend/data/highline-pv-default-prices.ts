export interface HighlinePvDefaultPriceSet {
    source: string;
    values: Record<number, number>;
}

// Valores preenchidos na aba Quantitativos do PV de referência recebido para PA.
// A linha do template é a chave porque a planilha contém códigos repetidos.
const DEFAULT_PRICES_BY_UF: Record<string, HighlinePvDefaultPriceSet> = {
    PA: {
        source: 'PV Highline de referência recebido - PA',
        values: {
            49: 367,
            63: 956.30,
            64: 3316.70,
            65: 52.29,
            71: 178.20,
            72: 12994.74,
            73: 12994.74,
            76: 1350,
            77: 350,
            80: 7650,
            86: 25,
            87: 38,
            88: 270,
            98: 50.63,
            100: 112.70,
            101: 27.25,
            102: 34,
            103: 3500,
            105: 90,
            113: 4500,
            122: 4500,
            124: 450,
        },
    },
};

export function getHighlinePvDefaultPriceSet(uf?: string | null): HighlinePvDefaultPriceSet | null {
    if (!uf) return null;
    return DEFAULT_PRICES_BY_UF[uf.trim().toUpperCase()] || null;
}
