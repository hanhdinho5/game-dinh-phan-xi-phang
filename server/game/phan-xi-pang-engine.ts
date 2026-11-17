import {
  DEFAULT_CONFIG,
  SEAT_OPTIONS,
  type AdminState,
  type ChainItem,
  type GameConfig,
  type GamePhase,
  type LiveComment,
  type LiveGift,
  type OverlayState,
  type PlayerView,
  type RoundPhase,
  type RoundResult,
  type ServerToClientEvents,
} from '../../shared/types';
import { canonicalWord } from '../../shared/vietnamese';
import { maskBanned } from '../../shared/banned-words';
import type { Logger } from '../logger';
import { PlayerManager, type Player } from './player-manager';
import { ClockSync, Round, chooseNextWord, hasOpenContinuation, pickStartWord } from './round-manager';
import { validateTiers } from './scoring-service';
import { isJoinComment, parseAnswer, validateAnswer } from './word-validator';
import type { WordBank } from './word-bank';

type Emit = <K extends keyof ServerToClientEvents>(event: K, ...args: Parameters<ServerToClientEvents[K]>) => void;

export interface EngineDeps {
  bank: WordBank;
  log: Logger;
  emit: Emit;
  rng?: () => number;
  /** có gì đổi: tầng socket gom lại rồi gửi ảnh chụp trạng thái */
  onChanged?: () => void;
  onRoundEnded?: (sessionId: string, result: RoundResult) => void;
  onSessionEnded?: (session: SessionRecord) => void;
}

/** Kết quả 1 phiên, lưu ra file khi kết thúc / reset */
export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number | null;
  config: GameConfig;
  rounds: number;
  chain: ChainItem[];
  ranking: PlayerView[];
  winners: PlayerView[];
}

/** Ảnh chụp để tắt server bật lại không mất điểm */
export interface EngineSnapshot {
  version: 1;
  sessionId: string;
  sessionStartedAt: number;
  phase: GamePhase;
  roundNo: number;
  currentWord: string;
  nextWord: string;
  /** lượt đang chạy dở lúc chụp: bật lại thì chơi lại từ này */
  roundUnfinished: boolean;
  config: GameConfig;
  players: ReturnType<PlayerManager['toJSON']>;
  chain: ChainItem[];
  used: string[];
  lastResult: RoundResult | null;
  winners: PlayerView[] | null;
  raceNo?: number;
  nextRaceAt?: number;
}

const MAX_CHAIN_VIEW = 10;
/** Sau phần bù độ trễ hình, chờ thêm chừng này để bình luận gửi kịp giờ nhưng tới server chậm vẫn được nhận */
export const ARRIVAL_BUFFER_MS = 1200;
/** Mở cuộc đua mới tự động: dọn người không bình luận gì trong chừng này (đã rời live) */
export const INACTIVE_PRUNE_MS = 10 * 60_000;

export class PhanXiPangEngine {
  config: GameConfig = structuredClone(DEFAULT_CONFIG);
  readonly players = new PlayerManager();
  sessionId = '';
  sessionStartedAt = 0;
  phase: GamePhase = 'idle';
  roundPhase: RoundPhase = 'waiting';
  round: Round | null = null;
  roundNo = 0;
  currentWord = '';
  /** từ sẽ dùng cho lượt tiếp theo */
  nextWord = '';
  private roundUnfinished = false;
  revealEndsAt = 0;
  private pausedAt = 0;
  chain: ChainItem[] = [];
  used = new Set<string>();
  lastResult: RoundResult | null = null;
  history: RoundResult[] = [];
  winners: PlayerView[] | null = null;
  /** cuộc đua thứ mấy (tăng mỗi lần Bắt đầu) */
  raceNo = 0;
  /** lúc tự mở cuộc đua mới sau vinh danh (0 = không) */
  nextRaceAt = 0;
  /** từ admin chọn bằng "Đổi từ" lúc chưa chạy: dùng cho lần Bắt đầu kế tiếp */
  private pendingStartWord = '';
  private clock = new ClockSync();
  private seq = 0;
  readonly stats = { commentsReceived: 0, duplicatesDropped: 0, answersAccepted: 0, answersRejected: 0 };
  private readonly rng: () => number;

  constructor(private readonly deps: EngineDeps, now = Date.now()) {
    this.rng = deps.rng ?? Math.random;
    this.newSessionId(now);
  }

  private get bank() {
    return this.deps.bank;
  }
  private get log() {
    return this.deps.log;
  }
  private changed() {
    this.deps.onChanged?.();
  }

  private newSessionId(now: number) {
    const d = new Date(now);
    const pad = (n: number) => String(n).padStart(2, '0');
    this.sessionId = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    this.sessionStartedAt = now;
  }

  // =========================================================
  //  Điều khiển của admin
  // =========================================================

  start(now: number) {
    if (this.phase === 'running' || this.phase === 'paused') throw new Error('Game đang chạy rồi');
    if (this.phase === 'ended') this.newRace(now); // kết thúc rồi bấm Bắt đầu = cuộc đua mới, giữ người chơi
    // từ admin vừa chọn > từ khởi đầu trong cấu hình (chỉ cuộc đua đầu của phiên; các cuộc đua sau đổi từ cho đỡ nhàm) > tự chọn
    const fromConfig = this.raceNo === 0 ? canonicalWord(this.config.startWord) : null;
    const word = this.pendingStartWord || fromConfig || pickStartWord(this.bank, this.used, this.rng);
    this.pendingStartWord = '';
    this.raceNo++;
    this.nextRaceAt = 0;
    this.phase = 'running';
    this.sessionStartedAt = now;
    this.chain.push({ word, source: 'start' });
    this.log.info(`▶ Bắt đầu phiên ${this.sessionId}, từ khởi đầu "${word}"`);
    this.deps.emit('game:started', { sessionId: this.sessionId });
    this.beginRound(word, now);
  }

  pause(now: number) {
    if (this.phase !== 'running') throw new Error('Game không ở trạng thái đang chạy');
    this.phase = 'paused';
    this.pausedAt = now;
    if (this.round && !this.round.isFinalized) this.round.markPaused(now);
    this.log.info('⏸ Tạm dừng');
    this.deps.emit('game:paused');
    this.changed();
  }

  resume(now: number) {
    if (this.phase !== 'paused') throw new Error('Game không ở trạng thái tạm dừng');
    const delta = Math.max(0, now - this.pausedAt);
    this.phase = 'running';
    this.log.info('▶ Tiếp tục');
    this.deps.emit('game:resumed');
    if (!this.round) {
      // vừa khôi phục sau khi tắt server (hoặc admin đổi từ lúc tạm dừng): chơi tiếp
      if (this.raceDone) this.end(now); // tắt máy đúng lúc đang hiện kết quả chặng cuối
      else this.beginRound(this.nextWord || pickStartWord(this.bank, this.used, this.rng), now);
      return;
    }
    if (!this.round.isFinalized) this.round.markResumed(now);
    this.round.shift(delta);
    this.revealEndsAt += delta;
    this.changed();
  }

  /** Admin bấm "Lượt tiếp": đang nhận đáp án thì chốt luôn (vẫn cộng điểm người đã đúng) rồi sang từ mới. */
  nextRoundNow(now: number) {
    if (this.phase !== 'running') throw new Error(this.phase === 'paused' ? 'Đang tạm dừng, bấm Tiếp tục trước' : 'Game chưa chạy');
    if (this.round && !this.round.isFinalized) this.finishRound(now);
    this.advance(now);
  }

  /** Đủ số chặng của cuộc đua chưa (chặng vừa / đang chơi là chặng cuối) */
  private get raceDone() {
    return this.config.roundsPerRace > 0 && this.roundNo >= this.config.roundsPerRace;
  }

  /** Sau khi chốt chặng: hết cuộc đua thì vinh danh, chưa thì sang chặng mới */
  private advance(now: number) {
    if (this.raceDone || !this.nextWord) this.end(now);
    else this.beginRound(this.nextWord, now);
  }

  end(now: number) {
    if (this.phase !== 'running' && this.phase !== 'paused') throw new Error('Game chưa bắt đầu');
    // chặng đang dở: vẫn chốt và cộng điểm cho người đã đúng (là chặng cuối: không chọn từ tiếp)
    if (this.round && !this.round.isFinalized) this.finishRound(now, true);
    this.phase = 'ended';
    this.round = null;
    this.roundPhase = 'waiting';
    this.winners = this.players.views(this.config.seatCount, 4);
    this.nextRaceAt = this.config.autoNewRace ? now + this.config.raceBreakSeconds * 1000 : 0;
    this.pendingStartWord = '';
    this.log.info(`🏁 Kết thúc phiên ${this.sessionId}. Vô địch: ${this.winners[0]?.nickname ?? '(chưa ai)'}`);
    this.deps.emit('game:ended', { winners: this.winners });
    this.deps.emit('winner:announced', { winners: this.winners });
    this.deps.onSessionEnded?.(this.record(now));
    this.changed();
  }

  /** Admin huỷ tự mở cuộc đua mới (đang vinh danh) */
  cancelNextRace() {
    if (!this.nextRaceAt) throw new Error('Không có cuộc đua mới nào đang chờ');
    this.nextRaceAt = 0;
    this.log.info('⏹ Huỷ tự mở cuộc đua mới');
    this.changed();
  }

  /** Cuộc đua mới sau vinh danh: giữ người chơi (dọn người đã rời live), điểm về 0, vẫn đếm số cuộc đua */
  private newRace(now: number) {
    const raceNo = this.raceNo;
    this.reset(true, now);
    this.raceNo = raceNo;
    const pruned = this.players.pruneInactive(now, INACTIVE_PRUNE_MS);
    if (pruned) this.log.info(`🧹 Dọn ${pruned} người không bình luận trong 10 phút (đã rời live)`);
  }

  /** Phiên mới: điểm về 0. Phiên cũ (nếu đã chơi) được lưu lại trước. Không xoá hồ sơ người chơi đã lưu. */
  reset(keepPlayers: boolean, now: number) {
    if (this.roundNo > 0 && this.phase !== 'ended') this.deps.onSessionEnded?.(this.record(now));
    this.newSessionId(now);
    this.raceNo = 0;
    if (keepPlayers) this.players.resetScores(now);
    else this.players.clear();
    this.phase = 'idle';
    this.roundPhase = 'waiting';
    this.round = null;
    this.roundNo = 0;
    this.currentWord = '';
    this.nextWord = '';
    this.roundUnfinished = false;
    this.chain = [];
    this.used.clear();
    this.lastResult = null;
    this.lastRejected = null;
    this.nextRaceAt = 0;
    this.history = [];
    this.winners = null;
    this.stats.answersAccepted = this.stats.answersRejected = 0;
    this.log.info(`🔄 Phiên mới ${this.sessionId}${keepPlayers ? ' (giữ người chơi, điểm về 0)' : ' (xoá danh sách người chơi)'}`);
    this.changed();
  }

  /** Admin đổi từ hiện tại (vd từ đang hỏi khó quá / không hay). Lượt đang chạy bỏ, không ai được điểm. */
  setWord(raw: string, now: number) {
    const word = canonicalWord(raw);
    if (!word) throw new Error('Từ phải gồm đúng 2 tiếng');
    if (!this.bank.has(word)) throw new Error(`"${word}" chưa có trong từ điển. Thêm ở tab Từ trước.`);
    if (this.phase === 'idle' || this.phase === 'ended') {
      if (!hasOpenContinuation(this.bank, word, new Set([word]))) throw new Error(`Không có từ nào nối tiếp được "${word}"`);
      this.pendingStartWord = word;
      this.log.info(`✏ Từ khởi đầu lần Bắt đầu tới: "${word}"`);
      this.changed();
      return;
    }
    if (this.round?.isFinalized && this.raceDone) throw new Error('Chặng cuối đã xong, cuộc đua sắp vinh danh');
    if (this.used.has(word) && word !== this.nextWord) throw new Error(`"${word}" đã dùng trong cuộc đua này`);
    if (!hasOpenContinuation(this.bank, word, new Set([...this.used, word]))) throw new Error(`Không còn từ nào nối tiếp được "${word}"`);
    if (this.round && !this.round.isFinalized) {
      // chặng đang dở bị huỷ (không ai được điểm), không tính vào số chặng
      this.roundNo = Math.max(0, this.roundNo - 1);
    } else if (this.nextWord && this.chain.at(-1)?.word === this.nextWord) {
      // đang hiện kết quả: từ hệ thống vừa chọn chưa chơi thì bỏ khỏi chuỗi
      this.chain.pop();
      this.used.delete(this.nextWord);
    }
    this.chain.push({ word, source: 'admin' });
    this.deps.emit('game:word_changed', { word, source: 'admin' });
    this.log.info(`✏ Admin đổi từ thành "${word}"`);
    if (this.phase === 'paused') {
      // hiện từ mới ngay, bấm Tiếp tục thì chặng mới bắt đầu (tắt máy lúc này cũng không mất)
      this.round = null;
      this.roundPhase = 'waiting';
      this.currentWord = word;
      this.nextWord = word;
      this.roundUnfinished = false; // bật lại máy: chơi từ nextWord, không trừ số chặng lần nữa
      this.used.add(word);
      this.changed();
      return;
    }
    this.beginRound(word, now);
  }

  updateConfig(patch: Partial<GameConfig>) {
    const next = { ...this.config };
    const num = (v: unknown, min: number, max: number, name: string) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} phải từ ${min} tới ${max}`);
      return n;
    };
    if (patch.seatCount !== undefined) {
      if (!SEAT_OPTIONS.includes(Number(patch.seatCount) as never)) throw new Error('Số ghế chỉ được 20, 40, 60, 80, 100');
      next.seatCount = Number(patch.seatCount) as GameConfig['seatCount'];
    }
    if (patch.roundSeconds !== undefined) next.roundSeconds = Math.round(num(patch.roundSeconds, 5, 120, 'Thời gian mỗi lượt'));
    if (patch.revealSeconds !== undefined) next.revealSeconds = Math.round(num(patch.revealSeconds, 1, 30, 'Thời gian hiện kết quả'));
    if (patch.lateGraceMs !== undefined) next.lateGraceMs = Math.round(num(patch.lateGraceMs, 0, 10_000, 'Bù độ trễ hình'));
    if (patch.maxWrongPerRound !== undefined) next.maxWrongPerRound = Math.round(num(patch.maxWrongPerRound, 1, 20, 'Số lần sai tối đa'));
    if (patch.scoreTiers !== undefined) {
      validateTiers(patch.scoreTiers);
      next.scoreTiers = patch.scoreTiers.map((t) => ({ from: t.from, to: t.to, points: t.points }));
    }
    if (patch.startWord !== undefined) {
      const w = patch.startWord.trim() ? canonicalWord(patch.startWord) : '';
      if (w === null) throw new Error('Từ khởi đầu phải gồm đúng 2 tiếng (hoặc để trống để tự chọn)');
      if (w && !this.bank.has(w)) throw new Error(`Từ khởi đầu "${w}" chưa có trong từ điển`);
      next.startWord = w;
    }
    if (patch.roundsPerRace !== undefined) next.roundsPerRace = Math.round(num(patch.roundsPerRace, 0, 500, 'Số chặng mỗi cuộc đua'));
    if (patch.raceBreakSeconds !== undefined) next.raceBreakSeconds = Math.round(num(patch.raceBreakSeconds, 10, 600, 'Thời gian vinh danh'));
    if (patch.voiceRate !== undefined) next.voiceRate = Math.round(num(patch.voiceRate, 0.7, 1.6, 'Tốc độ giọng') * 100) / 100;
    if (patch.voiceGender !== undefined) {
      if (patch.voiceGender !== 'f' && patch.voiceGender !== 'm') throw new Error('Giọng chỉ được f (nữ) hoặc m (nam)');
      next.voiceGender = patch.voiceGender;
    }
    for (const k of ['autoAdvance', 'effectsEnabled', 'soundEnabled', 'autoJoinOnAnswer', 'autoNewRace', 'voiceEnabled', 'voiceChatter'] as const) {
      if (patch[k] !== undefined) next[k] = !!patch[k];
    }
    this.config = next;
    // đang vinh danh mà tắt "tự mở cuộc đua mới": huỷ luôn cuộc đua đang chờ
    if (this.phase === 'ended' && !next.autoNewRace && this.nextRaceAt) this.nextRaceAt = 0;
    this.log.info('⚙ Đã lưu cấu hình');
    this.changed();
  }

  removePlayer(userId: string, ban: boolean) {
    const p = this.players.remove(userId, ban);
    if (!p && !ban) throw new Error('Không có người chơi này');
    // đáp án của họ trong chặng đang mở bị bỏ, người sau được đôn hạng
    if (this.round && !this.round.isFinalized) this.round.removeUser(userId);
    this.log.info(`${ban ? '⛔ Khoá' : '🗑 Xoá'} người chơi ${p?.nickname ?? userId}`);
    this.deps.emit('player:removed', { userId, nickname: p?.nickname ?? userId, banned: ban });
    this.deps.emit('leaderboard:updated');
    this.changed();
  }

  unbanPlayer(userId: string) {
    if (!this.players.unban(userId)) throw new Error('Tài khoản này không bị khoá');
    this.changed();
  }

  /** Admin vừa thêm từ vào ngân hàng: ai đã gửi từ đó trong lượt đang mở thì được tính đúng (theo đúng thứ tự gửi). */
  approveWordInRound(word: string, now: number): number {
    if (!this.round || this.round.isFinalized) return 0;
    // chỉ tính lại khi giờ từ đó thật sự hợp lệ (có trong từ điển, chưa dùng, đúng tiếng nối)
    if (!validateAnswer(this.bank, this.currentWord, word, this.used).ok) return 0;
    const before = new Set(this.round.provisional().map((e) => e.userId));
    const n = this.round.approveRejected(word);
    for (const e of this.round.provisional()) {
      if (before.has(e.userId) || this.players.get(e.userId)) continue;
      this.join({ userId: e.userId, uniqueId: e.uniqueId, nickname: e.nickname, avatar: e.avatar, source: e.isMock ? 'mock' : 'tiktok' }, now);
    }
    if (n) {
      this.log.info(`✅ Duyệt "${word}" giữa lượt: ${n} người được tính đúng`);
      this.changed();
    }
    return n;
  }

  /** Admin vừa xoá / đánh dấu không hợp lệ 1 từ: đáp án dùng từ đó trong chặng đang mở bị bỏ */
  revokeInvalidInRound(): number {
    if (!this.round || this.round.isFinalized) return 0;
    const n = this.round.dropInvalid((w) => this.bank.has(w));
    if (n) {
      this.log.info(`🚫 Bỏ ${n} đáp án dùng từ vừa bị đánh dấu không hợp lệ`);
      this.changed();
    }
    return n;
  }

  /** Vừa kết nối TikTok thật: bỏ người chơi giả để không lên bục vinh danh trên live */
  removeMockPlayers(): number {
    const n = this.players.removeMock();
    if (n) {
      this.log.info(`🧹 Bỏ ${n} người chơi giả`);
      this.changed();
    }
    return n;
  }

  // =========================================================
  //  Sự kiện từ TikTok (đã chuẩn hoá + chống trùng ở tầng live)
  // =========================================================

  handleComment(c: LiveComment) {
    const now = c.receivedAt;
    this.stats.commentsReceived++;
    if (this.players.isBanned(c.userId)) return;

    this.players.touch(c.userId, now);
    if (isJoinComment(c.text)) this.join(c, now);

    // tạm dừng vẫn nhận: người xem thấy hình trễ, đáp án gửi trước lúc dừng tới server trong lúc dừng
    if ((this.phase !== 'running' && this.phase !== 'paused') || !this.round || this.round.isFinalized) return;
    if (this.roundPhase !== 'answering' && this.roundPhase !== 'locking') return;

    const parsed = parseAnswer(c.text, this.round.linkSyllable);
    if (parsed.kind !== 'answer') return;

    const player = this.players.get(c.userId);
    if (!player && !this.config.autoJoinOnAnswer) return;

    const { at, sortAt } = this.clock.convert(c.createTime, c.receivedAt);
    const v = validateAnswer(this.bank, this.currentWord, parsed.word, this.used);
    const entry = {
      userId: c.userId,
      uniqueId: c.uniqueId,
      isMock: c.source === 'mock',
      nickname: c.nickname,
      avatar: c.avatar,
      syllable: parsed.syllable,
      word: parsed.word,
      at,
      sortAt,
      seq: ++this.seq,
    };
    const res = this.round.submit(entry, v);

    if (res === 'accepted') {
      if (!player) this.join(c, now);
      this.stats.answersAccepted++;
      const rank = this.round.provisional().findIndex((e) => e.userId === c.userId) + 1;
      this.log.debug(`✓ ${c.nickname} "${parsed.word}" hạng tạm ${rank} (at=${at}, msg=${c.msgId})`);
      this.deps.emit('answer:accepted', { userId: c.userId, nickname: maskBanned(c.nickname), avatar: c.avatar, rank });
      this.changed();
    } else if (res === 'rejected' && !v.ok) {
      this.stats.answersRejected++;
      this.log.debug(`✗ ${c.nickname} "${parsed.word}" (${v.reason})`);
      this.deps.emit('answer:rejected', { nickname: c.nickname, word: parsed.word, reason: v.reason });
      this.changed();
    } else {
      this.log.debug(`· ${c.nickname} "${parsed.word}" bỏ qua: ${res}`);
    }
  }

  handleGift(g: LiveGift) {
    if (this.players.isBanned(g.userId)) return;
    this.deps.emit('gift:received', {
      userId: g.userId,
      nickname: maskBanned(g.nickname),
      avatar: g.avatar,
      giftName: g.giftName,
      repeatCount: g.repeatCount,
      diamondCount: g.diamondCount,
    });
  }

  private join(p: { userId: string; uniqueId: string; nickname: string; avatar: string; source?: string }, now: number) {
    const r = this.players.join({ ...p, isMock: p.source === 'mock' }, now);
    if (r === 'joined') {
      const seated = this.players.newcomerSeated(this.config.seatCount);
      this.log.debug(`+ ${p.nickname} vào game (${seated ? 'có ghế' : 'hàng chờ'})`);
      this.deps.emit('player:joined', { userId: p.userId, nickname: maskBanned(p.nickname), avatar: p.avatar, seated });
      this.changed();
    }
  }

  // =========================================================
  //  Nhịp game: server gọi tick() vài lần mỗi giây
  // =========================================================

  tick(now: number) {
    if (this.phase === 'ended' && this.nextRaceAt && now >= this.nextRaceAt) {
      this.nextRaceAt = 0;
      if (this.config.autoNewRace) this.start(now);
      return;
    }
    if (this.phase !== 'running') return;
    const r = this.round;
    if (r && this.roundPhase === 'answering' && now >= r.endsAt) {
      this.roundPhase = 'locking';
      this.changed();
    }
    if (r && this.roundPhase === 'locking' && now >= r.endsAt + this.config.lateGraceMs + ARRIVAL_BUFFER_MS) this.finishRound(now);
    if (this.roundPhase === 'reveal' && now >= this.revealEndsAt) {
      // chặng cuối: vinh danh luôn; còn thì sang chặng mới (hoặc chờ admin nếu tắt tự chuyển)
      if (this.raceDone || this.config.autoAdvance) this.advance(now);
      else {
        this.roundPhase = 'waiting';
        this.changed();
      }
    } else if (this.roundPhase === 'waiting' && r?.isFinalized && (this.config.autoAdvance || this.raceDone)) {
      // admin vừa bật lại tự chuyển chặng / vừa giảm số chặng
      this.advance(now);
    }
  }

  private beginRound(word: string, now: number) {
    // bí đường: không còn từ nào nối tiếp được thì đổi sang từ khởi đầu mới
    this.used.add(word);
    if (!hasOpenContinuation(this.bank, word, this.used)) {
      const jump = pickStartWord(this.bank, this.used, this.rng);
      this.log.info(`🧗 "${word}" bí đường, đổi sang "${jump}"`);
      this.chain.push({ word: jump, source: 'jump' });
      this.deps.emit('game:word_changed', { word: jump, source: 'jump' });
      word = jump;
      this.used.add(word);
    }
    this.currentWord = word;
    this.nextWord = '';
    this.roundUnfinished = true;
    this.roundNo++;
    this.round = new Round(
      this.roundNo,
      word,
      now,
      now + this.config.roundSeconds * 1000,
      this.config.maxWrongPerRound,
      this.config.lateGraceMs,
    );
    this.roundPhase = 'answering';
    this.deps.emit('game:round_started', { roundNo: this.roundNo, word, linkSyllable: this.round.linkSyllable, endsAt: this.round.endsAt });
    this.changed();
  }

  /** Chốt chặng. `forceFinal`: admin bấm Kết thúc giữa chặng. Chặng cuối thì không chọn từ tiếp theo. */
  private finishRound(now: number, forceFinal = false) {
    const round = this.round!;
    const final = forceFinal || this.raceDone;
    this.lastRejected = round.rejectedSummary();
    // chốt chặt: từ vừa bị admin đánh dấu không hợp lệ, người vừa bị xoá / khoá thì không được tính
    round.dropInvalid((w) => this.bank.has(w));
    for (const e of round.provisional()) if (!this.players.get(e.userId)) round.removeUser(e.userId);
    const winners = round.finalize(this.config.scoreTiers);
    const updates: { userId: string; gain: number; score: number }[] = [];
    for (const w of winners) {
      if (!this.players.get(w.userId)) continue; // bị xoá giữa lượt
      this.players.award(w.userId, w.points, round.no, now);
      updates.push({ userId: w.userId, gain: w.points, score: this.players.get(w.userId)!.score });
    }
    const choice: { word: string; source: RoundResult['nextSource'] } = final
      ? { word: '', source: 'end' }
      : chooseNextWord(this.currentWord, this.bank, this.used, this.rng);
    const result: RoundResult = {
      no: round.no,
      word: round.word,
      nextWord: choice.word,
      nextSource: choice.source,
      winners: winners.map((w) => ({ ...w, nickname: maskBanned(w.nickname) })),
      distinctAnswers: [...new Set(winners.map((w) => w.word))],
      endedAt: now,
    };
    if (!final) {
      this.chain.push({ word: choice.word, source: choice.source });
      this.used.add(choice.word);
    }
    this.nextWord = choice.word;
    this.roundUnfinished = false;
    this.lastResult = result;
    this.history.push(result);
    if (this.history.length > 30) this.history.shift();
    this.roundPhase = 'reveal';
    this.revealEndsAt = now + this.config.revealSeconds * 1000;
    this.log.info(
      `⛰ Chặng ${round.no} "${round.word}": ${winners.length} người đúng${final ? ' (chặng cuối)' : `, từ tiếp "${choice.word}" (${choice.source})`}`,
    );
    this.deps.emit('game:round_ended', result);
    if (updates.length) this.deps.emit('player:score_updated', updates);
    this.deps.emit('leaderboard:updated');
    if (!final) this.deps.emit('game:word_changed', { word: choice.word, source: choice.source });
    this.deps.onRoundEnded?.(this.sessionId, result);
    this.changed();
  }

  // =========================================================
  //  Ảnh chụp trạng thái
  // =========================================================

  overlayState(now: number, live: OverlayState['live']): OverlayState {
    const r = this.round;
    const remaining = r ? Math.max(0, r.endsAt - (this.phase === 'paused' ? this.pausedAt : now)) : 0;
    const seatCount = this.config.seatCount;
    const answering = !!r && !r.isFinalized && this.phase !== 'ended';
    // tạm dừng mà chưa có chặng (admin vừa đổi từ / vừa bật lại máy): hiện từ sắp chơi, đồng hồ đầy
    const upcoming = !r && this.phase === 'paused';
    const shownWord = upcoming ? this.nextWord || this.currentWord : this.currentWord || this.nextWord || this.config.startWord;
    return {
      serverNow: now,
      sessionId: this.sessionId,
      phase: this.phase,
      roundPhase: upcoming ? 'answering' : this.roundPhase,
      roundNo: upcoming ? this.roundNo + 1 : this.roundNo,
      word: shownWord,
      linkSyllable: shownWord.split(' ')[1] ?? '',
      roundEndsAt: r?.endsAt ?? 0,
      remainingMs: upcoming ? this.config.roundSeconds * 1000 : remaining,
      roundTotalMs: r?.durationMs ?? this.config.roundSeconds * 1000,
      provisional: answering
        ? r!.provisional().slice(0, 30).map((e) => ({ userId: e.userId, nickname: maskBanned(e.nickname), avatar: e.avatar, rank: e.rank }))
        : [],
      lastResult: this.lastResult,
      chain: this.chain.slice(-MAX_CHAIN_VIEW),
      chainStart: Math.max(0, this.chain.length - MAX_CHAIN_VIEW),
      seats: this.players.views(seatCount, seatCount).map(maskView),
      waitingCount: Math.max(0, this.players.count - seatCount),
      totalPlayers: this.players.count,
      config: {
        seatCount,
        effectsEnabled: this.config.effectsEnabled,
        soundEnabled: this.config.soundEnabled,
        roundSeconds: this.config.roundSeconds,
        scoreTiers: this.config.scoreTiers,
        roundsPerRace: this.config.roundsPerRace,
      },
      winners: this.winners?.map(maskView) ?? null,
      raceNo: this.raceNo,
      nextRaceAt: this.nextRaceAt,
      live,
    };
  }

  adminState(now: number, extra: Pick<AdminState, 'live' | 'mockAllowed' | 'logs'>): AdminState {
    const base = this.overlayState(now, { isConnected: extra.live.isConnected, viewerCount: extra.live.viewerCount });
    const r = this.round;
    return {
      ...base,
      ...extra,
      fullConfig: this.config,
      // phòng rất đông: chỉ gửi 500 người đầu bảng (gửi hết vài nghìn người 8 lần/giây làm nghẽn trang admin)
      players: this.players.views(this.config.seatCount, 500),
      bannedUsers: this.players.bannedList(),
      currentAnswers: r && !r.isFinalized ? r.provisional().map((e) => ({ nickname: e.nickname, word: e.word, rank: e.rank })) : [],
      rejected: r && !r.isFinalized ? r.rejectedSummary() : (this.lastRejected ?? []),
      stats: { ...this.stats },
      usedWordCount: this.used.size,
      chainFull: this.chain.slice(-300),
      bankSize: this.bank.size,
      sessionStartedAt: this.sessionStartedAt,
    };
  }
  private lastRejected: AdminState['rejected'] | null = null;

  record(now: number): SessionRecord {
    return {
      id: this.sessionId,
      startedAt: this.sessionStartedAt,
      endedAt: this.phase === 'ended' || this.roundNo > 0 ? now : null,
      config: this.config,
      rounds: this.roundNo,
      chain: this.chain,
      ranking: this.players.views(this.config.seatCount),
      winners: this.winners ?? this.players.views(this.config.seatCount, 4),
    };
  }

  snapshot(): EngineSnapshot {
    return {
      version: 1,
      sessionId: this.sessionId,
      sessionStartedAt: this.sessionStartedAt,
      phase: this.phase,
      roundNo: this.roundNo,
      currentWord: this.currentWord,
      nextWord: this.nextWord,
      roundUnfinished: this.roundUnfinished,
      config: this.config,
      players: this.players.toJSON(),
      chain: this.chain,
      used: [...this.used],
      lastResult: this.lastResult,
      winners: this.winners,
      raceNo: this.raceNo,
      nextRaceAt: this.nextRaceAt,
    };
  }

  /**
   * Bật lại server: khôi phục điểm, chuỗi từ. Game đang chạy thì về TẠM DỪNG, admin bấm Tiếp tục.
   * Lượt đang chạy dở bị chơi lại (đáp án của lượt đó chưa cộng điểm nên không mất gì).
   */
  restore(s: EngineSnapshot, now: number) {
    if (s?.version !== 1) throw new Error('Ảnh chụp không đúng phiên bản');
    this.sessionId = s.sessionId;
    this.sessionStartedAt = s.sessionStartedAt;
    this.config = { ...structuredClone(DEFAULT_CONFIG), ...s.config };
    this.players.restore(s.players, now);
    this.chain = s.chain ?? [];
    this.used = new Set(s.used ?? []);
    this.lastResult = s.lastResult ?? null;
    this.winners = s.winners ?? null;
    this.raceNo = s.raceNo ?? (s.roundNo ? 1 : 0);
    // đang nghỉ giữa 2 cuộc đua: bật lại thì cho thêm 15 giây rồi mở cuộc đua mới
    this.nextRaceAt = s.phase === 'ended' && s.nextRaceAt ? Math.max(s.nextRaceAt, now + 15_000) : 0;
    this.roundNo = s.roundNo ?? 0;
    this.currentWord = s.currentWord ?? '';
    this.round = null;
    this.roundPhase = 'waiting';
    if (s.phase === 'running' || s.phase === 'paused') {
      this.phase = 'paused';
      this.pausedAt = now;
      this.nextWord = s.roundUnfinished ? s.currentWord : s.nextWord || s.currentWord;
      if (s.roundUnfinished) this.roundNo = Math.max(0, this.roundNo - 1);
    } else {
      this.phase = s.phase;
      this.nextWord = s.nextWord ?? '';
    }
  }
}

function maskView(p: PlayerView): PlayerView {
  return { ...p, nickname: maskBanned(p.nickname) };
}

export type { Player };
