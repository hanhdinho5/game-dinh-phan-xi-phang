import { useAdmin, useCommand } from '../context';
import { Button, Card } from '../ui';

/** Giả lập người xem để thử game khi chưa LIVE. Chỉ hiện khi chưa nối TikTok thật. */
export function MockBox({ roundSeconds }: { roundSeconds: number }) {
  const cmd = useCommand();
  const { toast } = useAdmin();
  const spreadMs = roundSeconds * 800;

  const answers = async (count: number, correctRatio: number) => {
    const r = await cmd('mock:answers', { count, correctRatio, spreadMs });
    if (r.ok) {
      const valid = (r.data as { valid?: number } | undefined)?.valid;
      toast(`Đang gửi ${count} câu trả lời giả${valid !== undefined ? ` · có ${valid} từ nối hợp lệ` : ''}`, valid === 0 ? 'error' : 'info');
    }
  };

  return (
    <Card title="Giả lập (để thử)">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            if ((await cmd('mock:join', 20)).ok) toast('+20 người giả vào game', 'info');
          }}
        >
          +20 người vào
        </Button>
        <Button onClick={() => answers(20, 0.8)}>20 người trả lời</Button>
        <Button onClick={() => answers(300, 0.5)}>300 người trả lời (đông)</Button>
        <Button
          onClick={async () => {
            if ((await cmd('mock:gift')).ok) toast('Đã gửi quà giả', 'info');
          }}
        >
          🎁 Tặng quà
        </Button>
      </div>
    </Card>
  );
}
