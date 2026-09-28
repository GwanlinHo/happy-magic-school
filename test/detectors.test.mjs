import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ema, HoldDetector, RepDetector, AlternateDetector } from '../src/input/detectors.js';

const feed = (d, samples) => samples.map(([t, v]) => d.update(t, v === null ? null : { v }));

test('Ema 平滑：單幀離群值不會整個跟過去', () => {
  const e = new Ema(0.4);
  [0, 0, 0, 0].forEach(v => e.push(v));
  e.push(1);
  assert.ok(e.value < 0.45, `離群值應被壓抑，實得 ${e.value}`);
});

test('HoldDetector：進入用嚴格門檻、離開用寬鬆門檻（遲滯）', () => {
  const d = new HoldDetector({ signal: s => s.v, enter: 0.7, exit: 0.6, alpha: 1 });
  feed(d, [[0, 0.5], [100, 0.65]]);
  assert.equal(d.holding, false, '0.65 未達 enter，不應開始');
  feed(d, [[200, 0.75]]);
  assert.equal(d.holding, true, '越過 enter 應開始');
  feed(d, [[300, 0.65]]);
  assert.equal(d.holding, true, '掉回 enter 與 exit 之間時應維持住（這就是遲滯的意義）');
  feed(d, [[400, 0.55]]);
  assert.equal(d.holding, false, '低於 exit 才中斷');
});

test('HoldDetector：短暫掉幀不算中斷，超過寬限才中斷', () => {
  const a = new HoldDetector({ signal: s => s.v, enter: 0.7, exit: 0.6, graceMs: 250, alpha: 1 });
  feed(a, [[0, 0.8], [100, 0.8], [200, null], [300, 0.8]]);
  assert.equal(a.holding, true, '100ms 的掉幀應被容忍');
  assert.ok(a.holdMs >= 300, `維持時間應連續累計，實得 ${a.holdMs}`);

  const b = new HoldDetector({ signal: s => s.v, enter: 0.7, exit: 0.6, graceMs: 250, alpha: 1 });
  feed(b, [[0, 0.8], [100, 0.8], [200, null], [400, null], [600, null]]);
  assert.equal(b.holding, false, '超過寬限期應中斷');
});

test('HoldDetector：maxHoldMs 記錄歷來最長，中斷後重新計時', () => {
  const d = new HoldDetector({ signal: s => s.v, enter: 0.7, exit: 0.6, alpha: 1 });
  feed(d, [[0, 0.8], [1000, 0.8], [1100, 0.1], [1200, 0.8], [1300, 0.8]]);
  assert.equal(d.maxHoldMs, 1000, '第一段維持 0→1000ms');
  assert.equal(d.holdMs, 100, '中斷後歸零重算：1200 進入不計時，1300 累計 100ms');
});

test('RepDetector：完整來回才算一次，未回到低區不計數', () => {
  const d = new RepDetector({ signal: s => s.v, high: 0.7, low: 0.3, minPeriodMs: 0, alpha: 1 });
  feed(d, [[0, 0.1], [100, 0.9]]);
  assert.equal(d.count, 0, '只上去還不算');
  feed(d, [[200, 0.1]]);
  assert.equal(d.count, 1, '回到低區才算一次');
  feed(d, [[300, 0.5], [400, 0.1]]);
  assert.equal(d.count, 1, '沒越過高門檻不算');
});

test('RepDetector：minPeriodMs 擋掉抖動造成的假計數', () => {
  const d = new RepDetector({ signal: s => s.v, high: 0.7, low: 0.3, minPeriodMs: 300, alpha: 1 });
  feed(d, [[0, 0.1], [50, 0.9], [100, 0.1], [150, 0.9], [200, 0.1]]);
  assert.equal(d.count, 1, `50ms 一次的抖動只應算一次，實得 ${d.count}`);
});

test('AlternateDetector：兩側輪流達標才計數，同側重複不計', () => {
  const d = new AlternateDetector({ signal: s => s.v, high: 0.5, low: -0.5, minPeriodMs: 0, alpha: 1 });
  feed(d, [[0, 0.8]]);
  assert.equal(d.count, 0, '第一次只是建立起始側');
  feed(d, [[200, -0.8]]);
  assert.equal(d.count, 1);
  feed(d, [[400, -0.9], [500, -0.7]]);
  assert.equal(d.count, 1, '留在同一側不應累加');
  feed(d, [[700, 0.8]]);
  assert.equal(d.count, 2);
});
