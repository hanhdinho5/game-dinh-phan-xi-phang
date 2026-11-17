/**
 * Chuẩn hoá chữ tiếng Việt cho game nối từ.
 *
 * - GIỮ dấu: "sinh viên" khác "sinh vien" (bỏ dấu sai nghĩa nên không tự bỏ).
 * - Dấu kiểu cũ / mới coi là một: "hóa" = "hoá", "thủy" = "thuỷ" (đưa về kiểu mới, dấu nằm ở chữ sau).
 * - Gõ kiểu tổ hợp (NFD) hay dựng sẵn (NFC) đều ra cùng một chuỗi.
 */

// dấu thanh (tổ hợp): huyền, sắc, hỏi, ngã, nặng
const TONE = '̣̀́̃̉';
const OLD_OA = new RegExp(`o([${TONE}])([ae])(?!\\p{L})`, 'gu'); // hóa -> hoá, hòe -> hoè
const OLD_UY = new RegExp(`u([${TONE}])y(?!\\p{L})`, 'gu'); // thủy -> thuỷ

/** Một tiếng (âm tiết) về dạng chuẩn: chữ thường, NFC, dấu kiểu mới. */
export function canonicalSyllable(s: string): string {
  return s.normalize('NFD').toLowerCase().replace(OLD_OA, 'o$2$1').replace(OLD_UY, 'uy$1').normalize('NFC').trim();
}

/** Tách câu thành các tiếng đã chuẩn hoá, bỏ emoji, dấu câu, số. */
export function syllablesOf(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}]+/gu, ' ')
    .split(' ')
    .filter(Boolean)
    .map(canonicalSyllable);
}

/** Từ ghép 2 tiếng về khoá chuẩn "sinh viên". Không đúng 2 tiếng thì trả null. */
export function canonicalWord(text: string): string | null {
  const parts = syllablesOf(text);
  return parts.length === 2 ? `${parts[0]} ${parts[1]}` : null;
}

/** Bỏ hết dấu (chỉ để TÌM KIẾM trong trang admin, không dùng để chấm). */
export function stripMarks(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/** Viết hoa để hiện trên overlay. */
export const upperVi = (s: string) => s.normalize('NFC').toLocaleUpperCase('vi');

// Tiếng Việt hợp lệ (gần đúng): phụ âm đầu + vần + phụ âm cuối. Dùng để lọc rác khi dựng từ điển.
const ONSET = '(?:ngh|ng|gh|gi|kh|nh|ph|qu|th|tr|ch|[bcdđghklmnprstvx])?';
const NUCLEUS = '[aăâeêioôơuưy]{1,3}';
const CODA = '(?:ch|nh|ng|[cmnpt])?';
const SYLLABLE_RE = new RegExp(`^${ONSET}${NUCLEUS}${CODA}$`);

export function looksLikeVietnameseSyllable(s: string): boolean {
  // bỏ dấu thanh nhưng giữ ă â ê ô ơ ư đ
  const base = s.normalize('NFD').replace(new RegExp(`[${TONE}]`, 'g'), '').normalize('NFC');
  if (!SYLLABLE_RE.test(base)) return false;
  // tối đa 1 dấu thanh
  return (s.normalize('NFD').match(new RegExp(`[${TONE}]`, 'g'))?.length ?? 0) <= 1;
}
