// 觸控備援：產生與手勢層完全相同形狀的輸出，讓遊戲層完全不必知道玩家用哪種輸入。
// 存在理由（GAME_DESIGN §5D、§16）：鏡頭壞掉、光線不足、手不舒服、自動化測試需要非鏡頭輸入。

import { RUNES } from './runes.js';

/** 對應維持型符文：按住按鈕＝維持；放開＝中斷。 */
class TouchHold {
  constructor() { this.reset(); }
  reset() { this.holding = false; this.holdMs = 0; this.maxHoldMs = 0; this.lastT = null; }
  setPressed(pressed) {
    if (pressed && !this.holding) { this.holding = true; this.holdMs = 0; }
    else if (!pressed) this.holding = false;
  }
  update(t) {
    const dt = this.lastT === null ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;
    if (this.holding) {
      this.holdMs += dt;
      if (this.holdMs > this.maxHoldMs) this.maxHoldMs = this.holdMs;
    }
    return { holding: this.holding, holdMs: this.holdMs, maxHoldMs: this.maxHoldMs, value: null, rate: 0 };
  }
}

/** 對應往復型符文：每點一下算一次。minPeriodMs 與手勢版一致，避免兩種輸入的節奏落差太大。 */
class TouchRep {
  constructor(minPeriodMs = 200) { this.minPeriodMs = minPeriodMs; this.reset(); }
  reset() { this.count = 0; this.lastT = -Infinity; }
  tap(t) { if (t - this.lastT >= this.minPeriodMs) { this.count++; this.lastT = t; } }
  update() { return { count: this.count, side: null, value: null }; }
}

/** 與 RuneBank 介面相同的觸控版本。 */
export class TouchRuneBank {
  constructor(keys = Object.keys(RUNES)) {
    this.keys = keys;
    this.controls = Object.fromEntries(
      keys.map(k => [k, RUNES[k].type === 'hold' ? new TouchHold() : new TouchRep()])
    );
  }
  reset() { for (const c of Object.values(this.controls)) c.reset(); }
  /** UI 呼叫：按住 / 放開維持型符文。 */
  setPressed(key, pressed) {
    const c = this.controls[key];
    if (c instanceof TouchHold) c.setPressed(pressed);
  }
  /** UI 呼叫：點一下往復型符文。 */
  tap(key, t) {
    const c = this.controls[key];
    if (c instanceof TouchRep) c.tap(t);
  }
  update(t) {
    const out = {};
    for (const k of this.keys) out[k] = this.controls[k].update(t);
    return out;
  }
}

/**
 * 輸入來源切換器。遊戲層只拿 update() 的結果，不知道背後是手勢還是觸控。
 * 手勢連續 staleMs 沒有有效影格 → 自動提示可改用觸控（不強制切換，避免搶走玩家的操作）。
 */
export class InputRouter {
  constructor({ gestureBank, touchBank, staleMs = 4000 }) {
    Object.assign(this, { gestureBank, touchBank, staleMs });
    this.mode = 'gesture';
    this.lastSignalT = null;
  }
  setMode(mode) {
    if (mode !== 'gesture' && mode !== 'touch') throw new Error(`unknown input mode: ${mode}`);
    this.mode = mode;
  }
  /** @param {object|null} signals 手勢訊號；觸控模式下可傳 null。 */
  update(t, signals) {
    if (signals) this.lastSignalT = t;
    const stale = this.mode === 'gesture' && this.lastSignalT !== null && t - this.lastSignalT > this.staleMs;
    const states = this.mode === 'gesture' ? this.gestureBank.update(t, signals) : this.touchBank.update(t);
    return { mode: this.mode, states, suggestTouch: stale };
  }
}
