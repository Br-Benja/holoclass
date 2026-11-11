// HoloClass · Detección de marcadores ArUco en un hilo separado (Web Worker)
// Así el render 3D no se traba aunque la detección tarde algunos milisegundos.
importScripts(
  'https://cdn.jsdelivr.net/npm/js-aruco2@2.0.0/src/cv.js',
  'https://cdn.jsdelivr.net/npm/js-aruco2@2.0.0/src/aruco.js',
  'https://cdn.jsdelivr.net/npm/js-aruco2@2.0.0/src/svd.js',
  'https://cdn.jsdelivr.net/npm/js-aruco2@2.0.0/src/posit1.js'
);

let detector = new AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12', maxHammingDistance: 5 });
let posit = null, focal = 640, markerMM = 50;

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') {
    focal = m.focal; markerMM = m.markerMM;
    posit = new POS.Posit(markerMM, focal);
    self.postMessage({ type: 'ready' });
    return;
  }
  if (m.type === 'frame') {
    const t0 = performance.now();
    const data = new Uint8ClampedArray(m.buffer);
    let sum = 0, n = 0;
    for (let i = 0; i < data.length; i += 4 * 97) { sum += data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11; n++; }
    const found = detector.detect({ width: m.width, height: m.height, data });
    const markers = found.map(mk => {
      const corners = mk.corners.map(c => ({ x: c.x - m.width / 2, y: m.height / 2 - c.y }));
      const pose = posit.pose(corners);
      return { id: mk.id, corners: mk.corners, rotation: pose.bestRotation, translation: pose.bestTranslation, error: pose.bestError };
    });
    self.postMessage({ type: 'result', markers, ms: performance.now() - t0, brightness: sum / n, buffer: m.buffer }, [m.buffer]);
  }
};
