function detectShadowDir(origImg, cutCanvas) {
  if (!origImg || !cutCanvas) return 0;
  const w = cutCanvas.width, h = cutCanvas.height;
  const orig = toCanvas(origImg, w, h);
  const od = orig.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const bb = bboxFromAlpha(cutCanvas);
  const y0 = Math.floor(bb.y + bb.h * 0.74);
  const y1 = Math.min(h - 1, Math.ceil(bb.y + bb.h + Math.max(12, bb.w * 0.08)));
  let paper = 0, pn = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < Math.min(14, w); x++) {
      const i = (y * w + x) * 4;
      paper += luma(od[i], od[i + 1], od[i + 2]); pn++;
    }
    for (let x = Math.max(0, w - 14); x < w; x++) {
      const i = (y * w + x) * 4;
      paper += luma(od[i], od[i + 1], od[i + 2]); pn++;
    }
  }
  paper = paper / Math.max(1, pn);
  let sx = 0, n = 0;
  const pad = Math.round(bb.w * 0.2);
  const xA = Math.max(0, bb.x - pad);
  const xB = Math.min(w - 1, bb.x + bb.w + pad);
  for (let y = y0; y <= y1; y++) {
    for (let x = xA; x <= xB; x++) {
      const i = (y * w + x) * 4;
      const L = luma(od[i], od[i + 1], od[i + 2]);
      if (L > paper - 10) continue;
      if (L > 200) continue;
      sx += x;
      n++;
    }
  }
  if (n < 30) return 0;
  const mean = sx / n;
  const cx = bb.x + bb.w / 2;
  return clamp((mean - cx) / Math.max(1, bb.w * 0.5), -1, 1);
}

const _keepShadow = keepShadow;
keepShadow = function (cutCanvas, origImg) {
  window.shadowDir = detectShadowDir(origImg, cutCanvas);
  return _keepShadow(cutCanvas, origImg);
};
