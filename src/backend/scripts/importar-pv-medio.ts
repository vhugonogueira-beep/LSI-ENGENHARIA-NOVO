// Leitor da planilha "PV MEDIO CONSOLIDADO" (aba "Analise das Medias").
//
// Este arquivo NAO cria mais base nenhuma. A media das PVs e preco de CLIENTE,
// nao estrutura da PV — quem monta as bases e reestruturar-bases-pv.ts, que
// importa lerAnaliseDasMedias daqui.

import XLSX from 'xlsx';


const ABA = 'Análise das Médias';

interface LinhaMedia {
    atividade: string;
    codigo: string;
    descricao: string;
    unidade: string;
    n_pvs: number;
    media: number;
    mediana: number;
    minimo: number;
    maximo: number;
    variacao: number;
}

export function lerAnaliseDasMedias(arquivo: string): LinhaMedia[] {
    const wb = XLSX.readFile(arquivo);
    if (!wb.Sheets[ABA]) throw new Error(`A planilha não tem a aba "${ABA}"`);

    const linhas: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[ABA], { header: 1, defval: null });
    return linhas.slice(1)
        .filter(l => l[1] && l[5] != null && Number(l[5]) > 0)
        .map(l => ({
            atividade: String(l[0] ?? '').trim(),
            codigo: String(l[1]).trim(),
            descricao: String(l[2] ?? '').trim(),
            unidade: String(l[3] ?? '').trim(),
            n_pvs: Number(l[4]) || 0,
            media: Number(l[5]),
            mediana: Number(l[6]) || 0,
            minimo: Number(l[7]) || 0,
            maximo: Number(l[8]) || 0,
            variacao: Number(l[10]) || 1,
        }));
}

