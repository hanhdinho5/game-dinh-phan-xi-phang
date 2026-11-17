import type { LiveComment } from '../../shared/types';
import type { PhanXiPangEngine } from '../game/phan-xi-pang-engine';
import type { WordBank } from '../game/word-bank';
import type { LivePipeline } from './pipeline';

/**
 * Chế độ giả lập: thử gameplay khi chưa LIVE. Sự kiện giả đi qua đúng đường của TikTok thật (pipeline),
 * gắn source = 'mock' và userId "mock_..." để không lẫn vào hồ sơ người chơi thật.
 * Server CHẶN giả lập khi đang kết nối TikTok thật (không cho người chơi giả chen vào phiên live).
 */
const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ'];
const TEN = ['Lan Anh', 'Minh Tuấn', 'Thu Trang', 'Quốc Bảo', 'Ngọc Hân', 'Gia Huy', 'Khánh Linh', 'Hải Yến', 'Đức Anh', 'Bảo Ngọc', 'Thanh Hà', 'Văn Toàn', 'Mai Chi'];
const CHAT = ['hay quá', 'khó ghê', 'hihi', 'ủa', 'đẹp', 'xấu', 'ngon', 'ok', 'cố lên', 'leo núi thôi'];

export class MockLive {
  private seq = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly pipeline: LivePipeline,
    private readonly engine: PhanXiPangEngine,
    private readonly bank: WordBank,
  ) {}

  private fake(i: number) {
    return {
      userId: `mock_${i}`,
      uniqueId: `mock_${i}`,
      nickname: `${HO[i % HO.length]} ${TEN[(i * 7) % TEN.length]}`,
      avatar: '',
    };
  }

  comment(p: { userId: string; uniqueId: string; nickname: string; avatar: string }, text: string, createTime = Date.now()) {
    const c: LiveComment = { ...p, msgId: `mock-${++this.seq}`, text, createTime, receivedAt: Date.now(), source: 'mock' };
    this.pipeline.comment(c);
  }

  /** n người giả cùng bình luận "join" */
  join(n: number) {
    const start = this.engine.players.count + 1;
    for (let i = 0; i < n; i++) this.comment(this.fake(start + i + Math.floor(Math.random() * 1e6)), 'join');
  }

  /**
   * `count` người giả trả lời trong `spreadMs`: tỉ lệ `correctRatio` gửi đáp án đúng (chọn từ ngân hàng),
   * còn lại đoán sai / nói chuyện. Bình luận tới server trễ 200-1500ms và lệch thứ tự như TikTok thật.
   */
  answers(count: number, correctRatio: number, spreadMs: number) {
    const link = this.engine.round?.linkSyllable;
    if (!link) throw new Error('Chưa có lượt nào đang chạy');
    const all = this.bank.continuations(link).filter((w) => !this.engine.used.has(w));
    // người thật hay nghĩ ra từ phổ biến trước
    const common = all.filter((w) => this.bank.isCommon(w));
    const good = common.length >= 3 ? common : [...common, ...all.filter((w) => !common.includes(w))];
    // người đã có trong game được ưu tiên trả lời, thiếu thì thêm người mới
    const existing = this.engine.players.ranking().filter((p) => p.isMock);
    const t0 = Date.now();
    for (let i = 0; i < count; i++) {
      const who = existing[i] ?? this.fake(10_000 + Math.floor(Math.random() * 1e6));
      const sentAt = t0 + Math.random() * spreadMs;
      const lag = 200 + Math.random() * 1300;
      const r = Math.random();
      const text =
        r < correctRatio && good.length
          ? good[Math.floor(Math.random() * Math.min(good.length, 6))].split(' ')[1]
          : r < correctRatio + (1 - correctRatio) / 2
            ? CHAT[Math.floor(Math.random() * CHAT.length)]
            : `${link} ${CHAT[Math.floor(Math.random() * CHAT.length)]}`;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.comment({ userId: who.userId, uniqueId: who.uniqueId, nickname: who.nickname, avatar: who.avatar }, text, sentAt);
      }, sentAt - t0 + lag);
      this.timers.add(timer);
    }
    return { valid: good.length };
  }

  gift() {
    const p = this.fake(Math.floor(Math.random() * 50));
    this.pipeline.gift({ ...p, msgId: `mock-gift-${++this.seq}`, giftName: 'Hoa hồng', diamondCount: 1, repeatCount: 1, receivedAt: Date.now(), source: 'mock' });
  }

  stopAll() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
