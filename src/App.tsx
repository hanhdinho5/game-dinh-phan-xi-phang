import { useMemo } from 'react';
import { IS_OVERLAY, MUTED } from './lib/page';
import { createSocket } from './lib/socket';
import { PhanXiPangOverlay } from './overlay/PhanXiPangOverlay';
import { StageFrame } from './overlay/StageFrame';
import { PhanXiPangAdmin } from './admin/PhanXiPangAdmin';

export default function App() {
  const socket = useMemo(() => createSocket(IS_OVERLAY ? 'overlay' : 'admin', IS_OVERLAY && !MUTED), []);

  // Trang cho TikTok LIVE Studio: chỉ có màn hình game, khung 1080x1920 tự co giãn
  if (IS_OVERLAY) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black">
        <StageFrame>
          <PhanXiPangOverlay socket={socket} sound />
        </StageFrame>
      </div>
    );
  }
  return <PhanXiPangAdmin socket={socket} />;
}
