// MediaPipe 資產的來源解析。
//
// 為什麼要分兩路：wasm 12MB + 模型 7.8MB 不適合放進公開 repo，也不該進 PWA 預快取。
// 線上版從 CDN 載入；本機測試走 p0/fetch_assets.sh 佈到 web/vendor 的副本，
// 讓 run_tests.sh 不依賴網路、結果可重現。

export const MP_VERSION = '1.0.1';

const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_CDN =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/** 本機測試（127.0.0.1 / localhost）用 vendor 副本，其餘一律走 CDN。 */
export function isLocalTest() {
  const h = globalThis.location?.hostname || '';
  return h === '127.0.0.1' || h === 'localhost';
}

export function mpSources(vendorBase = './vendor') {
  if (!isLocalTest()) {
    return { bundle: `${CDN}/vision_bundle.mjs`, wasm: `${CDN}/wasm`, model: MODEL_CDN, from: 'cdn' };
  }
  // 相對路徑要以「頁面」為基準解析，不是以這個模組所在的 src/input/ 為基準。
  const base = new URL(vendorBase.replace(/\/?$/, '/'), globalThis.document?.baseURI || globalThis.location.href).href;
  return { bundle: `${base}vision_bundle.mjs`, wasm: `${base}wasm`, model: `${base}hand_landmarker.task`, from: 'vendor' };
}

/**
 * 載入 HandLandmarker。GPU delegate 失敗時自動退回 CPU——
 * 某些 iOS Safari 的 GPU 路徑會初始化失敗，那不該看起來像「手勢整個壞掉」。
 * @param {'auto'|'GPU'|'CPU'} [o.delegate='auto'] 指定運算後端。測試用 'CPU'：
 *        Pi 走 swiftshader 軟體 GL，GPU 路徑慢到單幀要好幾十秒。
 * @returns {Promise<{landmarker:object, delegate:'GPU'|'CPU', from:string}>}
 */
export async function loadHandLandmarker({ vendorBase = './vendor', numHands = 2, confidence = 0.3, delegate = 'auto' } = {}) {
  const src = mpSources(vendorBase);
  const vision = await import(/* @vite-ignore */ src.bundle);
  const fileset = await vision.FilesetResolver.forVisionTasks(src.wasm);
  const make = (delegate) => vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: src.model, delegate },
    runningMode: 'VIDEO',
    numHands,
    minHandDetectionConfidence: confidence,
    minHandPresenceConfidence: confidence,
    minTrackingConfidence: confidence,
  });
  if (delegate !== 'auto') {
    return { landmarker: await make(delegate), delegate, from: src.from };
  }
  try {
    return { landmarker: await make('GPU'), delegate: 'GPU', from: src.from };
  } catch (err) {
    console.warn('GPU delegate 失敗，改用 CPU：', err);
    return { landmarker: await make('CPU'), delegate: 'CPU', from: src.from };
  }
}
