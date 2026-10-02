import React from 'react';
import { fmtMoeda } from './constants';

export function Card({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="bg-card text-foreground border border-border rounded-xl p-5 mb-4">
            {(title || action) && (
                <div className="flex items-center justify-between mb-4">
                    {title && <h3 className="text-sm font-bold text-foreground">{title}</h3>}
                    {action}
                </div>
            )}
            {children}
        </div>
    );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{label}</span>
            {children}
        </label>
    );
}

export function EmptyState({ text, action }: { text: string; action?: React.ReactNode }) {
    return (
        <div className="text-center py-10 text-muted-foreground text-sm">
            <p className="mb-3">{text}</p>
            {action}
        </div>
    );
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button {...props} className={`px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed ${props.className || ''}`}>
            {children}
        </button>
    );
}

export function GhostButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button {...props} className={`px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-secondary/50 disabled:opacity-50 ${props.className || ''}`}>
            {children}
        </button>
    );
}

export const inputClass = "w-full box-border px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/30";

export function ErrorBanner({ message }: { message: string }) {
    if (!message) return null;
    return <div className="mb-4 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">{message}</div>;
}

/** Ausência não tem cor: zero, vazio e "sem dado" saem como "—" apagado. */
export function Vazio() {
    return <span className="text-muted-foreground font-normal">—</span>;
}

const vazio = (v: React.ReactNode) => v == null || v === '' || v === '—' || v === false;

/** Dinheiro neutro; zero ou nulo vira "—". */
export function Dinheiro({ v, className }: { v?: number | null; className?: string }) {
    if (!v) return <Vazio />;
    return <span className={className}>{fmtMoeda(v)}</span>;
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between items-center py-1.5 border-b border-border/60 last:border-0">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm font-medium text-right">{vazio(value) ? <Vazio /> : value}</span>
        </div>
    );
}
