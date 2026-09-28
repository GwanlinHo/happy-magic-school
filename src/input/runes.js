// 五符文的判定設定（對應 GAME_DESIGN §5B）。
// 每個符文只綁一個純量訊號 + 一種判定器，全部可用合成序列測試。
//
// 設計約束（P0 得到的教訓）：
//   - 只用 x / y，不用深度。掌寬只拿來做尺度正規化，不拿來判斷「往前推」。
//   - 一定要有遲滯與掉幀寬限：P0 實測 97% 偵測率仍會出現單幀跳值。

import { HoldDetector, RepDetector, AlternateDetector } from './detectors.js';

/** 區間型訊號：轉成「距離區間中心的負距離」，就能用同一套大於門檻的邏輯判定。 */
const band = (pick, center) => (s) => -Math.abs(pick(s) - center);

export const RUNES = {
  // 光：雙手高舉維持。最費力，也是最好辨識的訊號。
  light: {
    name: '光', action: '雙手高舉維持', type: 'hold', effort: 'high',
    make: () => new HoldDetector({
      signal: s => s.lift, enter: 0.72, exit: 0.60, above: true, graceMs: 300, alpha: 0.35,
    }),
  },

  // 固：雙手在胸口高度前推並維持。用「高度落在區間內且雙手分開」判定，不需要深度。
  guard: {
    name: '固', action: '雙手前推維持', type: 'hold', effort: 'mid',
    make: () => new HoldDetector({
      signal: band(s => s.lift, 0.40),
      // 額外要求「雙手分開且穩住」：正在左右揮或上下擺時不算前推維持，避免與焰／流互相誤判
      gate: s => s.spread > 1.6 && Math.abs(s.sway) < 0.45 && Math.abs(s.tilt) < 0.22,
      // 還要求高度是「停住」的，否則手經過胸口高度也會被當成前推維持
      maxRate: 0.10,
      enter: -0.13, exit: -0.20, above: true, graceMs: 300, alpha: 0.35,
    }),
  },

  // 護：雙手交叉在胸前。交叉時兩腕會靠得很近 → 用 spread 變小判定，不需要知道左右手。
  shield: {
    name: '護', action: '雙手交叉胸前維持', type: 'hold', effort: 'low',
    make: () => new HoldDetector({
      signal: s => -s.spread,
      gate: s => s.lift > 0.12 && s.lift < 0.70,
      enter: -1.1, exit: -1.5, above: true, graceMs: 300, alpha: 0.35,
    }),
  },

  // 焰：左右交替橫揮。雙手中心的水平偏移會正負震盪。
  flame: {
    name: '焰', action: '左右交替橫揮', type: 'rep', effort: 'mid',
    make: () => new AlternateDetector({
      signal: s => s.sway, high: 0.45, low: -0.45, minPeriodMs: 200, alpha: 0.45,
    }),
  },

  // 流：雙手上下交替擺動。左右手高度差正負震盪。
  flow: {
    name: '流', action: '雙手上下交替擺', type: 'rep', effort: 'low',
    make: () => new AlternateDetector({
      signal: s => s.tilt, high: 0.22, low: -0.22, minPeriodMs: 200, alpha: 0.45,
    }),
  },
};

export const RUNE_KEYS = Object.keys(RUNES);

/**
 * 同時跑所有符文的判定器。戰鬥中通常只啟用當回合要求的那一個，
 * 但「鏡頭檢查」頁要全部跑，才能一眼看出哪個訊號在動。
 */
export class RuneBank {
  constructor(keys = RUNE_KEYS) {
    this.keys = keys;
    this.detectors = Object.fromEntries(keys.map(k => [k, RUNES[k].make()]));
  }
  reset() { for (const d of Object.values(this.detectors)) d.reset(); }
  update(t, signals) {
    const out = {};
    for (const k of this.keys) out[k] = this.detectors[k].update(t, signals);
    return out;
  }
}
