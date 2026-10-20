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
  const lo = 58 + strength * 0.75;
  const span = 70;
  const a = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    const v = d[i * 4 + 3];
    a[i] = v < lo ? 0 : v < lo + span ? Math.round((v - lo) * 255 / span) : 255;
  }
  let minY = h, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (a[y * w + x] > 18) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const footLine = minY + (maxY - minY) * 0.82;
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
  for (let i = 0; i < w * h; i++) d[i * 4 + 3] = a[i];
  ctx.putImageData(image, 0, 0);
}

function dropIslands(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const lab = new Int32Array(w * h);
  const sizes = [0];
  let id = 0;
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (lab[p] || d[p * 4 + 3] < 20) continue;
      id++;
      let n = 0, qi = 0, qj = 0;
      qx[qj] = x; qy[qj] = y; qj++;
      lab[p] = id;
      while (qi < qj) {
        const cx = qx[qi], cy = qy[qi]; qi++; n++;
        const nbs = [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
        for (let k = 0; k < 4; k++) {
          const nx = nbs[k][0], ny = nbs[k][1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (lab[np] || d[np * 4 + 3] < 20) continue;
          lab[np] = id;
          qx[qj] = nx; qy[qj] = ny; qj++;
        }
      }
      sizes[id] = n;
    }
  }
  let bestN = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > bestN) bestN = sizes[i];
  const minKeep = Math.max(400, bestN * 0.02);
  for (let i = 0; i < w * h; i++) {
    if (!lab[i]) continue;
    if (sizes[lab[i]] < minKeep) d[i * 4 + 3] = 0;
  }
  ctx.putImageData(image, 0, 0);
}

function fadeFrameEdge(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const band = Math.max(36, Math.round(w * 0.055));
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 8) continue;
      if (d[i + 3] > 248) continue;
      let e = 1;
      if (x < band) e *= x / band;
      if (x > w - 1 - band) e *= (w - 1 - x) / band;
      if (y > h - 1 - band) e *= (h - 1 - y) / band;
      if (e < 1) d[i + 3] = Math.round(d[i + 3] * e);
    }
  }
  ctx.putImageData(image, 0, 0);
}

function featherEdge(canvas, radius) {
  radius = Math.max(3, Math.round(Number(radius) || 6));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  let a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  const passes = Math.min(7, radius);
  for (let p = 0; p < passes; p++) {
    const n = new Float32Array(a);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (a[i] > 250) { n[i] = a[i]; continue; }
        n[i] = (a[i] + a[i - 1] + a[i + 1] + a[i - w] + a[i + w]) / 5;
      }
    }
    a = n;
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

function blurDensity(src, w, h, radius) {
  const r = Math.max(1, radius | 0);
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    for (let k = -r; k <= r; k++) sum += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / (r * 2 + 1);
      sum -= src[row + Math.max(0, x - r)];
      sum += src[row + Math.min(w - 1, x + r + 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / (r * 2 + 1);
      sum -= tmp[Math.max(0, y - r) * w + x];
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x];
    }
  }
  src.set(dst);
}

function keepShadow(cutCanvas, origImg) {
  if (!origImg) return;
  const dir = (typeof detectShadowDir === "function") ? detectShadowDir(origImg, cutCanvas) : (Number(window.shadowDir) || 0);
  window.shadowDir = dir;
  const soft = (typeof shadowSoft === "function") ? shadowSoft() : 0.55;
  const w = cutCanvas.width, h = cutCanvas.height;
  const orig = toCanvas(origImg, w, h);
  const od = orig.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const ctx = cutCanvas.getContext("2d", { willReadFrequently: true });
  const cut = ctx.getImageData(0, 0, w, h);
  const d = cut.data;
  const bb = bboxFromAlpha(cutCanvas);
  let paper = 0, pn = 0;
  const yS0 = Math.max(0, Math.floor(bb.y + bb.h * 0.75));
  const yS1 = Math.min(h - 1, Math.ceil(bb.y + bb.h + bb.w * 0.16));
  for (let y = yS0; y <= yS1; y++) {
    for (let x = 0; x < Math.min(20, w); x++) {
      const i = (y * w + x) * 4;
      paper += luma(od[i], od[i + 1], od[i + 2]); pn++;
    }
    for (let x = Math.max(0, w - 20); x < w; x++) {
      const i = (y * w + x) * 4;
      paper += luma(od[i], od[i + 1], od[i + 2]); pn++;
    }
  }
  paper = paper / Math.max(1, pn);
  const mask = new Float32Array(w * h);
  const cx = bb.x + bb.w / 2;
  const reach = Math.max(18, bb.w * (0.2 + Math.abs(dir) * 0.1));
  const y0 = Math.floor(bb.y + bb.h * 0.58);
  const y1 = Math.min(h - 1, Math.ceil(bb.y + bb.h + reach));
  const spread = Math.max(8, bb.w * (0.58 + Math.abs(dir) * 0.22));
  const base = bb.y + bb.h;
  for (let y = y0; y <= y1; y++) {
    const down = (y - base) / Math.max(1, reach);
    const fade = down <= 0 ? 0.85 : Math.max(0, 1 - down);
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      if (d[i + 3] > 200) continue;
      const along = (x - cx) / spread - dir * 0.6;
      if (along * along > 1) continue;
      const across = Math.max(0, 1 - along * along);
      const L = luma(od[i], od[i + 1], od[i + 2]);
      let density = (paper - L) / (24 + soft * 16);
      if (density < 0.04) density = 0;
      if (density > 1) density = 1;
      const contact = fade * across * 0.2 * (1 - soft * 0.35);
      mask[p] = Math.min(1, density * fade * across + contact);
    }
  }
  const radius = Math.max(2, Math.round(4 + soft * 9));
  blurDensity(mask, w, h, radius);
  blurDensity(mask, w, h, Math.max(2, Math.round(radius * 0.6)));
  for (let p = 0; p < w * h; p++) {
    const m = mask[p];
    if (m < 0.025) continue;
    const i = p * 4;
    if (d[i + 3] > 200) continue;
    const a = Math.round(Math.min(150, m * (145 - soft * 70)));
    if (a < 6 || a <= d[i + 3]) continue;
    d[i] = 26;
    d[i + 1] = 24;
    d[i + 2] = 22;
    d[i + 3] = a;
  }
  ctx.putImageData(cut, 0, 0);
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

function fitContain(sw, sh, boxW, boxH) {
  const s = Math.min(boxW / sw, boxH / sh);
  const dw = sw * s, dh = sh * s;
  return { s: s, dw: dw, dh: dh, dx: (boxW - dw) / 2, dy: (boxH - dh) / 2 };
}

function composeIntact(cutCanvas, origImg) {
  const s = readSettings();
  hardenMask(cutCanvas, 72);
  dropIslands(cutCanvas);
  keepShadow(cutCanvas, origImg);
  fadeFrameEdge(cutCanvas);
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

function sitOnPlate(cutCanvas, origImg, s) { return composeIntact(cutCanvas, origImg); }
function placeOnPlate(cutCanvas, contrast, origImg, s) { return composeIntact(cutCanvas, origImg); }

async function cutFromFile(file, s, onStatus) {
  s = s || readSettings();
  const orig = await loadImage(file);
  setOutputSize(orig);
  if (typeof window.cutWithAI === "function") {
    try {
      if (onStatus) onStatus("Cutting…");
      let rgba = await window.cutWithAI(file, onStatus);
      rgba = toCanvas(rgba, orig.width, orig.height);
      return forceFrame(composeIntact(rgba, orig));
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
    const sc = Math.min(W / src.width, H / src.height);
    const dw = src.width * sc, dh = src.height * sc;
    ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  return { canvas: out, photo: cut && cut.photo || out, bbox: { x: 0, y: 0, w: W, h: H }, meanLuma: tone.l, width: W, height: H };
}

function frameStill(img, s) {
  setOutputSize(img);
  const cut = cutPot(img, 64, 68);
  return composeIntact(cut.canvas, img);
}
