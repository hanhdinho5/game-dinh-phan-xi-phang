import { useCallback, useEffect, useState } from 'react';
import type { LogEntry, SessionSummary } from '../../shared/types';
import { useCommand } from './context';
import { LOG_TONE, fmtDateTime, fmtNum, fmtTime } from './labels';
import { Badge, Button, Card, Empty } from './ui';

export function HistoryPanel({ logs, currentSessionId }: { logs: LogEntry[]; currentSessionId: string }) {
  return (
    <div className="space-y-4">
      <SessionList currentSessionId={currentSessionId} />
      <LogList logs={logs} />
    </div>
  );
}

function SessionList({ currentSessionId }: { currentSessionId: string }) {
  const cmd = useCommand();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);

  const load = useCallback(async () => {
    const r = await cmd('admin:sessions');
    if (r.ok) setSessions((r.data as SessionSummary[] | undefined) ?? []);
  }, [cmd]);
  useEffect(() => {
    void load();
  }, [load]);

  const sorted = sessions ? [...sessions].sort((a, b) => b.startedAt - a.startedAt) : null;

  return (
    <Card
      title="Lịch sử các phiên"
      right={
        <Button size="sm" onClick={load}>
          ↻ Làm mới
        </Button>
      }
    >
      {sorted === null ? (
        <Empty>Đang tải…</Empty>
      ) : sorted.length === 0 ? (
        <Empty>Chưa có phiên nào được lưu.</Empty>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-900 text-xs text-slate-400">
              <tr className="border-b border-slate-800">
                <th className="px-2 py-2">Phiên</th>
                <th className="px-2 py-2">Bắt đầu</th>
                <th className="px-2 py-2">Kết thúc</th>
                <th className="px-2 py-2 text-right">Chặng</th>
                <th className="px-2 py-2 text-right">Người chơi</th>
                <th className="px-2 py-2">Người thắng</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id} className="border-b border-slate-800/60">
                  <td className="px-2 py-1.5 font-mono text-xs text-slate-300">
                    {s.id}
                    {s.id === currentSessionId && (
                      <span className="ml-1">
                        <Badge tone="emerald">hiện tại</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-300">{fmtDateTime(s.startedAt)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-300">{s.endedAt ? fmtDateTime(s.endedAt) : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(s.rounds)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(s.players)}</td>
                  <td className="px-2 py-1.5 text-amber-300">{s.winner ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function LogList({ logs }: { logs: LogEntry[] }) {
  const newestFirst = [...logs].reverse();
  return (
    <Card title="Nhật ký (log)" right={<span className="text-xs text-slate-400">mới nhất ở trên</span>}>
      {newestFirst.length === 0 ? (
        <Empty>Chưa có log.</Empty>
      ) : (
        <ul className="max-h-[480px] space-y-0.5 overflow-y-auto font-mono text-xs">
          {newestFirst.map((l, i) => (
            <li key={`${l.at}-${i}`} className={`flex gap-2 ${LOG_TONE[l.level]}`}>
              <span className="shrink-0 text-slate-500">{fmtTime(l.at)}</span>
              <span className="break-words">{l.msg}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
