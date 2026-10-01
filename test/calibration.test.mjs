import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calibrator, liftOf, curlNorm, robustQuantile, defaultProfile } from '../src/input/calibration.js';
import { readHands } from '../src/input/signals.js';
import { sequence, restPath, shoulderPath, REST_Y, SHOULDER_Y } from './fixtures.js';

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
  collect(c, 'shoulder', shoulderPath);
  const p = c.build();
  assert.ok(p && !p.error, '應成功產出 profile');
  assert.ok(Math.abs(liftOf(REST_Y, p) - 0) < 0.02, '自然垂放應對應抬升度 0');
  assert.ok(Math.abs(liftOf(SHOULDER_Y, p) - 1) < 0.02, '肩膀高度應對應抬升度 1（不是「舉到最高」）');
});

test('校正同時量到這個玩家的張開與握拳', () => {
  const c = new Calibrator();
  collect(c, 'rest', restPath);          // 張開
  collect(c, 'shoulder', shoulderPath);  // 握拳
  const p = c.build();
  assert.ok(p.curlOpen > p.curlFist, '張開的伸展比應大於握拳');
  assert.ok(Math.abs(curlNorm(p.curlOpen, p) - 0) < 0.02, '張開應對應 0');
  assert.ok(Math.abs(curlNorm(p.curlFist, p) - 1) < 0.02, '握拳應對應 1');
});

test('量不出手型差別時降級而不是卡住：profile 仍可用，但關掉手型條件', () => {
  const c = new Calibrator();
  collect(c, 'rest', restPath);
  collect(c, 'shoulder', () => ({ ...shoulderPath(), open: true }));   // 第二步忘了握拳
  const p = c.build();
  assert.ok(!p.error, '不該是致命錯誤——玩家還是要能玩');
  assert.equal(p.curlUsable, false, '手型條件應被關掉');
  assert.equal(p.warning, 'curl');
  assert.match(p.hint, /握拳/, '要告訴玩家怎麼做會更準');
});

test('樣本不足時不產出 profile（寧可請玩家重做，不要亂猜）', () => {
  const c = new Calibrator();
  c.begin('rest');
  for (const f of sequence({ frames: 3, path: restPath })) c.feed(readHands(f.result));
  collect(c, 'shoulder', shoulderPath);
  assert.equal(c.isReady(), false);
  assert.equal(c.build(), null);
});

test('高度差太小時判定校正失敗，並講得出該怎麼調平板', () => {
  const c = new Calibrator();
  collect(c, 'rest', () => ({ lx: 0.34, ly: 0.62, rx: 0.66, ry: 0.62, open: true }));
  collect(c, 'shoulder', () => ({ lx: 0.34, ly: 0.58, rx: 0.66, ry: 0.58, open: false }));  // 只差 0.04
  const p = c.build();
  assert.equal(p.error, 'range');
  assert.match(p.hint, /平板/, '提示要告訴玩家怎麼調，不能只說失敗');
});

test('校正過程有抖動與掉幀仍能成功', () => {
  const c = new Calibrator();
  collect(c, 'rest', restPath, { jitter: 0.02, dropFrames: [3, 7, 11] });
  collect(c, 'shoulder', shoulderPath, { jitter: 0.02, dropFrames: [2, 9] });
  const p = c.build();
  assert.ok(p && !p.error, '抖動與掉幀下仍應產出 profile');
  assert.ok(p.range > 0.18, `高度差應接近 0.26，實得 ${p.range.toFixed(3)}`);
});

test('只有單手的影格不列入校正樣本', () => {
  const c = new Calibrator();
  c.begin('rest');
  assert.equal(c.feed([{ wrist: { x: .3, y: .7 }, palmSize: .16, curlRatio: 2 }]), false);
  assert.equal(c.count('rest'), 0);
});

test('預設 profile 可用於校正完成前的第一幀', () => {
  const p = defaultProfile();
  assert.ok(p.isDefault);
  assert.ok(p.range > 0);
});
