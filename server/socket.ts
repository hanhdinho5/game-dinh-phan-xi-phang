import type { Server, Socket } from 'socket.io';
import type { AckResult, ClientToServerEvents, GameConfig, ServerToClientEvents } from '../shared/types';
import type { PhanXiPangEngine } from './game/phan-xi-pang-engine';
import type { WordBank } from './game/word-bank';
import type { TikTokConnector } from './live/tiktok-connector';
import type { MockLive } from './live/mock-live';
import type { McDirector } from './game/mc-director';
import type { JsonStore } from './storage/json-store';
import type { Logger } from './logger';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface SocketContext {
  engine: PhanXiPangEngine;
  bank: WordBank;
  tiktok: TikTokConnector;
  mock: MockLive;
  director: McDirector;
  store: JsonStore;
  log: Logger;
  adminToken: string;
  mockAllowed: () => boolean;
  onConfigChanged: () => void;
  onWordsChanged: () => void;
}

/**
 * Hai loại trang:
 *  - overlay (TikTok LIVE Studio): chỉ NHẬN trạng thái, mọi lệnh điều khiển gửi lên đều bị từ chối
 *  - admin: phải gửi auth { role: 'admin', token } đúng ADMIN_TOKEN (nếu có đặt) mới được điều khiển
 * Người xem TikTok không bao giờ chạm tới socket: họ chỉ bình luận, bình luận đi qua TikTok connector.
 */
export function setupSocket(io: IO, ctx: SocketContext) {
  const { engine, log } = ctx;

  // ---------- "loa": overlay có phát tiếng. Mở nhiều overlay thì chỉ cái mở SAU CÙNG được nói ----------
  let speakers: string[] = [];
  const speakerInfo = () => ({ socketId: speakers.at(-1) ?? null, count: speakers.length });
  const announceSpeaker = () => {
    io.emit('voice:speaker', speakerInfo());
    scheduleState();
  };

  // ---------- gửi trạng thái: gom các thay đổi liền nhau, tối đa ~8 lần/giây ----------
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pushState = () => {
    timer = null;
    const now = Date.now();
    const live = ctx.tiktok.status;
    io.to('overlay').emit('game:state', { ...engine.overlayState(now, { isConnected: live.isConnected, viewerCount: live.viewerCount }), speaker: speakerInfo() });
    if (io.sockets.adapter.rooms.get('admin')?.size) {
      io.to('admin').emit('admin:state', { ...engine.adminState(now, { live, mockAllowed: ctx.mockAllowed(), logs: log.entries() }), speaker: speakerInfo() });
    }
  };
  const scheduleState = () => {
    timer ??= setTimeout(pushState, 120);
  };

  const sendInitial = (s: Sock, admin: boolean) => {
    const now = Date.now();
    const live = ctx.tiktok.status;
    if (admin) s.emit('admin:state', { ...engine.adminState(now, { live, mockAllowed: ctx.mockAllowed(), logs: log.entries() }), speaker: speakerInfo() });
    else s.emit('game:state', { ...engine.overlayState(now, { isConnected: live.isConnected, viewerCount: live.viewerCount }), speaker: speakerInfo() });
  };

  const cancelPrepareVoice = () => {
    const id = ctx.director.cancelPrepare();
    if (id) io.emit('voice:cancel', { id });
  };

  io.on('connection', (socket) => {
    const auth = (socket.handshake.auth ?? {}) as { role?: string; token?: string; sound?: boolean };
    const isAdmin = auth.role === 'admin' && (!ctx.adminToken || auth.token === ctx.adminToken);
    if (auth.role === 'admin' && !isAdmin) log.warn(`Từ chối trang admin sai mã ADMIN_TOKEN (${socket.handshake.address})`);
    void socket.join(isAdmin ? 'admin' : 'overlay');
    if (!isAdmin && auth.sound === true) {
      speakers = [...speakers.filter((id) => id !== socket.id), socket.id];
      announceSpeaker();
      socket.on('disconnect', () => {
        speakers = speakers.filter((id) => id !== socket.id);
        announceSpeaker();
      });
    }
    sendInitial(socket, isAdmin);

    /** Bọc lệnh admin: kiểm tra quyền, bắt lỗi, trả kết quả cho nút bấm */
    const on = <K extends keyof ClientToServerEvents>(event: K, run: (...args: any[]) => unknown) => {
      socket.on(event, ((...args: unknown[]) => {
        const ack = args[args.length - 1];
        const reply = (r: AckResult) => (typeof ack === 'function' ? (ack as (r: AckResult) => void)(r) : undefined);
        if (!isAdmin) {
          log.warn(`Chặn lệnh "${event}" từ trang không phải admin`);
          return reply({ ok: false, error: 'Không có quyền admin' });
        }
        try {
          const data = run(...args.slice(0, -1));
          if (data instanceof Promise) {
            data.then((d) => reply({ ok: true, data: d })).catch((err) => reply({ ok: false, error: errMsg(err) }));
          } else reply({ ok: true, data });
        } catch (err) {
          log.warn(`Lệnh ${event} lỗi: ${errMsg(err)}`);
          reply({ ok: false, error: errMsg(err) });
        }
        scheduleState();
      }) as never);
    };

    on('admin:start', () => engine.start(Date.now()));
    on('admin:pause', () => engine.pause(Date.now()));
    on('admin:resume', () => engine.resume(Date.now()));
    on('admin:next_round', () => engine.nextRoundNow(Date.now()));
    on('admin:end', () => engine.end(Date.now()));
    on('admin:reset', (opts: { keepPlayers?: boolean }) => engine.reset(opts?.keepPlayers !== false, Date.now()));
    on('admin:update_config', (patch: Partial<GameConfig>) => {
      const hadNextRace = engine.nextRaceAt > 0;
      engine.updateConfig(patch ?? {});
      ctx.onConfigChanged();
      if (hadNextRace && !engine.nextRaceAt) cancelPrepareVoice();
    });
    on('admin:set_word', (word: string) => engine.setWord(String(word ?? ''), Date.now()));
    on('admin:remove_player', (d: { userId: string; ban: boolean }) => engine.removePlayer(String(d?.userId), !!d?.ban));
    on('admin:unban_player', (userId: string) => engine.unbanPlayer(String(userId)));

    // ---------- quản lý từ ----------
    on('admin:word_search', (q: string) => ctx.bank.search(String(q ?? '').slice(0, 40), engine.used));
    on('admin:word_add', (d: { word: string; common: boolean }) => {
      const w = ctx.bank.add(String(d?.word ?? ''), !!d?.common);
      ctx.onWordsChanged();
      const approved = engine.approveWordInRound(w, Date.now());
      log.info(`📗 Thêm từ "${w}"${approved ? ` (tính đúng lại cho ${approved} người trong lượt này)` : ''}`);
      return { word: w, approved };
    });
    on('admin:word_edit', (d: { from: string; to: string }) => {
      const w = ctx.bank.edit(String(d?.from ?? ''), String(d?.to ?? ''));
      ctx.onWordsChanged();
      engine.revokeInvalidInRound();
      engine.approveWordInRound(w, Date.now());
      log.info(`📝 Sửa từ "${d.from}" thành "${w}"`);
      return { word: w };
    });
    on('admin:word_delete', (word: string) => {
      const w = ctx.bank.remove(String(word ?? ''));
      ctx.onWordsChanged();
      engine.revokeInvalidInRound();
      log.info(`📕 Xoá từ "${w}"`);
      return { word: w };
    });
    on('admin:word_ban', (d: { word: string; banned: boolean }) => {
      const w = ctx.bank.setBanned(String(d?.word ?? ''), !!d?.banned);
      ctx.onWordsChanged();
      if (d?.banned) engine.revokeInvalidInRound();
      else engine.approveWordInRound(w, Date.now());
      log.info(`${d.banned ? '🚫 Đánh dấu không hợp lệ' : '↩ Gỡ đánh dấu'} "${w}"`);
      return { word: w };
    });
    on('admin:sessions', () => ctx.store.listSessions());
    on('admin:speak', (text: string) => ctx.director.speak(String(text ?? ''), Date.now()));
    on('admin:cancel_next_race', () => {
      engine.cancelNextRace();
      cancelPrepareVoice();
    });

    // ---------- TikTok ----------
    on('admin:tiktok_connect', async (username: string) => {
      const user = String(username ?? '').replace(/^@/, '').trim();
      ctx.mock.stopAll();
      ctx.store.saveSettings({ tiktokUser: user });
      await ctx.tiktok.connect(user);
      // lên live thật: người chơi giả không được ngồi ghế / lên bục vinh danh
      engine.removeMockPlayers();
    });
    on('admin:tiktok_disconnect', () => {
      ctx.store.saveSettings({ tiktokUser: '' });
      ctx.tiktok.disconnect();
    });

    // ---------- giả lập ----------
    const mockGuard = () => {
      if (!ctx.mockAllowed()) throw new Error('Đang kết nối TikTok thật (hoặc đã tắt giả lập): không cho người chơi giả vào phiên live');
    };
    on('mock:join', (n: number) => {
      mockGuard();
      ctx.mock.join(Math.max(1, Math.min(100, Number(n) || 1)));
    });
    on('mock:answers', (d: { count: number; correctRatio: number; spreadMs: number }) => {
      mockGuard();
      return ctx.mock.answers(
        Math.max(1, Math.min(1000, Number(d?.count) || 10)),
        Math.max(0, Math.min(1, Number(d?.correctRatio) || 0.5)),
        Math.max(0, Math.min(60_000, Number(d?.spreadMs) || 5000)),
      );
    });
    on('mock:comment', (d: { userId?: string; nickname?: string; text: string }) => {
      mockGuard();
      const id = String(d?.userId || `mock_tay_${Math.floor(Math.random() * 1000)}`);
      ctx.mock.comment({ userId: id, uniqueId: id, nickname: String(d?.nickname || 'Người thử'), avatar: '' }, String(d?.text ?? ''));
    });
    on('mock:gift', () => {
      mockGuard();
      ctx.mock.gift();
    });
  });

  return { scheduleState };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
