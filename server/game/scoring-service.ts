import type { ScoreTier } from '../../shared/types';

/** Điểm cho người đúng thứ `rank` (1 = nhanh nhất). Ngoài mọi bậc thì 0. */
export function pointsForRank(tiers: ScoreTier[], rank: number): number {
  for (const t of tiers) if (rank >= t.from && rank <= t.to) return t.points;
  return 0;
}

/**
 * Bảng điểm dạng chữ cho admin gõ: "9,7,5,3,2x6,1x10"
 * = hạng 1: 9, hạng 2: 7, hạng 3: 5, hạng 4: 3, hạng 5-10: 2, hạng 11-20: 1, sau đó 0.
 */
export function parseTiers(text: string): ScoreTier[] {
  const tiers: ScoreTier[] = [];
  let rank = 1;
  for (const part of text.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d{1,3})\s*(?:[x×*]\s*(\d{1,3}))?$/i.exec(part);
    if (!m) throw new Error(`Không hiểu "${part}". Viết kiểu 9,7,5,3,2x6,1x10`);
    const points = Number(m[1]);
    const count = m[2] ? Number(m[2]) : 1;
    if (count < 1) throw new Error(`Số hạng phải từ 1 trở lên ("${part}")`);
    if (points > 100) throw new Error('Mỗi hạng tối đa 100 điểm');
    tiers.push({ from: rank, to: rank + count - 1, points });
    rank += count;
  }
  validateTiers(tiers);
  return tiers;
}

export function formatTiers(tiers: ScoreTier[]): string {
  return tiers.map((t) => (t.to > t.from ? `${t.points}x${t.to - t.from + 1}` : `${t.points}`)).join(',');
}

/** Bậc phải liền nhau từ hạng 1, điểm không tăng dần (người nhanh hơn không được ít điểm hơn). */
export function validateTiers(tiers: ScoreTier[]): void {
  if (!Array.isArray(tiers) || tiers.length === 0) throw new Error('Bảng điểm trống');
  if (tiers.length > 50) throw new Error('Bảng điểm quá dài');
  let expect = 1;
  let prevPts = Infinity;
  for (const t of tiers) {
    if (![t.from, t.to, t.points].every((n) => Number.isInteger(n) && n >= 0)) throw new Error('Bảng điểm phải là số nguyên không âm');
    if (t.from !== expect || t.to < t.from) throw new Error('Các bậc hạng phải liền nhau, bắt đầu từ hạng 1');
    if (t.points > prevPts) throw new Error('Hạng sau không được nhiều điểm hơn hạng trước');
    prevPts = t.points;
    expect = t.to + 1;
  }
}
