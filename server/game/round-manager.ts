import type { RejectReason, RoundResult, RoundWinner, ScoreTier } from '../../shared/types';
import { pointsForRank } from './scoring-service';
import { lastSyllable, type Validation } from './word-validator';
import type { WordBank } from './word-bank';

/**
 * Giờ của 1 bình luận.
 *
 * TikTok gắn `createTime` lúc người xem bấm gửi. Bình luận tới server có thể trễ và lệch thứ tự,
 * nên XẾP AI NHANH HƠN theo createTime (`sortAt`) công bằng hơn giờ server nhận.
 *
 * Nhưng đồng hồ TikTok có thể lệch đồng hồ máy mình, nên muốn biết bình luận có nằm TRONG GIỜ của lượt
 * (so với giờ bắt đầu / hết giờ theo đồng hồ server) thì đổi sang giờ server (`at`):
 *   at = createTime + độ trễ thấp (phân vị 10%) của (receivedAt - createTime) các bình luận gần đây
 * Lấy độ trễ thấp chứ không lấy trung bình: phần trễ thấp nhất gần như chỉ là độ lệch đồng hồ,
 * phần trễ thêm là do mạng, không phải lỗi của người chơi.
 * Không có createTime (hoặc lệch vô lý) thì dùng giờ server nhận cho cả hai.
 */
export class ClockSync {
  private lags: number[] = [];
  private typicalLag = 0;
  constructor(private readonly maxSamples = 60) {}

  convert(createTime: number, receivedAt: number): { at: number; sortAt: number } {
    if (!createTime || !Number.isFinite(createTime) || Math.abs(receivedAt - createTime) > 30_000) {
      // không có / hỏng (sai đơn vị, đồng hồ lệch nặng): ước lượng giờ gửi = giờ nhận - độ trễ thường gặp
      return { at: receivedAt, sortAt: receivedAt - this.typicalLag };
    }
    this.lags.push(receivedAt - createTime);
    if (this.lags.length > this.maxSamples) this.lags.shift();
    const sorted = [...this.lags].sort((a, b) => a - b);
    this.typicalLag = sorted[Math.floor(sorted.length / 2)];
    const lowLag = sorted[Math.floor(sorted.length / 10)];
    // không sớm hơn 10 giây, không muộn hơn lúc server nhận
    const at = Math.min(receivedAt, Math.max(receivedAt - 10_000, createTime + lowLag));
    return { at, sortAt: createTime };
  }
}

export interface AnswerEntry {
  userId: string;
  uniqueId: string;
  isMock: boolean;
  nickname: string;
  avatar: string;
  syllable: string;
  word: string;
  /** giờ đã quy đổi sang đồng hồ server: để xét trong giờ / ngoài giờ */
  at: number;
  /** giờ gửi theo TikTok: để xếp ai nhanh hơn */
  sortAt: number;
  /** số thứ tự nhận: cùng giờ thì ai tới server trước đứng trước */
  seq: number;
}

export type SubmitResult =
  | 'accepted'
  | 'already_answered' // đã đúng trong lượt này: không tính thêm
  | 'too_many_wrong' // sai quá số lần cho phép
  | 'too_early' // gửi trước khi lượt bắt đầu (trả lời từ cũ)
  | 'too_late'
  | 'during_pause' // gửi trong lúc tạm dừng (người xem đã thấy màn hình dừng): không tính
  | 'rejected';

interface RejectedBucket {
  syllable: string;
  reason: RejectReason;
  entries: AnswerEntry[];
}

/**
 * Một lượt nối từ. Không đổi từ ngay khi có người đúng đầu tiên: nhận hết tới khi hết giờ
 * (+ phần bù độ trễ hình TikTok LIVE), rồi mới xếp hạng, cộng điểm, chọn từ tiếp.
 *
 * Người xem thấy hình trễ vài giây so với máy chủ kênh: đồng hồ trên máy mình về 0 thì người xem vẫn còn thấy
 * 2-3 giây. Nên nhận cả bình luận GỬI trong khoảng `acceptGraceMs` sau khi hết giờ.
 */
export class Round {
  readonly linkSyllable: string;
  private accepted: AnswerEntry[] = [];
  private answered = new Set<string>();
  private wrong = new Map<string, number>();
  private rejected = new Map<string, RejectedBucket>();
  private finalized = false;
  /** các khoảng tạm dừng (giờ server); `to` = 0 khi đang dừng */
  private pauses: { from: number; to: number }[] = [];
  /** thời lượng gốc của chặng (không đổi khi tạm dừng / đổi cấu hình giữa chừng) */
  readonly durationMs: number;

  constructor(
    readonly no: number,
    readonly word: string,
    public startedAt: number,
    public endsAt: number,
    private readonly maxWrong: number,
    private readonly acceptGraceMs = 0,
  ) {
    this.linkSyllable = lastSyllable(word);
    this.durationMs = endsAt - startedAt;
  }

  get isFinalized() {
    return this.finalized;
  }

  /**
   * Nhận 1 câu trả lời đã được kiểm tra.
   * - Mỗi người chỉ được tính 1 lần đúng mỗi lượt (gửi nhiều đáp án đúng khác nhau cũng chỉ giữ cái đầu).
   * - Sai không bị trừ điểm, nhưng sai quá `maxWrong` lần thì thôi nhận (chống spam đoán bừa).
   */
  submit(entry: AnswerEntry, v: Validation): SubmitResult {
    if (this.finalized) return 'too_late';
    if (entry.at < this.startedAt) return 'too_early';
    if (entry.at > this.endsAt + this.acceptGraceMs) return 'too_late';
    // người xem thấy màn hình "tạm dừng" trễ khoảng acceptGraceMs: gửi sau đó (tới lúc tiếp tục) thì không tính
    if (this.pauses.some((p) => entry.at > p.from + this.acceptGraceMs && (p.to === 0 || entry.at < p.to))) return 'during_pause';
    if (this.answered.has(entry.userId)) return 'already_answered';
    const wrongSoFar = this.wrong.get(entry.userId) ?? 0;
    if (wrongSoFar >= this.maxWrong) return 'too_many_wrong';
    if (!v.ok) {
      this.wrong.set(entry.userId, wrongSoFar + 1);
      let b = this.rejected.get(v.word);
      if (!b) this.rejected.set(v.word, (b = { syllable: entry.syllable, reason: v.reason, entries: [] }));
      if (b.entries.length < 200 && !b.entries.some((e) => e.userId === entry.userId)) b.entries.push(entry);
      return 'rejected';
    }
    this.accept(entry);
    return 'accepted';
  }

  private accept(entry: AnswerEntry) {
    this.answered.add(entry.userId);
    // chèn đúng chỗ theo giờ (bình luận tới trễ vẫn đứng đúng thứ tự)
    let i = this.accepted.length;
    while (i > 0 && cmpEntry(this.accepted[i - 1], entry) > 0) i--;
    this.accepted.splice(i, 0, entry);
  }

  /**
   * Admin vừa duyệt thêm từ `word` vào ngân hàng giữa lượt: ai đã gửi từ đó (bị báo sai) được tính đúng,
   * giữ nguyên thứ tự theo giờ gửi. Trả về số người được tính lại.
   */
  approveRejected(word: string): number {
    if (this.finalized) return 0;
    const b = this.rejected.get(word);
    // chỉ đáp án bị từ chối vì từ điển thiếu / từ bị đánh dấu (không phải vì đã dùng, trùng từ hiện tại)
    if (!b || (b.reason !== 'not_in_bank' && b.reason !== 'banned_word')) return 0;
    this.rejected.delete(word);
    let n = 0;
    for (const e of b.entries) {
      if (this.answered.has(e.userId)) continue;
      this.wrong.set(e.userId, Math.max(0, (this.wrong.get(e.userId) ?? 1) - 1));
      this.accept(e);
      n++;
    }
    return n;
  }

  /** Admin xoá / khoá người chơi giữa chặng: bỏ đáp án của họ, người sau được đôn hạng */
  removeUser(userId: string) {
    this.accepted = this.accepted.filter((e) => e.userId !== userId);
    this.answered.delete(userId);
    for (const b of this.rejected.values()) b.entries = b.entries.filter((e) => e.userId !== userId);
  }

  /**
   * Bỏ các đáp án mà từ không còn hợp lệ (admin vừa đánh dấu không hợp lệ / xoá từ giữa chặng).
   * Người bị bỏ được trả lời lại. Trả về số đáp án bị bỏ.
   */
  dropInvalid(isValid: (word: string) => boolean): number {
    const before = this.accepted.length;
    const bad = this.accepted.filter((e) => !isValid(e.word));
    if (!bad.length) return 0;
    this.accepted = this.accepted.filter((e) => isValid(e.word));
    for (const e of bad) this.answered.delete(e.userId);
    return before - this.accepted.length;
  }

  /** Thứ hạng tạm thời (chưa cộng điểm) */
  provisional() {
    return this.accepted.map((e, i) => ({ ...e, rank: i + 1 }));
  }

  get correctCount() {
    return this.accepted.length;
  }

  rejectedSummary() {
    return [...this.rejected]
      .map(([word, b]) => ({ word, syllable: b.syllable, count: b.entries.length, reason: b.reason }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  /** Chốt lượt: xếp hạng và tính điểm. Chỉ chạy 1 lần. */
  finalize(tiers: ScoreTier[]): RoundWinner[] {
    this.finalized = true;
    return this.accepted.map((e, i) => ({
      rank: i + 1,
      userId: e.userId,
      nickname: e.nickname,
      avatar: e.avatar,
      answer: e.syllable,
      word: e.word,
      points: pointsForRank(tiers, i + 1),
      at: e.at,
    }));
  }

  /**
   * Tạm dừng rồi tiếp tục: chỉ lùi giờ HẾT chặng. Giữ nguyên giờ bắt đầu, nếu không thì
   * đáp án gửi trước lúc tạm dừng (tới server trễ do độ trễ hình) bị coi là "gửi sớm".
   */
  shift(ms: number) {
    this.endsAt += ms;
  }

  markPaused(at: number) {
    this.pauses.push({ from: at, to: 0 });
  }

  markResumed(at: number) {
    const p = this.pauses.at(-1);
    if (p && p.to === 0) p.to = at;
  }
}

const cmpEntry = (a: AnswerEntry, b: AnswerEntry) => a.sortAt - b.sortAt || a.seq - b.seq;

// ---------- chọn từ tiếp theo ----------

/** Từ `word` còn nối tiếp được không (còn từ chưa dùng bắt đầu bằng tiếng cuối của nó) */
export function hasOpenContinuation(bank: WordBank, word: string, used: ReadonlySet<string>): boolean {
  return bank.continuations(lastSyllable(word)).some((w) => w !== word && !used.has(w));
}

export interface NextWordChoice {
  word: string;
  source: RoundResult['nextSource'];
}

/**
 * Hệ thống tự chọn từ cho chặng sau (KHÔNG lấy đáp án của người chơi):
 *  1. Từ phổ biến bắt đầu bằng tiếng cuối của từ hiện tại, chưa dùng, mà chặng sau vẫn còn
 *     từ phổ biến để nối (người chơi dễ nghĩ ra).
 *  2. Không có: từ phổ biến nối tiếp được, chặng sau còn từ (bất kỳ) để nối.
 *  3. Hết cách: đổi sang 1 từ khởi đầu phổ biến mới.
 */
export function chooseNextWord(currentWord: string, bank: WordBank, used: ReadonlySet<string>, rng: () => number): NextWordChoice {
  const candidates = bank.commonContinuations(lastSyllable(currentWord)).filter((w) => w !== currentWord && !used.has(w));
  const easy = candidates.filter((w) => bank.commonContinuations(lastSyllable(w)).some((x) => x !== w && !used.has(x)));
  const pool = easy.length ? easy : candidates.filter((w) => hasOpenContinuation(bank, w, used));
  if (pool.length) return { word: pool[Math.floor(rng() * pool.length)], source: 'auto' };
  return { word: pickStartWord(bank, used, rng), source: 'jump' };
}

/** Từ khởi đầu ngẫu nhiên: phổ biến, chưa dùng, còn nối tiếp được bằng từ phổ biến. */
export function pickStartWord(bank: WordBank, used: ReadonlySet<string>, rng: () => number): string {
  const all = bank.allCommon();
  const good = all.filter((w) => !used.has(w) && bank.commonContinuations(lastSyllable(w)).some((x) => !used.has(x) && x !== w));
  const pool = good.length ? good : all.filter((w) => !used.has(w) && hasOpenContinuation(bank, w, used));
  if (pool.length) return pool[Math.floor(rng() * pool.length)];
  // dùng hết từ phổ biến (cuộc đua rất dài): lấy bất kỳ từ chưa dùng nào trong từ điển còn nối tiếp được
  const any = bank.sample(400, rng).filter((w) => !used.has(w) && hasOpenContinuation(bank, w, used));
  if (any.length) return any[0];
  throw new Error('Ngân hàng từ không còn từ nào chưa dùng để bắt đầu. Bấm "Phiên mới" hoặc thêm từ.');
}
