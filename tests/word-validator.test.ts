import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSyllable, canonicalWord, looksLikeVietnameseSyllable, syllablesOf } from '../shared/vietnamese';
import { isJoinComment, parseAnswer, validateAnswer } from '../server/game/word-validator';
import { makeBank } from './helpers';

test('chuẩn hoá: hoa/thường, NFC/NFD, dấu kiểu cũ/mới, khoảng trắng', () => {
  assert.equal(canonicalSyllable('VIÊN'), 'viên');
  assert.equal(canonicalSyllable('viên'.normalize('NFD')), 'viên');
  assert.equal(canonicalSyllable('hóa'), canonicalSyllable('hoá'));
  assert.equal(canonicalSyllable('thủy'), canonicalSyllable('thuỷ'));
  assert.equal(canonicalSyllable('hòa'), canonicalSyllable('hoà'));
  assert.notEqual(canonicalSyllable('hoàn'), canonicalSyllable('hòan')); // chỉ đổi ở cuối tiếng
  assert.deepEqual(syllablesOf('  Sinh   VIÊN!! 😍 '), ['sinh', 'viên']);
  assert.equal(canonicalWord('Hóa  Học'), 'hoá học');
  assert.equal(canonicalWord('một'), null);
});

test('không tự bỏ dấu: "vien" khác "viên"', () => {
  const bank = makeBank();
  assert.equal(validateAnswer(bank, 'học sinh', 'sinh vien', new Set()).ok, false);
  assert.equal(validateAnswer(bank, 'học sinh', 'sinh viên', new Set()).ok, true);
});

test('nhận diện âm tiết tiếng Việt', () => {
  for (const s of ['viên', 'nghiêng', 'khuya', 'quốc', 'giữa', 'trường', 'ánh']) assert.ok(looksLikeVietnameseSyllable(s), s);
  for (const s of ['ok', 'kkk', 'haha', 'join', 'wow', 'zz']) assert.ok(!looksLikeVietnameseSyllable(s), s);
});

test('phân loại bình luận: 1 tiếng, cả từ, nói chuyện', () => {
  assert.deepEqual(parseAnswer('VIÊN', 'sinh'), { kind: 'answer', syllable: 'viên', word: 'sinh viên' });
  assert.deepEqual(parseAnswer('sinh viên', 'sinh'), { kind: 'answer', syllable: 'viên', word: 'sinh viên' });
  assert.deepEqual(parseAnswer('Viên 🎉', 'sinh'), { kind: 'answer', syllable: 'viên', word: 'sinh viên' });
  assert.equal(parseAnswer('hay quá', 'sinh').kind, 'chat');
  assert.equal(parseAnswer('ok', 'sinh').kind, 'chat');
  assert.equal(parseAnswer('@ban viên', 'sinh').kind, 'chat');
  assert.equal(parseAnswer('viên 123', 'sinh').kind, 'chat');
  assert.equal(parseAnswer('học sinh viên', 'sinh').kind, 'chat');
});

test('bình luận join', () => {
  assert.ok(isJoinComment('join'));
  assert.ok(isJoinComment('  JOIN!! '));
  assert.ok(isJoinComment('tham gia'));
  assert.ok(!isJoinComment('join đi mọi người'));
  assert.ok(!isJoinComment('vào'));
});

test('kiểm tra từ ghép: có trong ngân hàng, chưa dùng, không phải từ cấm', () => {
  const bank = makeBank();
  const used = new Set(['học sinh']);
  assert.deepEqual(validateAnswer(bank, 'học sinh', 'sinh viên', used), { ok: true, word: 'sinh viên' });
  assert.deepEqual(validateAnswer(bank, 'học sinh', 'sinh nhật', used), { ok: true, word: 'sinh nhật' });
  assert.deepEqual(validateAnswer(bank, 'học sinh', 'sinh đẹp', used), { ok: false, word: 'sinh đẹp', reason: 'not_in_bank' });
  used.add('sinh viên');
  assert.deepEqual(validateAnswer(bank, 'học sinh', 'sinh viên', used), { ok: false, word: 'sinh viên', reason: 'used' });
});

test('ngân hàng từ: thêm, sửa, xoá, đánh dấu không hợp lệ', () => {
  const bank = makeBank();
  assert.ok(!bank.has('sinh đẹp'));
  bank.add('Sinh Đẹp');
  assert.ok(bank.has('sinh đẹp'));
  bank.edit('sinh đẹp', 'sinh sống');
  assert.ok(!bank.has('sinh đẹp'));
  assert.ok(bank.has('sinh sống'));
  bank.remove('sinh sống');
  assert.ok(!bank.has('sinh sống'));
  // từ gốc: xoá = đánh dấu không hợp lệ, gỡ được
  bank.remove('sinh viên');
  assert.ok(!bank.has('sinh viên'));
  assert.ok(bank.isBanned('sinh viên'));
  bank.setBanned('sinh viên', false);
  assert.ok(bank.has('sinh viên'));
  assert.throws(() => bank.add('một'));
  assert.deepEqual(bank.continuations('sinh').sort((a, b) => a.localeCompare(b, 'vi')), ['sinh động', 'sinh hoạt', 'sinh nhật', 'sinh viên']);
  // từ thêm được lưu lại trong overrides
  bank.add('sinh tồn', true);
  assert.deepEqual(bank.overrides().added, [{ word: 'sinh tồn', common: true }]);
  assert.ok(bank.isCommon('sinh tồn'));
});
