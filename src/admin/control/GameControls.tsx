import { useState, type ReactNode } from 'react';
import type { GamePhase } from '../../../shared/types';
import { useAdmin, useCommand } from '../context';
import { Button, Card, inputCls } from '../ui';

/** Chỉ hiện nút hợp với trạng thái hiện tại; việc ít dùng nằm trong "Nâng cao" */
export function GameControls({ phase, children }: { phase: GamePhase; children?: ReactNode }) {
  const cmd = useCommand();
  const { toast } = useAdmin();

  const run = async (p: Promise<{ ok: boolean }>, okMsg: string) => {
    if ((await p).ok) toast(okMsg);
  };
  const canStart = phase === 'idle' || phase === 'ended';
  const active = phase === 'running' || phase === 'paused';

  return (
    <Card title="Điều khiển game">
      <div className="flex flex-wrap gap-2">
        {canStart && (
          <Button tone="emerald" size="lg" onClick={() => run(cmd('admin:start'), 'Đã bắt đầu game')}>
            ▶ Bắt đầu
          </Button>
        )}
        {phase === 'running' && (
          <Button tone="amber" size="lg" onClick={() => run(cmd('admin:pause'), 'Đã tạm dừng')}>
            ⏸ Tạm dừng
          </Button>
        )}
        {phase === 'paused' && (
          <Button tone="emerald" size="lg" onClick={() => run(cmd('admin:resume'), 'Đã tiếp tục')}>
            ⏯ Tiếp tục
          </Button>
        )}
        {phase === 'running' && (
          <Button tone="sky" size="lg" onClick={() => run(cmd('admin:next_round'), 'Đã chuyển chặng')}>
            ⏭ Chặng tiếp
          </Button>
        )}
        {active && (
          <Button tone="rose" size="lg" confirm="Kết thúc và vinh danh?" onClick={() => run(cmd('admin:end'), 'Đã kết thúc game')}>
            ⏹ Kết thúc
          </Button>
        )}
      </div>

      <details className="mt-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-slate-300">Nâng cao</summary>
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              tone="slate"
              confirm="Mở phiên mới? Điểm về 0, người chơi vẫn giữ chỗ. Lịch sử phiên cũ vẫn được lưu."
              onClick={() => run(cmd('admin:reset', { keepPlayers: true }), 'Đã mở phiên mới')}
            >
              ↺ Phiên mới (giữ người chơi)
            </Button>
            <Button
              tone="slate"
              confirm="Mở phiên mới và XOÁ HẾT người chơi? Lịch sử phiên cũ vẫn được lưu."
              onClick={() => run(cmd('admin:reset', { keepPlayers: false }), 'Đã mở phiên mới, xoá người chơi')}
            >
              Xoá hết người chơi
            </Button>
          </div>
          <SetWordBox />
          {children}
        </div>
      </details>
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
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-200">Đổi từ hiện tại (chặng đang chạy bị huỷ, không tính điểm)</span>
      <div className="flex gap-2">
        <input className={inputCls} placeholder="ví dụ: học sinh" value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        <Button tone="amber" onClick={submit}>
          Đổi từ
        </Button>
      </div>
    </div>
  );
}
