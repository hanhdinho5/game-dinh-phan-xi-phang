import { canonicalWord, stripMarks } from '../../shared/vietnamese';
import { containsBanned } from '../../shared/banned-words';
import type { WordSearchResult } from '../../shared/types';

/** Phần admin sửa, lưu riêng (data/word-overrides.json) để dựng lại từ điển gốc không mất. */
export interface WordOverrides {
  added: { word: string; common: boolean }[];
  /** từ bị đánh dấu không hợp lệ (cả từ gốc lẫn từ thêm) */
  banned: string[];
  /** từ gốc được admin đánh dấu là phổ biến */
  common: string[];
}

export const emptyOverrides = (): WordOverrides => ({ added: [], banned: [], common: [] });

/**
 * Ngân hàng từ ghép 2 tiếng, tra trong bộ nhớ.
 *   index: tiếng đầu -> các từ bắt đầu bằng tiếng đó
 * Từ "đang dùng được" = (từ gốc + từ admin thêm) - từ bị đánh dấu không hợp lệ.
 */
export class WordBank {
  private base = new Set<string>();
  private added = new Map<string, boolean>(); // từ -> phổ biến?
  private banned = new Set<string>();
  private baseCommon = new Set<string>(); // từ phổ biến trong file tu-pho-bien.txt
  private extraCommon = new Set<string>(); // admin đánh dấu thêm
  private index = new Map<string, Set<string>>();

  constructor(baseWords: Iterable<string>, commonWords: Iterable<string>, overrides: WordOverrides = emptyOverrides()) {
    // lọc từ cấm 1 lần lúc nạp (không lọc lại mỗi lần tra: tra từ chạy mỗi bình luận / mỗi chặng)
    for (const w of baseWords) {
      const c = canonicalWord(w);
      if (c && !containsBanned(c)) this.base.add(c);
    }
    for (const w of commonWords) {
      const c = canonicalWord(w);
      if (c) {
        this.base.add(c);
        this.baseCommon.add(c);
      }
    }
    for (const a of overrides.added ?? []) {
      const c = canonicalWord(a.word);
      if (c && !containsBanned(c)) this.added.set(c, !!a.common);
    }
    for (const b of overrides.banned ?? []) {
      const c = canonicalWord(b);
      if (c) this.banned.add(c);
    }
    for (const x of overrides.common ?? []) {
      const c = canonicalWord(x);
      if (c) this.extraCommon.add(c);
    }
    for (const w of [...this.base, ...this.added.keys()]) this.indexAdd(w);
  }

  /** Đọc file văn bản: mỗi dòng (hoặc cách nhau dấu phẩy) 1 từ, dòng # là ghi chú. */
  static parseList(text: string): string[] {
    return text
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('#'))
      .flatMap((l) => l.split(','))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private indexAdd(w: string) {
    const first = w.split(' ')[0];
    let set = this.index.get(first);
    if (!set) this.index.set(first, (set = new Set()));
    set.add(w);
  }
  private indexRemove(w: string) {
    this.index.get(w.split(' ')[0])?.delete(w);
  }

  private sizeCache = -1;
  /** số từ đang dùng được */
  get size() {
    if (this.sizeCache < 0) {
      let n = 0;
      for (const w of this.base) if (!this.banned.has(w)) n++;
      for (const w of this.added.keys()) if (!this.base.has(w) && !this.banned.has(w)) n++;
      this.sizeCache = n;
    }
    return this.sizeCache;
  }

  private exists(w: string) {
    return this.base.has(w) || this.added.has(w);
  }

  /** Từ (đã chuẩn hoá) có trong ngân hàng và không bị đánh dấu không hợp lệ */
  has(word: string): boolean {
    return this.exists(word) && !this.banned.has(word);
  }

  isBanned(word: string) {
    return this.banned.has(word);
  }

  isCommon(word: string) {
    return this.has(word) && (this.baseCommon.has(word) || this.extraCommon.has(word) || this.added.get(word) === true);
  }

  /** Các từ hợp lệ bắt đầu bằng `first` */
  continuations(first: string): string[] {
    const set = this.index.get(first);
    if (!set) return [];
    return [...set].filter((w) => this.has(w));
  }

  commonContinuations(first: string): string[] {
    return this.continuations(first).filter((w) => this.isCommon(w));
  }

  private commonCache: string[] | null = null;
  /** mọi từ phổ biến đang dùng được (nhớ sẵn, xoá khi admin sửa từ) */
  allCommon(): string[] {
    this.commonCache ??= [...new Set([...this.baseCommon, ...this.extraCommon, ...[...this.added].filter(([, c]) => c).map(([w]) => w)])].filter((w) =>
      this.has(w),
    );
    return this.commonCache;
  }

  /** Lấy ngẫu nhiên tối đa `n` từ đang dùng được */
  sample(n: number, rng: () => number): string[] {
    const firsts = [...this.index.keys()];
    const out: string[] = [];
    for (let tries = 0; tries < n * 3 && out.length < n && firsts.length; tries++) {
      const list = this.continuations(firsts[Math.floor(rng() * firsts.length)]);
      if (list.length) out.push(list[Math.floor(rng() * list.length)]);
    }
    return out;
  }

  // ---------- admin sửa từ ----------
  add(raw: string, common = false): string {
    const w = canonicalWord(raw);
    if (!w) throw new Error('Từ phải gồm đúng 2 tiếng, ví dụ "sinh viên"');
    if (containsBanned(w)) throw new Error('Từ này nằm trong danh sách từ cấm');
    this.sizeCache = -1;
    this.commonCache = null;
    this.banned.delete(w);
    if (this.base.has(w)) {
      if (common && !this.baseCommon.has(w)) this.extraCommon.add(w);
    } else {
      this.added.set(w, common);
      this.indexAdd(w);
    }
    return w;
  }

  /** Xoá: từ admin thêm thì xoá hẳn; từ gốc thì đánh dấu không hợp lệ (gỡ được). */
  remove(raw: string): string {
    const w = canonicalWord(raw);
    if (!w || !this.exists(w)) throw new Error('Không có từ này trong ngân hàng');
    this.sizeCache = -1;
    this.commonCache = null;
    if (this.added.has(w) && !this.base.has(w)) {
      this.added.delete(w);
      this.indexRemove(w);
      this.banned.delete(w);
    } else this.banned.add(w);
    this.extraCommon.delete(w);
    return w;
  }

  setBanned(raw: string, banned: boolean): string {
    const w = canonicalWord(raw);
    if (!w) throw new Error('Từ phải gồm đúng 2 tiếng');
    this.sizeCache = -1;
    this.commonCache = null;
    if (banned) this.banned.add(w);
    else this.banned.delete(w);
    return w;
  }

  edit(fromRaw: string, toRaw: string): string {
    const from = canonicalWord(fromRaw);
    if (!from || !this.exists(from)) throw new Error('Không có từ cần sửa');
    const common = this.isCommon(from);
    const to = this.add(toRaw, common); // kiểm tra từ mới trước, lỗi thì không đụng từ cũ
    if (to !== from) this.remove(from);
    return to;
  }

  /** Tìm từ cho trang admin: theo tiếng đầu / chuỗi con, gõ không dấu cũng tìm được. */
  search(q: string, used: Set<string>, limit = 200): WordSearchResult[] {
    const query = q.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
    if (!query) return [];
    const plainQ = stripMarks(query);
    const hasMarks = plainQ !== query;
    const pool = new Set([...this.base, ...this.added.keys()]);
    const out: WordSearchResult[] = [];
    // ưu tiên khớp đầu từ
    const scored: [number, string][] = [];
    for (const w of pool) {
      const hay = hasMarks ? w : stripMarks(w);
      const needle = hasMarks ? query : plainQ;
      const i = hay.indexOf(needle);
      if (i < 0) continue;
      scored.push([i === 0 ? 0 : hay.startsWith(needle.split(' ')[0]) ? 1 : 2, w]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], 'vi'));
    for (const [, w] of scored.slice(0, limit)) {
      out.push({
        word: w,
        origin: this.base.has(w) ? 'base' : 'custom',
        common: this.isCommon(w) || this.baseCommon.has(w) || this.extraCommon.has(w),
        banned: this.banned.has(w),
        used: used.has(w),
      });
    }
    return out;
  }

  overrides(): WordOverrides {
    return {
      added: [...this.added].map(([word, common]) => ({ word, common })),
      banned: [...this.banned],
      common: [...this.extraCommon],
    };
  }
}
