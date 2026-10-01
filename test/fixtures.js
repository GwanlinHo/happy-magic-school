// 合成測資：產生「長得像 MediaPipe 輸出」的 21 點座標序列。
// 有了它，判定層的回歸測試完全不需要相機，也不需要真人。

/** 造一隻手的 21 點。手掌朝上、手指往上，只有位置與大小會變。 */
export function makeHand({ x, y, palm = 0.16, spreadFingers = true }) {
  const P = (dx, dy) => ({ x: x + dx, y: y + dy, z: 0 });
  const w = palm;            // 掌寬尺度
  const f = spreadFingers ? 1 : 0.35;
  return [
    P(0, 0),                                       // 0 wrist
    P(-0.55 * w, -0.20 * w), P(-0.85 * w, -0.55 * w), P(-1.0 * w, -0.9 * w), P(-1.1 * w, -1.2 * w), // 拇指
    P(-0.5 * w, -1.0 * w), P(-0.55 * w, -1.7 * w * f), P(-0.57 * w, -2.1 * w * f), P(-0.58 * w, -2.4 * w * f), // 食指
    P(-0.15 * w, -1.1 * w), P(-0.17 * w, -1.85 * w * f), P(-0.18 * w, -2.3 * w * f), P(-0.19 * w, -2.6 * w * f), // 中指
    P(0.2 * w, -1.05 * w), P(0.22 * w, -1.75 * w * f), P(0.23 * w, -2.15 * w * f), P(0.24 * w, -2.45 * w * f),   // 無名指
    P(0.5 * w, -0.95 * w), P(0.55 * w, -1.5 * w * f), P(0.58 * w, -1.85 * w * f), P(0.6 * w, -2.1 * w * f),      // 小指
  ];
}

/** 造一幀 HandLandmarkerResult。hands 為 [{x,y,palm}]；傳 [] 代表這一幀沒偵測到手。 */
export function makeResult(hands) {
  return {
    landmarks: hands.map(makeHand),
    handednesses: hands.map((_, i) => [{ categoryName: i === 0 ? 'Left' : 'Right', score: 0.8 }]),
  };
}

/**
 * 產生一段序列。
 * @param {object} o
 * @param {number} o.frames 影格數
 * @param {number} [o.fps=15]
 * @param {(t:number,i:number)=>({lx:number,ly:number,rx:number,ry:number,palm?:number})} o.path 每幀的雙手位置
 * @param {number} [o.jitter=0] 每幀加上的隨機抖動幅度
 * @param {number[]} [o.dropFrames=[]] 指定哪幾幀「偵測不到手」
 * @param {Array<[number,object]>} [o.spikes=[]] 指定幀塞入離群值，模擬 P0 觀察到的跳值
 */
export function sequence({ frames, fps = 15, path, jitter = 0, dropFrames = [], spikes = [], seed = 1 }) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff) * 2 - 1; };
  const out = [];
  const drop = new Set(dropFrames);
  const spikeMap = new Map(spikes);
  for (let i = 0; i < frames; i++) {
    const t = (i * 1000) / fps;
    if (drop.has(i)) { out.push({ t, result: makeResult([]) }); continue; }
    let p = { palm: 0.16, ...path(t, i) };
    if (spikeMap.has(i)) p = { ...p, ...spikeMap.get(i) };
    const j = () => jitter * rnd();
    const open = p.open !== false;   // path 可回傳 open:false 代表握拳
    out.push({
      t,
      result: makeResult([
        { x: p.lx + j(), y: p.ly + j(), palm: p.palm, spreadFingers: open },
        { x: p.rx + j(), y: p.ry + j(), palm: p.palm, spreadFingers: open },
      ]),
    });
  }
  return out;
}

// 校正的兩個步驟：自然垂放且手張開 / 抬到肩膀高度且握拳。y 越小越高。
// 肩線只比垂放高 0.26（不是以前的 0.42）——動作刻意改小、改近身。
export const REST_Y = 0.72, SHOULDER_Y = 0.46;
export const restPath     = () => ({ lx: 0.34, ly: REST_Y,     rx: 0.66, ry: REST_Y,     open: true });
export const shoulderPath = () => ({ lx: 0.34, ly: SHOULDER_Y, rx: 0.66, ry: SHOULDER_Y, open: false });

/** 把 y 從「抬升度」換回影像座標，方便直接寫出想測的動作。 */
export const yAtLift = (lift) => REST_Y - lift * (REST_Y - SHOULDER_Y);

// --- 五個符文動作的合成軌跡 -------------------------------------------
// 全部收在身前一小塊範圍內：最高只到肩線（抬升度 1.0），左右與上下擺幅都小。
const L0 = 0.34, R0 = 0.66;

/** 光：雙手張開，抬到肩線附近維持。 */
export const pathLight = (t) => {
  const lift = t < 600 ? (t / 600) * 0.90 : 0.90 + 0.02 * Math.sin(t / 150);
  const y = yAtLift(lift);
  return { lx: L0, ly: y, rx: R0, ry: y, open: true };
};

/** 固：雙手握拳，停在胸口高度前推。 */
export const pathGuard = (t) => {
  const lift = t < 400 ? (t / 400) * 0.45 : 0.45 + 0.01 * Math.sin(t / 200);
  const y = yAtLift(lift);
  return { lx: 0.36, ly: y, rx: 0.64, ry: y, open: false };
};

/** 護：雙手握拳交叉靠攏於胸前。 */
export const pathShield = (t) => {
  const k = Math.min(1, t / 400);
  const y = yAtLift(0.40);
  return { lx: L0 + (0.47 - L0) * k, ly: y, rx: R0 + (0.53 - R0) * k, ry: y, open: false };
};

/** 焰：左右小幅交替橫揮。 */
export const pathFlame = (t) => {
  const c = 0.5 + 0.14 * Math.sin(t / 400);
  const y = yAtLift(0.40);
  return { lx: c - 0.14, ly: y, rx: c + 0.14, ry: y, open: true };
};

/** 流：雙手小幅上下交替擺動。 */
export const pathFlow = (t) => {
  const d = 0.14 * Math.sin(t / 400);
  return { lx: L0, ly: yAtLift(0.40 + d), rx: R0, ry: yAtLift(0.40 - d), open: true };
};

/** 反例：握拳抬到肩線。用來證明「光」真的有在看手型，而不是只看高度。 */
export const pathFistAtShoulder = (t) => ({ ...pathLight(t), open: false });

/** 反例：張開手停在胸口前推。用來證明「固」真的有在看手型。 */
export const pathOpenAtChest = (t) => ({ ...pathGuard(t), open: true });

export const RUNE_PATHS = {
  light: pathLight, guard: pathGuard, shield: pathShield, flame: pathFlame, flow: pathFlow,
};
