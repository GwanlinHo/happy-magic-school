import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNES, RUNE_KEYS, RuneBank } from '../src/input/runes.js';
import { sequence, RUNE_PATHS, yAtLift, restPath, makeResult } from './fixtures.js';
import { calibratedProfile, run } from './helpers.js';
import { readHands, computeSignals } from '../src/input/signals.js';

const profile = calibratedProfile();
const FPS = 15;

/** 跑一段動作，回傳各符文的最終狀態。 */
function runBank(path, { frames = 90, jitter = 0, dropFrames = [], spikes = [] } = {}) {
  const bank = new RuneBank();
  let last = null;
  for (const f of sequence({ frames, fps: FPS, path, jitter, dropFrames, spikes })) {
    last = bank.update(f.t, computeSignals(readHands(f.result), profile));
  }
  return last;
}

const fired = (state, key) =>
  RUNES[key].type === 'hold' ? state[key].maxHoldMs >= 1000 : state[key].count >= 3;

test('五個符文各自的動作都能被判定出來', () => {
  for (const key of RUNE_KEYS) {
    const st = runBank(RUNE_PATHS[key]);
    assert.ok(fired(st, key),
      `${RUNES[key].name}（${RUNES[key].action}）未被判定：${JSON.stringify(st[key])}`);
  }
});

test('不互相誤判：做某個動作時，其他符文不應被判定成立', () => {
  const problems = [];
  for (const key of RUNE_KEYS) {
    const st = runBank(RUNE_PATHS[key]);
    for (const other of RUNE_KEYS) {
      if (other === key) continue;
      if (fired(st, other)) {
        problems.push(`做「${RUNES[key].action}」時誤判成「${RUNES[other].action}」：${JSON.stringify(st[other])}`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('自然垂放時不會觸發任何符文', () => {
  const st = runBank(restPath, { frames: 60 });
  for (const key of RUNE_KEYS) {
    assert.ok(!fired(st, key), `靜止時誤觸發 ${RUNES[key].name}：${JSON.stringify(st[key])}`);
  }
});

test('有抖動時仍能判定（模擬真實辨識雜訊）', () => {
  for (const key of RUNE_KEYS) {
    const st = runBank(RUNE_PATHS[key], { jitter: 0.012 });
    assert.ok(fired(st, key), `${RUNES[key].name} 在抖動下失效：${JSON.stringify(st[key])}`);
  }
});

test('P0 實測的單幀跳值不應中斷維持', () => {
  // P0 觀察到 0.343 → 0.469 → 0.345 的單幀跳值
  const spikes = [[40, { ly: yAtLift(0.20), ry: yAtLift(0.20) }]];
  const st = runBank(RUNE_PATHS.light, { spikes });
  assert.ok(st.light.maxHoldMs >= 1000,
    `單幀跳值不應中斷高舉維持：${JSON.stringify(st.light)}`);
});

test('連續掉幀超過寬限期會中斷維持（不會憑空累積時間）', () => {
  const drop = [];
  for (let i = 40; i < 55; i++) drop.push(i);   // 15 幀 ≈ 1 秒，遠超 300ms 寬限
  const bank = new RuneBank(['light']);
  let sawBreak = false;
  for (const f of sequence({ frames: 90, fps: FPS, path: RUNE_PATHS.light, dropFrames: drop })) {
    const st = bank.update(f.t, computeSignals(readHands(f.result), profile));
    if (f.t > 3000 && f.t < 3600 && !st.light.holding) sawBreak = true;
  }
  assert.ok(sawBreak, '長時間掉幀應該讓維持中斷');
});

test('手只有一隻在畫面裡時視同掉幀，不產生訊號', () => {
  const oneHand = makeResult([{ x: 0.4, y: 0.5, palm: 0.16 }]);
  assert.equal(readHands(oneHand).length, 1);
  assert.equal(computeSignals(readHands(oneHand), profile), null, '只有一隻手時應回傳 null');
  assert.equal(computeSignals(readHands(makeResult([])), profile), null, '完全沒抓到手時應回傳 null');
});

test('手緩慢經過胸口高度不應被誤判成前推維持', () => {
  // 整合測試在慢速影片下抓到的問題：手「經過」某高度與「停在」某高度必須分得開。
  const slowRise = (t) => {
    const lift = Math.min(0.85, (t / 6000) * 0.85);     // 6 秒緩慢升到 0.85
    const y = yAtLift(lift);
    return { lx: 0.36, ly: y, rx: 0.64, ry: y };
  };
  const st = runBank(slowRise, { frames: 100 });
  assert.ok(st.guard.maxHoldMs < 800,
    `緩慢經過不應累積成維持，實得 ${st.guard.maxHoldMs.toFixed(0)}ms`);
  assert.ok(st.light.maxHoldMs >= 1000, '最後停在高處仍應判定為高舉');
});

test('真正停在胸口高度時仍判定得到前推維持', () => {
  const st = runBank(RUNE_PATHS.guard, { frames: 90 });
  assert.ok(st.guard.maxHoldMs >= 1000, `實得 ${st.guard.maxHoldMs.toFixed(0)}ms`);
});
