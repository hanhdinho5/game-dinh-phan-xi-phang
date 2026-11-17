import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PhanXiPangEngine } from '../server/game/phan-xi-pang-engine';
import { McDirector } from '../server/game/mc-director';
import { joinNames } from '../server/game/mc-lines';
import { silentLogger } from '../server/logger';
import type { VoiceLine } from '../shared/types';
import { comment, makeBank } from './helpers';

function setup(t0 = 1_000_000) {
  const lines: VoiceLine[] = [];
  let director: McDirector | null = null;
  let r = 0.42;
  const rng = () => (r = ((r * 9301 + 49297) % 233280) / 233280);
  const engine = new PhanXiPangEngine(
    { bank: makeBank(), log: silentLogger(), rng, emit: (name, ...args) => director?.onEvent(name, args as never, now) },
    t0,
  );
  let now = t0;
  director = new McDirector(engine, (l) => lines.push(l), rng);
  engine.updateConfig({ startWord: 'học sinh', roundSeconds: 10, revealSeconds: 4, lateGraceMs: 1000, raceBreakSeconds: 20 });
  const at = (t: number) => (now = t);
  return { engine, director, lines, at };
}
const plain = (l: VoiceLine) => l.text.replace(/\^/g, '').replace(/\s*\|\s*/g, ' ');

test('MC đọc đề lúc bắt đầu chặng: có từ, tiếng cần nối; cuộc đua mới có lời chào xuất phát', () => {
  const { engine, lines, at } = setup();
  const t = at(1_000_000);
  engine.start(t);
  const ask = lines.at(-1)!;
  assert.equal(ask.kind, 'main');
  assert.match(plain(ask), /học sinh/);
  assert.match(plain(ask), /sinh/);
  assert.match(plain(ask), /[Cc]uộc đua số 1/);
  assert.equal(ask.expiresAt, engine.round!.endsAt - 3000, 'đọc đề trễ quá thì bỏ');
});

test('MC đọc kết quả: tên người nhanh nhất (đã lọc cho dễ đọc), điểm, từ mới', () => {
  const { engine, lines, at } = setup();
  const t = at(1_000_000);
  engine.start(t);
  engine.handleComment(comment('a', 'viên', at(t + 500), t + 400, { nickname: 'Lan Anh 🌸' }));
  engine.handleComment(comment('b', 'nhật', at(t + 600), t + 500));
  engine.nextRoundNow(at(t + 1000));
  const result = lines.find((l) => /cộng 9 điểm/.test(plain(l)))!;
  assert.ok(result, 'có câu kết quả');
  assert.match(plain(result), /Lan Anh/);
  assert.doesNotMatch(result.text, /🌸/);
  assert.ok(plain(result).includes(engine.lastResult!.nextWord), 'MC đọc từ mới');
  assert.match(plain(result), /2 (người|bạn) nối đúng/);
});

test('Vinh danh: đọc hạng tư -> ba -> nhì -> vô địch, rồi báo chuẩn bị, tự mở cuộc đua mới', () => {
  const { engine, director, lines, at } = setup();
  let t = at(1_000_000);
  engine.start(t);
  ['a', 'b', 'c', 'd', 'e'].forEach((u, i) => engine.handleComment(comment(u, ['viên', 'nhật', 'động', 'hoạt', 'viên'][i], at(t + 100 + i * 10), t + 50 + i * 10, { nickname: `Người ${u.toUpperCase()}` })));
  engine.end(at((t += 2000)));
  const ceremony = lines.find((l) => l.flush)!;
  const text = plain(ceremony);
  const order = ['Hạng tư: Người D', 'Hạng ba: Người C', 'Hạng nhì: Người B', 'Người A'].map((s) => text.indexOf(s));
  assert.ok(order.every((i) => i >= 0), text);
  assert.deepEqual([...order].sort((x, y) => x - y), order, 'đúng thứ tự công bố');
  assert.equal(engine.winners!.length, 4, 'vinh danh Top 4');
  assert.equal(engine.nextRaceAt, t + 20_000);

  // 11 giây trước cuộc đua mới: "Tất cả chuẩn bị!"
  director.tick(at(t + 8000));
  assert.ok(!lines.some((l) => /chuẩn bị/.test(plain(l))));
  director.tick(at(t + 9500));
  assert.ok(lines.some((l) => /Tất cả chuẩn bị/.test(plain(l))));

  engine.tick(at(t + 20_000));
  assert.equal(engine.phase, 'running');
  assert.equal(engine.raceNo, 2);
  assert.equal(engine.players.count, 5, 'giữ người chơi');
  assert.equal(engine.players.get('a')!.score, 0, 'điểm về 0');
  assert.match(plain(lines.at(-1)!), /[Cc]uộc đua số 2/);
});

test('Đủ số chặng của cuộc đua thì tự kết thúc và vinh danh', () => {
  const { engine, at } = setup();
  const t = at(1_000_000);
  engine.updateConfig({ roundsPerRace: 2, autoNewRace: false });
  engine.start(t);
  engine.handleComment(comment('a', 'viên', at(t + 100), t + 50));
  engine.tick(at(t + 10_000)); // hết giờ
  engine.tick(at(t + 12_300)); // chốt
  engine.tick(at(t + 16_400)); // hết kết quả -> chặng 2
  assert.equal(engine.roundNo, 2);
  engine.tick(at(t + 26_400));
  engine.tick(at(t + 28_700));
  engine.tick(at(t + 32_800));
  assert.equal(engine.phase, 'ended');
  assert.equal(engine.nextRaceAt, 0, 'không tự mở cuộc đua mới khi đã tắt');
  engine.tick(at(t + 999_999));
  assert.equal(engine.phase, 'ended');
});

test('Cảm ơn quà: combo cùng người chỉ cảm ơn 1 lần mỗi 30 giây; quà to luôn cảm ơn', () => {
  const { engine, director, lines, at } = setup();
  const t = at(1_000_000);
  const gift = (u: string, coins: number, when: number) =>
    engine.handleGift({ msgId: `${u}${when}`, userId: u, uniqueId: u, nickname: `Bạn ${u}`, avatar: '', giftName: 'Hoa hồng', diamondCount: coins, repeatCount: 1, receivedAt: when, source: 'mock' });
  gift('a', 1, at(t));
  gift('a', 1, at(t + 1000));
  gift('a', 199, at(t + 2000));
  for (let i = 0; i < 5; i++) director.tick(at(t + 3000 + i * 100));
  assert.equal(lines.filter((l) => /Hoa hồng/.test(l.text)).length, 2);
});

test('Tắt giọng thì MC im (trừ câu admin gõ); chào người mới gom tên', () => {
  const { engine, director, lines, at } = setup();
  const t = at(1_000_000);
  ['a', 'b', 'c', 'd', 'e'].forEach((u) => engine.handleComment(comment(u, 'join', at(t))));
  director.tick(at(t + 8000));
  const greet = lines.filter((l) => l.kind === 'chatter').at(-1)!;
  assert.match(plain(greet), /và 3 bạn nữa/);
  engine.updateConfig({ voiceEnabled: false });
  const n = lines.length;
  engine.start(at(t + 9000));
  assert.equal(lines.length, n);
  director.speak('Xin chào', t + 9000);
  assert.equal(lines.length, n + 1);
  assert.equal(joinNames(['A', 'B']), 'A và B');
});
