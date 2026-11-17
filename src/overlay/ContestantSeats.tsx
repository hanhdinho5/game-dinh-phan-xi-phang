import { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PlayerView } from '../../shared/types';
import { Avatar, shortName } from './Avatar';

const AREA = { left: 24, top: 970, width: 1032, height: 862 };
const HEAD = 62;
const GAP = 10;

/** Số cột theo số ghế: ghế ít thì to, ghế nhiều thì nhỏ lại để vừa khung */
const COLS: Record<number, number> = { 20: 4, 40: 5, 60: 6, 80: 8, 100: 10 };

/**
 * Lưới ghế = bảng xếp hạng (không có bảng Top 10 riêng). Điểm đổi thì ghế tự trượt sang chỗ mới.
 * Ghế còn trống hiện "comment JOIN" để rủ người xem vào.
 */
export function ContestantSeats({
  seats,
  seatCount,
  waitingCount,
  highlightRound,
  fx,
  toast,
}: {
  seats: PlayerView[];
  seatCount: number;
  waitingCount: number;
  /** lượt vừa chốt: ghế được cộng điểm ở lượt này thì phát sáng + bay "+9" */
  highlightRound: number;
  fx: boolean;
  toast: React.ReactNode;
}) {
  const cols = COLS[seatCount] ?? 5;
  const rows = Math.ceil(seatCount / cols);
  const cellW = (AREA.width - 24 - GAP * (cols - 1)) / cols;
  const cellH = (AREA.height - HEAD - 16 - GAP * (rows - 1)) / rows;
  const size: SeatSize = cellW < 115 ? 'xs' : cellH >= 140 ? 'lg' : cellH >= 86 ? 'md' : 'sm';
  const empty = Math.max(0, seatCount - seats.length);

  return (
    <div className="pxp-panel absolute" style={AREA}>
      <div className="flex items-center px-5" style={{ height: HEAD }}>
        <div className="pxp-display flex-none whitespace-nowrap text-[32px] font-extrabold leading-none">
          NGƯỜI CHƠI <span className="text-amber-300">{Math.min(seats.length, seatCount)}</span>
          <span className="text-white/60">/{seatCount}</span>
        </div>
        {waitingCount > 0 && <div className="ml-3 flex-none whitespace-nowrap rounded-full bg-sky-400/20 px-3 py-0.5 text-[22px] font-bold text-sky-200">+{waitingCount} chờ ghế</div>}
        <div className="ml-auto flex min-w-0 flex-1 justify-end overflow-hidden pl-3">{toast}</div>
      </div>
      <div
        className="grid px-3"
        style={{ gridTemplateColumns: `repeat(${cols}, ${cellW}px)`, gridAutoRows: `${cellH}px`, gap: GAP }}
      >
        <AnimatePresence initial={false}>
          {seats.map((p) => (
            <motion.div
              key={p.userId}
              layout="position"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={{ layout: { type: 'spring', stiffness: 170, damping: 22 }, default: { duration: 0.3 } }}
            >
              <Seat p={p} size={size} gained={fx && p.lastGainRound === highlightRound && highlightRound > 0} />
            </motion.div>
          ))}
        </AnimatePresence>
        {Array.from({ length: empty }, (_, i) => (
          <EmptySeat key={`empty-${i}`} size={size} />
        ))}
      </div>
    </div>
  );
}

type SeatSize = 'lg' | 'md' | 'sm' | 'xs';

const MEDAL = ['', 'linear-gradient(160deg,#ffe58a,#f5b31b 60%,#b7791f)', 'linear-gradient(160deg,#f8fafc,#cbd5e1 60%,#94a3b8)', 'linear-gradient(160deg,#fcd5b0,#e08b4f 60%,#a0522d)'];

const Seat = memo(function Seat({ p, size, gained }: { p: PlayerView; size: SeatSize; gained: boolean }) {
  const medal = p.rank <= 3;
  const bg = medal ? MEDAL[p.rank] : 'linear-gradient(160deg, rgba(76,70,180,0.75), rgba(28,26,90,0.85))';
  const dark = medal; // nền sáng thì chữ tối
  const avatar = { lg: 64, md: 58, sm: 44, xs: 28 }[size];
  const nameMax = { lg: 12, md: 9, sm: 8, xs: 7 }[size];
  return (
    <div
      className={`relative flex h-full w-full rounded-[18px] ${gained ? 'pxp-seat-glow' : ''} ${size === 'xs' || size === 'lg' ? 'flex-col items-center justify-center' : 'items-center gap-2 px-2'}`}
      style={{ background: bg, border: medal ? 'none' : '1.5px solid rgba(255,255,255,0.14)', color: dark ? '#1e1300' : '#fff' }}
    >
      <span
        className="absolute left-1 top-1 flex items-center justify-center rounded-full font-extrabold"
        style={{
          minWidth: size === 'lg' ? 34 : size === 'xs' ? 20 : 26,
          height: size === 'lg' ? 34 : size === 'xs' ? 20 : 26,
          padding: '0 4px',
          fontSize: size === 'lg' ? 19 : size === 'xs' ? 12 : 15,
          background: medal ? 'rgba(30,19,0,0.85)' : '#ffc83d',
          color: medal ? '#ffe58a' : '#1e1300',
        }}
      >
        {p.rank}
      </span>
      <Avatar src={p.avatar} name={p.nickname} id={p.userId} size={avatar} ring={medal ? 'rgba(255,255,255,0.85)' : undefined} />
      <div className={`min-w-0 ${size === 'xs' || size === 'lg' ? 'mt-1 w-full px-1 text-center' : 'flex-1'}`}>
        <div className="truncate font-bold leading-tight" style={{ fontSize: { lg: 22, md: 19, sm: 16, xs: 12 }[size] }}>
          {shortName(p.nickname, nameMax)}
        </div>
        <div className="pxp-display font-extrabold leading-none" style={{ fontSize: { lg: 38, md: 32, sm: 26, xs: 19 }[size], color: dark ? '#3b1d00' : '#ffc83d' }}>
          {p.score}
        </div>
      </div>
      {gained && p.lastGain > 0 && (
        <div
          key={`plus-${p.lastGainRound}`}
          className="pxp-plus pxp-display absolute left-1/2 top-0 rounded-full bg-emerald-400 px-3 font-extrabold text-slate-900 shadow-lg"
          style={{ fontSize: size === 'lg' ? 40 : 30 }}
        >
          +{p.lastGain}
        </div>
      )}
    </div>
  );
});

const EmptySeat = memo(function EmptySeat({ size }: { size: SeatSize }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-[18px] border-2 border-dashed border-white/15 text-center font-bold text-white/30" style={{ fontSize: size === 'xs' ? 13 : 17 }}>
      Trống
    </div>
  );
});
