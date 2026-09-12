function bringBackObject(cutCanvas, origImg, steps) {
  if (!origImg) return;
  steps = steps || 4;
  const w = cutCanvas.width, h = cutCanvas.height;
  const orig = toCanvas(origImg, w, h);
  const od = orig.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const ctx = cutCanvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  for (let s = 0; s < steps; s++) {
    const a = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (a[i] > 40) continue;
        if (a[i - 1] < 200 && a[i + 1] < 200 && a[i - w] < 200 && a[i + w] < 200) continue;
        const p = i * 4;
        const L = luma(od[p], od[p + 1], od[p + 2]);
        if (L > 226) continue;
        d[p] = od[p]; d[p + 1] = od[p + 1]; d[p + 2] = od[p + 2];
        d[p + 3] = 232;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

function softenShadowAlpha(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  let a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  for (let p = 0; p < 6; p++) {
    const n = new Float32Array(a);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (a[i] > 236 || a[i] < 6) { n[i] = a[i]; continue; }
        n[i] = (a[i] * 2 + a[i - 1] + a[i + 1] + a[i - w] + a[i + w]) / 6;
      }
    }
    a = n;
  }
  for (let i = 0; i < w * h; i++) d[i * 4 + 3] = a[i];
  ctx.putImageData(image, 0, 0);
}

function composeIntact(cutCanvas, origImg) {
  const s = readSettings();
  hardenMask(cutCanvas, 72);
  if (s.bringBack) bringBackObject(cutCanvas, origImg, 4);
  dropIslands(cutCanvas);
  keepShadow(cutCanvas, origImg);
  fadeFrameEdge(cutCanvas);
  softenShadowAlpha(cutCanvas);
  dropIslands(cutCanvas);
  featherEdge(cutCanvas, Math.max(5, s.edge || 8));
  gradeCut(cutCanvas, s.enhance);
  const fit = fitContain(origImg.width, origImg.height, W, H);
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  paintPlate(ctx);
  ctx.drawImage(cutCanvas, 0, 0, cutCanvas.width, cutCanvas.height, fit.dx, fit.dy, fit.dw, fit.dh);
  return { canvas: out, photo: cutCanvas, bbox: { x: fit.dx, y: fit.dy, w: fit.dw, h: fit.dh }, meanLuma: tone.l, width: W, height: H };
}
