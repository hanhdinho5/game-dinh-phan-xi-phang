import { useEffect, useRef } from 'react';
import type { OverlayState, ServerToClientEvents } from '../../shared/types';
import { MUTED } from '../lib/page';
import { sfx } from '../lib/sfx';
import { voice } from '../lib/voice';
import { useGameState, useServerNow, type GameSocket } from '../lib/socket';

type Offset = { current: number };

/** Tích tắc 3 giây cuối. Tách riêng để đồng hồ 10 lần/giây không render lại cả màn hình (100 ghế) */
function TickSound({ s, offset }: { s: OverlayState; offset: Offset }) {
  const now = useServerNow(offset, 100);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (s.phase !== 'running' || s.roundPhase !== 'answering') {
      lastTick.current = -1;
      return;
    }
    const left = Math.ceil((s.roundEndsAt - now) / 1000);
    if (left >= 1 && left <= 3 && left !== lastTick.current) sfx.play('tick', 0);
    lastTick.current = left;
  }, [now, s]);
  return null;
}

function Winners({ s, offset, fx }: { s: OverlayState; offset: Offset; fx: boolean }) {
  const now = useServerNow(offset, 250);
  return <WinnerScreen winners={s.winners ?? []} fx={fx} raceNo={s.raceNo} nextRaceAt={s.nextRaceAt} now={now} />;
}
import { ContestantSeats } from './ContestantSeats';
import { Header, RulesTicker } from './Header';
import { MountainBackdrop } from './MountainBackdrop';
import { MountainTrail } from './MountainTrail';
import { QuestionBoard } from './QuestionBoard';
import { ToastView, useToasts } from './ScoreAnimation';
import { WinnerScreen } from './WinnerScreen';
import { WordHistory } from './WordHistory';
import './overlay.css';

/**
 * Màn hình 1080x1920 cho TikTok LIVE Studio. Chỉ hiển thị: mọi luật chơi chạy ở server.
 * `event`: trang overlay nghe 'game:state'; trang admin dùng lại component này để xem trước, nghe 'admin:state'.
 * `sound`: chỉ trang overlay phát tiếng (admin xem trước im lặng).
 */
export function PhanXiPangOverlay({ socket, event = 'game:state', sound = false }: { socket: GameSocket; event?: 'game:state' | 'admin:state'; sound?: boolean }) {
  const { state: s, connected, offset } = useGameState<OverlayState>(socket, event);
  const toasts = useToasts();
  const fx = s?.config.effectsEnabled ?? true;

  // bật / tắt tiếng theo cấu hình admin
  useEffect(() => {
    sfx.enabled = sound && !MUTED && (s?.config.soundEnabled ?? true);
    if (sfx.enabled) sfx.loadFiles();
  }, [sound, s?.config.soundEnabled]);

  // giọng MC: chỉ overlay được server chọn làm "loa" mới đọc
  useEffect(() => {
    if (!sound || MUTED) return;
    voice.serverOffset = () => offset.current;
    const onSpeaker = (d: { socketId: string | null }) => {
      const mine = !!socket.id && d.socketId === socket.id;
      if (!mine && voice.enabled) voice.stop();
      voice.enabled = mine;
    };
    const onSay = (l: Parameters<ServerToClientEvents['voice:say']>[0]) => voice.push(l);
    const onCancel = (d: { id: number }) => voice.cancel(d.id);
    socket.on('voice:cancel', onCancel);
    socket.on('voice:speaker', onSpeaker);
    socket.on('voice:say', onSay);
    // lỡ sự kiện lúc mới kết nối thì lấy từ ảnh chụp trạng thái
    const onState = (st: OverlayState) => st.speaker && onSpeaker(st.speaker);
    socket.on('game:state', onState);
    return () => {
      socket.off('voice:speaker', onSpeaker);
      socket.off('voice:say', onSay);
      socket.off('voice:cancel', onCancel);
      socket.off('game:state', onState);
      voice.stop();
    };
  }, [socket, sound, offset]);

  // sự kiện rời rạc -> thông báo + âm thanh (trạng thái thì lấy từ ảnh chụp)
  useEffect(() => {
    const on = <K extends keyof ServerToClientEvents>(name: K, fn: ServerToClientEvents[K]) => {
      socket.on(name, fn as never);
      return () => void socket.off(name, fn as never);
    };
    const offs = [
      on('player:joined', (p) => {
        toasts.push({ kind: 'join', name: p.nickname, avatar: p.avatar, userId: p.userId, text: p.seated ? 'vào ghế' : 'vào hàng chờ' });
        sfx.play('pop', 200);
      }),
      on('answer:accepted', (a) => {
        sfx.play('ting', 120);
        if (a.rank <= 3) toasts.push({ kind: 'correct', name: a.nickname, avatar: a.avatar, userId: a.userId, text: `nối đúng #${a.rank}` });
      }),
      on('gift:received', (g) => {
        toasts.push({ kind: 'gift', name: g.nickname, avatar: g.avatar, userId: g.nickname, text: `tặng ${g.giftName}${g.repeatCount > 1 ? ` x${g.repeatCount}` : ''}` });
      }),
      on('game:round_started', () => sfx.play('go', 300)),
      on('game:round_ended', (r) => {
        sfx.play(r.winners.length ? 'fanfare' : 'bell', 300);
        const w = r.winners[0];
        if (w) toasts.push({ kind: 'score', name: w.nickname, avatar: w.avatar, userId: w.userId, text: `+${w.points} · ${w.word.toUpperCase()}` });
      }),
      on('winner:announced', () => sfx.play('win', 1000)),
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  if (!s) {
    return (
      <div className="pxp relative h-[1920px] w-[1080px] overflow-hidden">
        <MountainBackdrop />
        <div className="absolute inset-0 flex items-center justify-center text-[44px] font-bold text-white/80">⛰️ Đang kết nối server…</div>
      </div>
    );
  }

  const highlightRound = (s.roundPhase === 'reveal' || s.roundPhase === 'waiting') && s.lastResult ? s.lastResult.no : 0;
  return (
    <div className={`pxp relative h-[1920px] w-[1080px] overflow-hidden ${fx ? '' : 'pxp-no-fx'}`}>
      <MountainBackdrop />
      <Header s={s} />
      <QuestionBoard s={s} offset={offset} fx={fx} />
      <TickSound s={s} offset={offset} />
      <WordHistory chain={s.chain} chainStart={s.chainStart} current={s.word} />
      <MountainTrail seats={s.seats} ended={s.phase === 'ended'} />
      <ContestantSeats
        seats={s.seats}
        seatCount={s.config.seatCount}
        waitingCount={s.waitingCount}
        highlightRound={highlightRound}
        fx={fx}
        toast={<ToastView toast={toasts.current} />}
      />
      <RulesTicker s={s} />
      {s.phase === 'ended' && s.winners && <Winners s={s} offset={offset} fx={fx} />}
      {!connected && <div className="absolute left-3 top-3 z-[60] h-4 w-4 rounded-full bg-red-500 shadow-[0_0_12px_red]" title="Mất kết nối server" />}
    </div>
  );
}
