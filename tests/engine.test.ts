import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comment, makeEngine } from './helpers';

test('một lượt đầy đủ: join, nhiều người trả lời, chốt sau khi hết giờ + chờ trễ, cộng điểm, đổi từ', () => {
  const { engine, events } = makeEngine();
  let t = 1_000_000;
  engine.handleComment(comment('a', 'join', t));
  engine.handleComment(comment('b', 'join', t));
  assert.equal(engine.players.count, 2);
  engine.start(t);
  assert.equal(engine.currentWord, 'học sinh');
  assert.equal(engine.roundPhase, 'answering');

  // TikTok gắn giờ gửi; bình luận thường tới server sau ~500ms
  engine.handleComment(comment('b', 'NHẬT', t + 2000, t + 1500));
  engine.handleComment(comment('a', 'viên', t + 3000, t + 1200)); // gửi sớm hơn, tới sau
  engine.handleComment(comment('c', 'sinh viên', t + 4000, t + 3500)); // chưa join: tự vào game khi đúng
  engine.handleComment(comment('d', 'đẹp', t + 4000, t + 3500)); // sai, chưa join: không vào game
  assert.equal(engine.players.count, 3);

  // chưa hết giờ: không đổi từ dù đã có người đúng
  engine.tick(t + 9000);
  assert.equal(engine.currentWord, 'học sinh');
  engine.tick((t += 10_000));
  assert.equal(engine.roundPhase, 'locking');
  // bình luận gửi trước khi hết giờ nhưng tới trong lúc chờ trễ: vẫn tính
  engine.handleComment(comment('e', 'động', t + 300, t - 200));
  // gửi quá phần bù độ trễ (1 giây trong test): không tính
  engine.handleComment(comment('f', 'hoạt', t + 1900, t + 1400));
  engine.tick(t + 1000 + 1199);
  assert.equal(engine.roundPhase, 'locking');
  engine.tick((t += 1000 + 1200));
  assert.equal(engine.roundPhase, 'reveal');

  const r = engine.lastResult!;
  assert.deepEqual(r.winners.map((w) => [w.userId, w.points]), [['a', 9], ['b', 7], ['c', 5], ['e', 3]]);
  assert.equal(r.nextWord, 'sinh viên'); // hệ thống tự chọn từ phổ biến nối tiếp
  assert.equal(r.nextSource, 'auto');
  assert.equal(engine.players.get('a')!.score, 9);
  assert.equal(engine.players.get('f'), undefined);
  assert.ok(events.some((e) => e.name === 'game:round_ended'));

  // hết thời gian hiện kết quả: tự sang lượt mới với từ "sinh viên"
  engine.tick(t + 3000);
  assert.equal(engine.currentWord, 'sinh viên');
  assert.equal(engine.roundNo, 2);
  assert.deepEqual(engine.chain.map((c) => c.word), ['học sinh', 'sinh viên']);
});

test('không cộng điểm trùng: cùng người gửi lại nhiều lần, cùng bình luận tới 2 lần', () => {
  const { engine } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  const c = comment('a', 'viên', t + 100);
  engine.handleComment(c);
  engine.handleComment(c); // trùng nguyên bình luận
  engine.handleComment(comment('a', 'nhật', t + 200));
  engine.handleComment(comment('a', 'động', t + 300));
  engine.nextRoundNow(t + 500);
  assert.equal(engine.history[0].winners.length, 1);
  assert.equal(engine.players.get('a')!.score, 9);
  assert.equal(engine.players.get('a')!.correct, 1);
});

test('từ đã dùng trong chuỗi không được dùng lại', () => {
  const { engine } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  engine.handleComment(comment('a', 'viên', t + 100));
  engine.nextRoundNow(t + 200); // -> sinh viên
  engine.handleComment(comment('a', 'chức', t + 300));
  engine.nextRoundNow(t + 400); // -> viên chức
  assert.equal(engine.currentWord, 'viên chức');
  assert.ok(engine.used.has('sinh viên'));
  // admin không đổi được sang từ đã dùng / từ chưa có trong từ điển / từ bí đường
  assert.throws(() => engine.setWord('học sinh', t + 500), /đã dùng/);
  assert.throws(() => engine.setWord('sinh đẹp', t + 500), /chưa có trong từ điển/);
  assert.throws(() => engine.setWord('hình ảnh', t + 500), /nối tiếp/);
  engine.setWord('hoạt hình', t + 500);
  engine.handleComment(comment('b', 'ảnh', t + 600));
  assert.equal(engine.round!.correctCount, 1);
  // người chơi nối ra từ đã dùng: không tính
  engine.setWord('mùa xuân', t + 700);
  engine.handleComment(comment('c', 'sắc', t + 800));
  assert.equal(engine.round!.correctCount, 1);
  engine.nextRoundNow(t + 900); // -> xuân sắc
  assert.equal(engine.currentWord, 'xuân sắc');
  engine.handleComment(comment('d', 'đẹp', t + 1000));
  assert.equal(engine.round!.correctCount, 1);
});

test('tạm dừng: đồng hồ đứng; đáp án gửi trước lúc dừng (tới trễ) vẫn được tính; tiếp tục thì chạy tiếp phần còn lại', () => {
  const { engine } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  engine.pause(t + 4000);
  // người xem gửi lúc t+3500 (trước khi dừng), tới server trong lúc dừng
  engine.handleComment(comment('a', 'viên', t + 5000, t + 3500));
  engine.tick(t + 60_000);
  assert.equal(engine.roundPhase, 'answering');
  assert.equal(engine.round!.correctCount, 1);
  engine.resume(t + 60_000);
  // gửi trước lúc dừng nhưng tới SAU khi tiếp tục: vẫn tính (không bị coi là "gửi sớm")
  engine.handleComment(comment('b', 'nhật', t + 60_500, t + 3800));
  assert.equal(engine.round!.correctCount, 2);
  assert.deepEqual(engine.round!.provisional().map((e) => e.userId), ['a', 'b']);
  // còn 6 giây
  engine.tick(t + 65_000);
  assert.equal(engine.roundPhase, 'answering');
  engine.handleComment(comment('c', 'động', t + 65_000));
  assert.equal(engine.round!.correctCount, 3);
  engine.tick(t + 66_000);
  assert.equal(engine.roundPhase, 'locking');
});

test('admin khoá người đang hạng 1 giữa chặng: người sau được đôn hạng', () => {
  const { engine } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  engine.handleComment(comment('troll', 'viên', t + 100, t + 50));
  engine.handleComment(comment('b', 'nhật', t + 200, t + 150));
  engine.removePlayer('troll', true);
  engine.nextRoundNow(t + 500);
  const r = engine.history[0];
  assert.deepEqual(r.winners.map((w) => [w.userId, w.points]), [['b', 9]]);
});

test('admin đánh dấu từ không hợp lệ giữa chặng: đáp án đó không được tính, người đó được trả lời lại', () => {
  const { engine, bank } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  engine.handleComment(comment('a', 'viên', t + 100, t + 50));
  engine.handleComment(comment('b', 'nhật', t + 200, t + 150));
  bank.setBanned('sinh viên', true);
  engine.revokeInvalidInRound();
  engine.handleComment(comment('a', 'động', t + 300, t + 250));
  engine.nextRoundNow(t + 500);
  assert.deepEqual(engine.history[0].winners.map((w) => [w.userId, w.word]), [['b', 'sinh nhật'], ['a', 'sinh động']]);
});

test('đổi từ lúc tạm dừng: hiện từ mới ngay, không tốn số chặng, tắt máy bật lại vẫn giữ từ mới', () => {
  const { engine } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  engine.pause(t + 1000);
  engine.setWord('mùa xuân', t + 2000);
  assert.equal(engine.currentWord, 'mùa xuân');
  const snap = JSON.parse(JSON.stringify(engine.snapshot()));
  const { engine: e2 } = makeEngine();
  e2.restore(snap, t + 3000);
  e2.resume(t + 4000);
  assert.equal(e2.currentWord, 'mùa xuân');
  assert.equal(e2.roundNo, 1);
});

test('"Đổi từ" lúc chưa chạy = từ khởi đầu lần Bắt đầu tới (cả sau khi đã có cuộc đua trước)', () => {
  const { engine } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  engine.end(t + 1000);
  engine.setWord('học tập', t + 2000);
  engine.start(t + 3000);
  assert.equal(engine.currentWord, 'học tập');
});

test('tắt tự chuyển lượt: chờ admin bấm lượt tiếp', () => {
  const { engine } = makeEngine();
  const t = 1_000_000;
  engine.updateConfig({ autoAdvance: false });
  engine.start(t);
  engine.tick(t + 10_000);
  engine.tick(t + 12_500);
  engine.tick(t + 20_000);
  assert.equal(engine.roundPhase, 'waiting');
  assert.equal(engine.roundNo, 1);
  engine.nextRoundNow(t + 21_000);
  assert.equal(engine.roundNo, 2);
});

test('kết thúc: chốt lượt dở, vinh danh Top 4; phiên mới điểm về 0 mà vẫn giữ người chơi', () => {
  const { engine, events } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  engine.handleComment(comment('a', 'viên', t + 100));
  engine.handleComment(comment('b', 'nhật', t + 200));
  engine.end(t + 300);
  assert.equal(engine.phase, 'ended');
  assert.deepEqual(engine.winners!.map((w) => [w.userId, w.score]), [['a', 9], ['b', 7]]);
  assert.ok(events.some((e) => e.name === 'winner:announced'));
  const oldSession = engine.sessionId;
  engine.reset(true, t + 5000);
  assert.notEqual(engine.sessionId, oldSession);
  assert.equal(engine.players.count, 2);
  assert.equal(engine.players.get('a')!.score, 0);
  assert.equal(engine.phase, 'idle');
});

test('khoá người chơi: không vào lại, không được tính điểm', () => {
  const { engine } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  engine.handleComment(comment('spam', 'join', t));
  engine.removePlayer('spam', true);
  engine.handleComment(comment('spam', 'join', t + 10));
  engine.handleComment(comment('spam', 'viên', t + 20));
  assert.equal(engine.players.get('spam'), undefined);
  assert.equal(engine.round!.correctCount, 0);
});

test('admin duyệt từ giữa lượt: người đã gửi được tính, người chưa join được vào game', () => {
  const { engine, bank } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  engine.handleComment(comment('a', 'tồn', t + 100));
  assert.equal(engine.round!.correctCount, 0);
  bank.add('sinh tồn');
  assert.equal(engine.approveWordInRound('sinh tồn', t + 200), 1);
  assert.ok(engine.players.get('a'));
  engine.handleComment(comment('b', 'tồn', t + 300));
  assert.equal(engine.round!.correctCount, 2);
});

test('không ai trả lời: hệ thống vẫn tự chọn từ tiếp; từ khởi đầu bí đường thì đổi từ', () => {
  const { engine } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  engine.nextRoundNow(t + 100);
  assert.equal(engine.lastResult!.nextSource, 'auto');
  assert.equal(engine.currentWord, 'sinh viên');
  // từ khởi đầu cấu hình là từ bí đường ("ảnh" không nối được): vào chặng là tự đổi
  const { engine: e2 } = makeEngine();
  e2.updateConfig({ startWord: 'hình ảnh' });
  e2.start(t);
  assert.notEqual(e2.currentWord, 'hình ảnh');
  assert.equal(e2.chain.at(-1)!.source, 'jump');
});

test('tắt server bật lại: khôi phục điểm, về tạm dừng, chơi lại lượt dở', () => {
  const { engine } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  engine.handleComment(comment('a', 'viên', t + 100));
  engine.nextRoundNow(t + 200); // a: 9 điểm, từ "sinh viên"
  engine.handleComment(comment('b', 'chức', t + 300)); // lượt dở, chưa cộng
  const snap = JSON.parse(JSON.stringify(engine.snapshot()));

  const { engine: e2 } = makeEngine();
  e2.restore(snap, t + 10_000);
  assert.equal(e2.phase, 'paused');
  assert.equal(e2.players.get('a')!.score, 9);
  e2.resume(t + 11_000);
  assert.equal(e2.currentWord, 'sinh viên');
  assert.equal(e2.roundNo, 2);
  assert.equal(e2.phase, 'running');
});

test('100 người trả lời cùng lúc: đúng thứ tự, đúng bảng điểm', () => {
  const { engine } = makeEngine();
  const t = 1_000_000;
  engine.start(t);
  const answers = ['viên', 'nhật', 'động', 'hoạt'];
  // gửi theo thứ tự i, tới server lộn xộn
  const order = Array.from({ length: 100 }, (_, i) => i).sort((a, b) => ((a * 37) % 100) - ((b * 37) % 100));
  for (const i of order) engine.handleComment(comment(`u${i}`, answers[i % 4], t + 2000 + ((i * 37) % 100), t + 1000 + i * 10));
  engine.nextRoundNow(t + 9000);
  const w = engine.history[0].winners;
  assert.equal(w.length, 100);
  assert.deepEqual(w.slice(0, 5).map((x) => x.userId), ['u0', 'u1', 'u2', 'u3', 'u4']);
  assert.deepEqual(w.map((x) => x.points).reduce((a, b) => a + b, 0), 9 + 7 + 5 + 3 + 2 * 6 + 1 * 10);
});
