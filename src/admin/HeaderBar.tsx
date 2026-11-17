import type { AdminState } from '../../shared/types';
import { useServerNow } from '../lib/socket';
import { useAdmin } from './context';
import { PHASE_LABEL, PHASE_TONE, ROUND_PHASE_LABEL, fmtNum } from './labels';
import { Badge, Button } from './ui';

export const overlayUrl = () => `http://lvh.me:${window.location.port || '80'}/?view=overlay`;

function Dot({ on, warn }: { on: boolean; warn?: boolean }) {
  const c = on ? 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400' : warn ? 'bg-amber-400 animate-pulse' : 'bg-rose-500';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${c}`} />;
}

/** Đếm ngược tách riêng để chỉ ô này vẽ lại 10 lần/giây */
function Countdown({ state, offset }: { state: AdminState; offset: { current: number } }) {
  const now = useServerNow(offset);
  let ms = 0;
  if (state.phase === 'paused') ms = state.remainingMs;
  else if (state.phase === 'running' && state.roundPhase === 'answering') ms = state.roundEndsAt - now;
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const urgent = state.phase === 'running' && sec <= 3 && sec > 0;
  return (
    <span className={`font-display text-2xl font-bold tabular-nums ${urgent ? 'text-rose-400' : 'text-amber-300'}`} title="Giây còn lại của chặng">
      {state.phase === 'running' || state.phase === 'paused' ? `${sec}s` : '–'}
    </span>
  );
}

export function HeaderBar({ state, connected, offset }: { state: AdminState | null; connected: boolean; offset: { current: number } }) {
  const { toast } = useAdmin();
  const url = overlayUrl();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Đã chép link LIVE Studio');
    } catch {
      window.prompt('Chép link này:', url);
    }
  };
  const live = state?.live;

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-900/80 px-4 py-2 text-sm">
      <h1 className="font-display text-lg font-extrabold leading-none tracking-wide text-amber-300">
        ĐƯỜNG LÊN ĐỈNH PHAN XI PĂNG
      </h1>

      <span className="flex items-center gap-1.5" title={connected ? 'Đã kết nối máy chủ game' : 'Mất kết nối máy chủ game'}>
        <Dot on={connected} />
        <span className="text-slate-300">{connected ? 'Server' : 'Mất kết nối'}</span>
      </span>

      <span className="flex items-center gap-1.5" title={live?.error || ''}>
        <Dot on={!!live?.isConnected} warn={!!live?.isConnecting} />
        <span className="text-slate-300">
          {live?.isConnected
            ? `TikTok @${live.username} · ${fmtNum(live.viewerCount)} xem`
            : live?.isConnecting
              ? 'TikTok đang kết nối…'
              : 'TikTok chưa kết nối'}
        </span>
      </span>

      {state && (
        <>
          <Badge tone={PHASE_TONE[state.phase]}>{PHASE_LABEL[state.phase]}</Badge>
          {(state.phase === 'running' || state.phase === 'paused') && (
            <span className="text-slate-300">{ROUND_PHASE_LABEL[state.roundPhase]}</span>
          )}
          <span className="text-slate-400">
            {state.raceNo > 0 && (
              <>
                Cuộc đua <b className="text-slate-100">{state.raceNo}</b> ·{' '}
              </>
            )}
            Chặng <b className="text-slate-100">{state.roundNo}</b>
            {state.fullConfig.roundsPerRace > 0 && `/${state.fullConfig.roundsPerRace}`}
          </span>
          <span className="font-display text-xl font-bold uppercase text-emerald-300">{state.word || '—'}</span>
          <Countdown state={state} offset={offset} />
          <span className="text-slate-400">
            Người chơi <b className="text-slate-100">{fmtNum(state.totalPlayers)}</b> (chờ {fmtNum(state.waitingCount)})
          </span>
        </>
      )}

      <span className="ml-auto flex items-center gap-2">
        <span className="hidden text-xs text-slate-400 xl:inline">LIVE Studio (1080×1920):</span>
        <code className="rounded bg-slate-950 px-2 py-1 text-xs text-sky-300">{url}</code>
        <Button size="sm" tone="sky" onClick={copy}>
          Chép link
        </Button>
      </span>
    </header>
  );
}
