import { memo } from 'react';

/** Nền: bầu trời bình minh, sao, dãy Hoàng Liên Sơn nhiều lớp, mây trôi. Vẽ 1 lần (memo), chỉ mây chuyển động. */
export const MountainBackdrop = memo(function MountainBackdrop() {
  const stars = Array.from({ length: 46 }, (_, i) => ({
    x: (i * 233) % 1080,
    y: (i * 97) % 640,
    r: 1.2 + ((i * 7) % 3),
    d: (i % 7) * 0.45,
  }));
  return (
    <svg className="absolute inset-0" width="1080" height="1920" viewBox="0 0 1080 1920" aria-hidden>
      <defs>
        <linearGradient id="pxp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a0b3a" />
          <stop offset="0.32" stopColor="#2a1873" />
          <stop offset="0.58" stopColor="#7a2a8f" />
          <stop offset="0.78" stopColor="#e2557a" />
          <stop offset="1" stopColor="#ff9a52" />
        </linearGradient>
        <radialGradient id="pxp-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3b0" stopOpacity="0.95" />
          <stop offset="0.4" stopColor="#ffc83d" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff7a3d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pxp-m1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b3a9e" />
          <stop offset="1" stopColor="#2b1d63" />
        </linearGradient>
        <linearGradient id="pxp-m2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f5f7a" />
          <stop offset="1" stopColor="#123447" />
        </linearGradient>
        <linearGradient id="pxp-m3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14684f" />
          <stop offset="1" stopColor="#0a2e2a" />
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#pxp-sky)" />
      {stars.map((s, i) => (
        <circle key={i} className="pxp-twinkle" style={{ animationDelay: `${s.d}s` }} cx={s.x} cy={s.y} r={s.r} fill="#fff" />
      ))}
      <circle cx="820" cy="1480" r="420" fill="url(#pxp-sun)" />
      <g className="pxp-beams" opacity="0.16">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M820 1480 L560 -400 L760 -400 Z" fill="#ffe9a8" transform={`rotate(${i * 30} 820 1480)`} />
        ))}
      </g>
      {/* lớp núi xa */}
      <path d="M0 1380 L120 1250 L210 1310 L330 1150 L430 1260 L560 1100 L690 1240 L800 1130 L930 1250 L1080 1160 L1080 1920 L0 1920 Z" fill="url(#pxp-m1)" opacity="0.9" />
      {/* đỉnh Phan Xi Păng ở giữa */}
      <path d="M0 1560 L170 1420 L300 1480 L470 1260 L560 1180 L640 1280 L760 1360 L880 1300 L1080 1460 L1080 1920 L0 1920 Z" fill="url(#pxp-m2)" />
      <path d="M520 1218 L560 1180 L600 1232 L582 1226 L566 1246 L548 1228 L532 1240 Z" fill="#e9f4ff" opacity="0.92" />
      <path d="M0 1700 L140 1610 L290 1660 L420 1580 L560 1640 L700 1570 L860 1650 L1080 1600 L1080 1920 L0 1920 Z" fill="url(#pxp-m3)" />
      {Array.from({ length: 16 }, (_, i) => (
        <circle key={`e${i}`} className="pxp-ember" style={{ animationDelay: `${(i * 0.9) % 9}s` }} cx={(i * 211) % 1080} cy={1900 - ((i * 53) % 200)} r={3 + (i % 3)} fill="#ffd36b" />
      ))}
      <g className="pxp-cloud" opacity="0.5">
        <ellipse cx="200" cy="1330" rx="220" ry="34" fill="#ffd6e7" />
        <ellipse cx="760" cy="1250" rx="260" ry="30" fill="#ffd6e7" />
      </g>
      <g className="pxp-cloud slow" opacity="0.35">
        <ellipse cx="520" cy="1520" rx="320" ry="40" fill="#fff" />
        <ellipse cx="80" cy="1600" rx="200" ry="30" fill="#fff" />
      </g>
    </svg>
  );
});
