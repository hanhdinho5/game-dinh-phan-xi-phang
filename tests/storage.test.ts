import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonStore, type PlayerProfile } from '../server/storage/json-store';
import { Logger, silentLogger } from '../server/logger';
import type { SessionRecord } from '../server/game/phan-xi-pang-engine';
import type { PlayerView } from '../shared/types';
import type { GameConfig } from '../shared/types';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pxp-store-'));

const view = (userId: string, score: number, extra: Partial<PlayerView> = {}): PlayerView => ({
  userId, uniqueId: userId, nickname: `Nick ${userId}`, avatar: '', score, correct: score, rank: 1, seated: true,
  joinedAt: 1000, lastGain: 0, lastGainRound: 0, isMock: false, ...extra,
});

const session = (id: string, ranking: PlayerView[], endedAt: number | null = 5000): SessionRecord => ({
  id, startedAt: 1000, endedAt, config: {} as GameConfig, rounds: 3, chain: [], ranking, winners: ranking.slice(0, 1),
});

test('ghi rồi đọc lại; thiếu file thì trả giá trị mặc định', () => {
  const store = new JsonStore(tmp(), silentLogger());
  assert.deepEqual(store.read('khong-co.json', { a: 1 }), { a: 1 });
  store.write('x.json', { b: 2 });
  assert.deepEqual(store.read('x.json', null), { b: 2 });
  assert.equal(fs.existsSync(path.join(store.dir, 'x.json.tmp')), false, 'không để lại file tạm');
});

test('file JSON hỏng: giữ bản hỏng, không để lần ghi sau đè mất', () => {
  const dir = tmp();
  const store = new JsonStore(dir, silentLogger());
  fs.writeFileSync(path.join(dir, 'players.json'), '{"u1": {"nickname": "A"'); // cụt giữa chừng
  assert.deepEqual(store.read('players.json', {}), {});
  assert.equal(fs.existsSync(path.join(dir, 'players.json')), false);
  const kept = fs.readdirSync(dir).filter((f) => f.startsWith('players.json.corrupt-'));
  assert.equal(kept.length, 1);
  assert.match(fs.readFileSync(path.join(dir, kept[0]), 'utf8'), /nickname/);
  store.write('players.json', { moi: 1 }); // ghi mới không đụng bản hỏng
  assert.equal(fs.readdirSync(dir).filter((f) => f.startsWith('players.json.corrupt-')).length, 1);
});

test('writeSoon gom nhiều lần ghi; flush ghi ngay', async () => {
  const store = new JsonStore(tmp(), silentLogger());
  let n = 0;
  store.writeSoon('a.json', () => ({ n: ++n }), 20);
  store.writeSoon('a.json', () => ({ n: ++n }), 20);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(store.read('a.json', null), { n: 1 }, 'chỉ ghi 1 lần');
  store.writeSoon('b.json', () => ({ ok: true }), 10_000);
  store.flush({ 'b.json': () => ({ ok: 'flush' }) });
  assert.deepEqual(store.read('b.json', null), { ok: 'flush' });
});

test('lưu phiên cộng dồn hồ sơ; lưu lại cùng phiên không cộng 2 lần', () => {
  const store = new JsonStore(tmp(), silentLogger());
  store.saveSession(session('s1', [view('u1', 10), view('u2', 4)]));
  store.saveSession(session('s1', [view('u1', 12), view('u2', 4)])); // cùng phiên, điểm tăng thêm 2
  let p = store.read<Record<string, PlayerProfile>>('players.json', {});
  assert.equal(p.u1.totalPoints, 12);
  assert.equal(p.u1.sessions, 1);
  assert.equal(p.u1.wins, 1);
  assert.equal(p.u2.wins, 0);
  store.saveSession(session('s2', [view('u2', 20), view('u1', 5)]));
  p = store.read<Record<string, PlayerProfile>>('players.json', {});
  assert.equal(p.u1.sessions, 2);
  assert.equal(p.u1.totalPoints, 17);
  assert.equal(p.u2.wins, 1);
  assert.equal(p.u1.bestScore, 12);
});

test('đổi người thắng khi lưu lại cùng phiên: số lần thắng được sửa', () => {
  const store = new JsonStore(tmp(), silentLogger());
  store.saveSession(session('s1', [view('u1', 10), view('u2', 4)]));
  store.saveSession(session('s1', [view('u2', 15), view('u1', 10)]));
  const p = store.read<Record<string, PlayerProfile>>('players.json', {});
  assert.equal(p.u1.wins, 0);
  assert.equal(p.u2.wins, 1);
});

test('người chơi giả và userId nguy hiểm không vào hồ sơ', () => {
  const store = new JsonStore(tmp(), silentLogger());
  store.saveSession(session('s1', [view('mock_1', 9, { isMock: true }), view('__proto__', 8), view('constructor', 7), view('real', 6)]));
  const p = store.read<Record<string, PlayerProfile>>('players.json', {});
  assert.deepEqual(Object.keys(p), ['real']);
  assert.equal(({} as Record<string, unknown>).totalPoints, undefined, 'Object.prototype không bị nhiễm');
});

test('phiên không ai ghi điểm thì không ai được tính thắng', () => {
  const store = new JsonStore(tmp(), silentLogger());
  store.saveSession(session('s0', [view('u1', 0)]));
  assert.equal(store.read<Record<string, PlayerProfile>>('players.json', {}).u1.wins, 0);
});

test('id phiên có ký tự lạ không thoát khỏi thư mục sessions', () => {
  const dir = tmp();
  const store = new JsonStore(dir, silentLogger());
  store.saveSession(session('../../evil', [view('u1', 1)]));
  assert.equal(fs.existsSync(path.join(dir, '..', 'evil.json')), false);
  assert.equal(store.listSessions().length, 1);
});

test('lịch sử lượt ghi từng dòng; danh sách phiên mới nhất trước', () => {
  const store = new JsonStore(tmp(), silentLogger());
  store.appendRound('s1', { n: 1 } as never);
  store.appendRound('s1', { n: 2 } as never);
  const lines = fs.readFileSync(path.join(store.sessionsDir, 's1.rounds.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  store.saveSession(session('2026-11-01', [view('u1', 1)]));
  store.saveSession(session('2026-11-09', [view('u1', 2)]));
  assert.deepEqual(store.listSessions().map((s) => s.id), ['2026-11-09', '2026-11-01']);
});

test('settings gộp từng phần', () => {
  const store = new JsonStore(tmp(), silentLogger());
  store.saveSettings({ tiktokUser: 'abc' });
  store.saveSettings({});
  assert.equal(store.loadSettings().tiktokUser, 'abc');
});

test('logger xoá log cũ hơn 30 ngày, giữ log mới và file lạ', () => {
  const dir = tmp();
  const old = path.join(dir, '2026-01-01.log');
  const fresh = path.join(dir, '2026-11-16.log');
  const other = path.join(dir, 'ghi-chu.txt');
  for (const f of [old, fresh, other]) fs.writeFileSync(f, 'x');
  const past = new Date(Date.now() - 40 * 86_400_000);
  fs.utimesSync(old, past, past);
  fs.utimesSync(other, past, past);
  new Logger(dir, true).prune(30);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(fresh), true);
  assert.equal(fs.existsSync(other), true);
});
