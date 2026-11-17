import type { PlayerView } from '../../shared/types';

export interface Player {
  userId: string;
  uniqueId: string;
  nickname: string;
  avatar: string;
  score: number;
  correct: number;
  joinedAt: number;
  /** lúc đạt tới số điểm hiện tại: cùng điểm thì ai đạt trước đứng trên */
  scoreAt: number;
  lastGain: number;
  lastGainRound: number;
  isMock: boolean;
  /** lần cuối bình luận (để dọn người đã rời live khi mở cuộc đua mới) */
  lastActiveAt: number;
}

export interface PlayerProfile {
  userId: string;
  uniqueId: string;
  nickname: string;
  avatar: string;
  isMock?: boolean;
}

/**
 * Thứ tự bảng xếp hạng (cũng là thứ tự ghế):
 *  1. điểm cao hơn đứng trên
 *  2. cùng điểm: ai đạt số điểm đó trước đứng trên (không nhảy chỗ lung tung)
 *  3. vẫn bằng (thường là cùng 0 điểm): ai vào game trước đứng trên
 *  4. cuối cùng theo userId để luôn ổn định
 */
export function compareRanking(a: Player, b: Player): number {
  return b.score - a.score || a.scoreAt - b.scoreAt || a.joinedAt - b.joinedAt || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);
}

export type JoinResult = 'joined' | 'updated' | 'banned';

/**
 * Người chơi của phiên. Không loại ai: ai đã vào đều được trả lời và cộng điểm.
 * Ghế = `seatCount` người đứng đầu bảng xếp hạng; còn lại là hàng chờ.
 * Hết ghế thì người mới (0 điểm, vào sau) nằm ở hàng chờ; có ghế trống (ai bị xoá) thì người chờ lâu nhất lên.
 * Người ở hàng chờ ghi điểm vượt người đang ngồi thì được lên ghế.
 */
export class PlayerManager {
  private players = new Map<string, Player>();
  private banned = new Map<string, string>(); // userId -> nickname
  private sorted: Player[] | null = null;

  get count() {
    return this.players.size;
  }

  get(userId: string) {
    return this.players.get(userId);
  }

  isBanned(userId: string) {
    return this.banned.has(userId);
  }

  join(p: PlayerProfile, now: number): JoinResult {
    if (this.banned.has(p.userId)) return 'banned';
    const old = this.players.get(p.userId);
    if (old) {
      // vào lại / đổi tên: cập nhật thông tin, giữ nguyên điểm và chỗ
      old.lastActiveAt = now;
      old.nickname = p.nickname || old.nickname;
      old.avatar = p.avatar || old.avatar;
      old.uniqueId = p.uniqueId || old.uniqueId;
      return 'updated';
    }
    this.players.set(p.userId, {
      userId: p.userId,
      uniqueId: p.uniqueId,
      nickname: p.nickname || p.uniqueId || 'Người chơi',
      avatar: p.avatar,
      score: 0,
      correct: 0,
      joinedAt: now,
      scoreAt: now,
      lastGain: 0,
      lastGainRound: 0,
      isMock: !!p.isMock,
      lastActiveAt: now,
    });
    this.sorted = null;
    return 'joined';
  }

  remove(userId: string, ban: boolean, nickname?: string): Player | undefined {
    const p = this.players.get(userId);
    this.players.delete(userId);
    if (ban) this.banned.set(userId, p?.nickname ?? nickname ?? userId);
    this.sorted = null;
    return p;
  }

  unban(userId: string) {
    return this.banned.delete(userId);
  }

  bannedList() {
    return [...this.banned].map(([userId, nickname]) => ({ userId, nickname }));
  }

  /** Cộng điểm sau khi chốt lượt. points có thể = 0 (đúng nhưng ngoài top có điểm): vẫn tính 1 câu đúng. */
  award(userId: string, points: number, roundNo: number, now: number) {
    const p = this.players.get(userId);
    if (!p) return;
    p.correct += 1;
    p.lastGain = points;
    p.lastGainRound = roundNo;
    if (points > 0) {
      p.score += points;
      p.scoreAt = now;
    }
    this.sorted = null;
  }

  ranking(): Player[] {
    this.sorted ??= [...this.players.values()].sort(compareRanking);
    return this.sorted;
  }

  touch(userId: string, now: number) {
    const p = this.players.get(userId);
    if (p) p.lastActiveAt = now;
  }

  /**
   * Người vừa vào (0 điểm, vào sau cùng) luôn đứng cuối bảng, nên có ghế khi tổng số người <= số ghế.
   * Không phải sắp xếp lại cả danh sách mỗi lần có người join (phòng đông join ồ ạt).
   */
  newcomerSeated(seatCount: number) {
    return this.players.size <= seatCount;
  }

  /** Dọn người không bình luận gì trong `idleMs` (đã rời live). Trả về số người bị dọn. */
  pruneInactive(now: number, idleMs: number): number {
    let n = 0;
    for (const [id, p] of this.players) {
      if (now - (p.lastActiveAt ?? p.joinedAt) > idleMs) {
        this.players.delete(id);
        n++;
      }
    }
    if (n) this.sorted = null;
    return n;
  }

  removeMock(): number {
    let n = 0;
    for (const [id, p] of this.players) {
      if (p.isMock) {
        this.players.delete(id);
        n++;
      }
    }
    if (n) this.sorted = null;
    return n;
  }

  isSeated(userId: string, seatCount: number) {
    const i = this.ranking().findIndex((p) => p.userId === userId);
    return i >= 0 && i < seatCount;
  }

  views(seatCount: number, limit = Infinity): PlayerView[] {
    return this.ranking()
      .slice(0, limit)
      .map((p, i) => ({
        userId: p.userId,
        uniqueId: p.uniqueId,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        correct: p.correct,
        rank: i + 1,
        seated: i < seatCount,
        joinedAt: p.joinedAt,
        lastGain: p.lastGain,
        lastGainRound: p.lastGainRound,
        isMock: p.isMock,
      }));
  }

  /** Phiên mới giữ người chơi: điểm về 0, thứ tự ghế theo lúc vào */
  resetScores(now: number) {
    for (const p of this.players.values()) {
      p.score = 0;
      p.correct = 0;
      p.lastGain = 0;
      p.lastGainRound = 0;
      p.scoreAt = now;
    }
    this.sorted = null;
  }

  /** Xoá danh sách người chơi. Danh sách bị khoá vẫn giữ (khoá là khoá cả buổi live), trừ khi `withBans` */
  clear(withBans = false) {
    this.players.clear();
    if (withBans) this.banned.clear();
    this.sorted = null;
  }

  toJSON() {
    return { players: [...this.players.values()], banned: [...this.banned] };
  }

  /** Bật lại server: coi như mọi người vừa hoạt động (máy tắt lâu thì đừng dọn sạch người chơi) */
  restore(data: { players?: Player[]; banned?: [string, string][] }, now: number) {
    this.clear(true);
    for (const p of data.players ?? []) if (p && typeof p.userId === 'string') this.players.set(p.userId, { ...p, lastActiveAt: now });
    for (const [id, nick] of data.banned ?? []) this.banned.set(id, nick);
  }
}
