import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClockSync, Round, chooseNextWord, type AnswerEntry } from '../server/game/round-manager';
import { EventDeduper } from '../server/live/event-deduper';
import { compareRanking, PlayerManager } from '../server/game/player-manager';
import { validateAnswer } from '../server/game/word-validator';
import { DEFAULT_CONFIG } from '../shared/types';
import { makeBank } from './helpers';

const T = 1_000_000;
let seq = 0;
const entry = (userId: string, word: string, at: number): AnswerEntry => ({
  userId,
  uniqueId: userId,
  isMock: false,
  nickname: userId,
  avatar: '',
  syllable: word.split(' ')[1],
  word,
  at,
  sortAt: at,
  seq: ++seq,
});

test('xếp hạng theo giờ gửi, bình luận tới trễ vẫn đứng đúng chỗ', () => {
  const bank = makeBank();
  const used = new Set(['học sinh']);
  const r = new Round(1, 'học sinh', T, T + 10_000, 3);
  const sub = (u: string, w: string, at: number) => r.submit(entry(u, w, at), validateAnswer(bank, 'học sinh', w, used));
  assert.equal(sub('b', 'sinh nhật', T + 3000), 'accepted');
  assert.equal(sub('c', 'sinh viên', T + 5000), 'accepted');
  assert.equal(sub('a', 'sinh viên', T + 1000), 'accepted'); // tới server sau nhưng gửi sớm nhất
  assert.deepEqual(r.provisional().map((e) => e.userId), ['a', 'b', 'c']);
  const w = r.finalize(DEFAULT_CONFIG.scoreTiers);
  assert.deepEqual(w.map((x) => [x.userId, x.points]), [['a', 9], ['b', 7], ['c', 5]]);
});

test('một người chỉ được tính 1 lần mỗi lượt, gửi nhiều đáp án cũng không chiếm thêm chỗ', () => {
  const bank = makeBank();
  const used = new Set(['học sinh']);
  const r = new Round(1, 'học sinh', T, T + 10_000, 3);
  const sub = (u: string, w: string, at: number) => r.submit(entry(u, w, at), validateAnswer(bank, 'học sinh', w, used));
  assert.equal(sub('a', 'sinh viên', T + 100), 'accepted');
  assert.equal(sub('a', 'sinh nhật', T + 200), 'already_answered');
  assert.equal(sub('a', 'sinh viên', T + 300), 'already_answered');
  assert.equal(sub('b', 'sinh viên', T + 400), 'accepted'); // đáp án trùng người khác vẫn được tính (ít điểm hơn)
  assert.equal(r.correctCount, 2);
});

test('sai không trừ điểm nhưng quá số lần sai thì thôi nhận; ngoài giờ thì không nhận', () => {
  const bank = makeBank();
  const used = new Set(['học sinh']);
  const r = new Round(1, 'học sinh', T, T + 10_000, 2);
  const sub = (u: string, w: string, at: number) => r.submit(entry(u, w, at), validateAnswer(bank, 'học sinh', w, used));
  assert.equal(sub('a', 'sinh đẹp', T + 100), 'rejected');
  assert.equal(sub('a', 'sinh xấu', T + 200), 'rejected');
  assert.equal(sub('a', 'sinh viên', T + 300), 'too_many_wrong');
  assert.equal(sub('b', 'sinh viên', T - 1), 'too_early');
  assert.equal(sub('b', 'sinh viên', T + 10_001), 'too_late');
  assert.deepEqual(r.rejectedSummary().map((x) => x.word).sort(), ['sinh xấu', 'sinh đẹp']);
});

test('admin duyệt từ giữa lượt: người gửi từ đó được tính đúng theo thứ tự cũ', () => {
  const bank = makeBank();
  const used = new Set(['học sinh']);
  const r = new Round(1, 'học sinh', T, T + 10_000, 3);
  const sub = (u: string, w: string, at: number) => r.submit(entry(u, w, at), validateAnswer(bank, 'học sinh', w, used));
  sub('a', 'sinh tồn', T + 100);
  sub('b', 'sinh viên', T + 200);
  sub('c', 'sinh tồn', T + 300);
  bank.add('sinh tồn');
  assert.equal(r.approveRejected('sinh tồn'), 2);
  assert.deepEqual(r.provisional().map((e) => e.userId), ['a', 'b', 'c']);
});

test('đồng hồ TikTok lệch: xếp theo giờ gửi, quy đổi sang giờ server để xét trong/ngoài giờ', () => {
  const c = new ClockSync();
  // đồng hồ TikTok chậm hơn máy mình 5 giây, bình luận tới sau 300-900ms
  const skew = -5000;
  const got = [
    [T + 300, T + 1000],
    [T + 100, T + 1100], // gửi trước nhưng tới sau
    [T + 500, T + 1200],
    [T + 50, T + 1250],
  ].map(([sent, recv]) => ({ sent, ...c.convert(sent + skew, recv) }));
  const order = [...got].sort((a, b) => a.sortAt - b.sortAt).map((x) => x.sent);
  assert.deepEqual(order, [T + 50, T + 100, T + 300, T + 500]);
  for (const g of got.slice(1)) assert.ok(Math.abs(g.at - g.sent) < 1500, 'giờ quy đổi gần giờ gửi thật');
  assert.equal(c.convert(0, T).at, T); // không có createTime
  assert.equal(c.convert(T - 3_600_000, T).at, T); // createTime vô lý
});

test('chống trùng sự kiện theo mã', () => {
  const d = new EventDeduper(3);
  assert.ok(d.check('a'));
  assert.ok(!d.check('a'));
  d.check('b');
  d.check('c');
  d.check('d'); // đẩy 'a' ra
  assert.ok(d.check('a'));
});

test('chọn từ tiếp: hệ thống tự chọn từ phổ biến nối tiếp, chặng sau vẫn nối được; hết thì đổi từ mới', () => {
  const bank = makeBank();
  const used = new Set(['học sinh']);
  // "sinh" -> chỉ có "sinh viên" là từ phổ biến (sinh nhật, sinh động... không phổ biến nên hệ thống không chọn)
  for (let i = 0; i < 20; i++) assert.deepEqual(chooseNextWord('học sinh', bank, used, Math.random), { word: 'sinh viên', source: 'auto' });
  // ưu tiên từ mà chặng sau còn từ phổ biến để nối: "học tập" (-> tập thể) hơn từ phổ biến bí đường
  bank.add('học bạ', true); // "bạ" không có từ nào nối tiếp
  used.add('chức vụ');
  for (let i = 0; i < 20; i++) assert.equal(chooseNextWord('viên chức', bank, used, Math.random).source, 'jump');
  for (let i = 0; i < 20; i++) assert.equal(chooseNextWord('sinh học', bank, used, Math.random).word, 'học tập');
  // dùng hết: đổi sang từ khởi đầu mới chưa dùng
  used.add('sinh viên');
  const c = chooseNextWord('học sinh', bank, used, () => 0);
  assert.equal(c.source, 'jump');
  assert.ok(!used.has(c.word));
});

test('xếp ghế: điểm cao trước, bằng điểm thì ai đạt trước, rồi ai vào trước', () => {
  const pm = new PlayerManager();
  const join = (id: string, t: number) => pm.join({ userId: id, uniqueId: id, nickname: id, avatar: '' }, t);
  join('a', 1);
  join('b', 2);
  join('c', 3);
  join('d', 4);
  assert.deepEqual(pm.ranking().map((p) => p.userId), ['a', 'b', 'c', 'd']);
  pm.award('c', 5, 1, 10);
  pm.award('d', 5, 1, 11);
  pm.award('b', 9, 1, 12);
  assert.deepEqual(pm.ranking().map((p) => p.userId), ['b', 'c', 'd', 'a']);
  // ghế 2: c và d cùng 5 điểm, c đạt trước nên có ghế
  const v = pm.views(2);
  assert.deepEqual(v.map((x) => [x.userId, x.rank, x.seated]), [['b', 1, true], ['c', 2, true], ['d', 3, false], ['a', 4, false]]);
  // không cho 1 tài khoản tạo nhiều ghế
  assert.equal(join('a', 99), 'updated');
  assert.equal(pm.count, 4);
  // khoá thì không vào lại được
  pm.remove('a', true);
  assert.equal(join('a', 100), 'banned');
  assert.ok(compareRanking(pm.get('b')!, pm.get('c')!) < 0);
});
