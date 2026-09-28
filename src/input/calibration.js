// 校正層：量測玩家「實際可及範圍」，把所有後續判定換算到裝置無關的正規化空間。
//
// 為什麼要量測而不是假設：平板仰角、鏡頭視角、孩子手臂長度都不一樣。
// 我們不知道畫面上哪裡是「眼睛的高度」，但我們可以問玩家「把手舉到最高，讓它停在畫面裡」，
// 然後把那個位置定義為 1.0。之後所有門檻都用 0~1 表示，換裝置、換人都不必重調。

/** 穩健極值：取排序後的分位數，避免單一離群影格污染校正結果。 */
export function robustQuantile(values, q) {
  if (!values.length) return NaN;
  const a = [...values].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))));
  return a[i];
}

export const CALIB_STEPS = ['rest', 'top'];

/**
 * 校正蒐集器。逐步蒐集各階段的樣本，最後產出 profile。
 * 影像座標系：y 往下遞增，所以「舉高」= y 變小。
 */
export class Calibrator {
  constructor() { this.samples = { rest: [], top: [] }; this.step = null; }

  begin(step) {
    if (!CALIB_STEPS.includes(step)) throw new Error(`unknown calibration step: ${step}`);
    this.step = step;
    this.samples[step] = [];
  }

  /** hands: 由 readHands() 產出的陣列。每個階段只收「雙手都在畫面裡」的影格。 */
  feed(hands) {
    if (!this.step || !hands || hands.length < 2) return false;
    const ys = hands.map(h => h.wrist.y);
    const xs = hands.map(h => h.wrist.x);
    this.samples[this.step].push({
      y: (ys[0] + ys[1]) / 2,
      xSpread: Math.abs(xs[0] - xs[1]),
      palm: (hands[0].palmSize + hands[1].palmSize) / 2,
    });
    return true;
  }

  count(step) { return this.samples[step].length; }

  /** 每階段至少要這麼多影格才算校正成功（約 1 秒 @15fps）。 */
  static MIN_SAMPLES = 12;

  isReady() { return CALIB_STEPS.every(s => this.samples[s].length >= Calibrator.MIN_SAMPLES); }

  /**
   * 產出 profile。
   * yRest：自然垂放時的手腕高度；yTop：盡力舉高時的手腕高度（數值較小）。
   */
  build() {
    if (!this.isReady()) return null;
    const rest = this.samples.rest, top = this.samples.top;
    // rest 取偏下（q=0.7，較大的 y），top 取偏上（q=0.3，較小的 y）：各自往「該去的方向」取穩健值
    const yRest = robustQuantile(rest.map(s => s.y), 0.7);
    const yTop = robustQuantile(top.map(s => s.y), 0.3);
    const palmRef = robustQuantile([...rest, ...top].map(s => s.palm), 0.5);
    const xSpreadRef = robustQuantile(rest.map(s => s.xSpread), 0.5);
    const range = yRest - yTop;
    if (!(range > 0.08)) return null;   // 可及範圍太小 → 校正失敗，請玩家調整平板
    return { yRest, yTop, range, palmRef, xSpreadRef };
  }
}

/**
 * 把影像座標的 y 換成「抬升度」：0 = 自然垂放，1 = 校正時能舉到的最高點。
 * 超出範圍不夾限，讓上層能看出玩家比校正時舉得更高（或更低）。
 */
export function liftOf(y, profile) {
  return (profile.yRest - y) / profile.range;
}

/** 建立一個保守的預設 profile，供校正完成前的第一幀使用（見 DEVLOG 的鏡頭幾何表）。 */
export function defaultProfile() {
  return { yRest: 0.72, yTop: 0.30, range: 0.42, palmRef: 0.18, xSpreadRef: 0.32, isDefault: true };
}
