// 五符文的判定設定（對應 GAME_DESIGN §5B）。
// 每個符文只綁一個純量訊號 + 一種判定器，全部可用合成序列測試。
//
// 設計約束：
//   - 只用 x / y 與手指伸展比，不用深度。掌寬只拿來做尺度正規化。
//   - 一定要有遲滯與掉幀寬限：P0 實測 97% 偵測率仍會出現單幀跳值。
//   - **動作要小、要近身**：不要求把手舉到極限，最高只到肩膀高度（抬升度 1.0）。
//     手舉過頭會逼人坐得離平板很遠，而且動作太大。
//
// 三個維持型符文各自在**兩個軸**上不同，不是只差一個高度——
// 動作縮小之後高度區間也跟著變窄，只靠高度會分不開。
//
//   符文   高度      雙手距離   手型
//   光     肩線      一般       張開
//   固     胸口      分開       握拳
//   護     胸口偏低  靠攏交叉   握拳
//
// 手型條件是「加分項」而非必要條件：校正若量不出張開與握拳的差別（signals.curlUsable 為 false），
// 手型一律放行，改回只靠高度與雙手距離分辨。寧可區分餘裕變小，也不要讓玩家卡住。

import { HoldDetector, RepDetector, AlternateDetector } from './detectors.js';

/** 區間型訊號：轉成「距離區間中心的負距離」，就能用同一套大於門檻的邏輯判定。 */
const band = (pick, center) => (s) => -Math.abs(pick(s) - center);

/** 手型條件：校正量不到手型差異時一律放行。 */
const handShape = (ok) => (s) => !s.curlUsable || ok(s.curl);

export const RUNES = {
  // 光：雙手張開、抬到肩膀高度維持。最費力的一個——
  // 手臂離開身體撐著就是會酸，跟舉多高無關，所以縮小動作並沒有削弱耐力挑戰。
  light: {
    name: '光', action: '雙手張開抬到肩線維持', type: 'hold', effort: 'high',
    make: () => new HoldDetector({
      signal: s => s.lift,
      gate: s => handShape(c => c < 0.4)(s) && s.spread > 1.2,
      enter: 0.78, exit: 0.62, above: true, graceMs: 300, alpha: 0.35,
    }),
  },

  // 固：雙手握拳、在胸口高度前推並維持。用高度區間 + 握拳 + 雙手分開判定，不需要深度資訊。
  guard: {
    name: '固', action: '雙手握拳胸前推住', type: 'hold', effort: 'mid',
    make: () => new HoldDetector({
      signal: band(s => s.lift, 0.45),
      gate: s => handShape(c => c > 0.55)(s) && s.spread > 1.6 && Math.abs(s.sway) < 0.45 && Math.abs(s.tilt) < 0.22,
      // 還要求高度是「停住」的，否則手經過胸口高度也會被當成前推維持
      maxRate: 0.10,
      enter: -0.15, exit: -0.24, above: true, graceMs: 300, alpha: 0.35,
    }),
  },

  // 護：雙手握拳交叉在胸前。交叉時兩腕會靠得很近 → 用雙手距離變小判定，不需要知道左右手。
  shield: {
    name: '護', action: '雙手握拳交叉胸前', type: 'hold', effort: 'low',
    make: () => new HoldDetector({
      signal: s => -s.spread,
      gate: s => handShape(c => c > 0.55)(s) && s.lift > 0.10 && s.lift < 0.70,
      enter: -1.1, exit: -1.5, above: true, graceMs: 300, alpha: 0.35,
    }),
  },

  // 焰：左右小幅交替橫揮。雙手中心的水平偏移會正負震盪。
  flame: {
    name: '焰', action: '左右交替橫揮', type: 'rep', effort: 'mid',
    make: () => new AlternateDetector({
      signal: s => s.sway, high: 0.45, low: -0.45, minPeriodMs: 200, alpha: 0.45,
    }),
  },

  // 流：雙手小幅上下交替擺動。左右手高度差正負震盪。
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
