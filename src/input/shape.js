// 畫形辨識（解謎用）：$1 Unistroke Recognizer 的精簡實作。
// 選它的理由：樣板比對，不需要訓練模型，新增一個符形只要加一組點。

const N = 64;                        // 重取樣點數
const SQUARE = 250;                  // 正規化後的邊長
const HALF_DIAGONAL = 0.5 * Math.sqrt(SQUARE * SQUARE * 2);
const ANGLE_RANGE = deg(45), ANGLE_STEP = deg(2), PHI = 0.5 * (-1 + Math.sqrt(5));

function deg(d) { return (d * Math.PI) / 180; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
  return d;
}

function resample(points, n = N) {
  const I = pathLength(points) / (n - 1);
  let D = 0;
  const pts = [...points], out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (D + d >= I) {
      const t = (I - D) / d;
      const q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y) };
      out.push(q);
      pts.splice(i, 0, q);
      D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out.slice(0, n);
}

const centroid = (pts) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

function rotateBy(pts, rad) {
  const c = centroid(pts), cos = Math.cos(rad), sin = Math.sin(rad);
  return pts.map(p => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

/**
 * 正規化大小。
 * 原始 $1 對 x/y 各自拉伸到正方形，但那對「接近一維」的符形（例如斜線）是災難：
 * 短邊幾乎是 0，把雜訊放大成主要形狀，辨識率因此掉到六成。
 * 因此細長形狀改用等比縮放。
 */
function scaleToSquare(pts) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const w = Math.max(...xs) - Math.min(...xs) || 1e-6;
  const h = Math.max(...ys) - Math.min(...ys) || 1e-6;
  const thin = Math.min(w, h) / Math.max(w, h) < 0.3;
  if (thin) {
    const k = SQUARE / Math.max(w, h);
    return pts.map(p => ({ x: p.x * k, y: p.y * k }));
  }
  return pts.map(p => ({ x: p.x * (SQUARE / w), y: p.y * (SQUARE / h) }));
}

const translateToOrigin = (pts) => {
  const c = centroid(pts);
  return pts.map(p => ({ x: p.x - c.x, y: p.y - c.y }));
};

export function normalize(points) {
  let pts = resample(points);
  const c = centroid(pts);
  pts = rotateBy(pts, -Math.atan2(pts[0].y - c.y, pts[0].x - c.x));
  return translateToOrigin(scaleToSquare(pts));
}

function pathDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += dist(a[i], b[i]);
  return d / a.length;
}

function distanceAtBestAngle(pts, tpl) {
  let a = -ANGLE_RANGE, b = ANGLE_RANGE;
  let x1 = PHI * a + (1 - PHI) * b, f1 = pathDistance(rotateBy(pts, x1), tpl);
  let x2 = (1 - PHI) * a + PHI * b, f2 = pathDistance(rotateBy(pts, x2), tpl);
  while (Math.abs(b - a) > ANGLE_STEP) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = PHI * a + (1 - PHI) * b; f1 = pathDistance(rotateBy(pts, x1), tpl); }
    else { a = x1; x1 = x2; f1 = f2; x2 = (1 - PHI) * a + PHI * b; f2 = pathDistance(rotateBy(pts, x2), tpl); }
  }
  return Math.min(f1, f2);
}

export class ShapeRecognizer {
  constructor(templates = {}) {
    this.templates = Object.entries(templates).map(([name, pts]) => ({ name, pts: normalize(pts) }));
  }
  add(name, points) { this.templates.push({ name, pts: normalize(points) }); }
  /** @returns {{name:string,score:number}|null} score 0~1，越高越像。 */
  recognize(points, minScore = 0.78) {
    if (!points || points.length < 8 || !this.templates.length) return null;
    const c = normalize(points);
    let best = null;
    for (const t of this.templates) {
      const d = distanceAtBestAngle(c, t.pts);
      const score = 1 - d / HALF_DIAGONAL;
      if (!best || score > best.score) best = { name: t.name, score };
    }
    return best && best.score >= minScore ? best : null;
  }
}

/** 內建符形樣板（對應 GAME_DESIGN 的解謎畫形）。座標為任意單位，會自行正規化。 */
export function builtinTemplates() {
  const circle = [], wave = [], spiral = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    circle.push({ x: Math.cos(a) * 100, y: Math.sin(a) * 100 });
  }
  for (let i = 0; i <= 48; i++) {
    const x = -100 + (i / 48) * 200;
    wave.push({ x, y: Math.sin((i / 48) * Math.PI * 4) * 45 });
  }
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 4, r = 12 + (i / 60) * 90;
    spiral.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const line = (a, b, n = 24) =>
    Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
  const poly = (verts) => verts.slice(1).flatMap((v, i) => line(verts[i], v));

  return {
    圓: circle,
    三角: poly([{ x: 0, y: -100 }, { x: 95, y: 70 }, { x: -95, y: 70 }, { x: 0, y: -100 }]),
    方: poly([{ x: -90, y: -90 }, { x: 90, y: -90 }, { x: 90, y: 90 }, { x: -90, y: 90 }, { x: -90, y: -90 }]),
    波: wave,
    斜線: line({ x: -100, y: -100 }, { x: 100, y: 100 }, 48),
    螺旋: spiral,
  };
}
