import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calibrator, liftOf, robustQuantile, defaultProfile } from '../src/input/calibration.js';
import { readHands } from '../src/input/signals.js';
import { sequence, restPath, topPath, REST_Y, TOP_Y } from './fixtures.js';

const collect = (c, step, path, opts = {}) => {
  c.begin(step);
  for (const f of sequence({ frames: 20, path, ...opts })) c.feed(readHands(f.result));
};

test('robustQuantile 取穩健分位數，不被單一離群值拉走', () => {
  const v = [0.5, 0.5, 0.5, 0.5, 0.5, 99];
  assert.equal(robustQuantile(v, 0.5), 0.5);
});

test('正常校正流程能產出 profile，且抬升度換算正確', () => {
  const c = new Calibrator();
  collect(c, 'rest', restPath);
  collect(c, 'top', topPath);
  const p = c.build();
  assert.ok(p, '應成功產出 profile');
  assert.ok(Math.abs(liftOf(REST_Y, p) - 0) < 0.02, '自然垂放應對應抬升度 0');
  assert.ok(Math.abs(liftOf(TOP_Y, p) - 1) < 0.02, '最高點應對應抬升度 1');
});

test('樣本不足時不產出 profile（寧可請玩家重做，不要亂猜）', () => {
  const c = new Calibrator();
  c.begin('rest');
  for (const f of sequence({ frames: 3, path: restPath })) c.feed(readHands(f.result));
  collect(c, 'top', topPath);
  assert.equal(c.isReady(), false);
  assert.equal(c.build(), null);
});

test('可及範圍太小時判定校正失敗（平板角度不對的情況）', () => {
  const c = new Calibrator();
  collect(c, 'rest', () => ({ lx: 0.34, ly: 0.62, rx: 0.66, ry: 0.62 }));
  collect(c, 'top', () => ({ lx: 0.34, ly: 0.58, rx: 0.66, ry: 0.58 }));  // 只差 0.04
  assert.equal(c.build(), null, '範圍過小應視為校正失敗');
});

test('校正過程有抖動與掉幀仍能成功', () => {
  const c = new Calibrator();
  collect(c, 'rest', restPath, { jitter: 0.02, dropFrames: [3, 7, 11] });
  collect(c, 'top', topPath, { jitter: 0.02, dropFrames: [2, 9] });
  const p = c.build();
  assert.ok(p, '抖動與掉幀下仍應產出 profile');
  assert.ok(p.range > 0.3, `可及範圍應接近 0.42，實得 ${p.range.toFixed(3)}`);
});

test('只有單手的影格不列入校正樣本', () => {
  const c = new Calibrator();
  c.begin('rest');
  assert.equal(c.feed([{ wrist: { x: .3, y: .7 }, palmSize: .16 }]), false);
  assert.equal(c.count('rest'), 0);
});

test('預設 profile 可用於校正完成前的第一幀', () => {
  const p = defaultProfile();
  assert.ok(p.isDefault);
  assert.ok(p.range > 0);
});
