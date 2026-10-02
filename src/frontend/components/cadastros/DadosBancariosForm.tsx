const input = 'w-full border border-border rounded-lg p-2.5 bg-secondary/40 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';
const label = 'block text-xs font-semibold text-muted-foreground mb-1';

const BANCOS = [
  'Banco do Brasil', 'Bradesco', 'Caixa Econômica Federal', 'Itaú', 'Santander',
  'Banco Inter', 'Nubank', 'C6 Bank', 'PagBank', 'Mercado Pago', 'Sicredi', 'Sicoob', 'N/A',
];

const PIX = [
  ['CPF', 'CPF'], ['CNPJ', 'CNPJ'], ['EMAIL', 'E-mail'], ['TELEFONE', 'Celular/telefone'],
  ['ALEATORIA', 'Chave aleatória'], ['NAO_POSSUI', 'Não possui PIX'],
];

const CONTAS = [
  ['CORRENTE', 'Conta corrente'], ['POUPANCA', 'Conta poupança'],
  ['PAGAMENTO', 'Conta de pagamento'], ['SALARIO', 'Conta salário'], ['NAO_APLICAVEL', 'Não aplicável'],
];

const FORMAS = [
  ['PIX', 'PIX'], ['TED', 'Transferência bancária'], ['BOLETO', 'Boleto'],
  ['CARTAO_CREDITO', 'Cartão de crédito corporativo'], ['DINHEIRO', 'Dinheiro'],
];

export type DadosBancariosValue = {
  forma_pagamento?: string;
  pix_tipo?: string;
  pix_chave?: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  tipo_conta?: string;
};

export default function DadosBancariosForm({ value, onChange, mostrarFormaPagamento = true, formasPermitidas }: {
  value: DadosBancariosValue;
  onChange: (campo: keyof DadosBancariosValue, valor: string) => void;
  mostrarFormaPagamento?: boolean;
  formasPermitidas?: string[];
}) {
  const bancoSelecionado = !value.banco ? '' : BANCOS.includes(value.banco) ? value.banco : 'OUTRO';
  const bancoPersonalizado = bancoSelecionado === 'OUTRO';
  const pixSelecionado = normalizarPix(value.pix_tipo);
  const contaSelecionada = normalizarConta(value.tipo_conta);
  const semPix = pixSelecionado === 'NAO_POSSUI';
  const formas = formasPermitidas?.length ? FORMAS.filter(([v]) => formasPermitidas.includes(v)) : FORMAS;

  return <section className="bg-secondary/20 border border-border rounded-lg p-4">
    <h3 className="text-sm font-bold mb-3">Dados bancários / PIX</h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {mostrarFormaPagamento && <label className="md:col-span-2"><span className={label}>Forma de pagamento padrão</span><select className={input} value={value.forma_pagamento || ''} onChange={e => onChange('forma_pagamento', e.target.value)}><option value="">Selecione</option>{formas.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
      <label><span className={label}>Tipo de chave PIX</span><select className={input} value={pixSelecionado} onChange={e => onChange('pix_tipo', e.target.value)}><option value="">Selecione</option>{PIX.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label><span className={label}>Chave PIX</span><input className={`${input} font-id`} disabled={semPix} value={semPix ? '' : (value.pix_chave || '')} onChange={e => onChange('pix_chave', e.target.value)} placeholder={placeholderPix(pixSelecionado)}/></label>
      <label><span className={label}>Banco</span><select className={input} value={bancoSelecionado} onChange={e => onChange('banco', e.target.value)}><option value="">Selecione</option>{BANCOS.map(b => <option key={b} value={b}>{b}</option>)}<option value="OUTRO">Outro banco</option></select></label>
      {bancoPersonalizado && <label><span className={label}>Nome do banco</span><input autoFocus className={input} value={value.banco === 'OUTRO' ? '' : (value.banco || '')} onChange={e => onChange('banco', e.target.value)} placeholder="Informe o banco"/></label>}
      <label><span className={label}>Agência</span><input className={input} value={value.agencia || ''} onChange={e => onChange('agencia', e.target.value)} placeholder="Número ou N/A"/></label>
      <label><span className={label}>Conta</span><input className={input} value={value.conta || ''} onChange={e => onChange('conta', e.target.value)} placeholder="Número com dígito ou N/A"/></label>
      <label><span className={label}>Tipo de conta</span><select className={input} value={contaSelecionada} onChange={e => onChange('tipo_conta', e.target.value)}><option value="">Selecione</option>{CONTAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    </div>
  </section>;
}

function normalizarPix(valor?: string) {
  const v = String(valor || '').trim().toUpperCase().replace(/[ÁÀÃÂ]/g, 'A').replace(/[ÉÊ]/g, 'E');
  if (['CELULAR', 'TELEFONE', 'PHONE'].includes(v)) return 'TELEFONE';
  if (['E-MAIL', 'EMAIL'].includes(v)) return 'EMAIL';
  if (['ALEATORIA', 'CHAVE ALEATORIA'].includes(v)) return 'ALEATORIA';
  if (['NA', 'N/A', 'NAO POSSUI', 'NAO_POSSUI'].includes(v)) return 'NAO_POSSUI';
  return ['CPF', 'CNPJ'].includes(v) ? v : '';
}

function normalizarConta(valor?: string) {
  const v = String(valor || '').trim().toUpperCase().replace(/[ÁÀÃÂ]/g, 'A');
  if (['N/A', 'NA', 'NAO APLICAVEL', 'NAO_APLICAVEL'].includes(v)) return 'NAO_APLICAVEL';
  if (v.includes('POUPAN')) return 'POUPANCA';
  if (v.includes('PAGAMENTO')) return 'PAGAMENTO';
  if (v.includes('SALARIO')) return 'SALARIO';
  if (v.includes('CORRENTE')) return 'CORRENTE';
  return '';
}

function placeholderPix(tipo?: string) {
  if (tipo === 'CPF') return '000.000.000-00';
  if (tipo === 'CNPJ') return '00.000.000/0001-00';
  if (tipo === 'EMAIL') return 'nome@empresa.com.br';
  if (tipo === 'TELEFONE') return '+55 (00) 00000-0000';
  if (tipo === 'ALEATORIA') return 'Chave aleatória';
  return 'Selecione o tipo da chave';
}
