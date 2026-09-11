function gradeCut(canvas, contrast) {
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
}

function hardenMask(canvas, strength) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data, w = canvas.width, h = canvas.height;
  strength = strength == null ? 72 : strength;
  const lo = 50 + strength * 0.9;
  const span = 90;
  const a = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    const v = d[i * 4 + 3];
    a[i] = v < lo ? 0 : v < lo + span ? Math.round((v - lo) * 255 / span) : 255;
  }
  let minY = h, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (a[y * w + x] > 18) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const footLine = minY + (maxY - minY) * 0.8;
  for (let pass = 0; pass < 2; pass++) {
    const copy = a.slice();
    for (let y = 1; y < h - 1; y++) {
      if (y >= footLine) continue;
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        a[i] = Math.min(copy[i], copy[i - 1], copy[i + 1], copy[i - w], copy[i + w]);
      }
    }
  }
  const copy = a.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (copy[i] === 255 || copy[i] === 0) continue;
      a[i] = (copy[i] + copy[i - 1] + copy[i + 1] + copy[i - w] + copy[i + w]) / 5;
    }
  }
  for (let i = 0; i < w * h; i++) d[i * 4 + 3] = a[i];
  ctx.putImageData(image, 0, 0);
}

function toCanvas(src, w, h) {
  const c = document.createElement("canvas");
  c.width = w || src.width;
  c.height = h || src.height;
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function keepFoot(cutCanvas, origImg, footPct) {
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
      d[i] = od[i]; d[i+1] = od[i+1]; d[i+2] = od[i+2];
      d[i + 3] = Math.max(d[i + 3], oa);
    }
  }
  ctx.putImageData(cut, 0, 0);
}

function sitOnPlate(cutCanvas, origImg, s) {
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
}

function bboxFromAlpha(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data, w = canvas.width, h = canvas.height;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 18) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return { x: 0, y: 0, w: w, h: h };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function placeOnPlate(cutCanvas, contrast, origImg, s) {
  s = s || readSettings();
  if (contrast) s.contrast = contrast;
  return sitOnPlate(cutCanvas, origImg, s);
}

async function cutFromFile(file, s, onStatus) {
  s = s || readSettings();
  const orig = await loadImage(file);
  if (typeof window.cutWithAI === "function") {
    try {
      if (onStatus) onStatus("Cutting…");
      let rgba = await window.cutWithAI(file, onStatus);
      rgba = toCanvas(rgba, orig.width, orig.height);
      return forceFrame(placeOnPlate(rgba, s.contrast, orig, s));
    } catch (err) {
      if (onStatus) onStatus("Mask fallback: " + (err && err.message ? err.message : "paper"));
    }
  }
  return forceFrame(frameStill(orig, s));
}

function forceFrame(cut) {
  const src = cut && cut.canvas;
  if (src && src.width === W && src.height === H) {
    cut.width = W; cut.height = H;
    return cut;
  }
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const ctx = out.getContext("2d");
  paintPlate(ctx);
  if (src && src.width && src.height) {
    const s = Math.min(W / src.width, H / src.height);
    const dw = src.width * s, dh = src.height * s;
    ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  return { canvas: out, photo: cut && cut.photo || out, bbox: { x: 0, y: 0, w: W, h: H }, meanLuma: tone.l, width: W, height: H };
}

function frameStill(img, s) {
  s = s || readSettings();
  const cut = cutPot(img, s.tol || 64, s.mask);
  return sitOnPlate(cut.canvas, img, s);
}
