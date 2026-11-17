import type { OverlayState } from '../../shared/types';

const PHASE: Record<string, { text: string; cls: string }> = {
  idle: { text: '● SẮP BẮT ĐẦU', cls: 'bg-sky-400 text-slate-900' },
  running: { text: '● ĐANG CHƠI', cls: 'bg-emerald-400 text-slate-900' },
  paused: { text: '⏸ TẠM DỪNG', cls: 'bg-amber-400 text-slate-900' },
  ended: { text: '🏁 KẾT THÚC', cls: 'bg-pink-500 text-white' },
};

/** Tên chương trình + trạng thái + số người tham gia */
export function Header({ s }: { s: OverlayState }) {
  const ph = PHASE[s.phase];
  return (
    <div className="absolute flex items-center" style={{ left: 24, top: 22, width: 1032, height: 140 }}>
      <div className="flex h-[128px] w-[128px] flex-none items-center justify-center rounded-[34px] bg-gradient-to-b from-amber-200 to-amber-500 text-[78px] shadow-[0_8px_0_#b45309,0_0_40px_rgba(255,200,61,0.5)]">
        ⛰️
      </div>
      <div className="ml-5 min-w-0 flex-1">
        <div className="pxp-display text-[42px] font-extrabold leading-none tracking-wide text-sky-200 drop-shadow-[0_3px_0_rgba(10,8,40,0.9)]">ĐƯỜNG LÊN ĐỈNH</div>
        <div className="pxp-display pxp-gold-text text-[86px] font-extrabold leading-[1.02]">PHAN XI PĂNG</div>
      </div>
      <div className="flex flex-none flex-col items-end gap-2">
        <div className={`pxp-pill text-[28px] ${ph.cls}`}>{ph.text}</div>
        <div className="pxp-pill bg-black/45 text-[30px]">
          👥 <b className="text-amber-300">{s.totalPlayers}</b> người chơi
        </div>
      </div>
    </div>
  );
}

/** Dòng chữ chạy dưới cùng: luật chơi tóm tắt */
export function RulesTicker({ s }: { s: OverlayState }) {
  const tiers = s.config.scoreTiers
    .filter((t) => t.points > 0)
    .map((t) => (t.from === t.to ? `Top ${t.from}: +${t.points}` : `Top ${t.from}-${t.to}: +${t.points}`))
    .join(' • ');
  const text = `Comment JOIN để tham gia  •  Comment 1 tiếng để nối từ  •  ${tiers}  •  Sai không trừ điểm  •  `;
  return (
    <div className="absolute overflow-hidden rounded-full bg-black/55" style={{ left: 24, top: 1844, width: 1032, height: 56 }}>
      <div className="pxp-ticker flex w-max whitespace-nowrap text-[30px] font-bold leading-[56px] text-white/95">
        <span className="pr-4">{text}</span>
        <span className="pr-4">{text}</span>
      </div>
    </div>
  );
}
