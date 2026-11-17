import type { AdminState } from '../../shared/types';
import { GameControls } from './control/GameControls';
import { MockBox } from './control/MockBox';
import { NeedsApproval } from './control/NeedsApproval';
import { TikTokBox } from './control/TikTokBox';
import { VoiceAlert, VoiceBox } from './control/VoiceBox';
import { useCommand } from './context';
import { Button } from './ui';

function NextRaceBanner({ at }: { at: number }) {
  const cmd = useCommand();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
      <span className="flex-1">🏁 Cuộc đua mới lúc {new Date(at).toLocaleTimeString('vi-VN')}</span>
      <Button size="sm" tone="rose" onClick={() => cmd('admin:cancel_next_race')}>
        Huỷ tự mở
      </Button>
    </div>
  );
}

/** Màn điều khiển gọn: chỉ nút cần dùng. Cảnh báo / duyệt từ / giả lập chỉ hiện khi cần. */
export function ControlPanel({ state }: { state: AdminState }) {
  return (
    <div className="space-y-4">
      <TikTokBox live={state.live} />
      <VoiceAlert state={state} />
      <GameControls phase={state.phase}>
        <VoiceBox />
      </GameControls>
      {state.phase === 'ended' && state.nextRaceAt > 0 && <NextRaceBanner at={state.nextRaceAt} />}
      <NeedsApproval rejected={state.rejected} />
      {state.mockAllowed && <MockBox roundSeconds={state.fullConfig.roundSeconds} />}
    </div>
  );
}
