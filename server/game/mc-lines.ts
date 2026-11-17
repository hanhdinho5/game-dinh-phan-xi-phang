/**
 * Lời MC (người dẫn chương trình). Mỗi nhóm nhiều câu, bốc kiểu xáo bài (LineBag) nên ít lặp.
 * Quy ước trong câu:  "|" = ngắt nghỉ (đọc thành đoạn riêng),  "^" đầu đoạn = hô to hơn.
 * Viết câu NGẮN: người xem thấy hình trễ, MC nói dài thì đè sang chặng sau.
 * Không có dấu gạch ngang dài, không đọc nguyên văn bình luận của người xem.
 */
type L0 = string[];
type L1 = ((a: string) => string)[];
type L2 = ((a: string, b: string) => string)[];
type L3 = ((a: string, b: string, c: string) => string)[];

export const MC = {
  raceStart: [
    (n) => `^Cuộc đua số ${n} bắt đầu!`,
    (n) => `^Xin chào cả nhà! Cuộc đua số ${n} chính thức bắt đầu!`,
  ] as L1,

  /** đọc đề: chặng, từ, tiếng cần nối */
  ask: [
    (n, w, l) => `Chặng ${n}: ${w}. | Nối tiếp chữ ${l}!`,
    (n, w, l) => `Chặng ${n}. Từ hiện tại: ${w}. | Nối chữ ${l}!`,
  ] as L3,

  /** chặng đầu tiên (đi sau lời chào xuất phát) */
  askFirst: [(w, l) => `Từ đầu tiên: ${w}. | Nối tiếp chữ ${l}!`] as L2,

  adminChanged: ['Ban tổ chức đổi từ.'] as L0,
  deadEndJump: ['Đổi sang từ mới.'] as L0,

  /** kết quả: người nhanh nhất + điểm */
  winner: [
    (name, pts) => `^${name} nhanh nhất, cộng ${pts} điểm!`,
    (name, pts) => `^${name} về nhất, cộng ${pts} điểm!`,
  ] as L2,
  manyCorrect: [(n) => `${n} người nối đúng.`] as L1,
  nextWord: [(w) => `Từ tiếp theo: ${w}.`] as L1,
  nobody: [(w) => `Chưa ai nối được. | Từ tiếp theo: ${w}.`] as L1,
  jump: [(w) => `Đổi sang từ mới: ${w}.`] as L1,
  nobodyFinal: ['Chưa ai nối được.'] as L0,

  // ---------- nói thêm (chỉ khi rảnh) ----------
  newLeader: [(name) => `^${name} đang dẫn đầu!`, (name) => `${name} vươn lên dẫn đầu!`] as L1,
  streak: [(name, k) => `${name} về nhất ${k} chặng liên tiếp!`] as L2,
  milestone: [(name, pts) => `${name} đã đạt ${pts} điểm!`] as L2,
  greet: [(names) => `Chào mừng ${names}!`, (names) => `Chào mừng ${names} tham gia!`] as L1,
  gift: [(name, gift) => `^Cảm ơn ${name} đã tặng ${gift}!`] as L2,
  hurry: ['Sắp hết giờ!', 'Còn vài giây!'] as L0,
  tips: [
    'Chỉ cần comment một tiếng để nối từ.',
    'Trả lời sai không bị trừ điểm.',
    'Comment join để tham gia.',
    'Nhớ gõ có dấu nhé.',
  ] as L0,
  idle: ['Comment join để tham gia cuộc đua!'] as L0,
  paused: ['Tạm dừng một chút.'] as L0,
  resumed: ['^Tiếp tục!'] as L0,

  // ---------- vinh danh ----------
  ceremonyOpen: ['^Cuộc đua kết thúc! | Xin vinh danh những người xuất sắc nhất.'] as L0,
  place4: [(name) => `Hạng tư: ${name}!`] as L1,
  place3: [(name) => `Hạng ba: ${name}!`] as L1,
  place2: [(name) => `Hạng nhì: ${name}!`] as L1,
  champion: [
    (name, pts) => `Và nhà vô địch là | ^${name}, với ${pts} điểm! | ^Xin chúc mừng!`,
    (name, pts) => `Vô địch cuộc đua là | ^${name}, ${pts} điểm! | ^Xin chúc mừng!`,
  ] as L2,
  noChampion: ['Cuộc đua kết thúc. Chưa có ai ghi điểm.'] as L0,
  prepareAuto: [(s) => `^Tất cả chuẩn bị! | Cuộc đua mới bắt đầu sau ${s} giây.`] as L1,
  /** kết thúc mà không tự mở cuộc đua mới */
  thanks: ['Cảm ơn cả nhà đã tham gia!'] as L0,
};

/** Bốc câu kiểu xáo bài: đọc hết mới lặp, không lặp ngay câu vừa đọc (lấy từ Lớp Học Chữ) */
export class LineBag {
  private left = new Map<string, number[]>();
  private last = new Map<string, number>();
  constructor(private readonly rand: () => number = Math.random) {}
  pick<T>(key: string, list: readonly T[]): T {
    let pool = this.left.get(key);
    if (!pool || pool.length === 0) {
      pool = list.map((_, i) => i);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      if (pool.length > 1 && pool[pool.length - 1] === this.last.get(key)) pool.unshift(pool.pop()!);
      this.left.set(key, pool);
    }
    const i = pool.pop()!;
    this.last.set(key, i);
    return list[i];
  }
}

/** "A", "A và B", "A, B và C", "A, B và 4 bạn nữa" */
export function joinNames(names: string[], max = 3): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length > max) return `${names.slice(0, max - 1).join(', ')} và ${names.length - (max - 1)} bạn nữa`;
  return `${names.slice(0, -1).join(', ')} và ${names[names.length - 1]}`;
}
