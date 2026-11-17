import { WordBank } from '../server/game/word-bank';
import { PhanXiPangEngine } from '../server/game/phan-xi-pang-engine';
import { silentLogger } from '../server/logger';
import type { LiveComment, ServerToClientEvents } from '../shared/types';

/** Ngân hàng từ nhỏ để test */
export const BASE = [
  'học sinh', 'sinh viên', 'sinh nhật', 'sinh động', 'sinh hoạt', 'viên chức', 'chức vụ', 'vụ mùa', 'mùa xuân',
  'nhật ký', 'ký túc', 'động vật', 'vật lý', 'hoạt hình', 'hình ảnh', 'xuân sắc', 'sắc đẹp', 'hoá học', 'học tập',
  'tập thể', 'thể thao', 'thao tác',
];
export const COMMON = ['học sinh', 'sinh viên', 'viên chức', 'chức vụ', 'mùa xuân', 'xuân sắc', 'sắc đẹp', 'học tập', 'tập thể', 'thể thao'];

export const makeBank = () => new WordBank(BASE, COMMON);

export interface Captured {
  name: keyof ServerToClientEvents;
  args: unknown[];
}

export function makeEngine(t0 = 1_000_000) {
  const events: Captured[] = [];
  const bank = makeBank();
  let r = 0.42;
  const engine = new PhanXiPangEngine(
    {
      bank,
      log: silentLogger(),
      emit: (name, ...args) => events.push({ name, args }),
      rng: () => (r = (r * 9301 + 49297) % 233280 / 233280), // cố định để test lặp lại được
    },
    t0,
  );
  engine.updateConfig({ startWord: 'học sinh', roundSeconds: 10, revealSeconds: 3, lateGraceMs: 1000 });
  return { engine, events, bank };
}

let msg = 0;
export function comment(userId: string, text: string, receivedAt: number, createTime = 0, extra: Partial<LiveComment> = {}): LiveComment {
  return {
    msgId: `m${++msg}`,
    userId,
    uniqueId: userId,
    nickname: `Bạn ${userId}`,
    avatar: '',
    text,
    createTime,
    receivedAt,
    source: 'mock',
    ...extra,
  };
}
