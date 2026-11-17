/**
 * Từ không bao giờ được hiện / chấp nhận trên live (tục, 18+, ma tuý, cờ bạc, bạo lực, lừa đảo).
 * Lấy từ Lớp Học Chữ. So khớp trên chữ CÓ dấu nên "lớn", "các", "buổi" không bị bắt nhầm.
 * Danh sách cố định: cách viết lách (l0n, đ.ị.t) vẫn lọt, gặp thì thêm vào BANNED_TOKENS.
 */
const BANNED_TOKENS = new Set([
  'lồn', 'lìn', 'cặc', 'buồi', 'đéo', 'địt', 'đụ', 'đĩ', 'cứt', 'đm', 'đmm', 'đcm', 'đkm',
  'dm', 'dmm', 'dcm', 'dkm', 'vcl', 'vkl', 'vcc', 'clgt', 'loz', 'dit', 'ditme', 'dume', 'cmm',
  'fuck', 'fck', 'fuk', 'shit', 'bitch', 'dick', 'pussy', 'sex', 'sexy', 'porn', 'nude', 'xxx',
  'giết', 'chém', 'casino', 'scam', 'điếm', 'dâm',
]);

const BANNED_PHRASES = [
  'địt mẹ', 'đụ má', 'đù má', 'đéo mẹ', 'con đĩ', 'dit me', 'du ma', 'ma túy', 'ma tuý',
  'thuốc lắc', 'cần sa', 'cá độ', 'lô đề', 'cờ bạc', 'chuyển khoản', 'lừa đảo', 'giao cấu', 'hiếp dâm',
];

const tokensOf = (text: string) =>
  text.normalize('NFC').toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);

export function containsBanned(text: string): boolean {
  if (!text) return false;
  const tokens = tokensOf(text);
  if (tokens.some((t) => BANNED_TOKENS.has(t))) return true;
  const joined = ` ${tokens.join(' ')} `;
  return BANNED_PHRASES.some((p) => joined.includes(` ${p} `));
}

/** Chữ hiện trên màn hình: từ cấm thành *** */
export function maskBanned(text: string): string {
  if (!containsBanned(text)) return text;
  let out = text.replace(/[\p{L}\p{M}\p{N}]+/gu, (w) => (BANNED_TOKENS.has(w.normalize('NFC').toLowerCase()) ? '***' : w));
  for (const p of BANNED_PHRASES) out = out.replace(new RegExp(p.replace(/ /g, '\\s+'), 'giu'), '***');
  return out;
}
