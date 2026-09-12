function samplePlateAt(yNorm) {
  if (groundEl && groundEl.width) {
    const c = document.createElement("canvas");
    c.width = 8; c.height = 1;
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

function localVar(od, w, h, x, y) {
  let m = 0, n = 0;
  for (let yy = y - 1; yy <= y + 1; yy++) {
    if (yy < 0 || yy >= h) continue;
    for (let xx = x - 1; xx <= x + 1; xx++) {
      if (xx < 0 || xx >= w) continue;
      const i = (yy * w + xx) * 4;
      m += luma(od[i], od[i + 1], od[i + 2]); n++;
    }
  }
  m = m / Math.max(1, n);
  let v = 0;
  for (let yy = y - 1; yy <= y + 1; yy++) {
    if (yy < 0 || yy >= h) continue;
    for (let xx = x - 1; xx <= x + 1; xx++) {
      if (xx < 0 || xx >= w) continue;
      const i = (yy * w + xx) * 4;
      const L = luma(od[i], od[i + 1], od[i + 2]);
      v += (L - m) * (L - m);
    }
  }
  return v / Math.max(1, n);
}

function isPaperPixel(od, ow, oh, x, y) {
  const i = (y * ow + x) * 4;
  const r = od[i], g = od[i + 1], b = od[i + 2];
  const L = luma(r, g, b);
  const p = samplePlateAt(y / oh);
  const pL = luma(p.r, p.g, p.b);
  const near = Math.abs(L - pL) < 18 && dist(r, g, b, p.r, p.g, p.b) < 36;
  if (!near && L < 220) return false;
  if (localVar(od, ow, oh, x, y) > 28) return false;
  return near || L > 236;
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
  item.layers = {
    w: w, h: h, base: base,
    shadowMask: shadow, restoreMask: restore,
    cut: item.cut && item.cut.photo ? item.cut.photo : null
  };
  return item.layers;
}

function paintMaskDot(mask, x, y, rx, ry, amount) {
  const ctx = mask.getContext("2d");
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  const a = amount == null ? 0.4 : amount;
  g.addColorStop(0, "rgba(255,255,255," + a + ")");
  g.addColorStop(0.55, "rgba(255,255,255," + (a * 0.22) + ")");
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
  const ww = Math.min(L.w, Math.ceil(cx + r)) - x0;
  const hh = Math.min(L.h, Math.ceil(cy + r)) - y0;
  if (ww < 1 || hh < 1) return;
  const image = ctx.getImageData(x0, y0, ww, hh);
  const d = image.data;
  const oc = toCanvas(orig, orig.width, orig.height);
  const od = oc.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, orig.width, orig.height).data;
  for (let yy = 0; yy < hh; yy++) {
    for (let xx = 0; xx < ww; xx++) {
      const i = (yy * ww + xx) * 4;
      if (d[i + 3] < 4) continue;
      const ox = Math.round((x0 + xx - fit.dx) / fit.s);
      const oy = Math.round((y0 + yy - fit.dy) / fit.s);
      if (ox < 1 || oy < 1 || ox >= orig.width - 1 || oy >= orig.height - 1) { d[i + 3] = 0; continue; }
      if (isPaperPixel(od, orig.width, orig.height, ox, oy)) d[i + 3] = 0;
    }
  }
  ctx.putImageData(image, x0, y0);
}

function punchPotFromShadow(item, cx, cy, rx, ry) {
  const L = item.layers;
  if (!L.cut) return;
  const fit = fitContain(L.cut.width, L.cut.height, L.w, L.h);
  const ctx = L.shadowMask.getContext("2d", { willReadFrequently: true });
  const x0 = Math.max(0, Math.floor(cx - rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const ww = Math.min(L.w, Math.ceil(cx + rx)) - x0;
  const hh = Math.min(L.h, Math.ceil(cy + ry)) - y0;
  if (ww < 1 || hh < 1) return;
  const image = ctx.getImageData(x0, y0, ww, hh);
  const d = image.data;
  const cc = toCanvas(L.cut, L.cut.width, L.cut.height);
  const cd = cc.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, L.cut.width, L.cut.height).data;
  for (let yy = 0; yy < hh; yy++) {
    for (let xx = 0; xx < ww; xx++) {
      const i = (yy * ww + xx) * 4;
      if (d[i + 3] < 4) continue;
      const ox = Math.round((x0 + xx - fit.dx) / fit.s);
      const oy = Math.round((y0 + yy - fit.dy) / fit.s);
      if (ox < 0 || oy < 0 || ox >= L.cut.width || oy >= L.cut.height) continue;
      if (cd[(oy * L.cut.width + ox) * 4 + 3] > 200) d[i + 3] = 0;
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
  sx.fillStyle = "#1a1a1a";
  sx.fillRect(0, 0, w, h);
  sx.globalCompositeOperation = "destination-in";
  sx.drawImage(L.shadowMask, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.58;
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
  const r = Math.max(10, Math.round(L.w * 0.014));
  paintMaskDot(L.restoreMask, outX, outY, r, r, 0.72);
  punchPaperFromRestore(item, outX, outY, r);
  composeFromLayers(item);
  item.processedUrl = URL.createObjectURL(await toBlob(item.framed));
  showHero(item);
}

async function stampShadow(item, outX, outY) {
  if (!item.framed) { status("Process first, then paint the shadow."); return; }
  const L = ensureLayers(item);
  const rx = Math.max(22, Math.round(L.w * 0.026));
  const ry = Math.max(8, Math.round(rx * 0.32));
  paintMaskDot(L.shadowMask, outX, outY, rx, ry, 0.34);
  punchPotFromShadow(item, outX, outY, rx, ry);
  composeFromLayers(item);
  item.processedUrl = URL.createObjectURL(await toBlob(item.framed));
  showHero(item);
}
