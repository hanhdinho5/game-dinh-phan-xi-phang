import type { AdminState, RejectedSummary } from '../../../shared/types';
import { useAdmin, useCommand } from '../context';
import { REJECT_LABEL, fmtNum } from '../labels';
import { Badge, Button, Card, Empty } from '../ui';

/** Đáp án chặng đang chạy (chỉ admin thấy) + các từ bị từ chối, có nút duyệt nhanh */
export function CurrentRound({ state }: { state: AdminState }) {
  return (
    <div className="grid gap-4 2xl:grid-cols-2">
      <Card title={`Đáp án chặng ${state.roundNo || '–'}`} right={<span className="text-xs text-slate-400">chỉ admin thấy</span>}>
        {state.currentAnswers.length === 0 ? (
          <Empty>Chưa có ai nối đúng.</Empty>
        ) : (
          <ol className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm">
            {state.currentAnswers.map((a) => (
              <li key={`${a.rank}-${a.nickname}`} className="flex items-center gap-2 rounded bg-slate-950/50 px-2 py-1">
                <span className="w-8 text-right font-bold text-amber-300 tabular-nums">#{a.rank}</span>
                <span className="flex-1 truncate text-slate-100">{a.nickname}</span>
                <span className="font-semibold text-emerald-300">{a.word}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <RejectedList rejected={state.rejected} />
    </div>
  );
}

function RejectedList({ rejected }: { rejected: RejectedSummary[] }) {
  const cmd = useCommand();
  const { toast } = useAdmin();
  const approve = async (word: string) => {
    const r = await cmd('admin:word_add', { word, common: false });
    if (!r.ok) return;
    const d = r.data as { word: string; approved: number } | undefined;
    const n = d?.approved ?? 0;
    toast(n > 0 ? `Đã thêm “${d?.word ?? word}”, tính đúng lại cho ${n} người` : `Đã thêm “${d?.word ?? word}” vào từ điển`);
  };

  return (
    <Card title="Từ bị từ chối" right={<span className="text-xs text-slate-400">duyệt nếu từ đúng mà từ điển thiếu</span>}>
      {rejected.length === 0 ? (
        <Empty>Chưa có từ nào bị từ chối trong chặng này.</Empty>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm">
          {rejected.map((r) => (
            <li key={`${r.word}-${r.reason}`} className="flex items-center gap-2 rounded bg-slate-950/50 px-2 py-1">
              <span className="font-semibold text-slate-100">{r.word}</span>
              <span className="text-xs text-slate-400">×{fmtNum(r.count)}</span>
              <Badge tone={r.reason === 'not_in_bank' ? 'amber' : 'slate'}>{REJECT_LABEL[r.reason]}</Badge>
              <span className="flex-1" />
              {r.reason === 'not_in_bank' && (
                <Button size="sm" tone="emerald" onClick={() => approve(r.word)}>
                  ✓ Duyệt từ này
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
