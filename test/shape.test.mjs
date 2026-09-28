import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShapeRecognizer, builtinTemplates } from '../src/input/shape.js';

const templates = builtinTemplates();
const rec = new ShapeRecognizer(templates);

/** 把乾淨樣板弄成「像人畫的」：抖動、平移、縮放、旋轉、速度不均（隨機丟點）。 */
function humanize(pts, { jitter, rot, scale, dx, dy, dropRate, seed }) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff) * 2 - 1; };
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const out = [];
  for (const p of pts) {
    if (Math.abs(rnd()) < dropRate) continue;          // 速度不均 → 取樣點疏密不一
    const x = p.x * scale, y = p.y * scale;
    out.push({
      x: x * cos - y * sin + dx + jitter * rnd(),
      y: x * sin + y * cos + dy + jitter * rnd(),
    });
  }
  return out;
}

test('六種符形在「像人畫的」變形下辨識率 > 90%', () => {
  const names = Object.keys(templates);
  let total = 0, hit = 0;
  const misses = [];
  for (let trial = 0; trial < 12; trial++) {
    for (const name of names) {
      const noisy = humanize(templates[name], {
        jitter: 7 + (trial % 4) * 2,
        rot: ((trial % 5) - 2) * 0.12,            // ±14 度
        scale: 0.6 + (trial % 4) * 0.35,
        dx: (trial % 3) * 60 - 60,
        dy: (trial % 4) * 45 - 70,
        dropRate: 0.15,
        seed: trial * 977 + name.length * 31 + 7,
      });
      const got = rec.recognize(noisy);
      total++;
      if (got && got.name === name) hit++;
      else misses.push(`${name} → ${got ? got.name + ' ' + got.score.toFixed(2) : 'null'}`);
    }
  }
  const rate = hit / total;
  assert.ok(rate > 0.9,
    `辨識率 ${(rate * 100).toFixed(1)}% (${hit}/${total})，未達 90%。錯誤樣本：\n${misses.join('\n')}`);
});

test('亂畫（隨機折線）不會被硬塞成某個符形', () => {
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff) * 2 - 1; };
  let falsePositives = 0;
  for (let i = 0; i < 20; i++) {
    const pts = Array.from({ length: 30 }, () => ({ x: rnd() * 120, y: rnd() * 120 }));
    if (rec.recognize(pts)) falsePositives++;
  }
  assert.ok(falsePositives <= 2, `亂畫誤判 ${falsePositives}/20 次，門檻應再收緊`);
});

test('點太少時拒絕辨識，不猜', () => {
  assert.equal(rec.recognize([{ x: 0, y: 0 }, { x: 10, y: 10 }]), null);
});
