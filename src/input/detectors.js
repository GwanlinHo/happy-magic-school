// 判定層：全部是純函式 / 無副作用的小狀態機，可用合成序列完整測試。
//
// 兩型動作（見 GAME_DESIGN §5B）：
//   維持型 HoldDetector — 訊號進入區間並持續，累積維持時間
//   往復型 RepDetector  — 訊號越過高閾值再回到低閾值算一次

/** 指數移動平均，壓掉 MediaPipe 的逐幀抖動。 */
export class Ema {
  constructor(alpha = 0.4) { this.alpha = alpha; this.value = null; }
  push(v) {
    if (!Number.isFinite(v)) return this.value;
    this.value = this.value === null ? v : this.alpha * v + (1 - this.alpha) * this.value;
    return this.value;
  }
  reset() { this.value = null; }
}

/**
 * 維持型判定。
 * 進入條件比離開條件嚴格（遲滯），避免在閾值邊緣抖動時反覆開關。
 * graceMs：短暫掉幀（辨識失敗）不算中斷——P0 實測確認掉幀真的會發生。
 */
export class HoldDetector {
  /**
   * @param {object} o
   * @param {(s:object)=>number} o.signal 從 signals 取出要看的純量
   * @param {number} o.enter 進入門檻
   * @param {number} o.exit  離開門檻（比 enter 寬鬆）
   * @param {boolean} o.above true = 訊號要大於門檻；false = 要小於
   * @param {(s:object)=>boolean} [o.gate] 前置條件；不成立時立刻中斷維持並清空平滑狀態。
   *        刻意不走平滑：條件是布林的「合不合格」，不該被前幾幀的數值拖著走。
   * @param {number} [o.graceMs=250] 容忍掉幀的時間
   * @param {number} [o.alpha=0.4] 平滑係數
   * @param {number} [o.maxRate] 訊號每秒最大變化量；超過視為「還在移動中」，不算維持。
   *        用來擋掉「手經過某高度」被誤判成「停在某高度維持」——整合測試在慢速影片下抓到過這個問題。
   *        變化量刻意用 rateWindowMs 這段時間的位移來算，不用逐幀差分：逐幀差分幾乎全是雜訊。
   * @param {number} [o.rateWindowMs=400] 估算變化量的時間窗
   */
  constructor({ signal, enter, exit, above = true, graceMs = 250, alpha = 0.4, gate = null, maxRate = null, rateWindowMs = 400 }) {
    Object.assign(this, { signal, enter, exit, above, graceMs, gate, maxRate, rateWindowMs });
    this.ema = new Ema(alpha);
    this.reset();
  }

  reset() {
    this.holding = false; this.holdMs = 0; this.maxHoldMs = 0;
    this.lastT = null; this.lastGoodT = null; this.history = []; this.rate = 0; this.ema.reset();
  }

  /** @param {number} t 毫秒時間戳 @param {object|null} signals null = 這一幀沒抓到手 */
  update(t, signals) {
    const dt = this.lastT === null ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;

    if (signals === null) {
      // 掉幀：在寬限期內維持現狀，超過就中斷
      if (this.holding) {
        if (this.lastGoodT !== null && t - this.lastGoodT <= this.graceMs) this.holdMs += dt;
        else this.holding = false;
      }
      return this.snapshot();
    }

    this.lastGoodT = t;

    if (this.gate && !this.gate(signals)) {
      this.holding = false;
      this.ema.reset();
      this.history.length = 0;
      return this.snapshot();
    }

    const v = this.ema.push(this.signal(signals));
    if (v === null) return this.snapshot();

    this.history.push({ t, v });
    while (this.history.length > 1 && t - this.history[0].t > this.rateWindowMs) this.history.shift();
    const oldest = this.history[0];
    const span = t - oldest.t;
    this.rate = span >= this.rateWindowMs * 0.5 ? Math.abs(v - oldest.v) * 1000 / span : 0;
    if (this.maxRate !== null && this.rate > this.maxRate) {
      this.holding = false;
      return this.snapshot();
    }

    const passEnter = this.above ? v >= this.enter : v <= this.enter;
    const passExit  = this.above ? v >= this.exit  : v <= this.exit;

    let justEntered = false;
    if (!this.holding && passEnter) { this.holding = true; this.holdMs = 0; justEntered = true; }
    else if (this.holding && !passExit) { this.holding = false; }

    // 起始那一幀不計時：維持真正開始的時間點落在兩幀之間，寧可少算也不要多算。
    if (this.holding && !justEntered) {
      this.holdMs += dt;
      if (this.holdMs > this.maxHoldMs) this.maxHoldMs = this.holdMs;
    }
    return this.snapshot();
  }

  snapshot() {
    return { holding: this.holding, holdMs: this.holdMs, maxHoldMs: this.maxHoldMs, value: this.ema.value, rate: this.rate };
  }
}

/**
 * 往復型判定（遲滯計數，同計步器原理）。
 * 一次 = 訊號從低區越到高區再回到低區。minPeriodMs 擋掉抖動造成的假計數。
 */
export class RepDetector {
  constructor({ signal, high, low, minPeriodMs = 180, alpha = 0.5 }) {
    Object.assign(this, { signal, high, low, minPeriodMs });
    this.ema = new Ema(alpha);
    this.reset();
  }

  reset() { this.count = 0; this.phase = 'low'; this.lastRepT = -Infinity; this.ema.reset(); }

  update(t, signals) {
    if (signals === null) return this.snapshot();
    const v = this.ema.push(this.signal(signals));
    if (v === null) return this.snapshot();

    if (this.phase === 'low' && v >= this.high) {
      this.phase = 'high';
    } else if (this.phase === 'high' && v <= this.low) {
      this.phase = 'low';
      if (t - this.lastRepT >= this.minPeriodMs) { this.count++; this.lastRepT = t; }
    }
    return this.snapshot();
  }

  snapshot() { return { count: this.count, phase: this.phase, value: this.ema.value }; }
}

/**
 * 交替型：兩個互補訊號輪流達標才算一次（例如左右手交替出拳）。
 * 內部就是兩個方向相反的越界偵測，要求兩者交錯發生。
 */
export class AlternateDetector {
  constructor({ signal, high, low, minPeriodMs = 180, alpha = 0.5 }) {
    Object.assign(this, { signal, high, low, minPeriodMs });
    this.ema = new Ema(alpha);
    this.reset();
  }

  reset() { this.count = 0; this.side = null; this.lastT = -Infinity; this.ema.reset(); }

  update(t, signals) {
    if (signals === null) return this.snapshot();
    const v = this.ema.push(this.signal(signals));
    if (v === null) return this.snapshot();

    const side = v >= this.high ? 'a' : (v <= this.low ? 'b' : null);
    if (side && side !== this.side) {
      if (this.side !== null && t - this.lastT >= this.minPeriodMs) { this.count++; this.lastT = t; }
      else if (this.side === null) this.lastT = t;
      this.side = side;
    }
    return this.snapshot();
  }

  snapshot() { return { count: this.count, side: this.side, value: this.ema.value }; }
}
