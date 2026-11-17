import type { AdminState } from '../../shared/types';
import { CurrentRound } from './control/CurrentRound';
import { GameControls } from './control/GameControls';
import { LastResult } from './control/LastResult';
import { MockBox } from './control/MockBox';
import { TikTokBox } from './control/TikTokBox';
import { VoiceBox } from './control/VoiceBox';
import { fmtNum } from './labels';
import { useCommand } from './context';
import { Button } from './ui';

function StatsLine({ state }: { state: AdminState }) {
  const s = state.stats;
  const items: [string, number][] = [
    ['Bình luận nhận', s.commentsReceived],
    ['Trùng bỏ qua', s.duplicatesDropped],
    ['Đáp án đúng', s.answersAccepted],
    ['Đáp án sai', s.answersRejected],
    ['Từ trong từ điển', state.bankSize],
    ['Từ đã dùng', state.usedWordCount],
  ];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs text-slate-400">
      {items.map(([label, n]) => (
        <span key={label}>
          {label}: <b className="text-slate-100 tabular-nums">{fmtNum(n)}</b>
        </span>
      ))}
    </div>
  );
}

function NextRaceBanner({ at }: { at: number }) {
  const cmd = useCommand();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
      <span className="flex-1">
        🏁 Cuộc đua mới lúc {new Date(at).toLocaleTimeString('vi-VN')}
      </span>
      <Button size="sm" tone="rose" onClick={() => cmd('admin:cancel_next_race')}>
        Huỷ tự mở
      </Button>
    </div>
  );
}

export function ControlPanel({ state }: { state: AdminState }) {
  return (
    <div className="space-y-4">
      <TikTokBox live={state.live} />
      <GameControls phase={state.phase} />
      {state.phase === 'ended' && state.nextRaceAt > 0 && (
        <NextRaceBanner at={state.nextRaceAt} />
      )}
      <VoiceBox state={state} />
      <CurrentRound state={state} />
      <LastResult result={state.lastResult} />
      <StatsLine state={state} />
      <MockBox allowed={state.mockAllowed} roundSeconds={state.fullConfig.roundSeconds} />
    </div>
  );
}
