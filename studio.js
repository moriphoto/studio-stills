/* JM Studio
   1. Cut the ceramic from the photo
   2. Sit it on studio-ground.jpg
   3. Grade toward studio-tone.jpg (the PXL look)
*/
const W = 1920, H = 1080, FEATHER = 8;
const items = [];
let groupUrl = null;
let groundEl = null;
let tone = { l: 110, r: 118, g: 110, b: 102 };

function readSettings() {
  return {
    ai: !!(document.getElementById("ai") && document.getElementById("ai").checked),
    mask: Number(document.getElementById("mask") && document.getElementById("mask").value || 68),
    foot: Number(document.getElementById("foot") && document.getElementById("foot").value || 58),
    tol: Number(document.getElementById("tol") && document.getElementById("tol").value || 64),
    contrast: Number(document.getElementById("con") && document.getElementById("con").value || 110) / 100,
  };
}
function writeSettings(s) {
  if (!s) return;
  const ai = document.getElementById("ai"); if (ai) ai.checked = !!s.ai;
  const mask = document.getElementById("mask"); if (mask) { mask.value = s.mask; const v = document.getElementById("maskv"); if (v) v.textContent = s.mask; }
  const foot = document.getElementById("foot"); if (foot) { foot.value = s.foot; const v = document.getElementById("footv"); if (v) v.textContent = s.foot; }
  const tol = document.getElementById("tol"); if (tol) { tol.value = s.tol; const v = document.getElementById("tolv"); if (v) v.textContent = s.tol; }
  const con = document.getElementById("con"); if (con) { const n = Math.round(s.contrast * 100); con.value = n; const v = document.getElementById("conv"); if (v) v.textContent = (n/100).toFixed(2); }
}

function isStill(f) {
  if (f.type && f.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp)$/i.test(f.name);
}
function dist(r,g,b,r2,g2,b2){ return Math.abs(r-r2)+Math.abs(g-g2)+Math.abs(b-b2); }
function luma(r,g,b){ return 0.2126*r + 0.7152*g + 0.0722*b; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function contrastPx(v,a){ return clamp((v-128)*a+128, 0, 255); }

function loadImageFile(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("missing " + src));
    img.src = src;
  });
}

async function loadAssets() {
  try {
    groundEl = await loadImageFile("studio-ground.jpg");
  } catch (e) {
    groundEl = null;
  }
  try {
    const img = await loadImageFile("studio-tone.jpg");
    const c = document.createElement("canvas");
    const s = 400 / Math.max(img.width, img.height);
    c.width = Math.max(2, Math.round(img.width * s));
    c.height = Math.max(2, Math.round(img.height * s));
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let r=0,g=0,b=0,n=0;
    for (let i=0;i<d.length;i+=4) {
      const L = luma(d[i], d[i+1], d[i+2]);
      if (L < 28 || L > 235) continue;
      r += d[i]; g += d[i+1]; b += d[i+2]; n++;
    }
    if (n > 80) tone = { l: (0.2126*r+0.7152*g+0.0722*b)/n, r:r/n, g:g/n, b:b/n };
  } catch (e) { /* keep defaults */ }
}

function plateRgb(t) {
  const stops = [
    [0, 0, 0, 0],
    [0.22, 5, 5, 5],
    [0.42, 26, 26, 26],
    [0.62, 106, 106, 106],
    [0.82, 228, 228, 228],
    [1, 255, 255, 255],
  ];
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1][0]) i++;
  const a = stops[i], b = stops[i + 1];
  const u = (t - a[0]) / (b[0] - a[0] || 1);
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
}

function paintPlate(ctx) {
  const image = ctx.createImageData(W, H);
  const d = image.data;
  for (let y = 0; y < H; y++) {
    const [r, g, b] = plateRgb(y / (H - 1));
    const rr = r | 0, gg = g | 0, bb = b | 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function trimBars(img) {
  const src = document.createElement("canvas");
  src.width = img.width; src.height = img.height;
  const ctx = src.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, src.width, src.height).data;
  const w = src.width, h = src.height;
  const empty = (x, y) => {
    const p = (y * w + x) * 4;
    return luma(data[p], data[p+1], data[p+2]) < 14;
  };
  const colEmpty = (x) => { let n=0; for (let y=0;y<h;y+=4) if (empty(x,y)) n++; return n > (h/4)*0.92; };
  const rowEmpty = (y) => { let n=0; for (let x=0;x<w;x+=4) if (empty(x,y)) n++; return n > (w/4)*0.92; };
  let x0=0,x1=w-1,y0=0,y1=h-1;
  while (x0<x1 && colEmpty(x0)) x0++;
  while (x1>x0 && colEmpty(x1)) x1--;
  while (y0<y1 && rowEmpty(y0)) y0++;
  while (y1>y0 && rowEmpty(y1)) y1--;
  const cw=x1-x0+1, ch=y1-y0+1;
  if (cw<40 || ch<40 || (cw>w*0.97 && ch>h*0.97)) return img;
  const out = document.createElement("canvas");
  out.width = cw; out.height = ch;
  out.getContext("2d").drawImage(src, x0, y0, cw, ch, 0, 0, cw, ch);
  return out;
}

function peelFrame(img) {
  const w = img.width, h = img.height;
  if (w / h < 1.45) return img;
  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  const ctx = src.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = 0, maxY = 0, n = 0;
  for (let y = 0; y < h; y += 2) {
    const [pr, pg, pb] = plateRgb(y / Math.max(1, h - 1));
    for (let x = 0; x < w; x += 2) {
      const p = (y * w + x) * 4;
      if (dist(d[p], d[p + 1], d[p + 2], pr, pg, pb) > 32) {
        n++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  if (n < 80 || bw < 48 || bh < 48) return img;
  if (bw > w * 0.92 && bh > h * 0.92) return img;
  const padX = Math.max(8, Math.round(bw * 0.04));
  const padY = Math.max(8, Math.round(bh * 0.04));
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(w - 1, maxX + padX);
  maxY = Math.min(h - 1, maxY + padY);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d").drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function blurAlpha(alpha, w, h, passes) {
  for (let p = 0; p < passes; p++) {
    const copy = alpha.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (copy[i] === 255) continue;
        const n = (copy[i] + copy[i - 1] + copy[i + 1] + copy[i - w] + copy[i + w]) / 5;
        alpha[i] = n;
      }
    }
  }
}

function cutPot(img, tol, mask) {
  img = peelFrame(trimBars(img));
  let scale = 820 / img.height;
  if (img.width * scale > 1100) scale = 1100 / img.width;
  const w = Math.max(2, Math.round(img.width * scale));
  const h = Math.max(2, Math.round(img.height * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const top = [0, 0, 0], bot = [0, 0, 0];
  let tn = 0, bn = 0;
  for (let x = 0; x < w; x += 3) {
    let p = (6 * w + x) * 4;
    top[0] += d[p]; top[1] += d[p + 1]; top[2] += d[p + 2]; tn++;
    p = ((h - 7) * w + x) * 4;
    bot[0] += d[p]; bot[1] += d[p + 1]; bot[2] += d[p + 2]; bn++;
  }
  top[0] /= tn; top[1] /= tn; top[2] /= tn;
  bot[0] /= bn; bot[1] /= bn; bot[2] /= bn;
  const isBg = (r, g, b, y) => {
    const t = y / Math.max(1, h - 1);
    const pr = top[0] + (bot[0] - top[0]) * t;
    const pg = top[1] + (bot[1] - top[1]) * t;
    const pb = top[2] + (bot[2] - top[2]) * t;
    if (dist(r, g, b, pr, pg, pb) < tol) return true;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma < 36 && dist(r, g, b, pr, pg, pb) < tol * 2.1) return true;
    return false;
  };
  const ground = new Uint8Array(w * h);
  const qx = [], qy = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (ground[i]) return;
    const p = i * 4;
    if (!isBg(d[p], d[p + 1], d[p + 2], y)) return;
    ground[i] = 1; qx.push(x); qy.push(y);
  };
  for (let x=0;x<w;x++) { push(x,0); push(x,h-1); }
  for (let y=0;y<h;y++) { push(0,y); push(w-1,y); }
  while (qx.length) {
    const x = qx.pop(), y = qy.pop();
    push(x-1,y); push(x+1,y); push(x,y-1); push(x,y+1);
  }
  let minX=w, minY=h, maxX=0, maxY=0, potN=0;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    if (!ground[y*w+x]) {
      potN++;
      if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y;
    }
  }
  if (potN < w * h * 0.02 || maxX < minX) {
    minX = Math.floor(w * 0.12);
    minY = Math.floor(h * 0.12);
    maxX = Math.floor(w * 0.88);
    maxY = Math.floor(h * 0.88);
  }
  const footY = minY + (maxY - minY) * 0.72;
  const alpha = new Uint8ClampedArray(w * h);
  const apron = 42;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!ground[i]) { alpha[i] = 255; continue; }
    const cx = clamp(x, minX, maxX), cy = clamp(y, minY, maxY);
    const distPx = Math.hypot(x - cx, y - cy);
    if (distPx <= FEATHER) {
      alpha[i] = Math.round(255 * (1 - distPx / FEATHER));
      continue;
    }
    if (y >= footY && distPx < apron) {
      const p = i * 4;
      const L = luma(d[p], d[p + 1], d[p + 2]);
      const t = y / Math.max(1, h - 1);
      const pr = top[0] + (bot[0] - top[0]) * t;
      const pg = top[1] + (bot[1] - top[1]) * t;
      const pb = top[2] + (bot[2] - top[2]) * t;
      const plateL = luma(pr, pg, pb);
      if (L < plateL - 22) {
        const fade = 1 - (distPx - FEATHER) / (apron - FEATHER);
        alpha[i] = Math.round(200 * fade * fade);
        continue;
      }
    }
    alpha[i] = 0;
  }
  blurAlpha(alpha, w, h, 1);
  for (let i = 0; i < w * h; i++) d[i * 4 + 3] = alpha[i];
  ctx.putImageData(image, 0, 0);
  hardenMask(c, mask);
  return { canvas: c, bbox: { x:minX, y:minY, w:maxX-minX+1, h:maxY-minY+1 } };
}

function gradeCut(canvas, contrast) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  let r=0,g=0,b=0,n=0;
  for (let i=0;i<d.length;i+=4) {
    if (d[i+3] < 40) continue;
    r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++;
  }
  if (!n) return;
  r/=n; g/=n; b/=n;
  const L = luma(r,g,b);
  const gL = clamp(tone.l / (L || 1), 0.88, 1.18);
  const gR = clamp(tone.r / (r || 1), 0.92, 1.08);
  const gG = clamp(tone.g / (g || 1), 0.92, 1.08);
  const gB = clamp(tone.b / (b || 1), 0.92, 1.08);
  for (let i=0;i<d.length;i+=4) {
    if (d[i+3] < 8) continue;
    d[i]   = contrastPx(d[i]   * gR * gL, contrast);
    d[i+1] = contrastPx(d[i+1] * gG * gL, contrast);
    d[i+2] = contrastPx(d[i+2] * gB * gL, contrast);
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

function sampleLight(orig, bb) {
  const w = orig.width, h = orig.height;
  const ctx = orig.getContext("2d", { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, w, h).data;
  const y0 = Math.max(0, Math.floor(bb.y + bb.h * 0.78));
  const y1 = Math.min(h - 1, Math.ceil(bb.y + bb.h + Math.max(12, bb.h * 0.2)));
  const x0 = Math.max(0, Math.floor(bb.x - bb.w * 0.22));
  const x1 = Math.min(w - 1, Math.ceil(bb.x + bb.w * 1.22));
  const cx = bb.x + bb.w / 2;
  const cy = bb.y + bb.h;
  let sx = 0, sy = 0, sw = 0;
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const i = (y * w + x) * 4;
      const L = luma(data[i], data[i + 1], data[i + 2]);
      if (L > 108) continue;
      const wt = (108 - L) / 108;
      sx += (x - cx) * wt;
      sy += (y - cy) * wt;
      sw += wt;
    }
  }
  if (sw < 10) return { dx: 0.14, dy: 0.03, power: 0.62 };
  return {
    dx: clamp(sx / sw / Math.max(1, bb.w), -0.22, 0.38),
    dy: clamp(sy / sw / Math.max(1, bb.h), -0.02, 0.14),
    power: clamp(0.45 + sw / 500, 0.45, 1),
  };
}

function keepFoot(cutCanvas, origImg, footPct, light) {
  footPct = Number(footPct);
  if (!origImg || footPct < 2) return;
  const w = cutCanvas.width, h = cutCanvas.height;
  const orig = toCanvas(origImg, w, h);
  const ctx = cutCanvas.getContext("2d", { willReadFrequently: true });
  const cut = ctx.getImageData(0, 0, w, h);
  const od = orig.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const d = cut.data;
  const bb = bboxFromAlpha(cutCanvas);
  const padL = bb.w * (0.08 + footPct / 500) * (light && light.dx < 0 ? 1.35 : 1);
  const padR = bb.w * (0.08 + footPct / 500) * (light && light.dx > 0 ? 1.45 : 1);
  const strip = Math.max(14, (footPct / 100) * Math.max(28, bb.h * 0.55));
  const y0 = Math.floor(bb.y + bb.h * 0.7);
  const y1 = Math.min(h - 1, Math.ceil(bb.y + bb.h + strip));
  const x0 = Math.max(0, Math.floor(bb.x - padL));
  const x1 = Math.min(w - 1, Math.ceil(bb.x + bb.w + padR));
  const cx0 = bb.x + bb.w / 2;
  const rx = bb.w / 2 + Math.max(padL, padR);
  const bias = light && light.dx != null ? light.dx : 0.14;
  for (let y = y0; y <= y1; y++) {
    const v = (y - y0) / Math.max(1, y1 - y0);
    const fade = Math.pow(1 - v, 1.35);
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 220) continue;
      const side = (x - cx0) / rx;
      const horiz = Math.max(0, 1 - side * side);
      const along = bias >= 0 ? Math.max(0, side) : Math.max(0, -side);
      const L = luma(od[i], od[i + 1], od[i + 2]);
      const shadow = L < 140 ? (140 - L) / 140 : 0;
      const keep = fade * horiz * (0.7 + 0.85 * shadow + 0.3 * along);
      if (keep < 0.04) continue;
      const mul = 1 - 0.42 * shadow;
      const oa = Math.round(Math.min(235, keep * (175 + shadow * 90)));
      if (oa <= d[i + 3] && shadow < 0.15) continue;
      d[i] = od[i] * mul;
      d[i + 1] = od[i + 1] * mul;
      d[i + 2] = od[i + 2] * mul;
      d[i + 3] = Math.max(d[i + 3], oa);
    }
  }
  ctx.putImageData(cut, 0, 0);
}

function paintSit(ctx, box, light) {
  const w = box.w, h = box.h;
  const ox = (light && light.dx != null ? light.dx : 0.14) * w;
  const oy = (light && light.dy != null ? light.dy : 0.03) * Math.max(8, h * 0.2);
  const p = light && light.power != null ? light.power : 0.6;
  const cx = box.x + w * 0.5 + ox;
  const cy = box.y + h - 1 + oy;
  ctx.save();
  ctx.filter = "blur(32px)";
  ctx.fillStyle = "rgba(0,0,0," + (0.16 + 0.22 * p).toFixed(3) + ")";
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.48, Math.max(16, h * 0.075), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "blur(11px)";
  ctx.fillStyle = "rgba(0,0,0," + (0.2 + 0.22 * p).toFixed(3) + ")";
  ctx.beginPath();
  ctx.ellipse(box.x + w * 0.5 + ox * 0.35, box.y + h, w * 0.3, Math.max(9, h * 0.038), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function sitOnPlate(cutCanvas, origImg, s) {
  s = s || readSettings();
  hardenMask(cutCanvas, s.mask);
  const orig = origImg ? toCanvas(origImg, cutCanvas.width, cutCanvas.height) : null;
  const obj = bboxFromAlpha(cutCanvas);
  const light = orig ? sampleLight(orig, obj) : { dx: 0.14, dy: 0.03, power: 0.62 };
  keepFoot(cutCanvas, orig || origImg, s.foot, light);
  gradeCut(cutCanvas, s.contrast || 1.1);
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
  paintSit(ctx, { x: dx, y: dy, w: dw, h: dh }, light);
  ctx.drawImage(cutCanvas, bb.x, bb.y, bb.w, bb.h, dx, dy, dw, dh);
  return { canvas: out, photo: cutCanvas, bbox: { x: dx, y: dy, w: dw, h: dh }, meanLuma: tone.l, width: W, height: H, light: light };
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
  const wantAI = s.ai && typeof window.cutWithAI === "function";
  if (wantAI) {
    try {
      onStatus("AI cutting… first time downloads a model (~50MB).");
      let rgba = await Promise.race([
        window.cutWithAI(file, onStatus),
        new Promise((_, rej) => setTimeout(() => rej(new Error("AI timed out")), 120000)),
      ]);
      rgba = toCanvas(rgba, orig.width, orig.height);
      return forceFrame(placeOnPlate(rgba, s.contrast, orig, s));
    } catch (err) {
      onStatus("AI skipped: " + (err && err.message ? err.message : "using paper match"));
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

function composeCollection(pieces) {
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const ctx = out.getContext("2d");
  paintPlate(ctx);
  if (!pieces.length) return out;
  const maxH = Math.max(...pieces.map(p => p.bbox.h));
  let unit = (H * 0.68) / maxH;
  const gaps = 28;
  let totalW = pieces.reduce((s,p)=>s+p.bbox.w*unit,0) + gaps * Math.max(0, pieces.length-1);
  if (totalW > W * 0.9) unit *= (W * 0.9) / totalW;
  totalW = pieces.reduce((s,p)=>s+p.bbox.w*unit,0) + gaps * Math.max(0, pieces.length-1);
  const baseline = H * 0.88;
  let x = (W - totalW) / 2;
  const positions = pieces.map(p => {
    const dw = p.bbox.w * unit, dh = p.bbox.h * unit;
    const pos = { p, x, y: baseline - dh, dw, dh };
    x += dw + gaps;
    return pos;
  });
  positions.sort((a,b)=>b.dh-a.dh).forEach(({p,x:px,y,dw,dh}) => {
    ctx.drawImage(p.photo, 0, 0, p.photo.width, p.photo.height, px, y, dw, dh);
  });
  return out;
}

function toBlob(c){ return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("export failed")),"image/jpeg",0.92)); }
function download(blob,name){
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name;
  a.rel="noopener"; document.body.appendChild(a); a.click(); a.remove();
}
function status(t){ document.getElementById("status").textContent = t || ""; }
function render() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  items.forEach((item) => {
    const el = document.createElement("article");
    el.innerHTML = `<img src="${item.processedUrl||item.url}" alt=""><div class="m"><span>${item.name}</span><label><input type="checkbox" ${item.selected?"checked":""}> in group</label></div>`;
    el.querySelector("input").onchange = e => { item.selected = e.target.checked; };
    grid.appendChild(el);
  });
}
function addFiles(list){
  const picked = Array.from(list).filter(isStill).slice(0,20);
  if (!picked.length) { status("No JPEGs in that drop."); return; }
  picked.forEach(file => {
    const name = file.name.replace(/\.[^.]+$/,"");
    items.push({ name, file, url: URL.createObjectURL(file), selected: true, settings: readSettings() });
  });
  if (items.length > 20) items.length = 20;
  render();
  const framed = picked.some(f => /-1920/i.test(f.name));
  status(picked.length + " added. Process all when ready." + (framed ? " Tip: use the original phone JPEG, not a -1920." : ""));
}

document.getElementById("files").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
document.getElementById("tol").oninput = e => { document.getElementById("tolv").textContent = e.target.value; };
document.getElementById("con").oninput = e => { document.getElementById("conv").textContent = (Number(e.target.value)/100).toFixed(2); };
["mask","foot"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.oninput = e => { const v = document.getElementById(id + "v"); if (v) v.textContent = e.target.value; };
});
const drop = document.getElementById("drop");
drop.onclick = () => document.getElementById("files").click();
drop.ondragover = e => e.preventDefault();
drop.ondrop = e => { e.preventDefault(); addFiles(e.dataTransfer.files); };

function loadImage(file){
  return new Promise((res,rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not read " + file.name));
    img.src = URL.createObjectURL(file);
  });
}

let assetsReady = null;
document.getElementById("run").onclick = async () => {
  if (!items.length) { status("Add original JPEGs first, then Process all."); return; }
  const bar = readSettings();
  const btn = document.getElementById("run");
  btn.disabled = true;
  try {
    if (!assetsReady) assetsReady = loadAssets();
    await assetsReady;
    for (let i=0;i<items.length;i++){
      const s = items[i].settings || bar;
      status("Processing " + (i+1) + " of " + items.length + "…");
      await new Promise(r => setTimeout(r, 20));
      try {
        items[i].cut = await cutFromFile(items[i].file, s, status);
        items[i].framed = items[i].cut.canvas;
        if (items[i].framed.width !== W || items[i].framed.height !== H) {
          items[i].cut = forceFrame(items[i].cut);
          items[i].framed = items[i].cut.canvas;
        }
        items[i].processedUrl = URL.createObjectURL(await toBlob(items[i].framed));
      } catch (one) {
        status("Skipped " + items[i].name + ": " + (one && one.message ? one.message : "error"));
        continue;
      }
      render();
      const hero = document.getElementById("hero");
      const wrap = document.getElementById("heroWrap");
      if (hero && wrap) {
        wrap.hidden = false;
        hero.src = items[i].processedUrl;
      }
    }
    const ok = items.filter(x => x.framed).length;
    status(ok ? ("Done — " + ok + " file(s) at 1920 × 1080.") : "Nothing processed. Try unticking AI cut.");
  } catch (err) {
    status("Process failed: " + (err && err.message ? err.message : "open Chrome console"));
  }
  btn.disabled = false;
};
function resetStudio() {
  items.splice(0, items.length);
  groupUrl = null;
  document.getElementById("grid").innerHTML = "";
  document.getElementById("heroWrap").hidden = true;
  document.getElementById("group").hidden = true;
  document.getElementById("files").value = "";
  const hero = document.getElementById("hero");
  if (hero) hero.removeAttribute("src");
  const gi = document.getElementById("groupImg");
  if (gi) gi.removeAttribute("src");
  const mask = document.getElementById("mask"); if (mask) { mask.value = 68; document.getElementById("maskv").textContent = "68"; }
  const foot = document.getElementById("foot"); if (foot) { foot.value = 58; document.getElementById("footv").textContent = "58"; }
  const tol = document.getElementById("tol"); if (tol) { tol.value = 64; document.getElementById("tolv").textContent = "64"; }
  const con = document.getElementById("con"); if (con) { con.value = 110; document.getElementById("conv").textContent = "1.10"; }
  status("Reset.");
}
document.getElementById("reset").onclick = resetStudio;
document.getElementById("selectAll").onclick = () => {
  if (!items.length) { status("Add JPEGs first."); return; }
  items.forEach(i => i.selected = true);
  render();
  status("All " + items.length + " selected.");
};
document.getElementById("applyAll").onclick = () => {
  if (!items.length) { status("Add JPEGs first."); return; }
  const s = readSettings();
  items.forEach(i => { i.settings = Object.assign({}, s); i.selected = true; });
  render();
  status("Preset copied to " + items.length + " — Mask " + s.mask + ", Foot " + s.foot + ", Paper " + s.tol + ". Process all.");
};
document.getElementById("dl").onclick = async () => {
  let n = 0;
  for (const item of items) {
    if (!item.framed) continue;
    download(await toBlob(item.framed), item.name + "-1920.jpg");
    n++;
    await new Promise(r => setTimeout(r, 250));
  }
  if (!n) status("Process first, then download.");
};
document.getElementById("groupBtn").onclick = async () => {
  const chosen = items.filter(i => i.selected && i.cut);
  if (!chosen.length) { status("Process first."); return; }
  if (!assetsReady) assetsReady = loadAssets();
  await assetsReady;
  const blob = await toBlob(composeCollection(chosen.map(i => i.cut)));
  groupUrl = URL.createObjectURL(blob);
  document.getElementById("group").hidden = false;
  document.getElementById("groupImg").src = groupUrl;
  status("");
};
document.getElementById("dlGroup").onclick = async () => {
  if (!groupUrl) return;
  download(await fetch(groupUrl).then(r => r.blob()), "collection-1920.jpg");
};
