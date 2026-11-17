import { useState } from 'react';
import type { AdminState } from '../../../shared/types';
import { useCommand } from '../context';
import { Button, inputCls } from '../ui';

/** Chỉ hiện khi có vấn đề với giọng MC (không có overlay phát tiếng, nhiều overlay, hoặc đang tắt giọng) */
export function VoiceAlert({ state }: { state: AdminState }) {
  const count = state.speaker?.count ?? 0;
  const running = state.phase === 'running' || state.live.isConnected;
  let msg = '';
  if (!state.fullConfig.voiceEnabled) msg = 'Giọng MC đang tắt (bật ở tab Cấu hình).';
  else if (count === 0 && running) msg = 'Chưa có overlay nào mở nên MC chưa phát tiếng. Mở link overlay trong LIVE Studio.';
  else if (count > 1) msg = `Đang mở ${count} overlay: chỉ cái mở sau cùng có tiếng. Xem thử thì thêm &mute=1 vào link.`;
  if (!msg) return null;
  return <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">🎙️ {msg}</div>;
}

/** Gõ câu cho MC đọc ngay (nằm trong "Nâng cao") */
export function VoiceBox() {
  const cmd = useCommand();
  const [text, setText] = useState('');
  const speak = async () => {
    if (!text.trim()) return;
    const r = await cmd('admin:speak', text.trim());
    if (r.ok) setText('');
  };
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-200">🎙️ Cho MC đọc ngay</span>
      <div className="flex gap-2">
        <input className={`${inputCls} min-w-0 flex-1`} placeholder="Câu cho MC đọc..." maxLength={300} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void speak()} />
        <Button tone="amber" disabled={!text.trim()} onClick={speak}>
          Đọc ngay
        </Button>
      </div>
    </div>
  );
}
