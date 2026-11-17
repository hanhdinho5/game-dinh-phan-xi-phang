import { useEffect, useState } from 'react';
import type { AdminState, VoiceLine } from '../../../shared/types';
import { useAdmin, useCommand } from '../context';
import { Badge, Button, Card, inputCls } from '../ui';

const QUICK = [
  'Chào cả nhà! Comment join để cùng leo núi nhé!',
  'Cảm ơn cả nhà đã thả tim và chia sẻ live!',
  'Ai chưa follow thì follow kênh để không bỏ lỡ cuộc đua sau nhé!',
];

/** Giọng MC: gõ câu cho MC đọc ngay, xem MC vừa nói gì, cảnh báo khi không có / có nhiều overlay phát tiếng */
export function VoiceBox({ state }: { state: AdminState }) {
  const { socket } = useAdmin();
  const cmd = useCommand();
  const [text, setText] = useState('');
  const [recent, setRecent] = useState<VoiceLine[]>([]);

  useEffect(() => {
    const onSay = (l: VoiceLine) => setRecent((list) => [l, ...list].slice(0, 6));
    socket.on('voice:say', onSay);
    return () => void socket.off('voice:say', onSay);
  }, [socket]);

  const speak = async (t: string) => {
    if (!t.trim()) return;
    const r = await cmd('admin:speak', t.trim());
    if (r.ok) setText('');
  };

  const count = state.speaker?.count ?? 0;
  const cfg = state.fullConfig;
  return (
    <Card
      title="🎙️ Giọng MC"
      right={
        <div className="flex items-center gap-2">
          {!cfg.voiceEnabled && <Badge tone="rose">Giọng đang tắt</Badge>}
          {count === 0 ? (
            <Badge tone="rose">Chưa mở overlay</Badge>
          ) : count > 1 ? (
            <Badge tone="amber">{count} overlay đang mở (chỉ cái mới nhất có tiếng)</Badge>
          ) : (
            <Badge tone="emerald">Đang phát tiếng</Badge>
          )}
        </div>
      }
    >
      <div className="flex gap-2">
        <input
          className={`${inputCls} min-w-0 flex-1`}
          placeholder="Câu cho MC đọc..."
          maxLength={300}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void speak(text)}
        />
        <Button tone="amber" disabled={!text.trim()} onClick={() => speak(text)}>
          Đọc ngay
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <Button key={q} size="sm" onClick={() => speak(q)}>
            {q.length > 34 ? `${q.slice(0, 33)}…` : q}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Xem thử overlay mà không giành tiếng của LIVE Studio: thêm <code className="text-sky-300">&amp;mute=1</code>.
      </p>
      {recent.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {recent.map((l) => (
            <li key={l.id} className={l.kind === 'main' ? 'text-slate-200' : 'text-slate-400'}>
              <span className="mr-1">{l.kind === 'main' ? '🎙️' : '💬'}</span>
              {l.text.replace(/\^/g, '').replace(/\s*\|\s*/g, ' ')}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
