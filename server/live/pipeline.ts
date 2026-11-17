import type { LiveComment, LiveGift } from '../../shared/types';
import type { PhanXiPangEngine } from '../game/phan-xi-pang-engine';
import type { Logger } from '../logger';
import { EventDeduper } from './event-deduper';

/**
 * Cửa duy nhất đưa sự kiện live vào game: TikTok thật và giả lập đều đi qua đây.
 *   chuẩn hoá (cắt dài, bỏ ký tự điều khiển) -> chống trùng theo msgId -> game engine
 * Engine chạy trên 1 luồng Node nên bình luận tới gần như cùng lúc vẫn được xử lý lần lượt, không giành nhau.
 */
export class LivePipeline {
  private comments = new EventDeduper(10_000);
  private gifts = new EventDeduper(2_000);

  constructor(
    private readonly engine: PhanXiPangEngine,
    private readonly log: Logger,
  ) {}

  comment(raw: LiveComment) {
    const c: LiveComment = {
      ...raw,
      userId: clean(raw.userId, 80),
      uniqueId: clean(raw.uniqueId, 80),
      nickname: clean(raw.nickname, 60) || 'Bạn',
      avatar: /^https?:\/\//.test(raw.avatar) ? raw.avatar.slice(0, 600) : '',
      text: clean(raw.text, 200),
    };
    if (!c.userId) return;
    if (!this.comments.check(`${c.source}:${c.msgId}`)) {
      this.engine.stats.duplicatesDropped++;
      this.log.debug(`bỏ bình luận trùng ${c.msgId} (${c.nickname}: ${c.text})`);
      return;
    }
    try {
      this.engine.handleComment(c);
    } catch (err) {
      this.log.error(`Lỗi xử lý bình luận của ${c.nickname}`, err);
    }
  }

  gift(g: LiveGift) {
    if (!this.gifts.check(`${g.source}:${g.msgId}`)) return;
    try {
      this.engine.handleGift({ ...g, nickname: clean(g.nickname, 60), giftName: clean(g.giftName, 40) });
    } catch (err) {
      this.log.error('Lỗi xử lý quà', err);
    }
  }
}

const clean = (s: unknown, max: number) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
