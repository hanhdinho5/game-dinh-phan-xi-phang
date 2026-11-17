import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTiers, parseTiers, pointsForRank, validateTiers } from '../server/game/scoring-service';
import { DEFAULT_CONFIG } from '../shared/types';

test('bảng điểm mặc định: 9/7/5/3, hạng 5-10: 2, hạng 11-20: 1, từ 21: 0', () => {
  const t = DEFAULT_CONFIG.scoreTiers;
  const expected = [9, 7, 5, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
  assert.deepEqual(expected.map((_, i) => pointsForRank(t, i + 1)), expected);
});

test('gõ bảng điểm dạng chữ', () => {
  assert.deepEqual(parseTiers('9,7,5,3,2x6,1x10'), DEFAULT_CONFIG.scoreTiers);
  assert.equal(formatTiers(DEFAULT_CONFIG.scoreTiers), '9,7,5,3,2x6,1x10');
  assert.deepEqual(parseTiers('10, 5 x 2'), [
    { from: 1, to: 1, points: 10 },
    { from: 2, to: 3, points: 5 },
  ]);
  assert.throws(() => parseTiers('5,9'), /không được nhiều điểm hơn/);
  assert.throws(() => parseTiers('abc'));
  assert.throws(() => parseTiers(''));
  assert.throws(() => validateTiers([{ from: 2, to: 2, points: 1 }]));
});
