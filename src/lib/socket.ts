import { io, type Socket } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';
import type { AckResult, AdminState, ClientToServerEvents, OverlayState, ServerToClientEvents } from '../../shared/types';
import { URL_TOKEN } from './page';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const TOKEN_KEY = 'pxp-admin-token';
export function adminToken(): string {
  try {
    if (URL_TOKEN) localStorage.setItem(TOKEN_KEY, URL_TOKEN);
    return URL_TOKEN || localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return URL_TOKEN;
  }
}

/** Mỗi trang 1 kết nối. Socket.IO tự kết nối lại khi rớt mạng / server bật lại. */
/** `sound`: overlay muốn phát tiếng (server chọn overlay mở sau cùng làm "loa") */
export function createSocket(role: 'overlay' | 'admin', sound = false): GameSocket {
  return io({ auth: role === 'admin' ? { role, token: adminToken() } : { role, sound }, transports: ['websocket', 'polling'] });
}

/** Gửi lệnh admin, đợi server trả lời (lỗi thì trả {ok:false}) */
export function command<K extends keyof ClientToServerEvents>(
  socket: GameSocket,
  event: K,
  ...args: Parameters<ClientToServerEvents[K]> extends [...infer A, unknown] ? A : never
): Promise<AckResult> {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ ok: false, error: 'Mất kết nối server' });
    const timer = setTimeout(() => resolve({ ok: false, error: 'Server không trả lời' }), 15_000);
    (socket.emit as (e: string, ...a: unknown[]) => void)(event, ...args, (r: AckResult) => {
      clearTimeout(timer);
      resolve(r);
    });
  });
}

/**
 * Trạng thái game từ server + độ lệch đồng hồ (để đếm ngược mượt trên client).
 * `offset` = giờ server - giờ máy này, lúc nhận ảnh chụp.
 */
export function useGameState<T extends OverlayState | AdminState>(socket: GameSocket, event: 'game:state' | 'admin:state') {
  const [state, setState] = useState<T | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const offset = useRef(0);
  useEffect(() => {
    const onState = (s: T) => {
      offset.current = s.serverNow - Date.now();
      setState(s);
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on(event, onState as never);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off(event, onState as never);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket, event]);
  return { state, connected, offset };
}

/** Giờ hiện tại theo đồng hồ server, cập nhật `everyMs` một lần */
export function useServerNow(offset: { current: number }, everyMs = 100) {
  const [now, setNow] = useState(() => Date.now() + offset.current);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset.current), everyMs);
    return () => clearInterval(t);
  }, [offset, everyMs]);
  return now;
}
