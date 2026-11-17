import { AnimatePresence, motion } from 'motion/react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { OverlayState, RoundResult } from '../../shared/types';
import { upperVi } from '../../shared/vietnamese';
import { Avatar, MARK_COLOR, MarkBadge, displayName } from './Avatar';
import { useServerNow } from '../lib/socket';

type Offset = { current: number };

/**
 * Khu vực câu hỏi: từ hiện tại thật to (tiếng cần nối tô vàng), hướng dẫn, đồng hồ đếm ngược,
 * dải người đã nối đúng (không lộ đáp án), và bảng kết quả khi chốt lượt.
 */
export function QuestionBoard({ s, offset, fx }: { s: OverlayState; offset: Offset; fx: boolean }) {
  const showResult = (s.roundPhase === 'reveal' || s.roundPhase === 'waiting') && s.lastResult && s.phase !== 'idle';
  return (
    <div className="pxp-board absolute overflow-hidden" style={{ left: 24, top: 176, width: 1032, height: 500 }}>
      {/* quét sáng mỗi lượt mới */}
      {fx && s.roundPhase === 'answering' && (
        <div key={`sweep-${s.roundNo}`} className="pxp-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      )}
      {/* chuyển cảnh song song (không dùng mode="wait"): màn mới hiện ngay, không phụ thuộc hiệu ứng cũ chạy xong */}
      <AnimatePresence>
        {s.phase === 'idle' ? (
          <IdleBoard key="idle" />
        ) : showResult ? (
          <ResultBoard key={`res-${s.lastResult!.no}`} r={s.lastResult!} waiting={s.roundPhase === 'waiting'} />
        ) : (
          <AskBoard key={`ask-${s.roundNo}`} s={s} offset={offset} />
        )}
      </AnimatePresence>
      {s.phase === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0b3a]/70">
          <div className="pxp-display pxp-pill bg-amber-400 text-6xl text-slate-900 shadow-2xl">⏸ TẠM DỪNG</div>
        </div>
      )}
    </div>
  );
}

/** Chữ to nhất có thể mà vẫn vừa `maxWidth` (đo thật sau khi vẽ, từ dài thì tự co) */
function FitWord({ children, max, maxWidth, className }: { children: ReactNode; max: number; maxWidth: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(max);
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      el.style.fontSize = `${max}px`;
      const natural = el.scrollWidth;
      const next = natural > maxWidth ? Math.floor((max * maxWidth) / natural) : max;
      el.style.fontSize = `${next}px`;
      setSize(next);
    };
    fit();
    // font Baloo tải xong thì chữ rộng hơn font tạm: đo lại
    let alive = true;
    void document.fonts?.ready.then(() => alive && fit());
    return () => {
      alive = false;
    };
  }, [children, max, maxWidth]);
  return (
    <div ref={ref} className={`w-max ${className ?? ''}`} style={{ fontSize: size }}>
      {children}
    </div>
  );
}

function AskBoard({ s, offset }: { s: OverlayState; offset: Offset }) {
  const now = useServerNow(offset, 100);
  const [first, last] = upperVi(s.word).split(' ');
  const link = upperVi(s.linkSyllable);
  const remaining = s.phase === 'paused' ? s.remainingMs : Math.max(0, s.roundEndsAt - now);
  const locking = s.roundPhase === 'locking';
  return (
    <motion.div
      className="absolute inset-0 px-10 pt-6"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center gap-3 text-[34px] font-extrabold tracking-wide text-sky-200">
        <span className="pxp-pill bg-white/10">
          CHẶNG {s.roundNo}
          {s.config.roundsPerRace > 0 && <span className="text-white/60">/{s.config.roundsPerRace}</span>}
        </span>
        <span className="text-white/70">TỪ HIỆN TẠI</span>
      </div>
      <div className="flex items-start">
        <div className="min-w-0 flex-1">
          <motion.div
            className="flex h-[150px] items-center"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
          >
            <FitWord max={132} maxWidth={700} className="pxp-display pxp-stroke flex items-center gap-[0.14em] font-extrabold leading-[1.18]">
              <span>{first}</span>
              <span className="pxp-link">{last}</span>
            </FitWord>
          </motion.div>
          <div className="mt-1 text-[44px] font-bold leading-tight">
            Hãy nối từ <span className="pxp-gold-text pxp-display text-[50px] font-extrabold">“{link}”</span>
          </div>
          <div className="text-[32px] font-semibold leading-tight text-white/80">
            Comment 1 tiếng: <b className="text-white">{link} ➜ ___</b>
          </div>
        </div>
        <Countdown remaining={remaining} total={s.roundTotalMs} locking={locking} paused={s.phase === 'paused'} />
      </div>
      <Answered s={s} />
    </motion.div>
  );
}

function Countdown({ remaining, total, locking, paused }: { remaining: number; total: number; locking: boolean; paused: boolean }) {
  const r = 92;
  const c = 2 * Math.PI * r;
  const frac = locking ? 0 : Math.max(0, Math.min(1, remaining / total));
  const sec = Math.ceil(remaining / 1000);
  const color = frac > 0.5 ? '#34e0a1' : frac > 0.25 ? '#ffc83d' : '#ff4d6d';
  const urgent = !locking && !paused && sec <= 3 && sec > 0;
  return (
    <div className={`relative mt-2 flex-none ${urgent ? 'pxp-urgent' : ''}`} style={{ width: 230, height: 230 }}>
      <svg width="230" height="230" viewBox="0 0 230 230">
        <circle cx="115" cy="115" r={r + 14} fill="rgba(5,6,30,0.65)" />
        <circle cx="115" cy="115" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="18" />
        <circle
          cx="115"
          cy="115"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform="rotate(-90 115 115)"
          style={{ transition: 'stroke-dashoffset 0.12s linear, stroke 0.3s', filter: `drop-shadow(0 0 10px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {locking ? (
          <>
            <div className="text-[64px] leading-none">⏳</div>
            <div className="mt-1 text-[28px] font-extrabold text-amber-300">ĐANG CHỐT</div>
          </>
        ) : (
          <>
            <div className="pxp-display text-[100px] font-extrabold leading-none" style={{ color }}>
              {sec}
            </div>
            <div className="text-[30px] font-bold text-white/75">giây</div>
          </>
        )}
      </div>
    </div>
  );
}

/** Dải người đã trả lời trong lượt: ✓ xanh = nối đúng, ✕ đỏ = sai. Chỉ hiện người + dấu, KHÔNG hiện đáp án (đỡ chép) */
function Answered({ s }: { s: OverlayState }) {
  const ok = s.provisional.slice(0, 6);
  const bad = s.wrong.slice(-3);
  const empty = s.provisional.length === 0 && s.wrongCount === 0;
  return (
    <div className="absolute inset-x-8 bottom-5 flex h-[88px] items-center gap-4 rounded-[22px] bg-black/30 px-5">
      {empty ? (
        <div className="text-[32px] font-semibold text-white/65">Chưa có ai trả lời</div>
      ) : (
        <>
          <div className="flex flex-none items-baseline gap-3 text-[36px] font-extrabold leading-none">
            <span style={{ color: MARK_COLOR.ok }}>✓ {s.provisional.length}</span>
            <span style={{ color: MARK_COLOR.bad }}>✕ {s.wrongCount}</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <AnimatePresence>
              {ok.map((p) => (
                <Chip key={`ok-${p.userId}`} p={p} mark="ok" />
              ))}
              {bad.map((p) => (
                <Chip key={`bad-${p.userId}`} p={p} mark="bad" />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ p, mark }: { p: { userId: string; nickname: string; avatar: string }; mark: 'ok' | 'bad' }) {
  return (
    <motion.div className="relative flex-none" initial={{ scale: 0, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }}>
      <Avatar src={p.avatar} name={p.nickname} id={p.userId} size={60} ring={MARK_COLOR[mark]} />
      <MarkBadge mark={mark} size={28} />
    </motion.div>
  );
}

const SOURCE_TEXT: Record<RoundResult['nextSource'], string> = {
  auto: 'Từ tiếp theo',
  jump: 'Đổi từ mới',
  admin: 'Đổi từ mới',
  end: 'Chặng cuối',
};

function ResultBoard({ r, waiting }: { r: RoundResult; waiting: boolean }) {
  const [nFirst, nLast] = upperVi(r.nextWord).split(' ');
  const top = r.winners.slice(0, 4);
  return (
    <motion.div
      className="absolute inset-0 px-10 pt-6"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center gap-3 text-[34px] font-extrabold tracking-wide">
        <span className="pxp-pill bg-emerald-400 text-slate-900">KẾT QUẢ CHẶNG {r.no}</span>
        <span className="text-white/75">{r.winners.length ? `${r.winners.length} người nối đúng` : 'Không ai nối được'}</span>
      </div>
      <div className="mt-3 text-[34px] font-extrabold tracking-wide text-sky-200">{SOURCE_TEXT[r.nextSource].toLocaleUpperCase('vi')}</div>
      <motion.div
        className="flex h-[150px] items-center"
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.1 }}
      >
        {r.nextSource === 'end' ? (
          <div className="pxp-display pxp-gold-text text-[124px] font-extrabold leading-[1.18]">VỀ ĐÍCH</div>
        ) : (
          <FitWord max={124} maxWidth={950} className="pxp-display pxp-stroke flex items-center gap-[0.14em] font-extrabold leading-[1.18]">
            <span>{nFirst}</span>
            <span className="pxp-link">{nLast}</span>
          </FitWord>
        )}
      </motion.div>
      <div className="absolute inset-x-8 bottom-6 flex h-[132px] items-center gap-3">
        {top.map((w, i) => (
          <motion.div
            key={w.userId}
            className="flex min-w-0 flex-1 flex-col items-center rounded-[20px] bg-black/30 px-2 py-2"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25 + i * 0.08 }}
          >
            <div className="flex w-full items-center gap-2">
              <Avatar src={w.avatar} name={w.nickname} id={w.userId} size={52} ring={i === 0 ? '#ffc83d' : undefined} />
              <div className="min-w-0 flex-1 truncate text-[26px] font-bold">{displayName(w.nickname, 8)}</div>
            </div>
            <div className="mt-1 flex w-full items-center justify-between">
              <span className="truncate text-[24px] font-semibold text-white/75">{upperVi(w.answer)}</span>
              <span className="pxp-display text-[38px] font-extrabold text-amber-300">+{w.points}</span>
            </div>
          </motion.div>
        ))}

      </div>
      {waiting && <div className="absolute right-8 top-6 text-[30px] font-bold text-amber-300">Chờ chặng tiếp</div>}
    </motion.div>
  );
}

function IdleBoard() {
  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="pxp-display pxp-gold-text text-[110px] font-extrabold leading-none">SẮP XUẤT PHÁT</div>
      <div className="mt-6 text-[40px] font-bold">
        Comment <span className="pxp-pill bg-emerald-400 text-slate-900">JOIN</span> để tham gia
      </div>
      <div className="mt-6 text-[32px] font-semibold text-white/80">
        HỌC <b className="text-amber-300">SINH</b> ➜ comment <b className="text-amber-300">VIÊN</b>
      </div>
    </motion.div>
  );
}
