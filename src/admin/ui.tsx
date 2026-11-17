import { useState, type ReactNode } from 'react';

export function Card({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900 p-4 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-display text-lg font-bold leading-tight text-amber-300">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export type ButtonTone = 'amber' | 'emerald' | 'rose' | 'sky' | 'slate';
const TONES: Record<ButtonTone, string> = {
  amber: 'bg-amber-500 text-slate-950 hover:bg-amber-400',
  emerald: 'bg-emerald-600 text-white hover:bg-emerald-500',
  rose: 'bg-rose-600 text-white hover:bg-rose-500',
  sky: 'bg-sky-600 text-white hover:bg-sky-500',
  slate: 'bg-slate-700 text-slate-100 hover:bg-slate-600',
};

interface ButtonProps {
  children: ReactNode;
  /** có thể trả Promise: trong lúc chờ nút hiện trạng thái đang xử lý và bị khoá */
  onClick?: () => unknown;
  tone?: ButtonTone;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
  /** hỏi lại trước khi chạy */
  confirm?: string;
}

/** Nút có trạng thái chờ khi lệnh đang gửi lên server */
export function Button({ children, onClick, tone = 'slate', size = 'md', disabled, title, type = 'button', className = '', confirm }: ButtonProps) {
  const [pending, setPending] = useState(false);
  const handle = async () => {
    if (!onClick || pending) return;
    if (confirm && !window.confirm(confirm)) return;
    const r = onClick();
    if (r instanceof Promise) {
      setPending(true);
      try {
        await r;
      } finally {
        setPending(false);
      }
    }
  };
  const sz = size === 'sm' ? 'px-2 py-1 text-xs' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-3 py-2 text-sm';
  return (
    <button
      type={type}
      title={title}
      disabled={disabled || pending}
      onClick={type === 'submit' ? undefined : handle}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${sz} ${TONES[tone]} ${className}`}
    >
      {pending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export type BadgeTone = 'amber' | 'emerald' | 'rose' | 'sky' | 'slate' | 'violet';
const BADGE: Record<BadgeTone, string> = {
  amber: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  rose: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  sky: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  slate: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  violet: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
};

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${BADGE[tone]}`}>{children}</span>;
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg p-1 hover:bg-slate-800/50">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-600'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-4.5' : 'left-0.5'}`} />
      </button>
      <span className="text-sm">
        <span className="text-slate-100">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none';

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-200">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-400">{error}</span> : hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Avatar({ src, name, size = 28 }: { src: string; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  if (!src || broken) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-700 font-bold text-slate-200"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {initial}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-center text-sm text-slate-500">{children}</p>;
}
