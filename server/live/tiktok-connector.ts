/**
 * Kết nối phòng TikTok LIVE (tiktok-live-connector 2.x, proto v3). Lấy từ Lớp Học Chữ, đã chạy thật.
 *
 * Tầng này CHỈ nhận sự kiện và chuẩn hoá (LiveComment / LiveGift), KHÔNG xử lý luật chơi.
 * Rớt kết nối / hết phiên live thì tự kết nối lại (15 giây, 30, 60, tối đa 2 phút một lần).
 */
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import type { LiveComment, LiveGift, LiveStatus } from '../../shared/types';
import type { Logger } from '../logger';

export interface ConnectorHandlers {
  onComment: (c: LiveComment) => void;
  onGift: (g: LiveGift) => void;
  onStatus: (s: LiveStatus) => void;
}

const emptyStatus = (): LiveStatus => ({ isConnected: false, isConnecting: false, username: '', roomId: '', viewerCount: 0, error: '', target: '' });

// ---------- đọc dữ liệu TikTok ----------
/* eslint-disable @typescript-eslint/no-explicit-any */
const userIdOf = (d: any): string => String(d?.user?.id || d?.user?.userId || d?.userId || d?.user?.uniqueId || d?.user?.displayId || '');
const uniqueIdOf = (d: any): string => String(d?.user?.uniqueId || d?.user?.displayId || d?.uniqueId || '');
const nickOf = (d: any): string => String(d?.user?.nickname || d?.nickname || uniqueIdOf(d) || 'Bạn');
const avatarOf = (d: any): string => String(d?.user?.avatarThumb?.urlList?.[0] || d?.user?.avatarThumb?.url?.[0] || '');
const createTimeOf = (d: any): number => {
  const n = Number(d?.common?.createTime || d?.createTime || 0);
  if (!n) return 0;
  return n < 1e12 ? n * 1000 : n; // có bản gửi giây, có bản gửi ms
};

export class TikTokConnector {
  status: LiveStatus = emptyStatus();
  private conn: InstanceType<typeof TikTokLiveConnection> | null = null;
  private wantUser = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTries = 0;

  constructor(
    private readonly h: ConnectorHandlers,
    private readonly log: Logger,
  ) {}

  get isConnected() {
    return this.status.isConnected;
  }

  private setStatus(patch: Partial<LiveStatus>) {
    this.status = { ...this.status, ...patch, target: this.wantUser };
    this.h.onStatus(this.status);
  }

  /** Admin bấm Kết nối: thử ngay, lỗi thì tự thử lại */
  async connect(username: string) {
    const user = username.replace(/^@/, '').trim();
    if (!user) throw new Error('Chưa nhập username TikTok');
    this.stopReconnect();
    this.wantUser = user;
    try {
      await this.open(user);
    } catch (err) {
      this.scheduleReconnect(`Không kết nối được: ${errMsg(err)}`);
      throw new Error(`Không kết nối được @${user}: ${errMsg(err)}. Tài khoản phải đang LIVE. Server sẽ tự thử lại.`);
    }
  }

  disconnect() {
    this.stopReconnect();
    this.wantUser = '';
    this.close();
    this.status = emptyStatus();
    this.h.onStatus(this.status);
    this.log.info('[TikTok] Đã ngắt kết nối');
  }

  private close() {
    const c = this.conn;
    this.conn = null;
    try {
      c?.disconnect();
    } catch {
      // bỏ qua
    }
  }

  private scheduleReconnect(why: string) {
    if (!this.wantUser || this.reconnectTimer) return;
    const delay = Math.min(120_000, 15_000 * 2 ** this.reconnectTries);
    this.reconnectTries++;
    this.log.warn(`[TikTok] ${why}. Tự kết nối lại @${this.wantUser} sau ${delay / 1000} giây`);
    this.setStatus({ isConnected: false, isConnecting: false, error: `${why}. Tự kết nối lại sau ${delay / 1000} giây` });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open(this.wantUser).catch((err) => this.scheduleReconnect(`Chưa kết nối lại được (${errMsg(err)})`));
    }, delay);
  }

  private stopReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectTries = 0;
  }

  private async open(user: string) {
    this.close();
    this.status = { ...emptyStatus(), isConnecting: true, username: user, target: this.wantUser };
    this.h.onStatus(this.status);

    const conn = new TikTokLiveConnection(user, {
      // bình luận cũ trước lúc kết nối: không lấy (tránh cộng điểm cho đáp án cũ)
      processInitialData: false,
      enableExtendedGiftInfo: false,
    });
    this.conn = conn;
    const mine = () => this.conn === conn; // kết nối cũ bị thay thì bỏ qua sự kiện của nó

    conn.on(ControlEvent.CONNECTED, (state: { roomId?: string }) => {
      if (!mine()) return;
      this.log.info(`[TikTok] Đã kết nối @${user}, room ${state?.roomId}`);
      this.reconnectTries = 0;
      this.setStatus({ isConnected: true, isConnecting: false, roomId: state?.roomId || '', error: '' });
    });
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (!mine()) return;
      this.log.warn(`[TikTok] Mất kết nối @${user}`);
      this.setStatus({ isConnected: false, isConnecting: false });
      this.scheduleReconnect('Mất kết nối TikTok');
    });
    conn.on(WebcastEvent.STREAM_END, () => {
      if (!mine()) return;
      this.setStatus({ isConnected: false, isConnecting: false, error: 'Phiên live đã kết thúc' });
      this.scheduleReconnect('Phiên live đã kết thúc');
    });
    conn.on(ControlEvent.ERROR, (err: unknown) => {
      if (!mine()) return;
      this.log.warn(`[TikTok] Lỗi: ${errMsg(err)}`);
      this.setStatus({ error: errMsg(err) });
    });

    conn.on(WebcastEvent.CHAT, (d: any) => {
      if (!mine()) return;
      const receivedAt = Date.now();
      const userId = userIdOf(d);
      if (!userId) return;
      const text = String(d?.content ?? d?.comment ?? '');
      const createTime = createTimeOf(d);
      this.h.onComment({
        // không có msgId thì ghép mã từ người + nội dung + giờ gửi để vẫn chống trùng được
        msgId: String(d?.common?.msgId || d?.msgId || `${userId}|${createTime || Math.floor(receivedAt / 3000)}|${text}`),
        userId,
        uniqueId: uniqueIdOf(d),
        nickname: nickOf(d),
        avatar: avatarOf(d),
        text,
        createTime,
        receivedAt,
        source: 'tiktok',
      });
    });

    // TikTok gửi lại quà combo với repeatCount cộng dồn: chỉ chuyển phần mới
    const streak = new Map<string, number>();
    conn.on(WebcastEvent.GIFT, (d: any) => {
      if (!mine()) return;
      const userId = userIdOf(d);
      const giftId = d?.giftId || d?.gift?.id || 0;
      const key = `${userId}_${giftId}`;
      const total = d?.repeatCount || 1;
      const delta = total - (streak.get(key) || 0);
      const isStreakable = (d?.gift?.type ?? d?.giftDetails?.giftType ?? d?.giftType) === 1;
      if (isStreakable && !d?.repeatEnd) streak.set(key, total);
      else streak.delete(key);
      if (delta <= 0) return;
      this.h.onGift({
        msgId: String(d?.common?.msgId || `${key}|${total}|${Date.now()}`),
        userId,
        uniqueId: uniqueIdOf(d),
        nickname: nickOf(d),
        avatar: avatarOf(d),
        giftName: String(d?.gift?.name || d?.giftDetails?.giftName || d?.giftName || 'Quà'),
        diamondCount: Number(d?.gift?.diamondCount || d?.diamondCount || 1),
        repeatCount: delta,
        receivedAt: Date.now(),
        source: 'tiktok',
      });
    });

    conn.on(WebcastEvent.ROOM_USER, (d: any) => {
      if (!mine() || typeof d?.viewerCount !== 'number') return;
      this.status.viewerCount = d.viewerCount;
      this.h.onStatus(this.status);
    });

    try {
      // Chưa LIVE thì thư viện có thể treo mãi ở "Đang kết nối": hỏi TikTok trước
      const live = await conn.fetchIsLive().catch(() => true);
      if (!live) throw new Error('TikTok báo tài khoản này CHƯA LIVE. Bấm Phát trực tiếp trong LIVE Studio trước');
      await Promise.race([
        conn.connect(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('quá 30 giây không vào được phòng live')), 30_000)),
      ]);
    } catch (err) {
      // lần thử cũ đã bị lần kết nối mới thay chỗ: bỏ qua lỗi của nó, đừng hẹn kết nối lại (sẽ đá kết nối đang tốt)
      if (!mine()) return;
      this.close();
      this.setStatus({ isConnected: false, isConnecting: false, error: errMsg(err) });
      throw err;
    }
  }

  /** Bật lại server: lần trước đang kết nối thì tự kết nối lại */
  resume(username: string) {
    if (!username) return;
    this.wantUser = username;
    this.log.info(`[TikTok] Tự kết nối lại @${username} (lần trước đang kết nối)`);
    this.open(username).catch((err) => this.scheduleReconnect(`Chưa kết nối được (${errMsg(err)})`));
  }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
