import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import DadosBancariosForm from './DadosBancariosForm';
import { carregarMunicipios } from './MunicipioInput';

// Janela única de cadastro/edição de funcionário. Usada na tela Funcionários LS
// e dentro do pagamento da atividade (decisão de 08/10/2026: "a mesma janela de
// pessoas e funcionários") — os dois lugares ficam sempre iguais.

export type Funcionario = Record<string, any> & { id: string; nome: string; qualificacoes?: any[] };

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const vazio: Record<string, any> = { nome:'', cpf:'', rg:'', rg_orgao:'', data_nascimento:'', tipo_vinculo:'CLT', funcao:'', cargo:'', data_admissao:'', telefone:'', email:'', logradouro:'', numero:'', complemento:'', bairro:'', cep:'', uf:'', municipio:'', municipio_ibge:'', banco:'', agencia:'', conta:'', tipo_conta:'', pix_tipo:'CPF', pix_chave:'', forma_pagamento:'PIX', observacoes:'' };
export const input = 'w-full border border-border rounded-lg p-2.5 bg-secondary/40 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';
export const label = 'block text-xs font-semibold text-muted-foreground mb-1';

function formDoFuncionario(f?: Funcionario | null) {
  if (!f) return { ...vazio };
  const dados = Object.fromEntries(Object.keys(vazio).map(k => [k, k.startsWith('data_') && f[k] ? String(f[k]).slice(0, 10) : (f[k] ?? '')]));
  if (!dados.forma_pagamento) dados.forma_pagamento = f.pix_chave ? 'PIX' : 'TED';
  if (!dados.pix_tipo) dados.pix_tipo = 'CPF';
  return dados;
}

export default function FuncionarioFormModal({ funcionario, onClose, onSaved }: {
  funcionario?: Funcionario | null;
  onClose: () => void;
  /** Recebe o funcionário gravado (criado ou atualizado). */
  onSaved: (f: Funcionario) => void;
}) {
  const [form, setForm] = useState<Record<string, any>>(() => formDoFuncionario(funcionario));
  const [municipios, setMunicipios] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const edit = funcionario?.id || null;
  useEffect(() => { if (!form.uf) { setMunicipios([]); return; } carregarMunicipios(form.uf).then(setMunicipios); }, [form.uf]);
  const fld = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const salvar = async (e: any) => {
    e.preventDefault();
    // A janela pode estar dentro de outro formulário (pagamento): o submit não sobe.
    e.stopPropagation();
    setErro(''); setSalvando(true);
    try {
      const r = await fetch(edit ? `/api/funcionarios/${edit}` : '/api/funcionarios', { method: edit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const corpo = await r.json();
      if (!r.ok) { setErro(corpo.error || 'Erro ao salvar'); return; }
      onSaved(corpo);
    } finally { setSalvando(false); }
  };

  return <Modal title={edit ? 'Editar funcionário' : 'Novo funcionário'} close={onClose}><form onSubmit={salvar} className="space-y-5">
    {erro && <div role="alert" className="rounded-lg border border-crit/40 bg-crit/10 p-3 text-sm text-crit">{erro}</div>}
    <Sec title="Identificação"><Grid>{[['nome','Nome completo'],['cpf','CPF'],['rg','RG'],['rg_orgao','Órgão emissor'],['data_nascimento','Nascimento','date'],['tipo_vinculo','Vínculo','select'],['cargo','Cargo'],['funcao','Função','funcao'],['data_admissao','Admissão','date'],['telefone','Telefone'],['email','E-mail']].map(([k,l,t])=><Campo key={k} k={k} l={l} t={t} value={form[k]} on={fld}/>)}</Grid></Sec>
    <Sec title="Endereço (município validado pelo IBGE)"><Grid><Campo k="cep" l="CEP" value={form.cep} on={fld}/><Campo k="uf" l="UF" t="uf" value={form.uf} on={fld}/><label><span className={label}>Município</span><select className={input} value={form.municipio_ibge} onChange={e=>{const m=municipios.find(x=>x.codigo_ibge===e.target.value);setForm(p=>({...p,municipio_ibge:e.target.value,municipio:m?.nome||''}))}}><option value="">Selecione</option>{municipios.map(m=><option key={m.codigo_ibge} value={m.codigo_ibge}>{m.nome}</option>)}</select></label>{[['logradouro','Logradouro'],['numero','Número'],['complemento','Complemento'],['bairro','Bairro']].map(([k,l])=><Campo key={k} k={k} l={l} value={form[k]} on={fld}/>)}</Grid></Sec>
    <DadosBancariosForm value={form} formasPermitidas={['PIX','TED','DINHEIRO']} onChange={(campo,valor)=>fld(campo,valor)}/>
    <label><span className={label}>Observações</span><textarea className={input} value={form.observacoes} onChange={e=>fld('observacoes',e.target.value)}/></label>
    <button disabled={salvando} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg p-3 font-semibold disabled:opacity-60">{salvando ? 'Salvando…' : 'Salvar funcionário'}</button>
  </form></Modal>;
}

export function Modal({title,close,children}:any){return <div className="fixed inset-0 z-[9500] bg-black/70 flex items-center justify-center p-4"><div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-auto p-5 text-foreground"><div className="flex justify-between mb-5"><h2 className="font-bold text-lg">{title}</h2><button type="button" onClick={close} aria-label="Fechar" title="Fechar" className="p-1 rounded-md text-muted-foreground hover:text-foreground"><X aria-hidden size={18}/></button></div>{children}</div></div>}
export function Sec({title,children}:any){return <section className="bg-secondary/20 border border-border rounded-lg p-4"><h3 className="text-sm font-bold mb-3">{title}</h3>{children}</section>}
export function Grid({children}:any){return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>}
export function Campo({k,l,t,value,on}:any){if(t==='select')return <label><span className={label}>{l}</span><select className={input} value={value} onChange={e=>on(k,e.target.value)}><option value="CLT">CLT</option><option value="PJ">Pessoa jurídica (PJ)</option><option value="AUTONOMO">Autônomo</option><option value="TERCEIRO">Terceirizado</option></select></label>;if(t==='funcao')return <label><span className={label}>{l}</span><select className={input} value={value} onChange={e=>on(k,e.target.value)}><option value="">Selecione</option><option value="TECNICO">Técnico</option><option value="ENCARREGADO">Encarregado</option><option value="ENGENHEIRO">Engenheiro</option><option value="ADMINISTRATIVO">Administrativo</option><option value="OUTRO">Outro</option></select></label>;if(t==='uf')return <label><span className={label}>{l}</span><select className={input} value={value} onChange={e=>on(k,e.target.value)}><option value="">Selecione</option>{UFS.map(x=><option key={x}>{x}</option>)}</select></label>;return <label><span className={label}>{l}</span><input required={k==='nome'} type={t||'text'} className={input} value={value||''} onChange={e=>on(k,e.target.value)}/></label>}
