import XLSX from 'xlsx';
const wb = XLSX.readFile('assets/lpu/PV MÉDIO CONSOLIDADO - LS OFFICE - 36 PVs.xlsx');
const ws = wb.Sheets['Análise das Médias'];
const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
console.log('=== ANÁLISE DAS MÉDIAS — primeiras 20 linhas ===');
linhas.slice(0, 20).forEach((l, i) => {
  const cels = l.map(c => c === null ? '' : String(c).slice(0, 34));
  console.log(String(i+1).padStart(3), '|', cels.join(' | '));
});
