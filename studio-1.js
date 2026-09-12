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
  try { groundEl = await loadImageFile("studio-ground.jpg"); } catch (e) { groundEl = null; }
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
function plateRgb(t) {
  const stops = [[0,0,0,0],[0.22,5,5,5],[0.42,26,26,26],[0.62,106,106,106],[0.82,228,228,228],[1,255,255,255]];
  let i = 0;
  while (i < stops.length - 1 && t > stops[i + 1][0]) i++;
  const a = stops[i], b = stops[i + 1];
  const u = (t - a[0]) / (b[0] - a[0] || 1);
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
}
function paintPlate(ctx) {
  if (groundEl) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(groundEl, 0, 0, W, H);
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
