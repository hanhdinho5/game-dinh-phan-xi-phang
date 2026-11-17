import { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PlayerView } from '../../shared/types';
import { Avatar, MARK_COLOR, MarkBadge, displayName, type Mark } from './Avatar';

const AREA = { left: 24, top: 904, width: 1032, height: 928 };
const HEAD = 78;
const GAP = 10;

/** Số cột theo số ghế: ghế ít thì to, ghế nhiều thì nhỏ lại để vừa khung */
// ít cột để mỗi ghế đủ rộng cho chữ to (người xem TikTok nhìn trên điện thoại)
const COLS: Record<number, number> = { 20: 4, 40: 4, 60: 5, 80: 6, 100: 8 };

/**
 * Lưới ghế = bảng xếp hạng (không có bảng Top 10 riêng). Điểm đổi thì ghế tự trượt sang chỗ mới.
 * Ghế còn trống hiện "comment JOIN" để rủ người xem vào.
 */
export function ContestantSeats({
  seats,
  seatCount,
  waitingCount,
  highlightRound,
  marks,
  fx,
  toast,
}: {
  seats: PlayerView[];
  seatCount: number;
  waitingCount: number;
  /** lượt vừa chốt: ghế được cộng điểm ở lượt này thì phát sáng + bay "+9" */
  highlightRound: number;
  /** ✓ xanh = đã nối đúng, ✕ đỏ = đã gửi sai (trong lúc chặng chạy) */
  marks: Record<string, Mark>;
  fx: boolean;
  toast: React.ReactNode;
}) {
  const cols = COLS[seatCount] ?? 5;
  const rows = Math.ceil(seatCount / cols);
  const cellW = (AREA.width - 24 - GAP * (cols - 1)) / cols;
  const cellH = (AREA.height - HEAD - 16 - GAP * (rows - 1)) / rows;
  const size: SeatSize = cellW < 125 ? 'xs' : cellH >= 140 ? 'lg' : cellH >= 70 ? 'md' : 'sm';
  const empty = Math.max(0, seatCount - seats.length);

  return (
    <div className="pxp-panel absolute" style={AREA}>
      <div className="flex items-center px-5" style={{ height: HEAD }}>
        <div className="pxp-display flex-none whitespace-nowrap text-[36px] font-extrabold leading-none">
          🏆 BẢNG XẾP HẠNG
        </div>
        <div className="ml-3 flex-none whitespace-nowrap rounded-full bg-white/10 px-3 py-0.5 text-[28px] font-extrabold text-amber-300">
          {Math.min(seats.length, seatCount)}
          <span className="text-white/60">/{seatCount}</span>
        </div>
        {waitingCount > 0 && <div className="ml-2 flex-none whitespace-nowrap rounded-full bg-sky-400/25 px-3 py-0.5 text-[24px] font-bold text-sky-200">+{waitingCount} chờ</div>}
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
              <Seat p={p} size={size} mark={marks[p.userId]} gained={fx && p.lastGainRound === highlightRound && highlightRound > 0} />
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

const Seat = memo(function Seat({ p, size, gained, mark }: { p: PlayerView; size: SeatSize; gained: boolean; mark?: Mark }) {
  const medal = p.rank <= 3;
  const bg = medal ? MEDAL[p.rank] : 'linear-gradient(160deg, rgba(86,78,200,0.8), rgba(30,28,96,0.9))';
  const avatar = { lg: 84, md: 50, sm: 42, xs: 30 }[size];
  const nameMax = { lg: 10, md: 8, sm: 8, xs: 6 }[size];
  const column = size === 'lg' || size === 'xs';
  // điểm: huy hiệu ĐỎ nổi bật, người xem nhìn là biết ai đang dẫn
  const pill = { lg: { f: 44, h: 54, w: 72 }, md: { f: 30, h: 40, w: 46 }, sm: { f: 26, h: 36, w: 44 }, xs: { f: 20, h: 28, w: 36 } }[size];
  return (
    <div
      className={`relative flex h-full w-full rounded-[18px] ${gained ? 'pxp-seat-glow' : ''} ${column ? 'flex-col items-center justify-center gap-1' : 'items-center gap-1.5 pl-2 pr-1.5'}`}
      style={{ background: bg, border: medal ? '2px solid rgba(255,255,255,0.55)' : '1.5px solid rgba(255,255,255,0.16)', color: medal ? '#1e1300' : '#fff', boxShadow: medal ? '0 4px 14px rgba(0,0,0,0.35)' : undefined }}
    >
      <div className="relative flex-none">
        <Avatar src={p.avatar} name={p.nickname} id={p.userId} size={avatar} ring={mark ? MARK_COLOR[mark] : medal ? 'rgba(255,255,255,0.9)' : undefined} />
        {mark && <MarkBadge mark={mark} size={Math.max(22, Math.round(avatar * 0.5))} />}
        {p.rank === 1 && p.score > 0 && (
          <span className="absolute -left-2 -top-3 -rotate-[18deg]" style={{ fontSize: Math.max(22, avatar * 0.42) }}>
            👑
          </span>
        )}
      </div>
      <div className={`min-w-0 font-extrabold leading-tight ${column ? 'w-full px-1 text-center' : 'flex-1'}`}>
        <div className="truncate" style={{ fontSize: { lg: 32, md: 25, sm: 23, xs: 19 }[size] }}>
          {displayName(p.nickname, nameMax)}
        </div>
      </div>
      <span
        className="pxp-display flex flex-none items-center justify-center rounded-full font-extrabold"
        style={{
          minWidth: pill.w,
          height: pill.h,
          padding: '0 8px',
          fontSize: pill.f,
          lineHeight: 1,
          background: 'linear-gradient(180deg,#ff4a5a,#d9101f)',
          color: '#fff',
          textShadow: '0 2px 0 rgba(90,0,10,0.55)',
          boxShadow: '0 3px 8px rgba(0,0,0,0.4), inset 0 1.5px 0 rgba(255,255,255,0.4)',
        }}
      >
        {p.score}
      </span>
      {gained && p.lastGain > 0 && (
        <div
          key={`plus-${p.lastGainRound}`}
          className="pxp-plus pxp-display absolute left-1/2 top-0 rounded-full bg-emerald-400 px-3 font-extrabold text-slate-900 shadow-lg"
          style={{ fontSize: size === 'lg' ? 44 : 34 }}
        >
          +{p.lastGain}
        </div>
      )}
    </div>
  );
});

const EmptySeat = memo(function EmptySeat({ size }: { size: SeatSize }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-[18px] border-2 border-dashed border-white/15 text-center font-bold text-white/30" style={{ fontSize: size === 'xs' ? 18 : 24 }}>
      Trống
    </div>
  );
});
