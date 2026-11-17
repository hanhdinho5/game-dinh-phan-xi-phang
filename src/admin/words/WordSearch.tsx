import { useCallback, useEffect, useRef, useState } from 'react';
import type { WordSearchResult } from '../../../shared/types';
import { useAdmin, useCommand } from '../context';
import { Badge, Button, Card, Empty, inputCls } from '../ui';

export function WordSearch({ refreshKey }: { refreshKey: number }) {
  const cmd = useCommand();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<WordSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const search = useCallback(
    async (query: string) => {
      const id = ++reqId.current;
      if (!query.trim()) {
        setResults(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const r = await cmd('admin:word_search', query);
      if (id !== reqId.current) return; // đã có lần tìm mới hơn
      setLoading(false);
      if (r.ok) setResults((r.data as WordSearchResult[] | undefined) ?? []);
    },
    [cmd],
  );

  // gõ xong 250ms mới tìm
  useEffect(() => {
    const t = setTimeout(() => void search(q), 250);
    return () => clearTimeout(t);
  }, [q, search]);

  // có từ vừa thêm ở form bên dưới: tìm lại để thấy ngay
  const qRef = useRef(q);
  useEffect(() => {
    qRef.current = q;
  }, [q]);
  useEffect(() => {
    if (refreshKey > 0) void search(qRef.current);
  }, [refreshKey, search]);

  const refresh = () => search(q);

  return (
    <Card title="Tìm từ trong từ điển">
      <div className="relative">
        <input
          className={inputCls}
          placeholder="Tìm từ (gõ không dấu được)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {loading && (
          <span className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        )}
      </div>
      <div className="mt-3">
        {results === null ? (
          <Empty>Nhập từ để tìm.</Empty>
        ) : results.length === 0 ? (
          <Empty>Không tìm thấy “{q}”.</Empty>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-400">
              {results.length} kết quả{results.length >= 200 ? ' (tối đa 200)' : ''}
            </p>
            <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              {results.map((w) => (
                <WordRow key={w.word} w={w} onChanged={refresh} />
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function WordRow({ w, onChanged }: { w: WordSearchResult; onChanged: () => Promise<void> }) {
  const cmd = useCommand();
  const { toast } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(w.word);

  const saveEdit = async () => {
    const to = draft.trim();
    if (!to || to === w.word) return setEditing(false);
    const r = await cmd('admin:word_edit', { from: w.word, to });
    if (!r.ok) return;
    toast(`Đã sửa “${w.word}” thành “${(r.data as { word?: string } | undefined)?.word ?? to}”`);
    setEditing(false);
    await onChanged();
  };
  const remove = async () => {
    if (!(await cmd('admin:word_delete', w.word)).ok) return;
    toast(`Đã xoá “${w.word}”`);
    await onChanged();
  };
  const ban = async (banned: boolean) => {
    if (!(await cmd('admin:word_ban', { word: w.word, banned })).ok) return;
    toast(banned ? `Đã đánh dấu “${w.word}” không hợp lệ` : `Đã gỡ đánh dấu “${w.word}”`);
    await onChanged();
  };

  return (
    <li className="flex flex-wrap items-center gap-2 rounded bg-slate-950/50 px-2 py-1.5 text-sm">
      {editing ? (
        <>
          <input
            autoFocus
            className={`${inputCls} max-w-56 py-1`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <Button size="sm" tone="emerald" onClick={saveEdit}>
            Lưu
          </Button>
          <Button size="sm" onClick={() => setEditing(false)}>
            Huỷ
          </Button>
        </>
      ) : (
        <span className={`font-semibold ${w.banned ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{w.word}</span>
      )}
      <span className="flex flex-wrap gap-1">
        {w.origin === 'base' ? <Badge>gốc</Badge> : <Badge tone="sky">thêm</Badge>}
        {w.common && <Badge tone="emerald">phổ biến</Badge>}
        {w.banned && <Badge tone="rose">không hợp lệ</Badge>}
        {w.used && <Badge tone="amber">đã dùng</Badge>}
      </span>
      {!editing && (
        <span className="ml-auto flex gap-1">
          <Button
            size="sm"
            onClick={() => {
              setDraft(w.word);
              setEditing(true);
            }}
          >
            Sửa
          </Button>
          <Button size="sm" tone="rose" confirm={`Xoá “${w.word}” khỏi từ điển?`} onClick={remove}>
            Xoá
          </Button>
          {w.banned ? (
            <Button size="sm" tone="emerald" onClick={() => ban(false)}>
              Gỡ
            </Button>
          ) : (
            <Button size="sm" tone="amber" onClick={() => ban(true)}>
              Đánh dấu không hợp lệ
            </Button>
          )}
        </span>
      )}
    </li>
  );
}
