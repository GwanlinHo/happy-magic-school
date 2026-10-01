// 校正層：量測玩家「實際可及範圍」，把所有後續判定換算到裝置無關的正規化空間。
//
// 為什麼要量測而不是假設：平板仰角、鏡頭視角、孩子手臂長度、手的大小都不一樣。
//
// 兩個步驟，每個步驟同時量兩件事：
//   rest     自然垂放、手張開   → 垂放時的手腕高度 + 這個人「張開」的手指伸展比
//   shoulder 抬到肩膀高度、握拳 → 肩線高度         + 這個人「握拳」的手指伸展比
//
// 刻意**不**要求玩家「舉到最高」：那會逼人坐得離平板很遠，動作也很大。
// 把 1.0 定義在「肩膀高度」這個舒服又好維持的位置，所有動作就能收在身前一小塊範圍內。

/** 穩健極值：取排序後的分位數，避免單一離群影格污染校正結果。 */
export function robustQuantile(values, q) {
  if (!values.length) return NaN;
  const a = [...values].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))));
  return a[i];
}

export const CALIB_STEPS = ['rest', 'shoulder'];

/**
 * 校正蒐集器。逐步蒐集各階段的樣本，最後產出 profile。
 * 影像座標系：y 往下遞增，所以「舉高」= y 變小。
 */
export class Calibrator {
  constructor() { this.samples = { rest: [], shoulder: [] }; this.step = null; }

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
      curlRatio: (hands[0].curlRatio + hands[1].curlRatio) / 2,
    });
    return true;
  }

  count(step) { return this.samples[step].length; }

  /** 每階段至少要這麼多影格才算校正成功（約 1 秒 @15fps）。 */
  static MIN_SAMPLES = 12;

  isReady() { return CALIB_STEPS.every(s => this.samples[s].length >= Calibrator.MIN_SAMPLES); }

  /**
   * 產出 profile。失敗時回傳 { error } 讓上層能講出「該怎麼調」，而不是只說失敗。
   * yRest：自然垂放時的手腕高度；yShoulder：肩線高度（數值較小，因為影像 y 往下遞增）。
   */
  build() {
    if (!this.isReady()) return null;
    const rest = this.samples.rest, sh = this.samples.shoulder;
    // rest 取偏下（q=0.7，較大的 y），shoulder 取偏上（q=0.3，較小的 y）：各自往該去的方向取穩健值
    const yRest = robustQuantile(rest.map(s => s.y), 0.7);
    const yShoulder = robustQuantile(sh.map(s => s.y), 0.3);
    const palmRef = robustQuantile([...rest, ...sh].map(s => s.palm), 0.5);
    const xSpreadRef = robustQuantile(rest.map(s => s.xSpread), 0.5);
    const curlOpen = robustQuantile(rest.map(s => s.curlRatio), 0.5);
    const curlFist = robustQuantile(sh.map(s => s.curlRatio), 0.5);
    const range = yShoulder !== undefined ? yRest - yShoulder : 0;

    if (!(range > 0.08)) {
      return { error: 'range', hint: '垂放與抬起的高度差太小。請把平板往後移一點，或讓鏡頭往上仰一些，再重新校正。' };
    }
    // 手型分不開**不是**致命錯誤：有些人的握法、或鏡頭角度就是量不出差別。
    // 這時關掉手型條件、改回只靠高度與雙手距離分辨，遊戲照樣能玩，只是三個維持型符文的
    // 區分餘裕變小。寧可降級也不要卡住玩家。
    const curlUsable = curlOpen - curlFist > 0.18;
    const out = { yRest, yShoulder, range, palmRef, xSpreadRef, curlOpen, curlFist, curlUsable };
    if (!curlUsable) {
      out.warning = 'curl';
      out.hint = '量不出張開與握拳的差別，已改用不看手型的判定。想更準的話，校正時第一步把手指張開、第二步確實握拳，再重做一次。';
    }
    return out;
  }
}

/**
 * 把影像座標的 y 換成「抬升度」：0 = 自然垂放，1 = 校正時量到的肩膀高度。
 * 超出範圍不夾限，讓上層能看出玩家抬得比校正時更高（或更低）。
 */
export function liftOf(y, profile) {
  return (profile.yRest - y) / profile.range;
}

/** 把手指伸展比換算成 0（張開）~1（握拳）。 */
export function curlNorm(ratio, profile) {
  const span = profile.curlOpen - profile.curlFist;
  if (!(span > 1e-6)) return 0;
  return Math.max(0, Math.min(1, (profile.curlOpen - ratio) / span));
}

/** 校正完成前的保守預設值。數值取自實測：張開約 2.05、握拳約 1.6。 */
export function defaultProfile() {
  return {
    yRest: 0.72, yShoulder: 0.46, range: 0.26,
    palmRef: 0.18, xSpreadRef: 0.32,
    curlOpen: 2.05, curlFist: 1.60, curlUsable: true,
    isDefault: true,
  };
}
