import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNES, RUNE_KEYS, RuneBank } from '../src/input/runes.js';
import { sequence, RUNE_PATHS, yAtLift, restPath, makeResult,
         pathFistAtShoulder, pathOpenAtChest } from './fixtures.js';
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

test('手型不對就不該觸發：握拳抬到肩線不是「光」', () => {
  const st = runBank(pathFistAtShoulder);
  assert.ok(st.light.maxHoldMs < 800,
    `「光」要求張開手，握拳不該成立（實得 ${st.light.maxHoldMs.toFixed(0)}ms）`);
});

test('手型不對就不該觸發：張開手停在胸口不是「固」', () => {
  const st = runBank(pathOpenAtChest);
  assert.ok(st.guard.maxHoldMs < 800,
    `「固」要求握拳，張開手不該成立（實得 ${st.guard.maxHoldMs.toFixed(0)}ms）`);
});

test('從「光」換到「固」的過程中不會誤判（高度與手型同時變）', () => {
  // 肩線張開 → 胸口握拳。動作縮小後高度區間變窄，這是最容易互相誤判的一組。
  const swap = (t) => (t < 2500
    ? { lx: 0.34, ly: yAtLift(0.90), rx: 0.66, ry: yAtLift(0.90), open: true }
    : { lx: 0.36, ly: yAtLift(0.45), rx: 0.64, ry: yAtLift(0.45), open: false });
  const bank = new RuneBank();
  let lightDone = 0, guardStarted = false;
  for (const f of sequence({ frames: 90, fps: FPS, path: swap })) {
    const st = bank.update(f.t, computeSignals(readHands(f.result), profile));
    if (f.t < 2500) lightDone = st.light.maxHoldMs;
    else if (st.guard.holding) guardStarted = true;
  }
  const st = bank.update(6000, null);
  assert.ok(lightDone >= 1000, `前半段的「光」應成立（實得 ${lightDone.toFixed(0)}ms）`);
  assert.ok(guardStarted, '後半段的「固」應成立');
  assert.ok(st.shield.maxHoldMs < 800, `切換過程不該誤判成「護」（實得 ${st.shield.maxHoldMs.toFixed(0)}ms）`);
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
    const lift = Math.min(0.90, (t / 6000) * 0.90);     // 6 秒緩慢升到肩線
    const y = yAtLift(lift);
    return { lx: 0.36, ly: y, rx: 0.64, ry: y, open: false };   // 握拳，所以「固」的手型條件是成立的
  };
  const st = runBank(slowRise, { frames: 100 });
  assert.ok(st.guard.maxHoldMs < 800,
    `緩慢經過不應累積成維持，實得 ${st.guard.maxHoldMs.toFixed(0)}ms`);
  assert.ok(st.light.maxHoldMs < 800, '握拳時不該判定成「光」（光要求張開手）');
});

test('真正停在胸口高度時仍判定得到前推維持', () => {
  const st = runBank(RUNE_PATHS.guard, { frames: 90 });
  assert.ok(st.guard.maxHoldMs >= 1000, `實得 ${st.guard.maxHoldMs.toFixed(0)}ms`);
});

test('校正量不出手型時自動降級：不看手型，仍判得到「光」與「固」', () => {
  const degraded = { ...profile, curlUsable: false };
  const bank = new RuneBank();
  const runWith = (path, prof, frames = 90) => {
    const b = new RuneBank();
    for (const f of sequence({ frames, fps: FPS, path })) {
      b.update(f.t, computeSignals(readHands(f.result), prof));
    }
    return b.update(frames * 1000 / FPS + 100, null);
  };
  // 降級模式下，手型是張是握都不影響——只看高度與雙手距離
  const st1 = runWith(pathFistAtShoulder, degraded);
  assert.ok(st1.light.maxHoldMs >= 1000, `降級後抬到肩線就該算「光」（實得 ${st1.light.maxHoldMs.toFixed(0)}ms）`);
  const st2 = runWith(pathOpenAtChest, degraded);
  assert.ok(st2.guard.maxHoldMs >= 1000, `降級後停在胸口就該算「固」（實得 ${st2.guard.maxHoldMs.toFixed(0)}ms）`);
  // 但高度仍要分得開：抬到肩線不該同時算成「固」
  assert.ok(st1.guard.maxHoldMs < 800, `降級後高度仍要分得開（實得 ${st1.guard.maxHoldMs.toFixed(0)}ms）`);
  assert.ok(bank.keys.length === 5);
});
