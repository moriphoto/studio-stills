let W = 1920, H = 1080, FEATHER = 8;
const items = [];
let groupUrl = null;
let groundEl = null;
let tone = { l: 110, r: 118, g: 110, b: 102 };

function outputIsHigh() {
  const el = document.getElementById("resHigh");
  return !!(el && el.checked);
}
function setOutputSize(src) {
  if (outputIsHigh() && src && src.width) {
    const long = Math.max(src.width, src.height);
    W = Math.min(4096, Math.max(1920, long));
    H = Math.round(W * 9 / 16);
  } else {
    W = 1920;
    H = 1080;
  }
}

function readSettings() {
  return {
    ai: typeof window.cutWithAI === "function",
    high: outputIsHigh(),
    enhance: Number(document.getElementById("enhance") && document.getElementById("enhance").value || 108) / 100,
    edge: Number(document.getElementById("edge") && document.getElementById("edge").value || 10),
    bringBack: !!(document.getElementById("bringBack") && document.getElementById("bringBack").checked),
    mask: 68,
    foot: 72,
    tol: 64,
    contrast: Number(document.getElementById("enhance") && document.getElementById("enhance").value || 108) / 100,
  };
}
function writeSettings(s) {}
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
  window.plateLocked = false;
  window.covePlate = null;
  try { localStorage.removeItem("cove-plate"); } catch (e) {}
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
  } catch (e) {}
}

function samplePaperRamp(origImg, cutCanvas) {
  if (!origImg || !origImg.width) return null;
  const w = origImg.width, h = origImg.height;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(origImg, 0, 0);
  const od = ctx.getImageData(0, 0, w, h).data;
  let mask = null;
  if (cutCanvas && cutCanvas.width === w && cutCanvas.height === h) {
    mask = cutCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  }
  const strip = Math.max(14, Math.round(w * 0.18));
  const bins = 96;
  const ramp = [];
  let total = 0;
  for (let b = 0; b < bins; b++) {
    const y0 = Math.floor(b * h / bins);
    const y1 = Math.min(h, Math.floor((b + 1) * h / bins));
    let R = 0, G = 0, B = 0, n = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let side = 0; side < 2; side++) {
        const x0 = side === 0 ? 2 : Math.max(0, w - strip);
        const x1 = side === 0 ? Math.min(w, strip) : w - 2;
        for (let x = x0; x < x1; x += 3) {
          const i = (y * w + x) * 4;
          if (mask && mask[i + 3] > 48) continue;
          R += od[i]; G += od[i + 1]; B += od[i + 2]; n++;
        }
      }
    }
    total += n;
    ramp.push(n > 6 ? { r: R / n, g: G / n, b: B / n } : null);
  }
  if (total < 80) return null;
  for (let i = 0; i < bins; i++) {
    if (ramp[i]) continue;
    let prev = null, next = null;
    for (let j = i - 1; j >= 0; j--) if (ramp[j]) { prev = ramp[j]; break; }
    for (let j = i + 1; j < bins; j++) if (ramp[j]) { next = ramp[j]; break; }
    ramp[i] = prev && next
      ? { r: (prev.r + next.r) / 2, g: (prev.g + next.g) / 2, b: (prev.b + next.b) / 2 }
      : (prev || next || { r: 18, g: 18, b: 18 });
  }
  return ramp.map(function (p, i) {
    const a = ramp[Math.max(0, i - 1)], b = ramp[Math.min(bins - 1, i + 1)];
    return {
      r: (a.r + p.r * 2 + b.r) / 4,
      g: (a.g + p.g * 2 + b.g) / 4,
      b: (a.b + p.b * 2 + b.b) / 4
    };
  });
}

function buildPlateFromRamp(ramp) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const n = ramp.length;
  for (let y = 0; y < H; y++) {
    const t = y / Math.max(1, H - 1);
    const idx = t * (n - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(n - 1, i0 + 1);
    const u = idx - i0;
    const a = ramp[i0], b = ramp[i1];
    const rr = (a.r + (b.r - a.r) * u) | 0;
    const gg = (a.g + (b.g - a.g) * u) | 0;
    const bb = (a.b + (b.b - a.b) * u) | 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function paintPaper(ctx, origImg, cutCanvas) {
  const ramp = samplePaperRamp(origImg, cutCanvas);
  if (ramp) {
    const plate = buildPlateFromRamp(ramp);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(plate, 0, 0, W, H);
    window.paperOk = true;
    return;
  }
  window.paperOk = false;
  paintPlate(ctx);
}

function plateRgb(t) {
  const stops = [[0,0,0,0],[0.22,5,5,5],[0.42,26,26,26],[0.62,106,106,106],[0.82,228,228,228],[1,255,255,255]];
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1][0]) i++;
  const a = stops[i], b = stops[i + 1];
  const u = (t - a[0]) / (b[0] - a[0] || 1);
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
}
function paintPlate(ctx) {
  const plate = (window.plateLocked && window.covePlate && window.covePlate.width) ? window.covePlate : groundEl;
  if (plate && plate.width) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(plate, 0, 0, W, H);
    return;
  }
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
function trimBars(img) { return img; }
