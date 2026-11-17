// Các lỗi tìm được khi review (2026-11-10): giữ test để không tái phát
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comment, makeEngine } from './helpers';

const live = { isConnected: false, viewerCount: 0 };
const T = 1_000_000;

test('đổi từ lúc tạm dừng rồi tắt máy: không bị trừ số chặng 2 lần; overlay hiện từ mới, không hiện kết quả cũ', () => {
  const { engine } = makeEngine();
  engine.start(T);
  engine.nextRoundNow(T + 100); // chặng 2: sinh viên
  engine.pause(T + 200);
  engine.setWord('mùa xuân', T + 300);
  const view = engine.overlayState(T + 300, live);
  assert.deepEqual([view.word, view.roundNo, view.roundPhase], ['mùa xuân', 2, 'answering']);
  const { engine: e2 } = makeEngine();
  e2.restore(JSON.parse(JSON.stringify(engine.snapshot())), T + 400);
  e2.resume(T + 500);
  assert.deepEqual([e2.currentWord, e2.roundNo], ['mùa xuân', 2]);
});

test('chặng cuối: không chọn từ tiếp, không thêm vào chuỗi; "Chặng tiếp" không vượt số chặng', () => {
  const { engine } = makeEngine();
  engine.updateConfig({ roundsPerRace: 2, autoNewRace: false });
  engine.start(T);
  engine.nextRoundNow(T + 100);
  assert.equal(engine.roundNo, 2);
  const chainLen = engine.chain.length;
  engine.handleComment(comment('a', 'chức', T + 200, T + 150));
  engine.nextRoundNow(T + 300);
  assert.equal(engine.history.at(-1)!.nextSource, 'end');
  assert.equal(engine.history.at(-1)!.nextWord, '');
  assert.equal(engine.chain.length, chainLen, 'không có từ "ma" trong chuỗi');
  assert.equal(engine.phase, 'ended');
  assert.equal(engine.roundNo, 2);
});

test('admin bấm Kết thúc giữa chặng: chặng dở là chặng cuối, không có từ tiếp', () => {
  const { engine } = makeEngine();
  engine.start(T);
  engine.handleComment(comment('a', 'viên', T + 100, T + 50));
  engine.end(T + 200);
  assert.equal(engine.history.at(-1)!.nextSource, 'end');
  assert.deepEqual(engine.chain.map((c) => c.word), ['học sinh']);
});

test('tắt "tự mở cuộc đua mới" lúc đang vinh danh thì huỷ cuộc đua đang chờ', () => {
  const { engine } = makeEngine();
  engine.start(T);
  engine.end(T + 100);
  assert.ok(engine.nextRaceAt > 0);
  engine.updateConfig({ autoNewRace: false });
  assert.equal(engine.nextRaceAt, 0);
  engine.tick(T + 10_000_000);
  assert.equal(engine.phase, 'ended');
});

test('đáp án gửi TRONG lúc tạm dừng không được tính (chỉ tính gửi trước lúc dừng + bù độ trễ)', () => {
  const { engine } = makeEngine(); // bù độ trễ 1 giây trong test
  engine.start(T);
  engine.pause(T + 3000);
  engine.handleComment(comment('a', 'viên', T + 3600, T + 3500)); // trong 1 giây bù trễ: tính
  engine.handleComment(comment('b', 'nhật', T + 9100, T + 9000)); // giữa lúc dừng: không tính
  engine.resume(T + 20_000);
  engine.handleComment(comment('c', 'động', T + 15_100, T + 15_000)); // gửi lúc dừng, tới sau: không tính
  engine.handleComment(comment('d', 'hoạt', T + 21_000, T + 20_900)); // sau khi tiếp tục: tính
  assert.deepEqual(engine.round!.provisional().map((e) => e.userId), ['a', 'd']);
});

test('duyệt từ không cộng nhầm đáp án bị từ chối vì "đã dùng"', () => {
  const { engine } = makeEngine();
  engine.start(T);
  engine.nextRoundNow(T + 100); // -> sinh viên (đã dùng: học sinh, sinh viên)
  engine.setWord('học tập', T + 200);
  engine.handleComment(comment('a', 'sinh', T + 300, T + 250)); // "học sinh" đã dùng
  assert.equal(engine.approveWordInRound('học sinh', T + 400), 0);
  assert.equal(engine.round!.correctCount, 0);
});

test('Phiên mới (xoá người chơi) vẫn giữ danh sách bị khoá', () => {
  const { engine } = makeEngine();
  engine.handleComment(comment('spam', 'join', T));
  engine.removePlayer('spam', true);
  engine.reset(false, T + 100);
  engine.handleComment(comment('spam', 'join', T + 200));
  assert.equal(engine.players.get('spam'), undefined);
});

test('máy tắt lâu lúc đang vinh danh: bật lại không dọn sạch người chơi', () => {
  const { engine } = makeEngine();
  engine.handleComment(comment('a', 'join', T));
  engine.start(T);
  engine.end(T + 100);
  const { engine: e2 } = makeEngine();
  e2.restore(JSON.parse(JSON.stringify(engine.snapshot())), T + 3_600_000);
  e2.tick(T + 3_700_000);
  assert.equal(e2.phase, 'running');
  assert.equal(e2.players.count, 1);
});
