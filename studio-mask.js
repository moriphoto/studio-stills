/* Mask tool: outline, keep, unmask, expand. Edits alpha before the sit.
   Pixels stay the original JPEG. No generative fill. */
window.maskOn = false;
window.maskMode = "keep";

function cloneCanvas(src) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d").drawImage(src, 0, 0);
  return c;
}

function dilateAlpha(canvas, radius) {
  radius = Math.max(0, Math.round(Number(radius) || 0));
  if (!radius) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width, h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  let a = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  for (let pass = 0; pass < radius; pass++) {
    const n = a.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (a[i] > 200) { n[i] = a[i]; continue; }
        let m = a[i];
        m = Math.max(m, a[i - 1], a[i + 1], a[i - w], a[i + w]);
        n[i] = m;
      }
    }
    a = n;
  }
  for (let i = 0; i < w * h; i++) {
    if (a[i] > d[i * 4 + 3]) {
      d[i * 4 + 3] = a[i];
    }
  }
  ctx.putImageData(image, 0, 0);
}

function workingMask(item) {
  if (!item || !item.maskBase) return null;
  const work = cloneCanvas(item.maskBase);
  const expand = Number(item.maskExpand || 0);
  if (expand > 0) dilateAlpha(work, expand);
  return work;
}

function drawOutline(item) {
  const overlay = document.getElementById("maskOverlay");
  const hero = document.getElementById("hero");
  if (!overlay || !hero || !item || !item.framed) return;
  const rect = hero.getBoundingClientRect();
  const fw = item.framed.width, fh = item.framed.height;
  overlay.width = Math.max(2, Math.round(rect.width));
  overlay.height = Math.max(2, Math.round(rect.height));
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!window.maskOn) return;
  const work = workingMask(item);
  if (!work) return;
  const fit = fitContain(work.width, work.height, fw, fh);
  const sx = overlay.width / fw;
  const sy = overlay.height / fh;
  const src = work.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, work.width, work.height).data;
  const step = Math.max(1, Math.round(work.width / 420));
  ctx.strokeStyle = "#c4a35a";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (let y = step; y < work.height - step; y += step) {
    for (let x = step; x < work.width - step; x += step) {
      const i = (y * work.width + x) * 4 + 3;
      if (src[i] < 140) continue;
      const edge = src[i - step * 4] < 80 || src[i + step * 4] < 80 || src[i - step * work.width * 4] < 80 || src[i + step * work.width * 4] < 80;
      if (!edge) continue;
      const fx = (fit.dx + x * fit.s) * sx;
      const fy = (fit.dy + y * fit.s) * sy;
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + 0.8, fy);
    }
  }
  ctx.stroke();
}

async function resitMask(item) {
  if (!item || !item.maskBase || !item.origImg) return;
  const work = workingMask(item);
  if (!work) return;
  const cut = composeIntact(work, item.origImg);
  item.cut = cut;
  item.framed = cut.canvas;
  item.processedUrl = URL.createObjectURL(await toBlob(item.framed));
  showHero(item);
  drawOutline(item);
  if (typeof render === "function") render();
}

function paintMask(item, framedX, framedY) {
  if (!item || !item.maskBase || !item.origImg) return;
  const base = item.maskBase;
  const fit = fitContain(base.width, base.height, item.framed.width, item.framed.height);
  const x = (framedX - fit.dx) / fit.s;
  const y = (framedY - fit.dy) / fit.s;
  if (x < 0 || y < 0 || x >= base.width || y >= base.height) return;
  const r = Math.max(8, Math.round(base.width * 0.012));
  const ctx = base.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, base.width, base.height);
  const d = image.data;
  let orig = null;
  if (window.maskMode === "keep") {
    const oc = document.createElement("canvas");
    oc.width = base.width; oc.height = base.height;
    oc.getContext("2d").drawImage(item.origImg, 0, 0, base.width, base.height);
    orig = oc.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, base.width, base.height).data;
  }
  const x0 = Math.max(0, Math.floor(x - r));
  const y0 = Math.max(0, Math.floor(y - r));
  const x1 = Math.min(base.width - 1, Math.ceil(x + r));
  const y1 = Math.min(base.height - 1, Math.ceil(y + r));
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - x, dy = yy - y;
      if (dx * dx + dy * dy > r * r) continue;
      const i = (yy * base.width + xx) * 4;
      if (window.maskMode === "unmask") {
        d[i + 3] = 0;
      } else if (orig) {
        d[i] = orig[i];
        d[i + 1] = orig[i + 1];
        d[i + 2] = orig[i + 2];
        d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

function setMaskMode(mode) {
  window.maskMode = mode === "unmask" ? "unmask" : "keep";
  const keep = document.getElementById("maskKeep");
  const drop = document.getElementById("maskDrop");
  if (keep) keep.classList.toggle("on", window.maskMode === "keep");
  if (drop) drop.classList.toggle("on", window.maskMode === "unmask");
  status(window.maskMode === "unmask" ? "Unmask. Paint to drop." : "Keep. Paint to add from the JPEG.");
}

function setMaskOn(on) {
  window.maskOn = !!on;
  const btn = document.getElementById("maskTool");
  const bar = document.getElementById("maskBar");
  if (btn) btn.classList.toggle("on", window.maskOn);
  if (bar) bar.hidden = !window.maskOn;
  const hero = document.getElementById("hero");
  if (hero) hero.style.cursor = window.maskOn ? "crosshair" : "default";
  if (window.maskOn && activeItem && !activeItem.maskBase) {
    status("Process first, then Mask.");
    window.maskOn = false;
    if (btn) btn.classList.remove("on");
    if (bar) bar.hidden = true;
    return;
  }
  status(window.maskOn ? "Mask on. Outline is the cut. Keep adds. Unmask drops." : "Mask off.");
  if (activeItem) drawOutline(activeItem);
}

window.drawMaskOutline = drawOutline;
window.resitMask = resitMask;
window.paintMask = paintMask;
window.setMaskOn = setMaskOn;
