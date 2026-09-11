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
  const R = Math.max(10, Math.round(8 + footPct * 0.38));
  const yFoot0 = Math.floor(bb.y + bb.h * 0.62);
  const near = new Uint8Array(w * h);
  for (let y = yFoot0; y < bb.y + bb.h && y < h; y++) {
    for (let x = bb.x; x < bb.x + bb.w && x < w; x++) {
      if (d[(y * w + x) * 4 + 3] < 220) continue;
      const x0 = Math.max(0, x - R), x1 = Math.min(w - 1, x + R);
      const y0 = Math.max(0, y - Math.round(R * 0.35));
      const y1 = Math.min(h - 1, y + R);
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const dx = xx - x, dy = yy - y;
          if (dx * dx + dy * dy * 1.6 <= R * R) near[yy * w + xx] = 1;
        }
      }
    }
  }
  const y0 = Math.floor(bb.y + bb.h * 0.7);
  const y1 = Math.min(h - 1, Math.ceil(bb.y + bb.h + R));
  for (let y = y0; y <= y1; y++) {
    const fade = Math.pow(1 - (y - y0) / Math.max(1, y1 - y0), 0.7);
    for (let x = Math.max(0, bb.x - R); x <= Math.min(w - 1, bb.x + bb.w + R); x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 248) continue;
      if (!near[y * w + x]) continue;
      const oL = luma(od[i], od[i + 1], od[i + 2]);
      const shadow = oL < 165 ? 1.2 : 0.55;
      const keep = fade * (footPct / 70) * shadow;
      if (keep < 0.04) continue;
      const oa = Math.round(Math.min(210, keep * 200));
      if (oa <= d[i + 3]) continue;
      d[i] = od[i]; d[i + 1] = od[i + 1]; d[i + 2] = od[i + 2];
      d[i + 3] = Math.max(d[i + 3], oa);
    }
  }
  const copy = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) copy[i] = d[i * 4 + 3];
  for (let y = y0; y <= y1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (copy[i] > 240) continue;
      d[i * 4 + 3] = (copy[i] + copy[i - 1] + copy[i + 1] + copy[i - w] + copy[Math.min(w * h - 1, i + w)]) / 5;
    }
  }
  ctx.putImageData(cut, 0, 0);
}

function bodyCentreX(canvas, full) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data, w = canvas.width;
  const y1 = Math.floor(full.y + full.h * 0.76);
  let sx = 0, n = 0;
  for (let y = full.y; y <= y1; y++) {
    for (let x = full.x; x < full.x + full.w; x++) {
      if (d[(y * w + x) * 4 + 3] > 200) { sx += x; n++; }
    }
  }
  if (!n) return full.x + full.w / 2;
  return sx / n;
}

function sitOnPlate(cutCanvas, origImg, s) {
  s = s || readSettings();
  hardenMask(cutCanvas, s.mask);
  keepFoot(cutCanvas, origImg, s.foot);
  gradeCut(cutCanvas, s.contrast || 1);
  const bb = bboxFromAlpha(cutCanvas);
  const maxW = W * 0.9;
  const maxH = H * 0.76;
  const scale = Math.min(maxW / Math.max(1, bb.w), maxH / Math.max(1, bb.h));
  const dw = bb.w * scale;
  const dh = bb.h * scale;
  const bodyCx = (bodyCentreX(cutCanvas, bb) - bb.x) * scale;
  let dx = W / 2 - bodyCx;
  if (dx < 16) dx = 16;
  if (dx + dw > W - 16) dx = W - 16 - dw;
  const floor = (typeof window.coveFloor === "number") ? window.coveFloor : 0.91;
  let dy = H * floor - dh;
  if (dy < 20) dy = 20;
  if (dy + dh > H - 12) dy = H - 12 - dh;
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
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

function applyAutoCove(img) {
  if (!window.autoCove || typeof window.extendFromImage !== "function") return;
  groundEl = window.extendFromImage(img);
}

async function cutFromFile(file, s, onStatus) {
  s = s || readSettings();
  const orig = await loadImage(file);
  setOutputSize(orig);
  applyAutoCove(orig);
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
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
  setOutputSize(img);
  applyAutoCove(img);
  const cut = cutPot(img, s.tol || 64, s.mask);
  return sitOnPlate(cut.canvas, img, s);
}
