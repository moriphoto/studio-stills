function samplePlateAt(yNorm) {
  if (groundEl && groundEl.width) {
    const c = document.createElement("canvas");
    c.width = 8; c.height = 8;
    const x = c.getContext("2d");
    const sy = Math.max(0, Math.min(groundEl.height - 1, yNorm * groundEl.height));
    x.drawImage(groundEl, 0, sy, groundEl.width, 1, 0, 0, 8, 1);
    const d = x.getImageData(0, 0, 8, 1).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return { r: r / n, g: g / n, b: b / n };
  }
  const rgb = plateRgb(yNorm);
  return { r: rgb[0], g: rgb[1], b: rgb[2] };
}

function isPaperPixel(r, g, b, yNorm) {
  const p = samplePlateAt(yNorm);
  const L = luma(r, g, b);
  const pL = luma(p.r, p.g, p.b);
  if (L > 232 && pL > 190) return true;
  if (Math.abs(L - pL) < 22 && dist(r, g, b, p.r, p.g, p.b) < 48) return true;
  return false;
}

function ensureLayers(item) {
  if (!item || !item.framed) return null;
  if (item.layers) return item.layers;
  const w = item.framed.width, h = item.framed.height;
  const base = document.createElement("canvas");
  base.width = w; base.height = h;
  base.getContext("2d").drawImage(item.framed, 0, 0);
  const shadow = document.createElement("canvas");
  shadow.width = w; shadow.height = h;
  const restore = document.createElement("canvas");
  restore.width = w; restore.height = h;
  item.layers = { w: w, h: h, base: base, shadowMask: shadow, restoreMask: restore };
  return item.layers;
}

function paintMaskDot(mask, x, y, rx, ry, amount) {
  const ctx = mask.getContext("2d");
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  const a = amount == null ? 0.45 : amount;
  g.addColorStop(0, "rgba(255,255,255," + a + ")");
  g.addColorStop(0.5, "rgba(255,255,255," + (a * 0.28) + ")");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function punchPaperFromRestore(item, cx, cy, r) {
  const L = item.layers;
  const orig = item.origImg;
  if (!orig) return;
  const fit = fitContain(orig.width, orig.height, L.w, L.h);
  const ctx = L.restoreMask.getContext("2d", { willReadFrequently: true });
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(L.w, Math.ceil(cx + r));
  const y1 = Math.min(L.h, Math.ceil(cy + r));
  const ww = x1 - x0, hh = y1 - y0;
  if (ww < 1 || hh < 1) return;
  const image = ctx.getImageData(x0, y0, ww, hh);
  const d = image.data;
  const oc = document.createElement("canvas");
  oc.width = orig.width; oc.height = orig.height;
  oc.getContext("2d").drawImage(orig, 0, 0);
  const od = oc.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, orig.width, orig.height).data;
  for (let yy = 0; yy < hh; yy++) {
    for (let xx = 0; xx < ww; xx++) {
      const i = (yy * ww + xx) * 4;
      if (d[i + 3] < 4) continue;
      const ox = Math.round((x0 + xx - fit.dx) / fit.s);
      const oy = Math.round((y0 + yy - fit.dy) / fit.s);
      if (ox < 0 || oy < 0 || ox >= orig.width || oy >= orig.height) { d[i + 3] = 0; continue; }
      const p = (oy * orig.width + ox) * 4;
      if (isPaperPixel(od[p], od[p + 1], od[p + 2], oy / orig.height)) d[i + 3] = 0;
    }
  }
  ctx.putImageData(image, x0, y0);
}

function composeFromLayers(item) {
  const L = ensureLayers(item);
  if (!L) return;
  const w = L.w, h = L.h;
  const ctx = item.framed.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(L.base, 0, 0);

  const sh = document.createElement("canvas");
  sh.width = w; sh.height = h;
  const sx = sh.getContext("2d");
  sx.fillStyle = "#141414";
  sx.fillRect(0, 0, w, h);
  sx.globalCompositeOperation = "destination-in";
  sx.drawImage(L.shadowMask, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.62;
  ctx.drawImage(sh, 0, 0);
  ctx.restore();

  const orig = item.origImg;
  if (orig) {
    const fit = fitContain(orig.width, orig.height, w, h);
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const tx = tmp.getContext("2d");
    tx.drawImage(orig, 0, 0, orig.width, orig.height, fit.dx, fit.dy, fit.dw, fit.dh);
    tx.globalCompositeOperation = "destination-in";
    tx.drawImage(L.restoreMask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(tmp, 0, 0);
  }
}

async function stampOriginal(item, outX, outY) {
  if (!item.framed) { status("Process first, then paint."); return; }
  if (!item.origImg) item.origImg = await loadImage(item.file);
  const L = ensureLayers(item);
  const r = Math.max(12, Math.round(L.w * 0.016));
  paintMaskDot(L.restoreMask, outX, outY, r, r, 0.55);
  punchPaperFromRestore(item, outX, outY, r);
  composeFromLayers(item);
  item.processedUrl = URL.createObjectURL(await toBlob(item.framed));
  showHero(item);
  render();
}

async function stampShadow(item, outX, outY) {
  if (!item.framed) { status("Process first, then paint the shadow."); return; }
  const L = ensureLayers(item);
  const rx = Math.max(26, Math.round(L.w * 0.032));
  const ry = Math.max(10, Math.round(rx * 0.34));
  paintMaskDot(L.shadowMask, outX, outY, rx, ry, 0.38);
  composeFromLayers(item);
  item.processedUrl = URL.createObjectURL(await toBlob(item.framed));
  showHero(item);
  render();
}
