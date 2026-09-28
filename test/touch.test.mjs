import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TouchRuneBank, InputRouter } from '../src/input/touch.js';
import { RuneBank } from '../src/input/runes.js';

test('觸控維持：按住會累積時間，放開即中斷', () => {
  const b = new TouchRuneBank();
  b.update(0);
  b.setPressed('light', true);
  b.update(100); b.update(1100);
  assert.ok(b.controls.light.holdMs >= 1000);
  b.setPressed('light', false);
  const s = b.update(1200);
  assert.equal(s.light.holding, false);
  assert.ok(s.light.maxHoldMs >= 1000, '最長維持仍應被記住');
});

test('觸控往復：連點計數，過快的重複點擊不重複計數', () => {
  const b = new TouchRuneBank();
  b.tap('flame', 0); b.tap('flame', 50); b.tap('flame', 300);
  assert.equal(b.update(300).flame.count, 2);
});

test('觸控與手勢的輸出形狀一致，遊戲層不需要分辨來源', () => {
  const g = new RuneBank(), t = new TouchRuneBank();
  const gs = g.update(0, null), ts = t.update(0);
  assert.deepEqual(Object.keys(gs).sort(), Object.keys(ts).sort());
  for (const k of Object.keys(gs)) {
    assert.deepEqual(Object.keys(gs[k]).sort(), Object.keys(ts[k]).sort(), `${k} 的欄位不一致`);
  }
});

test('手勢長時間無訊號時提示改用觸控，但不擅自切換', () => {
  const r = new InputRouter({ gestureBank: new RuneBank(), touchBank: new TouchRuneBank(), staleMs: 3000 });
  r.update(0, { lift: 0, liftL: 0, liftR: 0, tilt: 0, spread: 2, sway: 0, scale: 0.16 });
  let out = r.update(2000, null);
  assert.equal(out.suggestTouch, false);
  out = r.update(5000, null);
  assert.equal(out.suggestTouch, true, '超過 staleMs 應提示');
  assert.equal(out.mode, 'gesture', '不應擅自切換模式');
});

test('切到觸控模式後由觸控狀態供應遊戲層', () => {
  const touch = new TouchRuneBank();
  const r = new InputRouter({ gestureBank: new RuneBank(), touchBank: touch });
  r.setMode('touch');
  touch.setPressed('guard', true);
  r.update(0, null);
  const out = r.update(1000, null);
  assert.ok(out.states.guard.holdMs >= 1000);
});
