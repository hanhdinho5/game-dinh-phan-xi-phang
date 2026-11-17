import { useState } from 'react';
import { useAdmin, useCommand } from '../context';
import { Button, Card, inputCls } from '../ui';

/** Giả lập người xem để thử game khi chưa LIVE */
export function MockBox({ allowed, roundSeconds }: { allowed: boolean; roundSeconds: number }) {
  const cmd = useCommand();
  const { toast } = useAdmin();
  const [nick, setNick] = useState('');
  const [text, setText] = useState('');
  const spreadMs = roundSeconds * 800;

  const answers = async (count: number, correctRatio: number) => {
    const r = await cmd('mock:answers', { count, correctRatio, spreadMs });
    if (r.ok) {
      const valid = (r.data as { valid?: number } | undefined)?.valid;
      toast(`Đang gửi ${count} câu trả lời giả${valid !== undefined ? ` · có ${valid} từ nối hợp lệ` : ''}`, valid === 0 ? 'error' : 'info');
    }
  };
  const sendComment = async () => {
    if (!text.trim()) return;
    const r = await cmd('mock:comment', { nickname: nick.trim() || undefined, userId: nick.trim() ? `mock_tay_${nick.trim()}` : undefined, text: text.trim() });
    if (r.ok) setText('');
  };

  return (
    <Card title="Giả lập (thử game)" right={!allowed && <span className="text-xs text-amber-300">Đang kết nối TikTok thật nên tắt giả lập</span>}>
      <fieldset disabled={!allowed} className="space-y-3 disabled:opacity-50">
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!allowed}
            onClick={async () => {
              if ((await cmd('mock:join', 10)).ok) toast('+10 người giả vào game', 'info');
            }}
          >
            +10 người join
          </Button>
          <Button disabled={!allowed} onClick={() => answers(20, 0.6)}>
            20 người trả lời (60% đúng)
          </Button>
          <Button disabled={!allowed} onClick={() => answers(100, 0.6)}>
            100 người trả lời
          </Button>
          <Button disabled={!allowed} onClick={() => answers(1000, 0.15)}>
            1000 người cùng đoán
          </Button>
          <Button
            disabled={!allowed}
            onClick={async () => {
              if ((await cmd('mock:gift')).ok) toast('Đã gửi quà giả', 'info');
            }}
          >
            🎁 Tặng quà
          </Button>
        </div>
        <div className="flex gap-2">
          <input className={`${inputCls} max-w-40`} placeholder="Tên (tuỳ ý)" value={nick} onChange={(e) => setNick(e.target.value)} />
          <input
            className={inputCls}
            placeholder="Bình luận, vd: join, viên"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void sendComment()}
          />
          <Button tone="sky" disabled={!allowed || !text.trim()} onClick={sendComment}>
            Gửi
          </Button>
        </div>
      </fieldset>
    </Card>
  );
}
