// 特徵層：把 MediaPipe 的 21 點座標壓成幾個裝置無關的純量訊號。
// 判定層只看這些純量，不認識 MediaPipe，因此可以用合成資料完整測試。

import { liftOf, curlNorm } from './calibration.js';

const WRIST = 0, INDEX_MCP = 5, PINKY_MCP = 17, MIDDLE_TIP = 12;

// 四指的 (掌指關節, 指尖)。拇指排除：它的位置變化大、辨識也最不穩。
const FINGERS = [[5, 8], [9, 12], [13, 16], [17, 20]];
/**
 * 手指伸展比：「指尖到手腕」除以「掌指關節到手腕」的平均值。
 * 因為是比值，不受手離鏡頭遠近影響。實測張開約 2.0～2.1、握拳約 1.6。
 * 絕對值會因人而異（孩子的手、不同的握法），所以**不設固定門檻**，
 * 改由校正量出這個玩家自己的張開值與握拳值，再換算成 0~1。
 *
 * 這是唯一與高度、左右都無關的訊號——有了它，所有動作才能全部縮在身前一小塊範圍內還分得開。
 */
export function curlRatioOf(lm) {
  let sum = 0;
  for (const [mcp, tip] of FINGERS) {
    const w = lm[WRIST];
    const base = Math.hypot(lm[mcp].x - w.x, lm[mcp].y - w.y) || 1e-6;
    sum += Math.hypot(lm[tip].x - w.x, lm[tip].y - w.y) / base;
  }
  return sum / FINGERS.length;
}

/** 從 MediaPipe HandLandmarkerResult 取出精簡的手部資料。 */
export function readHands(result) {
  if (!result || !result.landmarks) return [];
  return result.landmarks.map((lm, i) => {
    const w = lm[WRIST], a = lm[INDEX_MCP], b = lm[PINKY_MCP];
    // 掌寬當作「距離代理」：手靠近鏡頭會變大。只用於比例換算，不用於判定動作。
    const palmSize = Math.hypot(a.x - b.x, a.y - b.y);
    const cat = result.handednesses?.[i]?.[0]?.categoryName || null;
    return {
      wrist: { x: w.x, y: w.y },
      middleTip: { x: lm[MIDDLE_TIP].x, y: lm[MIDDLE_TIP].y },
      palmSize,
      // 注意：MediaPipe 的 handedness 是以「鏡射前的畫面」判定，前鏡頭自拍畫面會左右相反。
      // 我們不依賴它做判定，只在 UI 上顯示。
      handed: cat,
      curlRatio: curlRatioOf(lm),
      landmarks: lm,
    };
  });
}

/** 依 x 座標排序：畫面左邊的手排前面。比 handedness 可靠。 */
export function sortByScreenX(hands) {
  return [...hands].sort((a, b) => a.wrist.x - b.wrist.x);
}

/**
 * 從一幀的手部資料算出所有判定用訊號。雙手都在才算完整的一幀。
 * 回傳 null 表示這一幀資料不足（掉幀 / 只有一隻手）。
 */
export function computeSignals(hands, profile) {
  if (!hands || hands.length < 2) return null;
  const [L, R] = sortByScreenX(hands);   // L = 畫面左側的手
  const lift = (liftOf(L.wrist.y, profile) + liftOf(R.wrist.y, profile)) / 2;

  // 掌心距離用掌寬正規化 → 不受人與鏡頭距離影響
  const scale = Math.max(1e-6, (L.palmSize + R.palmSize) / 2);
  const spread = Math.abs(L.wrist.x - R.wrist.x) / scale;

  return {
    // 抬升度：0 = 自然垂放，1 = 校正時的最高點
    lift,
    liftL: liftOf(L.wrist.y, profile),
    liftR: liftOf(R.wrist.y, profile),
    // 雙手高度差（左 - 右）。上下交替擺動時會正負震盪
    tilt: liftOf(L.wrist.y, profile) - liftOf(R.wrist.y, profile),
    // 雙手水平張開程度（已正規化）
    spread,
    // 雙手中心的水平偏移（已正規化）。左右交替橫揮時會正負震盪
    sway: ((L.wrist.x + R.wrist.x) / 2 - 0.5) / scale,
    // 握拳程度：0 = 張開，1 = 握拳（用校正量到的個人值換算）
    curl: (curlNorm(L.curlRatio, profile) + curlNorm(R.curlRatio, profile)) / 2,
    // 校正若量不出張開與握拳的差別，手型條件一律放行（見 calibration.js）
    curlUsable: profile.curlUsable !== false,
    scale,
  };
}
