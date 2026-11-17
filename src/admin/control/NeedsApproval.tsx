import type { RejectedSummary } from '../../../shared/types';
import { useAdmin, useCommand } from '../context';
import { fmtNum } from '../labels';
import { Button, Card } from '../ui';

/** Chỉ hiện khi có từ người xem gõ mà từ điển chưa có: duyệt nếu từ đúng (người đã gửi được tính lại) */
export function NeedsApproval({ rejected }: { rejected: RejectedSummary[] }) {
  const cmd = useCommand();
  const { toast } = useAdmin();
  const list = rejected.filter((r) => r.reason === 'not_in_bank');
  if (list.length === 0) return null;

  const approve = async (word: string) => {
    const r = await cmd('admin:word_add', { word, common: false });
    if (!r.ok) return;
    const d = r.data as { word: string; approved: number } | undefined;
    const n = d?.approved ?? 0;
    toast(n > 0 ? `Đã thêm “${d?.word ?? word}”, tính đúng lại cho ${n} người` : `Đã thêm “${d?.word ?? word}” vào từ điển`);
  };

  return (
    <Card title="Từ cần duyệt" right={<span className="text-xs text-amber-300">từ điển chưa có, duyệt nếu từ đúng</span>}>
      <ul className="max-h-60 space-y-1 overflow-y-auto pr-1 text-sm">
        {list.map((r) => (
          <li key={r.word} className="flex items-center gap-2 rounded bg-slate-950/50 px-2 py-1">
            <span className="font-semibold text-slate-100">{r.word}</span>
            <span className="text-xs text-slate-400">×{fmtNum(r.count)}</span>
            <span className="flex-1" />
            <Button size="sm" tone="emerald" onClick={() => approve(r.word)}>
              ✓ Duyệt
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
