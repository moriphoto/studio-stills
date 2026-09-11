/* Cut the ceramic. Mask from AI. Pixels from the original JPEG. */
(function loadStudio() {
  const SRC = "https://cdn.jsdelivr.net/gh/moriphoto/studio-stills@62c2cc8b2bcad7c295651534e608064c966eff05/studio.js";
  const xhr = new XMLHttpRequest();
  xhr.open("GET", SRC, false);
  xhr.send();
  if (xhr.status < 200 || xhr.status >= 300 || !xhr.responseText) {
    throw new Error("Could not load studio engine");
  }
  (0, eval)(xhr.responseText);

  window.paintSit = function paintSit() {};

  window.gradeCut = function gradeCut(canvas, contrast) {
    contrast = Number(contrast) || 1;
    if (Math.abs(contrast - 1) < 0.02) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      d[i] = contrastPx(d[i], contrast);
      d[i + 1] = contrastPx(d[i + 1], contrast);
      d[i + 2] = contrastPx(d[i + 2], contrast);
    }
    ctx.putImageData(image, 0, 0);
  };

  window.keepFoot = function keepFoot(cutCanvas, origImg, footPct) {
    footPct = Number(footPct);
    if (!origImg || footPct < 2) return;
    const w = cutCanvas.width, h = cutCanvas.height;
    const orig = toCanvas(origImg, w, h);
    const ctx = cutCanvas.getContext("2d", { willReadFrequently: true });
    const cut = ctx.getImageData(0, 0, w, h);
    const od = orig.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const d = cut.data;
    const bb = bboxFromAlpha(cutCanvas);
    const pad = bb.w * (0.05 + footPct / 450);
    const strip = Math.max(8, (footPct / 100) * Math.max(18, bb.h * 0.32));
    const y0 = Math.floor(bb.y + bb.h * 0.82);
    const y1 = Math.min(h - 1, Math.ceil(bb.y + bb.h + strip));
    const x0 = Math.max(0, Math.floor(bb.x - pad));
    const x1 = Math.min(w - 1, Math.ceil(bb.x + bb.w + pad));
    const cx0 = bb.x + bb.w / 2;
    const rx = bb.w / 2 + pad;
    for (let y = y0; y <= y1; y++) {
      const fade = Math.pow(1 - (y - y0) / Math.max(1, y1 - y0), 1.2);
      for (let x = x0; x <= x1; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] > 240) continue;
        const side = (x - cx0) / rx;
        const horiz = Math.max(0, 1 - side * side);
        const keep = fade * horiz * (footPct / 80);
        if (keep < 0.03) continue;
        const oa = Math.round(Math.min(190, keep * 200));
        if (oa <= d[i + 3]) continue;
        d[i] = od[i];
        d[i + 1] = od[i + 1];
        d[i + 2] = od[i + 2];
        d[i + 3] = Math.max(d[i + 3], oa);
      }
    }
    ctx.putImageData(cut, 0, 0);
  };

  window.sitOnPlate = function sitOnPlate(cutCanvas, origImg, s) {
    s = s || readSettings();
    hardenMask(cutCanvas, s.mask);
    keepFoot(cutCanvas, origImg, s.foot);
    gradeCut(cutCanvas, s.contrast || 1);
    const bb = bboxFromAlpha(cutCanvas);
    const maxW = W * 0.78;
    const maxH = H * 0.62;
    const scale = Math.min(maxW / Math.max(1, bb.w), maxH / Math.max(1, bb.h));
    const dw = bb.w * scale;
    const dh = bb.h * scale;
    const dx = (W - dw) / 2;
    const dy = H * 0.86 - dh;
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const ctx = out.getContext("2d");
    paintPlate(ctx);
    ctx.drawImage(cutCanvas, bb.x, bb.y, bb.w, bb.h, dx, dy, dw, dh);
    return { canvas: out, photo: cutCanvas, bbox: { x: dx, y: dy, w: dw, h: dh }, meanLuma: tone.l, width: W, height: H };
  };
})();
