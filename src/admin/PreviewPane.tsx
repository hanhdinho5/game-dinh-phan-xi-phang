import { useEffect, useState } from 'react';
import type { GameSocket } from '../lib/socket';
import { PhanXiPangOverlay } from '../overlay/PhanXiPangOverlay';
import { StageFrame } from '../overlay/StageFrame';

/** chừa chỗ cho thanh trạng thái trên cùng + nhãn "Xem trước" */
const RESERVED_PX = 100;

function useWindowHeight() {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return h;
}

/** Màn hình overlay thu nhỏ, không phát tiếng (âm thanh chỉ phát ở trang LIVE Studio) */
export function PreviewPane({ socket }: { socket: GameSocket }) {
  const h = useWindowHeight();
  return (
    <aside className="flex shrink-0 flex-col items-center gap-2 border-l border-slate-800 bg-slate-950 px-3 py-2">
      <div className="flex w-full items-center justify-between text-xs text-slate-400">
        <span className="font-semibold text-slate-300">Xem trước (im lặng)</span>
        <span>1080×1920</span>
      </div>
      <div className="overflow-hidden rounded-lg ring-1 ring-slate-700">
        <StageFrame maxHeight={Math.max(320, h - RESERVED_PX)}>
          <PhanXiPangOverlay socket={socket} event="admin:state" />
        </StageFrame>
      </div>
    </aside>
  );
}
