import type { ChainItem } from '../../../shared/types';
import { SOURCE_LABEL, SOURCE_TONE } from '../labels';
import { Badge, Card, Empty } from '../ui';

export function ChainList({ chain }: { chain: ChainItem[] }) {
  const newestFirst = [...chain].reverse();
  return (
    <Card title={`Chuỗi từ phiên này (${chain.length})`} right={<span className="text-xs text-slate-400">mới nhất ở trên</span>}>
      {newestFirst.length === 0 ? (
        <Empty>Chưa có từ nào.</Empty>
      ) : (
        <ol className="max-h-[420px] space-y-1 overflow-y-auto pr-1 text-sm">
          {newestFirst.map((c, i) => (
            <li key={`${chain.length - i}-${c.word}`} className="flex items-center gap-2 rounded bg-slate-950/50 px-2 py-1">
              <span className="w-8 text-right text-xs text-slate-500 tabular-nums">{chain.length - i}</span>
              <span className="font-semibold text-slate-100">{c.word}</span>
              <Badge tone={SOURCE_TONE[c.source]}>{SOURCE_LABEL[c.source]}</Badge>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
