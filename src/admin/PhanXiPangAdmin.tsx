import { useState, type ReactNode } from 'react';
import type { AdminState } from '../../shared/types';
import { useGameState, type GameSocket } from '../lib/socket';
import { ConfigPanel } from './ConfigPanel';
import { AdminProvider } from './context';
import { ControlPanel } from './ControlPanel';
import { HeaderBar } from './HeaderBar';
import { HistoryPanel } from './HistoryPanel';
import { PlayersPanel } from './PlayersPanel';
import { PreviewPane } from './PreviewPane';
import { WordsPanel } from './WordsPanel';

type TabId = 'control' | 'players' | 'config' | 'more';
const TABS: [TabId, string][] = [
  ['control', 'Điều khiển'],
  ['players', 'Người chơi'],
  ['config', 'Cấu hình'],
  ['more', 'Khác'],
];

const TAB_KEY = 'pxp-admin-tab';
const loadTab = (): TabId => {
  try {
    const t = localStorage.getItem(TAB_KEY);
    return TABS.some(([id]) => id === t) ? (t as TabId) : 'control';
  } catch {
    return 'control';
  }
};

export function PhanXiPangAdmin({ socket }: { socket: GameSocket }) {
  const { state, connected, offset } = useGameState<AdminState>(socket, 'admin:state');
  const [tab, setTabState] = useState<TabId>(loadTab);
  const setTab = (t: TabId) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* bỏ qua */
    }
  };

  return (
    <AdminProvider socket={socket}>
      <div className="flex h-screen flex-col overflow-hidden bg-slate-950 font-sans text-slate-100">
        <HeaderBar state={state} connected={connected} offset={offset} />
        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            <nav className="flex shrink-0 gap-1 border-b border-slate-800 px-4 pt-2">
              {TABS.map(([id, label]) => (
                <TabButton key={id} active={tab === id} onClick={() => setTab(id)} badge={state ? tabBadge(id, state) : undefined}>
                  {label}
                </TabButton>
              ))}
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!state ? (
                <Waiting connected={connected} />
              ) : (
                <>
                  {tab === 'control' && <ControlPanel state={state} />}
                  {tab === 'players' && <PlayersPanel state={state} />}
                  {/* luôn giữ bảng cấu hình để không mất phần đang gõ khi đổi tab */}
                  <div className={tab === 'config' ? '' : 'hidden'}>
                    <ConfigPanel config={state.fullConfig} />
                  </div>
                  {tab === 'more' && (
                    <div className="space-y-3">
                      <Fold title="📚 Từ điển &amp; chuỗi từ">
                        <WordsPanel state={state} />
                      </Fold>
                      <Fold title="🕘 Lịch sử &amp; nhật ký">
                        <HistoryPanel logs={state.logs} currentSessionId={state.sessionId} />
                      </Fold>
                    </div>
                  )}
                </>
              )}
            </div>
          </main>
          <PreviewPane socket={socket} />
        </div>
      </div>
    </AdminProvider>
  );
}

function tabBadge(id: TabId, s: AdminState): ReactNode {
  if (id === 'control') {
    const n = s.rejected.filter((r) => r.reason === 'not_in_bank').length;
    return n > 0 ? <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-slate-950">{n}</span> : undefined;
  }
  if (id === 'players') return <span className="text-xs text-slate-400">{s.players.length}</span>;
  if (id === 'more' && s.logs.some((l) => l.level === 'error')) return <span className="h-2 w-2 rounded-full bg-rose-500" />;
  return undefined;
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2">
      <summary className="cursor-pointer py-1 font-semibold text-slate-200" dangerouslySetInnerHTML={{ __html: title }} />
      <div className="mt-3">{children}</div>
    </details>
  );
}

function TabButton({ active, onClick, badge, children }: { active: boolean; onClick: () => void; badge?: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 rounded-t-lg border-x border-t px-4 py-2 text-sm font-semibold transition ${
        active ? 'border-slate-800 bg-slate-900 text-amber-300' : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
      {badge}
    </button>
  );
}

function Waiting({ connected }: { connected: boolean }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" />
      {connected ? (
        <>
          <p className="font-semibold">Đã kết nối, đang chờ dữ liệu game…</p>
          <p className="mt-2 text-sm text-slate-400">
            Chờ lâu? Mở trang với <code className="text-sky-300">?token=...</code> (nếu server đặt ADMIN_TOKEN).
          </p>
        </>
      ) : (
        <p className="font-semibold">Đang kết nối tới máy chủ game…</p>
      )}
    </div>
  );
}
