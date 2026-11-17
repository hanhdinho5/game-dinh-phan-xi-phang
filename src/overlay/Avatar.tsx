import { memo, useState } from 'react';

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
