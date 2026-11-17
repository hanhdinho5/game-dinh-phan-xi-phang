import { useState } from 'react';
import type { GamePhase } from '../../../shared/types';
import { useAdmin, useCommand } from '../context';
import { Button, Card, inputCls } from '../ui';

export function GameControls({ phase }: { phase: GamePhase }) {
  const cmd = useCommand();
  const { toast } = useAdmin();
  const [keepPlayers, setKeepPlayers] = useState(true);

  const run = async (p: Promise<{ ok: boolean }>, okMsg: string) => {
    if ((await p).ok) toast(okMsg);
  };
  const canStart = phase === 'idle' || phase === 'ended';
  const active = phase === 'running' || phase === 'paused';

  return (
    <Card title="Điều khiển game">
      <div className="flex flex-wrap gap-2">
        <Button
          tone="emerald"
          disabled={!canStart}
          onClick={() => run(cmd('admin:start'), 'Đã bắt đầu game')}
          title={phase === 'ended' ? 'Bắt đầu lại = phiên mới, giữ người chơi' : undefined}
        >
          ▶ Bắt đầu
        </Button>
        <Button tone="amber" disabled={phase !== 'running'} onClick={() => run(cmd('admin:pause'), 'Đã tạm dừng')}>
          ⏸ Tạm dừng
        </Button>
        <Button tone="emerald" disabled={phase !== 'paused'} onClick={() => run(cmd('admin:resume'), 'Đã tiếp tục')}>
          ⏯ Tiếp tục
        </Button>
        <Button tone="sky" disabled={phase !== 'running'} onClick={() => run(cmd('admin:next_round'), 'Đã chuyển chặng')}>
          ⏭ Chặng tiếp
        </Button>
        <Button
          tone="rose"
          disabled={!active}
          confirm="Kết thúc và vinh danh?"
          onClick={() => run(cmd('admin:end'), 'Đã kết thúc game')}
        >
          ⏹ Kết thúc
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
        <Button
          tone="slate"
          confirm={
            keepPlayers
              ? 'Mở phiên mới? Điểm và chuỗi từ về 0, người chơi vẫn giữ chỗ. Lịch sử phiên cũ vẫn được lưu.'
              : 'Mở phiên mới và XOÁ HẾT người chơi? Lịch sử phiên cũ vẫn được lưu.'
          }
          onClick={() => run(cmd('admin:reset', { keepPlayers }), 'Đã mở phiên mới')}
        >
          ↺ Phiên mới
        </Button>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={keepPlayers} onChange={(e) => setKeepPlayers(e.target.checked)} />
          Giữ người chơi
        </label>
        <p className="w-full text-xs text-slate-400">
          Điểm về 0. Lịch sử cũ vẫn được lưu.
        </p>
      </div>

      <SetWordBox />
    </Card>
  );
}

function SetWordBox() {
  const cmd = useCommand();
  const { toast } = useAdmin();
  const [word, setWord] = useState('');
  const submit = async () => {
    const w = word.trim();
    if (!w) return toast('Nhập từ 2 tiếng, ví dụ “học sinh”', 'error');
    const r = await cmd('admin:set_word', w);
    if (r.ok) {
      toast(`Đã đổi từ hiện tại thành “${w}”`);
      setWord('');
    }
  };
  return (
    <div className="mt-4">
      <span className="mb-1 block text-sm font-medium text-slate-200">Đổi từ hiện tại</span>
      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder="ví dụ: học sinh"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
        <Button tone="amber" onClick={submit}>
          Đổi từ
        </Button>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Chặng đang chạy bị huỷ, không tính điểm.
      </p>
    </div>
  );
}
