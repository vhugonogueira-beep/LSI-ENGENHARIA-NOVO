import XLSX from 'xlsx';
import { HIGHLINE_PV_CATALOG } from './src/backend/data/highline-pv-catalog';

const wb = XLSX.readFile('assets/lpu/PV MÉDIO CONSOLIDADO - LS OFFICE - 36 PVs.xlsx');
const linhas: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Análise das Médias'], { header: 1, defval: null });

const planilha = linhas.slice(1)
  .filter(l => l[1] && l[5] != null)
  .map(l => ({
    atividade: String(l[0] || '').trim(),
    codigo: String(l[1]).trim(),
    descricao: String(l[2] || '').trim(),
    unidade: String(l[3] || '').trim(),
    n_pvs: Number(l[4]) || 0,
    media: Number(l[5]),
    variacao: Number(l[10]) || 1,
  }));

console.log('Itens com média na planilha:', planilha.length);
console.log('Itens no catálogo do sistema:', HIGHLINE_PV_CATALOG.length);

const codigosCatalogo = new Set(HIGHLINE_PV_CATALOG.map(c => c.code));
const casados = planilha.filter(p => codigosCatalogo.has(p.codigo));
const semCasar = planilha.filter(p => !codigosCatalogo.has(p.codigo));
const semPreco = HIGHLINE_PV_CATALOG.filter(c => !planilha.some(p => p.codigo === c.code));

console.log('');
console.log('CASAM pelo código:', casados.length);
console.log('NA PLANILHA mas não no catálogo:', semCasar.length);
semCasar.forEach(p => console.log('   -', p.codigo, '|', p.descricao.slice(0, 50)));
console.log('');
console.log('NO CATÁLOGO sem preço na planilha:', semPreco.length, '(de', HIGHLINE_PV_CATALOG.length + ')');

// unidade divergente
const porCodigo = new Map(HIGHLINE_PV_CATALOG.map(c => [c.code, c]));
const unidDif = casados.filter(p => {
  const c = porCodigo.get(p.codigo)!;
  return c.unit.trim().toUpperCase() !== p.unidade.trim().toUpperCase();
});
console.log('Unidade divergente:', unidDif.length);
unidDif.slice(0, 10).forEach(p => console.log('   -', p.codigo, '| planilha:', p.unidade, '| catálogo:', porCodigo.get(p.codigo)!.unit));

// itens com dispersão alta merecem atenção
const dispersos = casados.filter(p => p.variacao >= 2).sort((a, b) => b.variacao - a.variacao);
console.log('');
console.log('Itens com variação máx/mín >= 2x:', dispersos.length);
dispersos.slice(0, 10).forEach(p => console.log('   -', p.codigo, '|', p.descricao.slice(0,38), '| média', p.media, '| variação', p.variacao + 'x', '| PVs:', p.n_pvs));

// baseado em 1 único PV = média frágil
const fracos = casados.filter(p => p.n_pvs <= 1);
console.log('');
console.log('Média vinda de 1 único PV:', fracos.length);
