import { useMemo, useState } from 'react';
import type { AdminState, PlayerView } from '../../shared/types';
import { useAdmin, useCommand } from './context';
import { fmtNum } from './labels';
import { Avatar, Badge, Button, Card, Empty, inputCls } from './ui';

type SeatFilter = 'all' | 'seated' | 'waiting';
const FILTERS: [SeatFilter, string][] = [
  ['all', 'Tất cả'],
  ['seated', 'Đang ngồi'],
  ['waiting', 'Hàng chờ'],
];
/** vẽ tối đa bấy nhiêu dòng, tránh giật khi có cả nghìn người */
const MAX_ROWS = 300;

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function PlayersPanel({ state }: { state: AdminState }) {
  const [q, setQ] = useState('');
  const [seat, setSeat] = useState<SeatFilter>('all');
  const { players } = state;

  const filtered = useMemo(() => {
    const needle = fold(q.trim());
    return players.filter((p) => {
      if (seat === 'seated' && !p.seated) return false;
      if (seat === 'waiting' && p.seated) return false;
      return !needle || fold(p.nickname).includes(needle) || fold(p.uniqueId).includes(needle);
    });
  }, [players, q, seat]);
  const seatedCount = useMemo(() => players.filter((p) => p.seated).length, [players]);
  const counts: Record<SeatFilter, number> = { all: players.length, seated: seatedCount, waiting: players.length - seatedCount };

  return (
    <div className="space-y-4">
      <Card title={`Người chơi (${fmtNum(players.length)})`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className={`${inputCls} max-w-xs`} placeholder="Lọc theo tên hoặc @id…" value={q} onChange={(e) => setQ(e.target.value)} />
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSeat(key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
                seat === key ? 'bg-amber-500 text-slate-950 ring-amber-500' : 'text-slate-300 ring-slate-700 hover:bg-slate-800'
              }`}
            >
              {label} ({fmtNum(counts[key])})
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <Empty>Không có người chơi nào.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-400">
                <tr className="border-b border-slate-800">
                  <th className="px-2 py-2 text-right">Hạng</th>
                  <th className="px-2 py-2">Người chơi</th>
                  <th className="px-2 py-2 text-right">Điểm</th>
                  <th className="px-2 py-2 text-right">Đúng</th>
                  <th className="px-2 py-2">Trạng thái</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, MAX_ROWS).map((p) => (
                  <PlayerRow key={p.userId} p={p} />
                ))}
              </tbody>
            </table>
            {filtered.length > MAX_ROWS && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Đang hiện {MAX_ROWS}/{fmtNum(filtered.length)} người. Gõ tên để lọc.
              </p>
            )}
          </div>
        )}
      </Card>
      <BannedList banned={state.bannedUsers} />
    </div>
  );
}

function PlayerRow({ p }: { p: PlayerView }) {
  const cmd = useCommand();
  const { toast } = useAdmin();
  const remove = async (ban: boolean) => {
    const r = await cmd('admin:remove_player', { userId: p.userId, ban });
    if (r.ok) toast(ban ? `Đã khoá ${p.nickname}` : `Đã xoá ${p.nickname} khỏi game`);
  };
  return (
    <tr className="border-b border-slate-800/60 hover:bg-slate-800/40">
      <td className="px-2 py-1.5 text-right font-bold text-amber-300 tabular-nums">{p.rank}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <Avatar src={p.avatar} name={p.nickname} />
          <div className="min-w-0">
            <div className="truncate text-slate-100">{p.nickname}</div>
            <div className="truncate text-xs text-slate-500">@{p.uniqueId}</div>
          </div>
        </div>
      </td>
      <td className="px-2 py-1.5 text-right font-semibold text-emerald-300 tabular-nums">{fmtNum(p.score)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{fmtNum(p.correct)}</td>
      <td className="px-2 py-1.5">
        <div className="flex gap-1">
          {p.seated ? <Badge tone="emerald">Đang ngồi</Badge> : <Badge tone="slate">Hàng chờ</Badge>}
          {p.isMock && <Badge tone="violet">giả lập</Badge>}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex justify-end gap-1">
          <Button size="sm" confirm={`Xoá ${p.nickname}?`} onClick={() => remove(false)}>
            Xoá
          </Button>
          <Button size="sm" tone="rose" confirm={`Khoá ${p.nickname}?`} onClick={() => remove(true)}>
            Khoá
          </Button>
        </div>
      </td>
    </tr>
  );
}

function BannedList({ banned }: { banned: AdminState['bannedUsers'] }) {
  const cmd = useCommand();
  const { toast } = useAdmin();
  return (
    <Card title={`Tài khoản bị khoá (${banned.length})`}>
      {banned.length === 0 ? (
        <Empty>Chưa khoá ai.</Empty>
      ) : (
        <ul className="space-y-1 text-sm">
          {banned.map((b) => (
            <li key={b.userId} className="flex items-center gap-2 rounded bg-slate-950/50 px-2 py-1">
              <span className="flex-1 truncate text-slate-100">{b.nickname}</span>
              <span className="text-xs text-slate-500">{b.userId}</span>
              <Button
                size="sm"
                tone="emerald"
                onClick={async () => {
                  if ((await cmd('admin:unban_player', b.userId)).ok) toast(`Đã gỡ khoá ${b.nickname}`);
                }}
              >
                Gỡ khoá
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
