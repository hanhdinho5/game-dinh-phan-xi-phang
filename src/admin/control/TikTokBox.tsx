import { useRef, useState } from 'react';
import type { LiveStatus } from '../../../shared/types';
import { useAdmin, useCommand } from '../context';
import { fmtNum } from '../labels';
import { Button, Card, inputCls } from '../ui';

const USER_KEY = 'pxp-tiktok-user';
const loadUser = () => {
  try {
    return localStorage.getItem(USER_KEY) ?? '';
  } catch {
    return '';
  }
};

export function TikTokBox({ live }: { live: LiveStatus }) {
  const cmd = useCommand();
  const { toast } = useAdmin();
  const [user, setUser] = useState(() => loadUser() || live.username);
  const busy = useRef(false);

  const connect = async () => {
    const u = user.trim().replace(/^@/, '');
    if (!u) return toast('Nhập tên TikTok (username) trước', 'error');
    // Enter liên tục / bấm 2 lần: chỉ 1 lần kết nối
    if (busy.current || live.isConnecting) return;
    busy.current = true;
    try {
      localStorage.setItem(USER_KEY, u);
    } catch {
      /* bỏ qua */
    }
    const r = await cmd('admin:tiktok_connect', u);
    busy.current = false;
    if (r.ok) toast(`Đã kết nối TikTok @${u}`);
  };
  const disconnect = async () => {
    const r = await cmd('admin:tiktok_disconnect');
    if (r.ok) toast('Đã ngắt TikTok', 'info');
  };

  return (
    <Card
      title="Kết nối TikTok LIVE"
      right={
        <span className={`text-xs ${live.isConnected ? 'text-emerald-300' : live.isConnecting ? 'text-amber-300' : 'text-slate-400'}`}>
          {live.isConnected
            ? `Đang nhận bình luận @${live.username}${live.roomId ? ` · phòng ${live.roomId}` : ''} · ${fmtNum(live.viewerCount)} người xem`
            : live.isConnecting
              ? 'Đang kết nối…'
              : 'Chưa kết nối'}
        </span>
      }
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500">@</span>
          <input
            className={`${inputCls} pl-7`}
            placeholder="tên tài khoản TikTok đang LIVE"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void connect()}
          />
        </div>
        <Button tone="emerald" onClick={connect} disabled={live.isConnecting}>
          Kết nối
        </Button>
        <Button tone="rose" onClick={disconnect} disabled={!live.isConnected && !live.isConnecting && !live.target}>
          Ngắt
        </Button>
      </div>
      {live.error && <p className="mt-2 rounded-lg bg-rose-950/60 px-3 py-2 text-sm text-rose-300">⚠ {live.error}</p>}
    </Card>
  );
}
