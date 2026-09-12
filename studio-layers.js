function ensureLayers(item) {
  if (!item || !item.framed) return null;
  if (item.layers) return item.layers;
  const w = item.framed.width, h = item.framed.height;
  const shadow = document.createElement("canvas");
  shadow.width = w; shadow.height = h;
  const restore = document.createElement("canvas");
  restore.width = w; restore.height = h;
  item.layers = {
    w: w,
    h: h,
    cut: item.cut && item.cut.photo ? item.cut.photo : item.framed,
    shadowMask: shadow,
    restoreMask: restore
  };
  return item.layers;
}

function paintMaskDot(mask, x, y, rx, ry, amount) {
  const ctx = mask.getContext("2d");
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  const a = amount == null ? 0.55 : amount;
  g.addColorStop(0, "rgba(255,255,255," + a + ")");
  g.addColorStop(0.55, "rgba(255,255,255," + (a * 0.35) + ")");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function composeFromLayers(item) {
  const L = ensureLayers(item);
  if (!L) return;
  const w = L.w, h = L.h;
  const out = item.framed;
  const ctx = out.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  paintPlate(ctx);

  const orig = item.origImg;
  const fit = orig ? fitContain(orig.width, orig.height, w, h) : { dx: 0, dy: 0, dw: w, dh: h };

  const sh = document.createElement("canvas");
  sh.width = w; sh.height = h;
  const sx = sh.getContext("2d");
  sx.fillStyle = "#111";
  sx.fillRect(0, 0, w, h);
  sx.globalCompositeOperation = "destination-in";
  sx.drawImage(L.shadowMask, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.55;
  ctx.drawImage(sh, 0, 0);
  ctx.restore();

  if (L.cut && L.cut.width) {
    const cf = fitContain(L.cut.width, L.cut.height, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(L.cut, 0, 0, L.cut.width, L.cut.height, cf.dx, cf.dy, cf.dw, cf.dh);
  }

  if (orig) {
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const tx = tmp.getContext("2d");
    tx.drawImage(orig, 0, 0, orig.width, orig.height, fit.dx, fit.dy, fit.dw, fit.dh);
    tx.globalCompositeOperation = "destination-in";
    tx.drawImage(L.restoreMask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(tmp, 0, 0);
  }
}

async function stampOriginal(item, outX, outY) {
  if (!item.framed) { status("Process first, then paint."); return; }
  if (!item.origImg) item.origImg = await loadImage(item.file);
  const L = ensureLayers(item);
  const r = Math.max(16, Math.round(L.w * 0.02));
  paintMaskDot(L.restoreMask, outX, outY, r, r, 0.7);
  composeFromLayers(item);
  item.processedUrl = URL.createObjectURL(await toBlob(item.framed));
  showHero(item);
  render();
}

async function stampShadow(item, outX, outY) {
  if (!item.framed) { status("Process first, then paint the shadow."); return; }
  const L = ensureLayers(item);
  const rx = Math.max(30, Math.round(L.w * 0.036));
  const ry = Math.max(11, Math.round(rx * 0.36));
  paintMaskDot(L.shadowMask, outX, outY, rx, ry, 0.4);
  composeFromLayers(item);
  item.processedUrl = URL.createObjectURL(await toBlob(item.framed));
  showHero(item);
  render();
}
