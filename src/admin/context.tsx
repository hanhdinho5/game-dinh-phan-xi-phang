import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { AckResult, ClientToServerEvents } from '../../shared/types';
import { command, type GameSocket } from '../lib/socket';

export type ToastKind = 'ok' | 'error' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  msg: string;
}

interface AdminContextValue {
  socket: GameSocket;
  toast: (msg: string, kind?: ToastKind) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export type CommandArgs<K extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[K]> extends [...infer A, unknown] ? A : never;

/** Cung cấp socket + khu thông báo (toast) cho mọi bảng điều khiển */
export function AdminProvider({ socket, children }: { socket: GameSocket; children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (msg: string, kind: ToastKind = 'ok') => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-4), { id, kind, msg }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500);
    },
    [dismiss],
  );

  return (
    <AdminContext.Provider value={{ socket, toast }}>
      {children}
      <ToastArea toasts={toasts} onDismiss={dismiss} />
    </AdminContext.Provider>
  );
}

function ToastArea({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const tone: Record<ToastKind, string> = {
    ok: 'border-emerald-500/50 bg-emerald-950/95 text-emerald-100',
    error: 'border-rose-500/60 bg-rose-950/95 text-rose-100',
    info: 'border-sky-500/50 bg-slate-900/95 text-sky-100',
  };
  const icon: Record<ToastKind, string> = { ok: '✓', error: '⚠', info: 'ℹ' };
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex max-w-md flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onDismiss(t.id)}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm shadow-xl ${tone[t.kind]}`}
        >
          <span className="font-bold">{icon[t.kind]}</span>
          <span className="flex-1">{t.msg}</span>
        </button>
      ))}
    </div>
  );
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin phải nằm trong AdminProvider');
  return ctx;
}

/** Gửi lệnh admin; lỗi thì tự hiện thông báo đỏ. Trả về kết quả để hiện thông báo thành công tuỳ ý. */
export function useCommand() {
  const { socket, toast } = useAdmin();
  return useCallback(
    async <K extends keyof ClientToServerEvents>(event: K, ...args: CommandArgs<K>): Promise<AckResult> => {
      const r = await command(socket, event, ...args);
      if (!r.ok) toast(r.error || 'Lệnh thất bại (không rõ lý do)', 'error');
      return r;
    },
    [socket, toast],
  );
}
