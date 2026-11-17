// Kiểu dữ liệu dùng chung server <-> overlay <-> admin.

/** Một bậc điểm: hạng từ `from` tới `to` (tính cả 2 đầu) được `points` điểm. */
export interface ScoreTier {
  from: number;
  to: number;
  points: number;
}

export type SeatCount = 20 | 40 | 60 | 80 | 100;
export const SEAT_OPTIONS: SeatCount[] = [20, 40, 60, 80, 100];

export interface GameConfig {
  seatCount: SeatCount;
  /** thời gian nhận câu trả lời mỗi lượt (giây) */
  roundSeconds: number;
  /** thời gian hiện kết quả lượt trước khi sang lượt mới (giây) */
  revealSeconds: number;
  /**
   * Bù độ trễ hình TikTok LIVE (ms): người xem thấy đồng hồ về 0 muộn hơn máy chủ kênh vài giây,
   * nên vẫn nhận bình luận GỬI trong khoảng này sau khi hết giờ.
   */
  lateGraceMs: number;
  scoreTiers: ScoreTier[];
  /** từ khởi đầu ("học sinh"); rỗng = hệ thống tự chọn từ phổ biến */
  startWord: string;
  autoAdvance: boolean;
  effectsEnabled: boolean;
  soundEnabled: boolean;
  /** số lần gửi sai tối đa mỗi người mỗi lượt (chống spam đoán bừa) */
  maxWrongPerRound: number;
  /** trả lời đúng mà chưa "join" thì tự cho vào game */
  autoJoinOnAnswer: boolean;
  /** số chặng mỗi cuộc đua, hết thì tự kết thúc + vinh danh (0 = admin tự bấm Kết thúc) */
  roundsPerRace: number;
  /** kết thúc xong thì tự mở cuộc đua mới (giữ người chơi, điểm về 0) */
  autoNewRace: boolean;
  /** thời gian vinh danh + chuẩn bị trước cuộc đua mới (giây) */
  raceBreakSeconds: number;
  // ---------- giọng MC ----------
  voiceEnabled: boolean;
  /** f = giọng nữ (HoaiMy), m = giọng nam (NamMinh) */
  voiceGender: 'f' | 'm';
  voiceRate: number;
  /** MC nói thêm: chào người mới, cảm ơn quà, khen dẫn đầu, nhắc luật */
  voiceChatter: boolean;
}

export const DEFAULT_CONFIG: GameConfig = {
  seatCount: 40,
  roundSeconds: 15,
  revealSeconds: 5,
  lateGraceMs: 3000,
  scoreTiers: [
    { from: 1, to: 1, points: 9 },
    { from: 2, to: 2, points: 7 },
    { from: 3, to: 3, points: 5 },
    { from: 4, to: 4, points: 3 },
    { from: 5, to: 10, points: 2 },
    { from: 11, to: 20, points: 1 },
  ],
  startWord: 'học sinh',
  autoAdvance: true,
  effectsEnabled: true,
  soundEnabled: true,
  maxWrongPerRound: 3,
  autoJoinOnAnswer: true,
  roundsPerRace: 0,
  autoNewRace: true,
  raceBreakSeconds: 30,
  voiceEnabled: true,
  voiceGender: 'f',
  voiceRate: 1.15,
  voiceChatter: true,
};

export type GamePhase = 'idle' | 'running' | 'paused' | 'ended';
/** answering: đang nhận; locking: hết giờ, chờ bình luận tới trễ; reveal: hiện kết quả; waiting: chờ admin bấm lượt tiếp */
export type RoundPhase = 'answering' | 'locking' | 'reveal' | 'waiting';

export interface PlayerView {
  userId: string;
  uniqueId: string;
  nickname: string;
  avatar: string;
  score: number;
  correct: number;
  /** thứ hạng hiện tại (1 = cao nhất) */
  rank: number;
  seated: boolean;
  joinedAt: number;
  /** điểm cộng ở lượt vừa chốt (để overlay làm hiệu ứng +9) */
  lastGain: number;
  lastGainRound: number;
  isMock: boolean;
}

export interface RoundWinner {
  rank: number;
  userId: string;
  nickname: string;
  avatar: string;
  answer: string; // tiếng người đó gửi (chuẩn hoá)
  word: string; // từ ghép tạo thành
  points: number;
  at: number; // giờ dùng để xếp thứ tự
}

export interface RoundResult {
  no: number;
  word: string; // từ của lượt đó
  nextWord: string;
  /** từ tiếp theo do hệ thống chọn: auto = hệ thống chọn ngẫu nhiên; jump = đổi sang từ mới (bí đường);
   *  admin = admin đổi; end = chặng cuối của cuộc đua (không có từ tiếp, nextWord rỗng) */
  nextSource: 'auto' | 'jump' | 'admin' | 'end';
  winners: RoundWinner[];
  distinctAnswers: string[];
  endedAt: number;
}

export interface ChainItem {
  word: string;
  source: RoundResult['nextSource'] | 'start';
}

export interface LiveStatus {
  isConnected: boolean;
  isConnecting: boolean;
  username: string;
  roomId: string;
  viewerCount: number;
  error: string;
  /** tài khoản đang cần giữ kết nối (kể cả lúc rớt mạng đang chờ tự nối lại); rỗng = admin đã ngắt */
  target: string;
}

/** Ảnh chụp trạng thái gửi cho overlay. Không chứa đáp án của lượt đang chạy. */
export interface OverlayState {
  serverNow: number;
  sessionId: string;
  phase: GamePhase;
  roundPhase: RoundPhase;
  roundNo: number;
  word: string;
  linkSyllable: string;
  roundEndsAt: number;
  /** còn bao nhiêu ms (dùng khi đang tạm dừng) */
  remainingMs: number;
  roundTotalMs: number;
  /** những người đã nối đúng trong lượt (tạm tính, chưa có đáp án) */
  provisional: { userId: string; nickname: string; avatar: string; rank: number }[];
  /** những người đã gửi đáp án SAI trong lượt (chỉ người + avatar, không lộ đáp án), cũ -> mới; tối đa 30 */
  wrong: { userId: string; nickname: string; avatar: string }[];
  /** số người sai (đầy đủ) */
  wrongCount: number;
  /** dấu trên avatar của người đang ngồi ghế: ok = đã nối đúng, bad = đã gửi sai (chỉ trong lúc chặng chạy) */
  marks: Record<string, 'ok' | 'bad'>;
  lastResult: RoundResult | null;
  chain: ChainItem[];
  /** vị trí của chain[0] trong cả chuỗi (làm key ổn định cho hiệu ứng) */
  chainStart: number;
  seats: PlayerView[];
  waitingCount: number;
  totalPlayers: number;
  config: Pick<GameConfig, 'seatCount' | 'effectsEnabled' | 'soundEnabled' | 'roundSeconds' | 'scoreTiers' | 'roundsPerRace'>;
  /** Top 4 khi kết thúc (vinh danh) */
  winners: PlayerView[] | null;
  /** cuộc đua thứ mấy kể từ khi bật server / phiên */
  raceNo: number;
  /** lúc tự mở cuộc đua mới (0 = không tự mở) */
  nextRaceAt: number;
  /** overlay nào đang là "loa" (tầng socket điền vào) */
  speaker?: { socketId: string | null; count: number };
  live: Pick<LiveStatus, 'isConnected' | 'viewerCount'>;
}

export interface RejectedSummary {
  word: string; // từ ghép người chơi định nối
  syllable: string;
  count: number;
  reason: RejectReason;
}

export type RejectReason = 'not_in_bank' | 'used' | 'banned_word' | 'same_word';

export interface LogEntry {
  at: number;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

/** Trạng thái đầy đủ cho trang admin. */
export interface AdminState extends OverlayState {
  fullConfig: GameConfig;
  players: PlayerView[];
  bannedUsers: { userId: string; nickname: string }[];
  /** đáp án hợp lệ đã nhận trong lượt đang chạy (chỉ admin thấy) */
  currentAnswers: { nickname: string; word: string; rank: number }[];
  rejected: RejectedSummary[];
  live: LiveStatus;
  mockAllowed: boolean;
  stats: { commentsReceived: number; duplicatesDropped: number; answersAccepted: number; answersRejected: number };
  usedWordCount: number;
  /** cả chuỗi từ của phiên (tối đa 300 từ gần nhất) */
  chainFull: ChainItem[];
  bankSize: number;
  sessionStartedAt: number;
  logs: LogEntry[];
}

/** Sự kiện chuẩn hoá từ TikTok (hoặc giả lập) trước khi đưa vào game engine. */
export interface LiveComment {
  msgId: string;
  userId: string;
  uniqueId: string;
  nickname: string;
  avatar: string;
  text: string;
  /** giờ TikTok gắn lúc người xem gửi (ms), 0 nếu không có */
  createTime: number;
  /** giờ server nhận (ms) */
  receivedAt: number;
  source: 'tiktok' | 'mock';
}

export interface LiveGift {
  msgId: string;
  userId: string;
  uniqueId: string;
  nickname: string;
  avatar: string;
  giftName: string;
  diamondCount: number;
  repeatCount: number;
  receivedAt: number;
  source: 'tiktok' | 'mock';
}

// ---------- Sự kiện Socket.IO ----------
export interface ServerToClientEvents {
  'game:state': (s: OverlayState) => void;
  'admin:state': (s: AdminState) => void;
  'game:started': (d: { sessionId: string }) => void;
  'game:paused': () => void;
  'game:resumed': () => void;
  'game:ended': (d: { winners: PlayerView[] }) => void;
  'game:round_started': (d: { roundNo: number; word: string; linkSyllable: string; endsAt: number }) => void;
  'game:round_ended': (r: RoundResult) => void;
  'game:word_changed': (d: { word: string; source: RoundResult['nextSource'] }) => void;
  'player:joined': (p: { userId: string; nickname: string; avatar: string; seated: boolean }) => void;
  'player:removed': (p: { userId: string; nickname: string; banned: boolean }) => void;
  'player:score_updated': (d: { userId: string; gain: number; score: number }[]) => void;
  'leaderboard:updated': () => void;
  'answer:accepted': (d: { userId: string; nickname: string; avatar: string; rank: number }) => void;
  'answer:rejected': (d: { nickname: string; word: string; reason: RejectReason }) => void;
  'winner:announced': (d: { winners: PlayerView[] }) => void;
  'gift:received': (d: { userId: string; nickname: string; avatar: string; giftName: string; repeatCount: number; diamondCount: number }) => void;
  /** câu MC đọc: chỉ overlay được chọn làm "loa" phát */
  'voice:say': (l: VoiceLine) => void;
  /** overlay nào đang được phát tiếng (mở 2 overlay thì chỉ cái mở sau cùng nói, tránh 2 giọng đè nhau) */
  'voice:speaker': (d: { socketId: string | null; count: number }) => void;
  /** bỏ 1 câu đang chờ / đang đọc (vd "Tất cả chuẩn bị" khi admin huỷ cuộc đua mới) */
  'voice:cancel': (d: { id: number }) => void;
}

export interface VoiceLine {
  id: number;
  /** "|" tách đoạn (ngắt nghỉ), "^" đầu đoạn = hô to hơn */
  text: string;
  /** main: lời dẫn chính (đọc đề, kết quả, vinh danh) - xếp hàng, bỏ hết câu phụ đang chờ.
   *  chatter: nói thêm (chào, cảm ơn) - chỉ đọc khi rảnh, quá hạn thì bỏ */
  kind: 'main' | 'chatter';
  /** quá giờ này (giờ server) mà chưa tới lượt đọc thì bỏ */
  expiresAt: number;
  /** bỏ cả các câu chính đang chờ (vinh danh) */
  flush?: boolean;
  /** chen lên đầu hàng (admin gõ cho MC đọc) */
  front?: boolean;
  voice: 'f' | 'm';
  rate: number;
}

export interface AckResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}
type Ack = (r: AckResult) => void;

export interface WordSearchResult {
  word: string;
  origin: 'base' | 'custom';
  common: boolean;
  banned: boolean;
  used: boolean;
}

export interface SessionSummary {
  id: string;
  startedAt: number;
  endedAt: number | null;
  rounds: number;
  players: number;
  winner: string | null;
}

export interface ClientToServerEvents {
  'admin:start': (ack: Ack) => void;
  'admin:pause': (ack: Ack) => void;
  'admin:resume': (ack: Ack) => void;
  'admin:next_round': (ack: Ack) => void;
  'admin:end': (ack: Ack) => void;
  'admin:reset': (opts: { keepPlayers: boolean }, ack: Ack) => void;
  'admin:update_config': (patch: Partial<GameConfig>, ack: Ack) => void;
  'admin:set_word': (word: string, ack: Ack) => void;
  'admin:remove_player': (d: { userId: string; ban: boolean }, ack: Ack) => void;
  'admin:unban_player': (userId: string, ack: Ack) => void;
  'admin:word_search': (q: string, ack: Ack) => void;
  'admin:word_add': (d: { word: string; common: boolean }, ack: Ack) => void;
  'admin:word_edit': (d: { from: string; to: string }, ack: Ack) => void;
  'admin:word_delete': (word: string, ack: Ack) => void;
  'admin:word_ban': (d: { word: string; banned: boolean }, ack: Ack) => void;
  'admin:sessions': (ack: Ack) => void;
  'admin:tiktok_connect': (username: string, ack: Ack) => void;
  'admin:tiktok_disconnect': (ack: Ack) => void;
  'mock:join': (n: number, ack: Ack) => void;
  'mock:answers': (d: { count: number; correctRatio: number; spreadMs: number }, ack: Ack) => void;
  'mock:comment': (d: { userId?: string; nickname?: string; text: string }, ack: Ack) => void;
  'mock:gift': (ack: Ack) => void;
  'admin:speak': (text: string, ack: Ack) => void;
  'admin:cancel_next_race': (ack: Ack) => void;
}
