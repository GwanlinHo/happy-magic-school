import { Calibrator } from '../src/input/calibration.js';
import { readHands, computeSignals } from '../src/input/signals.js';
import { sequence, restPath, shoulderPath } from './fixtures.js';

/** 用合成的 rest / top 序列跑完整校正流程，取得 profile。 */
export function calibratedProfile() {
  const c = new Calibrator();
  c.begin('rest');
  for (const f of sequence({ frames: 20, path: restPath })) c.feed(readHands(f.result));
  c.begin('shoulder');
  for (const f of sequence({ frames: 20, path: shoulderPath })) c.feed(readHands(f.result));
  const p = c.build();
  if (!p || p.error) throw new Error('校正測資無法產生 profile：' + (p && p.error));
  return p;
}

/** 把一段序列餵進判定器，回傳每幀快照。 */
export function run(detector, frames, profile) {
  const snaps = [];
  for (const f of frames) {
    const hands = readHands(f.result);
    const sig = computeSignals(hands, profile);
    snaps.push(detector.update(f.t, sig));
  }
  return snaps;
}
