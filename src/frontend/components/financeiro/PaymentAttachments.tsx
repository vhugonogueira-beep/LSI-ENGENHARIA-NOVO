import { useEffect, useRef, useState } from 'react';
import { Check, Download, FileText, Paperclip, Trash2 } from 'lucide-react';
import { authFetch, downloadAuthenticatedFile } from '../../lib/authFetch';

// ─────────────────────────────────────────────────────────────────────────────
// Documentos de um pagamento — comprovante, documento fiscal e o resto.
//
// Esta faixa é o ÚNICO lugar de anexo do pagamento. Antes conviviam dois
// mecanismos independentes: o botão "Adicionar comprovante" do cartão, que
// gravava uma URL única em `comprovante_url`, e esta faixa, com a sua própria
// tabela. Anexar por um não registrava no outro — o cartão mostrava
// "comprovante anexado" em verde enquanto a faixa logo abaixo dizia
// "comprovante pendente", sobre o mesmo pagamento.
//
// O campo legado continua existindo e é exibido aqui como um documento a mais
// (9 registros o usam). Não é removido: é a única cópia daqueles arquivos.
//
// Vale tanto para uma parcela de contratação quanto para um depósito de
// reembolso/adiantamento, por isso o par ownerType/ownerId. O backend guarda os
// bytes fora da pasta pública e valida SHA-256; aqui só se lista, anexa e baixa.
//
// `requiresFiscal` vem do catálogo `PAYMENT_PURPOSES`: finalidade de material
// exige nota fiscal além do comprovante. O aviso é informativo — quem bloqueia
// a conclusão é o backend, em `validateFormalizationDocuments`.
// ─────────────────────────────────────────────────────────────────────────────

type Documento = {
  id: string;
  tipo: string;
  nome_original: string;
  tamanho_bytes: number;
};

type TipoUpload = 'COMPROVANTE_PAGAMENTO' | 'DOCUMENTO_FISCAL' | 'OUTRO_DOCUMENTO';

const ROTULO_TIPO: Record<string, string> = {
  COMPROVANTE_PAGAMENTO: 'Comprovante',
  DOCUMENTO_FISCAL: 'Nota fiscal',
  OUTRO_DOCUMENTO: 'Documento',
};

interface Props {
  ownerType: 'PARCELA' | 'DEPOSITO';
  ownerId: string;
  requiresFiscal?: boolean;
  /** Comprovante gravado no campo antigo, antes desta faixa existir. */
  comprovanteLegado?: string | null;
  onChange?: () => void;
}

export default function PaymentAttachments({ ownerType, ownerId, requiresFiscal = false, comprovanteLegado = null, onChange }: Props) {
  const [docs, setDocs] = useState<Documento[]>([]);
  const [erro, setErro] = useState('');
  const [tipoUpload, setTipoUpload] = useState<TipoUpload>('COMPROVANTE_PAGAMENTO');
  const seletor = useRef<HTMLInputElement>(null);

  async function carregar() {
    const r = await authFetch(`/api/payment-attachments/${ownerType}/${ownerId}`, { cache: 'no-store' });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    setDocs(body);
  }

  useEffect(() => { carregar().catch(e => setErro(e.message)); }, [ownerType, ownerId]);

  async function enviar(arquivos: FileList) {
    const data = new FormData();
    data.append('tipo', tipoUpload);
    Array.from(arquivos).forEach(a => data.append('arquivos', a));

    const r = await authFetch(`/api/payment-attachments/${ownerType}/${ownerId}`, { method: 'POST', body: data });
    const body = await r.json();
    if (!r.ok) return setErro(body.error);

    setErro('');
    await carregar();
    onChange?.();
  }

  async function remover(id: string) {
    if (!confirm('Remover este anexo?')) return;
    const r = await authFetch(`/api/payment-attachments/${id}`, { method: 'DELETE' });
    if (!r.ok) return setErro((await r.json()).error);
    await carregar();
    onChange?.();
  }

  // O comprovante pode estar nos dois lugares. A conferência considera os dois,
  // senão um pagamento com comprovante antigo apareceria como pendente.
  const temComprovante = docs.some(d => d.tipo === 'COMPROVANTE_PAGAMENTO') || Boolean(comprovanteLegado);
  const temFiscal = docs.some(d => d.tipo === 'DOCUMENTO_FISCAL');

  return (
    <div className="mt-2 rounded-lg border border-border/70 bg-background/30 p-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Paperclip size={14} aria-hidden />
        <strong>Documentos</strong>

        <span className={`inline-flex items-center gap-1 ${temComprovante ? 'text-ok' : 'text-warn'}`}>
          {temComprovante ? <><Check size={14} aria-hidden />Comprovante</> : 'Comprovante pendente'}
        </span>
        {requiresFiscal && (
          <span className={`inline-flex items-center gap-1 ${temFiscal ? 'text-ok' : 'text-warn'}`}>
            {temFiscal ? <><Check size={14} aria-hidden />Documento fiscal</> : 'Documento fiscal pendente'}
          </span>
        )}

        <select
          className="ml-auto h-7 rounded border border-border bg-secondary px-2"
          aria-label="Tipo do documento a anexar"
          value={tipoUpload}
          onChange={e => setTipoUpload(e.target.value as TipoUpload)}
        >
          <option value="COMPROVANTE_PAGAMENTO">Comprovante de pagamento</option>
          <option value="DOCUMENTO_FISCAL">Nota fiscal / documento fiscal</option>
          <option value="OUTRO_DOCUMENTO">Foto, orçamento, OS e outros</option>
        </select>
        <button className="h-7 rounded border border-border px-2 font-semibold" onClick={() => seletor.current?.click()}>
          Anexar arquivos
        </button>
        <input
          ref={seletor}
          hidden
          multiple
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.gif,.xls,.xlsx,.csv,.doc,.docx"
          onChange={e => {
            if (e.target.files?.length) enviar(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {erro && <div className="mt-2 text-[11px] text-crit">{erro}</div>}

      {(docs.length > 0 || comprovanteLegado) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {comprovanteLegado && (
            <a
              href={comprovanteLegado}
              target="_blank"
              rel="noreferrer"
              title="Comprovante anexado antes desta faixa existir"
              className="inline-flex items-center gap-1 rounded border border-ok/30 bg-ok/10 px-2 py-1 text-[11px] text-ok"
            >
              <FileText size={14} aria-hidden />
              Comprovante (arquivo anterior)
              <Download size={14} aria-hidden />
            </a>
          )}
          {docs.map(doc => (
            <span key={doc.id} className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1 text-[11px]">
              <FileText size={14} aria-hidden />
              <span className="text-muted-foreground">{ROTULO_TIPO[doc.tipo] || doc.tipo}</span>
              {doc.nome_original}
              <button
                title="Baixar anexo"
                aria-label={`Baixar ${doc.nome_original}`}
                onClick={() => downloadAuthenticatedFile(`/api/payment-attachments/${doc.id}/download`, doc.nome_original)}
              >
                <Download size={14} aria-hidden />
              </button>
              <button title="Remover anexo" aria-label={`Remover ${doc.nome_original}`} className="text-crit" onClick={() => remover(doc.id)}>
                <Trash2 size={14} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
