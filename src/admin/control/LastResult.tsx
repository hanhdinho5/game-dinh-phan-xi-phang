import type { AdminState } from '../../../shared/types';
import { SOURCE_LABEL, SOURCE_TONE, fmtNum } from '../labels';
import { Badge, Card, Empty } from '../ui';

export function LastResult({ result }: { result: AdminState['lastResult'] }) {
  return (
    <Card title={result ? `Kết quả chặng ${result.no}` : 'Kết quả chặng trước'}>
      {!result ? (
        <Empty>Chưa có chặng nào kết thúc.</Empty>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-display text-xl font-bold uppercase text-slate-100">{result.word}</span>
            <span className="text-slate-500">→</span>
            <span className="font-display text-xl font-bold uppercase text-emerald-300">{result.nextWord}</span>
            <Badge tone={SOURCE_TONE[result.nextSource]}>{SOURCE_LABEL[result.nextSource]}</Badge>
            <span className="ml-auto text-xs text-slate-400">
              {fmtNum(result.winners.length)} người đúng · {fmtNum(result.distinctAnswers.length)} đáp án khác nhau
            </span>
          </div>
          {result.winners.length === 0 ? (
            <Empty>Không ai nối đúng.</Empty>
          ) : (
            <ol className="grid gap-1 text-sm sm:grid-cols-2">
              {result.winners.slice(0, 10).map((w) => (
                <li key={w.userId} className="flex items-center gap-2 rounded bg-slate-950/50 px-2 py-1">
                  <span className="w-7 text-right font-bold text-amber-300 tabular-nums">#{w.rank}</span>
                  <span className="flex-1 truncate">{w.nickname}</span>
                  <span className="text-xs text-slate-400">{w.word}</span>
                  <span className="font-bold text-emerald-300">+{w.points}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </Card>
  );
}
