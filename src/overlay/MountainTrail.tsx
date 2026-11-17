import { memo } from 'react';
import { motion } from 'motion/react';
import type { PlayerView } from '../../shared/types';
import { Avatar, shortName } from './Avatar';

const W = 1032;
const H = 196;
// đường mòn: chân núi bên trái -> đỉnh bên phải (đường cong bậc 2)
const P0 = { x: 70, y: 168 };
const P1 = { x: 560, y: 170 };
const P2 = { x: 930, y: 46 };
const at = (t: number) => ({
  x: (1 - t) ** 2 * P0.x + 2 * (1 - t) * t * P1.x + t ** 2 * P2.x,
  y: (1 - t) ** 2 * P0.y + 2 * (1 - t) * t * P1.y + t ** 2 * P2.y,
});

/**
 * Đường lên đỉnh: 5 người dẫn đầu leo theo điểm. Người đầu bảng ở gần đỉnh, chỉ CHẠM ĐỈNH khi kết thúc.
 * Độ cao = điểm / (điểm người dẫn đầu x 1.15), tối thiểu 30 điểm cho thang đo để đầu game không ai vọt lên đỉnh.
 */
export function MountainTrail({ seats, ended }: { seats: PlayerView[]; ended: boolean }) {
  const top = seats.filter((p) => p.score > 0).slice(0, 5);
  const scale = Math.max(30, (top[0]?.score ?? 0) * 1.15);
  return (
    <div className="pxp-panel absolute overflow-hidden" style={{ left: 24, top: 766, width: W, height: H }}>
      <TrailArt />
      {top.length === 0 && (
        <div className="absolute left-8 top-6 text-[28px] font-bold text-white/80">Nối đúng để leo lên đỉnh</div>
      )}
      {/* vẽ người thấp trước để người dẫn đầu nằm trên */}
      {placed(top, scale, ended).reverse().map(({ p, t }) => {
        const pos = at(t);
        const size = p.rank === 1 ? 62 : 50;
        return (
          <motion.div
            key={p.userId}
            className="absolute flex flex-col items-center"
            initial={false}
            animate={{ left: pos.x - size / 2, top: pos.y - size - 6 }}
            transition={{ type: 'spring', stiffness: 70, damping: 16 }}
          >
            {/* chỉ người dẫn đầu có bảng tên (5 bảng tên chen nhau sẽ đè lên nhau) */}
            {p.rank === 1 && (
              <div className="absolute bottom-full mb-1 whitespace-nowrap rounded-full bg-amber-300 px-3 text-[17px] font-extrabold text-slate-900 shadow-lg">
                👑 {shortName(p.nickname, 12)} · {p.score}
              </div>
            )}
            <div className="relative">
              <Avatar src={p.avatar} name={p.nickname} id={p.userId} size={size} ring={p.rank === 1 ? '#ffc83d' : '#ffffff'} />
              <span className="absolute -left-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-300 text-[16px] font-extrabold text-slate-900">
                {p.rank}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Vị trí trên đường mòn; người bằng điểm đứng lùi lại một chút để không chồng lên nhau */
function placed(top: PlayerView[], scale: number, ended: boolean) {
  let prev = Infinity;
  return top.map((p) => {
    let t = ended && p.rank === 1 ? 1 : Math.max(0.04, Math.min(0.93, p.score / scale));
    t = Math.max(0.02, Math.min(t, prev - 0.075));
    prev = t;
    return { p, t };
  });
}

const TrailArt = memo(function TrailArt() {
  const path = `M${P0.x} ${P0.y} Q${P1.x} ${P1.y} ${P2.x} ${P2.y}`;
  const marks = [0.33, 0.66].map((t) => ({ ...at(t), label: t < 0.5 ? '1.000m' : '2.000m' }));
  return (
    <svg className="absolute inset-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <linearGradient id="pxp-trail-m" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f7d6d" />
          <stop offset="1" stopColor="#123a3a" />
        </linearGradient>
      </defs>
      <path d={`M0 ${H} L0 186 Q520 190 760 120 L940 30 L1032 110 L1032 ${H} Z`} fill="url(#pxp-trail-m)" opacity="0.95" />
      <path d="M905 47 L940 30 L975 63 L958 60 L946 70 L932 58 L918 64 Z" fill="#eef7ff" />
      <path d={path} fill="none" stroke="#ffe8a3" strokeWidth="5" strokeDasharray="4 14" strokeLinecap="round" opacity="0.85" />
      {marks.map((m) => (
        <g key={m.label}>
          <circle cx={m.x} cy={m.y} r="6" fill="#ffc83d" />
          <text x={m.x} y={m.y + 30} textAnchor="middle" fontSize="18" fontWeight="700" fill="rgba(255,255,255,0.7)">
            {m.label}
          </text>
        </g>
      ))}
      {/* cờ trên đỉnh */}
      <line x1="940" y1="30" x2="940" y2="-4" stroke="#fff" strokeWidth="3" />
      <g className="pxp-flag">
        <rect x="941" y="-4" width="44" height="28" fill="#da251d" />
        <polygon points="963,3 965.4,8.6 971.4,8.6 966.6,12.2 968.4,18 963,14.5 957.6,18 959.4,12.2 954.6,8.6 960.6,8.6" fill="#ffde00" />
      </g>
      <text x="1018" y="140" textAnchor="end" fontSize="22" fontWeight="800" fill="#ffc83d">
        ĐỈNH 3.143m
      </text>
    </svg>
  );
});
