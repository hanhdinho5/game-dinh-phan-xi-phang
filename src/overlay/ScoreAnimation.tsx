import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, shortName } from './Avatar';

export interface Toast {
  id: number;
  kind: 'join' | 'correct' | 'gift' | 'score';
  name: string;
  avatar: string;
  userId: string;
  text: string;
}

const KIND_STYLE: Record<Toast['kind'], string> = {
  join: 'bg-sky-400/90 text-slate-900',
  correct: 'bg-emerald-400/95 text-slate-900',
  gift: 'bg-pink-400/95 text-slate-900',
  score: 'bg-amber-300/95 text-slate-900',
};

/**
 * Khu vực thông báo: người vừa vào ghế, người vừa nối đúng, quà, điểm vừa nhận.
 * Hàng đợi: mỗi thông báo hiện ~1.6 giây; dồn quá nhiều thì bỏ bớt cái cũ (phòng đông không bị trễ mãi).
 */
export function useToasts() {
  const [current, setCurrent] = useState<Toast | null>(null);
  const queue = useRef<Toast[]>([]);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const next = () => {
    const t = queue.current.shift() ?? null;
    setCurrent(t);
    timer.current = t ? setTimeout(next, queue.current.length > 3 ? 900 : 1600) : null;
  };

  const push = (t: Omit<Toast, 'id'>) => {
    queue.current.push({ ...t, id: ++seq.current });
    if (queue.current.length > 8) queue.current.splice(0, queue.current.length - 8);
    if (!timer.current) next();
  };

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return { current, push };
}

export function ToastView({ toast }: { toast: Toast | null }) {
  return (
    <div className="relative h-[46px] w-full max-w-[470px]">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className={`absolute right-0 top-0 flex h-[46px] max-w-full items-center gap-2 rounded-full pl-1 pr-4 font-extrabold shadow-lg ${KIND_STYLE[toast.kind]}`}
            initial={{ x: 80, opacity: 0, scale: 0.8 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ y: -30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 24 }}
          >
            <Avatar src={toast.avatar} name={toast.name} id={toast.userId} size={38} />
            <span className="truncate text-[21px]">
              {shortName(toast.name, 14)} <span className="font-bold opacity-80">{toast.text}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
