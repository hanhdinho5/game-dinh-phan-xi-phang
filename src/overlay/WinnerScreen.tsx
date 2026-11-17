import { memo } from 'react';
import { motion } from 'motion/react';
import type { PlayerView } from '../../shared/types';
import { Avatar, shortName } from './Avatar';

/**
 * Màn hình vinh danh Top 4. Công bố ngược: hạng tư -> ba -> nhì -> NHÀ VÔ ĐỊCH (khớp nhịp MC đọc tên),
 * mỗi hạng có khung avatar riêng: vàng (vương miện, tia sáng xoay), bạc, đồng, ngọc.
 * Cuối màn: băng đếm ngược tới cuộc đua mới (nếu admin bật tự mở cuộc đua mới).
 */
// giây xuất hiện của từng hạng (MC: mở màn ~3s, mỗi hạng ~1.5s, vô địch sau cùng)
const REVEAL_AT: Record<number, number> = { 4: 3.2, 3: 4.7, 2: 6.2, 1: 7.9 };

export function WinnerScreen({ winners, fx, raceNo, nextRaceAt, now }: { winners: PlayerView[]; fx: boolean; raceNo: number; nextRaceAt: number; now: number }) {
  const top = winners.filter((w) => w.score > 0).slice(0, 4);
  const [first, ...rest] = top;
  const delay = (place: number) => (fx ? REVEAL_AT[place] : 0);
  const left = nextRaceAt ? Math.max(0, Math.ceil((nextRaceAt - now) / 1000)) : 0;

  return (
    <motion.div
      className="absolute inset-0 z-50 overflow-hidden"
      style={{ background: 'radial-gradient(90% 55% at 50% 33%, rgba(255,200,61,0.33), transparent 70%), linear-gradient(180deg,#0a0b3a 0%,#2a1873 45%,#6d2a8f 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {fx && <Confetti />}
      <MountainBack />

      <motion.div className="absolute inset-x-0 top-[56px] text-center" initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 120 }}>
        <div className="pxp-display text-[42px] font-extrabold tracking-wide text-sky-200">CUỘC ĐUA {raceNo > 0 ? `SỐ ${raceNo}` : ''}</div>
        <div className="pxp-display pxp-gold-text text-[120px] font-extrabold leading-[1.02]">VINH DANH</div>
      </motion.div>

      {first ? (
        <>
          <Champion p={first} delay={delay(1)} fx={fx} />
          <div className="absolute inset-x-0 flex items-start justify-center gap-5" style={{ top: 1150 }}>
            {[2, 3, 4].map((place) => {
              const p = rest[place - 2];
              return p ? <PlaceCard key={place} p={p} place={place as 2 | 3 | 4} delay={delay(place)} /> : <div key={place} className="w-[318px]" />;
            })}
          </div>
        </>
      ) : (
        <div className="absolute inset-x-0 text-center text-[44px] font-bold text-white/80" style={{ top: 820 }}>
          Chưa có ai ghi điểm
        </div>
      )}

      {/* cuộc đua mới (chỉ khi sẽ tự mở) */}
      {nextRaceAt > 0 && (
      <motion.div
        className="absolute inset-x-6 flex h-[132px] items-center justify-center rounded-[34px] border-4 border-amber-300 bg-black/45 text-center"
        style={{ top: 1752 }}
        initial={{ y: 200, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: fx ? 10 : 0 }}
      >
        <div>
          <div className="pxp-display text-[44px] font-extrabold leading-tight">
            CUỘC ĐUA MỚI SAU <span className={`pxp-gold-text inline-block text-[64px] ${left <= 5 ? 'pxp-urgent' : ''}`}>{left}</span> GIÂY
          </div>
          <div className="text-[28px] font-bold text-white/80">Comment JOIN để tham gia</div>
        </div>
      </motion.div>
      )}
    </motion.div>
  );
}

// ---------- khung avatar theo hạng ----------
const FRAME = {
  1: { ring: 'conic-gradient(from 0deg,#fff6c9,#ffc83d,#f59e0b,#fff1a8,#ffc83d,#b45309,#fff6c9)', glow: 'rgba(255,200,61,0.75)', label: 'VÔ ĐỊCH', ribbon: 'linear-gradient(180deg,#ffe58a,#f5b31b 60%,#b7791f)', ink: '#3b1d00', medal: '🥇' },
  2: { ring: 'conic-gradient(from 0deg,#ffffff,#cbd5e1,#94a3b8,#f1f5f9,#cbd5e1,#64748b,#ffffff)', glow: 'rgba(226,232,240,0.6)', label: 'HẠNG NHÌ', ribbon: 'linear-gradient(180deg,#f8fafc,#cbd5e1 60%,#94a3b8)', ink: '#1e293b', medal: '🥈' },
  3: { ring: 'conic-gradient(from 0deg,#fde2c4,#e08b4f,#a0522d,#fcd5b0,#e08b4f,#7c3a12,#fde2c4)', glow: 'rgba(224,139,79,0.6)', label: 'HẠNG BA', ribbon: 'linear-gradient(180deg,#fcd5b0,#e08b4f 60%,#a0522d)', ink: '#3b1505', medal: '🥉' },
  4: { ring: 'conic-gradient(from 0deg,#d1fae5,#34e0a1,#0d9488,#a5f3fc,#34e0a1,#0f766e,#d1fae5)', glow: 'rgba(52,224,161,0.55)', label: 'HẠNG TƯ', ribbon: 'linear-gradient(180deg,#a7f3d0,#34d399 60%,#0f766e)', ink: '#052e2b', medal: '🏅' },
} as const;

function FramedAvatar({ p, place, size }: { p: PlayerView; place: 1 | 2 | 3 | 4; size: number }) {
  const f = FRAME[place];
  const ring = Math.round(size * 0.07);
  return (
    <div className="relative" style={{ width: size + ring * 2, height: size + ring * 2 }}>
      <div className="absolute inset-0 rounded-full" style={{ background: f.ring, boxShadow: `0 0 ${size * 0.25}px ${f.glow}, 0 10px 24px rgba(0,0,0,0.45)` }} />
      <div className="absolute rounded-full bg-[#0b1030]" style={{ inset: ring - 3 }} />
      <div className="absolute" style={{ left: ring, top: ring }}>
        <Avatar src={p.avatar} name={p.nickname} id={p.userId} size={size} />
      </div>
      <div
        className="absolute flex items-center justify-center rounded-full border-4 border-white/80 font-extrabold shadow-lg"
        style={{ right: -4, bottom: -4, width: size * 0.34, height: size * 0.34, background: f.ribbon, color: f.ink, fontSize: size * 0.2 }}
      >
        {place}
      </div>
    </div>
  );
}

function Champion({ p, delay, fx }: { p: PlayerView; delay: number; fx: boolean }) {
  const f = FRAME[1];
  return (
    <motion.div
      className="absolute inset-x-0 flex flex-col items-center"
      style={{ top: 360 }}
      initial={{ scale: 0.2, opacity: 0, y: 120 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 110, damping: 12 }}
    >
      <div className="relative flex items-center justify-center" style={{ width: 520, height: 470 }}>
        {fx && <div className="pxp-rays absolute rounded-full" style={{ width: 640, height: 640 }} />}
        <div className="absolute top-[6px] z-10 text-[104px] leading-none drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]">👑</div>
        <div className="absolute left-[28px] top-[150px] text-[90px]">🌿</div>
        <div className="absolute right-[28px] top-[150px] -scale-x-100 text-[90px]">🌿</div>
        <div className="mt-[70px]">
          <FramedAvatar p={p} place={1} size={280} />
        </div>
      </div>
      <div className="relative -mt-6 rounded-[26px] px-12 pb-3 pt-2 text-center shadow-2xl" style={{ background: f.ribbon, color: f.ink }}>
        <div className="pxp-display text-[40px] font-extrabold leading-none tracking-wider">{f.label}</div>
        <div className="max-w-[880px] truncate text-[56px] font-extrabold leading-tight">{shortName(p.nickname, 20)}</div>
        <div className="pxp-display text-[48px] font-extrabold leading-none">{p.score} điểm</div>
      </div>
    </motion.div>
  );
}

function PlaceCard({ p, place, delay }: { p: PlayerView; place: 2 | 3 | 4; delay: number }) {
  const f = FRAME[place];
  return (
    <motion.div
      className="flex w-[318px] flex-col items-center rounded-[30px] bg-black/35 px-3 pb-5 pt-6"
      style={{ boxShadow: `0 0 0 3px ${f.glow}, 0 16px 34px rgba(0,0,0,0.4)` }}
      initial={{ y: 260, opacity: 0, rotate: -6 }}
      animate={{ y: 0, opacity: 1, rotate: 0 }}
      transition={{ delay, type: 'spring', stiffness: 120, damping: 13 }}
    >
      <FramedAvatar p={p} place={place} size={place === 2 ? 170 : 150} />
      <div className="mt-4 rounded-full px-5 py-1 text-[26px] font-extrabold" style={{ background: f.ribbon, color: f.ink }}>
        {f.label}
      </div>
      <div className="mt-2 w-full truncate text-center text-[34px] font-extrabold">{shortName(p.nickname, 13)}</div>
      <div className="pxp-display pxp-gold-text text-[50px] font-extrabold leading-none">{p.score} điểm</div>
    </motion.div>
  );
}

const MountainBack = memo(function MountainBack() {
  return (
    <svg className="absolute inset-x-0" style={{ top: 560 }} width="1080" height="700" viewBox="0 0 1080 700" aria-hidden>
      <path d="M0 700 L200 460 L330 520 L540 180 L750 500 L880 420 L1080 700 Z" fill="#1b4f4a" opacity="0.55" />
      <path d="M488 264 L540 180 L594 270 L566 258 L548 280 L528 258 L510 272 Z" fill="#eef7ff" opacity="0.6" />
    </svg>
  );
});

const Confetti = memo(function Confetti() {
  const colors = ['#ffc83d', '#ff4d6d', '#34e0a1', '#5ad1ff', '#c084fc', '#ffffff'];
  return (
    <div className="pointer-events-none absolute inset-0 z-[1]">
      {Array.from({ length: 70 }, (_, i) => (
        <div
          key={i}
          className="pxp-confetti"
          style={
            {
              left: (i * 157) % 1080,
              background: colors[i % colors.length],
              animationDuration: `${4 + ((i * 13) % 40) / 10}s`,
              animationDelay: `${((i * 37) % 50) / 10}s`,
              '--dx': `${((i * 53) % 160) - 80}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
});
