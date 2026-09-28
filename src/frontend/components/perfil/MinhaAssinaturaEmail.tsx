import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Trash2, Upload } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';

type SignatureMetadata = {
    id: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    active: boolean;
    created_at: string;
    updated_at: string;
};

const btn = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-3 text-xs font-bold text-foreground hover:bg-secondary/70 disabled:opacity-50';

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MinhaAssinaturaEmail() {
    const [metadata, setMetadata] = useState<SignatureMetadata | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const user = (() => { try { return JSON.parse(localStorage.getItem('ls_auth_user') || 'null'); } catch { return null; } })();

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await authFetch('/api/profile/email-signature', { cache: 'no-store' });
            if (!response.ok) throw new Error((await response.json()).error || 'Erro ao carregar a assinatura');
            const current = await response.json();
            setMetadata(current);
            setImageUrl(previous => { if (previous) URL.revokeObjectURL(previous); return null; });
            if (current) {
                const imageResponse = await authFetch(`/api/profile/email-signature/image?v=${encodeURIComponent(current.updated_at)}`, { cache: 'no-store' });
                if (!imageResponse.ok) throw new Error('Não foi possível visualizar a assinatura atual');
                setImageUrl(URL.createObjectURL(await imageResponse.blob()));
            }
        } catch (cause: any) {
            setError(cause.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);
    useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

    async function upload(file: File) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            setError('Escolha uma imagem PNG, JPG/JPEG ou WEBP.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError('A assinatura deve ter no máximo 5 MB.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const form = new FormData();
            form.append('arquivo', file);
            const response = await authFetch('/api/profile/email-signature', { method: 'POST', body: form });
            if (!response.ok) throw new Error((await response.json()).error || 'Erro ao salvar a assinatura');
            await load();
        } catch (cause: any) {
            setError(cause.message);
        } finally {
            setSaving(false);
        }
    }

    async function remove() {
        if (!confirm('Remover sua assinatura de e-mail? Os próximos e-mails serão gerados sem a imagem personalizada.')) return;
        setSaving(true);
        setError('');
        try {
            const response = await authFetch('/api/profile/email-signature', { method: 'DELETE' });
            if (!response.ok) throw new Error((await response.json()).error || 'Erro ao remover a assinatura');
            await load();
        } catch (cause: any) {
            setError(cause.message);
        } finally {
            setSaving(false);
        }
    }

    return <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-foreground"><Image size={16} className="text-primary"/>Assinatura de e-mail</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                    Esta imagem será adicionada automaticamente aos próximos e-mails gerados por <strong className="text-foreground">{user?.nome || 'este usuário'}</strong>, incluindo pagamentos, reembolsos, adiantamentos e faturamento.
                </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
                <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) upload(file); }}/>
                <button type="button" className={btn} disabled={saving} onClick={() => inputRef.current?.click()}><Upload size={14}/>{metadata ? 'Substituir assinatura' : 'Adicionar assinatura'}</button>
                {metadata && <button type="button" className={`${btn} text-red-400`} disabled={saving} onClick={remove}><Trash2 size={14}/>Remover</button>}
            </div>
        </div>

        {error && <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
        {loading ? <div className="mt-5 text-xs text-muted-foreground">Carregando assinatura...</div> : metadata && imageUrl ? <div className="mt-5">
            <div className="rounded-xl border border-border bg-white p-4">
                <img src={imageUrl} alt="Sua assinatura de e-mail" className="block h-auto max-w-full" style={{ maxWidth: 590 }}/>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span>{metadata.original_name}</span><span>{formatSize(metadata.size_bytes)}</span><span>Atualizada em {new Date(metadata.updated_at).toLocaleString('pt-BR')}</span>
            </div>
        </div> : <div className="mt-5 rounded-xl border border-dashed border-border bg-secondary/10 px-5 py-10 text-center">
            <Image size={28} className="mx-auto text-muted-foreground"/>
            <p className="mt-3 text-sm font-semibold text-foreground">Nenhuma assinatura personalizada cadastrada</p>
            <p className="mt-1 text-xs text-muted-foreground">Os e-mails continuam funcionando normalmente sem uma assinatura pessoal.</p>
        </div>}
        <p className="mt-4 text-[11px] leading-5 text-muted-foreground">Formatos aceitos: PNG, JPG/JPEG e WEBP, até 5 MB. A proporção original é preservada. No Outlook, a imagem é incorporada ao próprio e-mail e não depende de caminho local ou endereço externo.</p>
    </section>;
}
