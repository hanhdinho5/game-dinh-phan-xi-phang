import { AnimatePresence, motion } from 'motion/react';
import type { ChainItem } from '../../shared/types';
import { upperVi } from '../../shared/vietnamese';

/** Chuỗi từ đã đi qua (gần nhất bên phải), từ hiện tại nổi bật. Đổi đường leo thì có dấu 🧭. */
export function WordHistory({ chain, chainStart, current }: { chain: ChainItem[]; chainStart: number; current: string }) {
  const items = chain.slice(-6);
  const base = chainStart + chain.length - items.length;
  return (
    <div className="pxp-panel absolute flex items-center overflow-hidden px-5" style={{ left: 24, top: 668, width: 1032, height: 84 }}>
      <div className="mr-4 flex-none text-[24px] font-extrabold text-sky-200">CHUỖI TỪ</div>
      <div className="relative flex min-w-0 flex-1 items-center justify-end gap-2 overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, #000 12%)' }}>
        <AnimatePresence initial={false}>
          {items.map((c, i) => {
            const isCurrent = c.word === current && i === items.length - 1;
            return (
              <motion.div
                key={`${base + i}-${c.word}`}
                layout
                className="flex flex-none items-center gap-2"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -60 }}
              >
                {i > 0 && <span className="text-[26px] text-amber-300">{c.source === 'jump' || c.source === 'admin' ? '🧭' : '›'}</span>}
                <span
                  className={`pxp-display whitespace-nowrap rounded-2xl px-4 text-[30px] font-extrabold leading-[1.5] ${
                    isCurrent ? 'bg-amber-300 text-slate-900 shadow-[0_0_24px_rgba(255,200,61,0.7)]' : 'bg-white/10 text-white/85'
                  }`}
                >
                  {upperVi(c.word)}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
