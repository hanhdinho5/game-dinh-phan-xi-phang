import { useState } from 'react';
import { useAdmin, useCommand } from '../context';
import { Button, Card, inputCls } from '../ui';

export function AddWordForm({ onAdded }: { onAdded: () => void }) {
  const cmd = useCommand();
  const { toast } = useAdmin();
  const [word, setWord] = useState('');
  const [common, setCommon] = useState(false);

  const add = async () => {
    const w = word.trim();
    if (!w) return toast('Nhập từ gồm 2 tiếng, ví dụ “sinh viên”', 'error');
    const r = await cmd('admin:word_add', { word: w, common });
    if (!r.ok) return;
    const d = r.data as { word: string; approved: number } | undefined;
    toast(
      d && d.approved > 0
        ? `Đã thêm “${d.word}”, tính đúng lại cho ${d.approved} người`
        : `Đã thêm “${d?.word ?? w}” vào từ điển`,
    );
    setWord('');
    onAdded();
  };

  return (
    <Card title="Thêm từ mới">
      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder="Từ 2 tiếng, ví dụ: sinh viên"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
        <Button tone="emerald" onClick={add}>
          Thêm
        </Button>
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={common} onChange={(e) => setCommon(e.target.checked)} />
        Từ phổ biến (hệ thống được tự ra từ này)
      </label>
      <p className="mt-1 text-xs text-slate-400">Người đã gửi từ này trong chặng đang chạy được tính đúng.</p>
    </Card>
  );
}
