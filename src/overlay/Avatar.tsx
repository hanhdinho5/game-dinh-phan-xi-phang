import { memo, useState } from 'react';
import { motion } from 'motion/react';

const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#20c997'];
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** Ảnh đại diện TikTok; không có / lỗi ảnh thì hiện chữ cái đầu trên nền màu cố định theo người */
export const Avatar = memo(function Avatar({ src, name, id, size, ring }: { src: string; name: string; id: string; size: number; ring?: string }) {
  const [broken, setBroken] = useState(false);
  const initial = [...(name.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '') || '?')][0].toUpperCase();
  const style = { width: size, height: size, boxShadow: ring ? `0 0 0 ${Math.max(2, size / 18)}px ${ring}` : undefined };
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="flex-none rounded-full bg-slate-700 object-cover"
        style={style}
        draggable={false}
      />
    );
  }
  return (
    <div
      className="flex flex-none items-center justify-center rounded-full font-extrabold text-white"
      style={{ ...style, background: COLORS[hash(id) % COLORS.length], fontSize: size * 0.46, textShadow: '0 2px 0 rgba(0,0,0,0.25)' }}
    >
      {initial}
    </div>
  );
});

/** Tên rút gọn để vừa ghế */
export function shortName(name: string, max: number) {
  const chars = [...name.trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : name.trim();
}

/** Tên hiển thị gọn: người Việt gọi bằng tên (từ cuối), vd "Trần Mai Anh" -> "Anh". Tên 1 từ thì giữ nguyên. */
export function displayName(name: string, max: number) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const out = words.length > 1 ? words[words.length - 1] : (words[0] ?? 'Bạn');
  return shortName(out, max);
}

export type Mark = 'ok' | 'bad';
export const MARK_COLOR: Record<Mark, string> = { ok: '#22c55e', bad: '#ef4444' };

/** Dấu ✓ xanh (nối đúng) / ✗ đỏ (sai) gắn góc dưới phải avatar */
export function MarkBadge({ mark, size }: { mark: Mark; size: number }) {
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 14 }}
      className="absolute flex items-center justify-center rounded-full font-black text-white"
      style={{
        right: -size * 0.1,
        bottom: -size * 0.12,
        width: size,
        height: size,
        fontSize: size * 0.72,
        lineHeight: 1,
        background: MARK_COLOR[mark],
        border: `${Math.max(2, size / 10)}px solid #fff`,
        boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
      }}
    >
      {mark === 'ok' ? '✓' : '✕'}
    </motion.span>
  );
}
