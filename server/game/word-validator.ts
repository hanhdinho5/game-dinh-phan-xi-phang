import { looksLikeVietnameseSyllable, syllablesOf } from '../../shared/vietnamese';
import { containsBanned } from '../../shared/banned-words';
import type { RejectReason } from '../../shared/types';
import type { WordBank } from './word-bank';

/** Bình luận để vào game. Không dùng "vào" vì "vào" cũng là 1 tiếng nối được (đi vào). */
const JOIN_KEYWORDS = new Set(['join', 'tham gia', 'thamgia', 'jion', 'joinn']);

export function isJoinComment(text: string): boolean {
  const t = text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return JOIN_KEYWORDS.has(t);
}

export type ParsedComment =
  | { kind: 'answer'; syllable: string; word: string }
  | { kind: 'chat' };

/**
 * Bình luận có phải câu trả lời không. Người chơi chỉ cần gõ 1 tiếng ("viên"),
 * gõ cả từ ("sinh viên") cũng được. Nói chuyện thường ("hay quá", "ok") không bị tính.
 */
export function parseAnswer(text: string, linkSyllable: string): ParsedComment {
  if (text.includes('@')) return { kind: 'chat' }; // nhắc tên người khác
  if (/\d/.test(text)) return { kind: 'chat' };
  const parts = syllablesOf(text);
  let syllable: string | undefined;
  if (parts.length === 1) syllable = parts[0];
  else if (parts.length === 2 && parts[0] === linkSyllable) syllable = parts[1];
  if (!syllable || !looksLikeVietnameseSyllable(syllable)) return { kind: 'chat' };
  return { kind: 'answer', syllable, word: `${linkSyllable} ${syllable}` };
}

export type Validation = { ok: true; word: string } | { ok: false; word: string; reason: RejectReason };

/**
 * Từ ghép `linkSyllable + syllable` có hợp lệ không:
 *  - phải có trong ngân hàng từ (không bị đánh dấu không hợp lệ)
 *  - chưa dùng trong chuỗi của phiên
 *  - không chứa từ cấm
 */
export function validateAnswer(bank: WordBank, currentWord: string, word: string, used: ReadonlySet<string>): Validation {
  if (word === currentWord) return { ok: false, word, reason: 'same_word' };
  if (containsBanned(word)) return { ok: false, word, reason: 'banned_word' };
  if (!bank.has(word)) return { ok: false, word, reason: bank.isBanned(word) ? 'banned_word' : 'not_in_bank' };
  if (used.has(word)) return { ok: false, word, reason: 'used' };
  return { ok: true, word };
}

export const lastSyllable = (word: string) => word.split(' ')[1] ?? '';
