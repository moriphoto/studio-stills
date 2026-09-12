function gradeMidFromOriginal(orig) {
  if (!orig || !orig.width) return null;
  const w = orig.width, h = orig.height;
  const src = toCanvas(orig, w, h);
  const d = src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const band = Math.max(4, Math.round(w * 0.06));
  const profile = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0, n = 0;
    for (let x = 0; x < band; x++) {
      const i = (y * w + x) * 4;
      s += luma(d[i], d[i + 1], d[i + 2]); n++;
    }
    for (let x = w - band; x < w; x++) {
      const i = (y * w + x) * 4;
      s += luma(d[i], d[i + 1], d[i + 2]); n++;
    }
    profile[y] = s / n;
  }
  const sm = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0, n = 0;
    for (let k = -6; k <= 6; k++) {
      const yy = clamp(y + k, 0, h - 1);
      s += profile[yy]; n++;
    }
    sm[y] = s / n;
  }
  const top = sm[Math.round(h * 0.06)];
  const bot = sm[Math.round(h * 0.94)];
  const midL = (top + bot) * 0.5;
  let midY = Math.round(h * 0.5);
  for (let y = Math.round(h * 0.12); y < Math.round(h * 0.88); y++) {
    if (sm[y] >= midL) { midY = y; break; }
  }
  let maxD = 0, horY = midY;
  for (let y = Math.round(h * 0.2); y < Math.round(h * 0.9); y++) {
    const deriv = sm[y] - sm[y - 4];
    if (deriv > maxD) { maxD = deriv; horY = y; }
  }
  return {
    mid: midY / h,
    horizon: horY / h,
    top: top,
    bot: bot
  };
}

const _paintPlate = paintPlate;
paintPlate = function (ctx) {
  const floor = typeof window.coveFloor === "number" ? window.coveFloor : 0.91;
  const mid0 = 0.5;
  const mid = typeof window.gradeMid === "number" ? window.gradeMid : mid0;
  const fy = typeof window.itemFootY === "number" ? window.itemFootY : floor;
  const deltaMid = clamp(mid - mid0, -0.16, 0.16);
  const deltaFoot = clamp(fy - floor, -0.1, 0.1);
  const delta = deltaMid * 0.7 + deltaFoot * 0.3;
  const scale = 1 + delta * 0.55;
  const destH = H * scale;
  const destY = (0.5 + delta) * H - 0.5 * destH;

  function fillGap(fromY, toY, srcY) {
    if (toY <= fromY) return;
    if (groundEl) {
      ctx.drawImage(groundEl, 0, srcY, groundEl.width, 1, 0, fromY, W, toY - fromY);
    } else {
      const [r, g, b] = plateRgb(srcY <= 0 ? 0 : 1);
      ctx.fillStyle = "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")";
      ctx.fillRect(0, fromY, W, toY - fromY);
    }
  }

  if (Math.abs(delta) < 0.01) {
    _paintPlate(ctx);
    return;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (groundEl) {
    ctx.drawImage(groundEl, 0, 0, groundEl.width, groundEl.height, 0, destY, W, destH);
    fillGap(0, Math.max(0, destY), 0);
    fillGap(Math.min(H, destY + destH), H, Math.max(0, groundEl.height - 1));
    return;
  }
  const image = ctx.createImageData(W, H);
  const d = image.data;
  for (let y = 0; y < H; y++) {
    const t = clamp((y - destY) / destH, 0, 1);
    const [r, g, b] = plateRgb(t);
    const rr = r | 0, gg = g | 0, bb = b | 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
};

function seedFromOriginal(cutCanvas, orig) {
  const g = gradeMidFromOriginal(orig);
  if (g) window.gradeMid = g.mid;
  if (!cutCanvas) return;
  const bb = bboxFromAlpha(cutCanvas);
  const srcW = orig && orig.width ? orig.width : cutCanvas.width;
  const srcH = orig && orig.height ? orig.height : cutCanvas.height;
  const fit = fitContain(srcW, srcH, W, H);
  window.itemFootY = clamp((fit.dy + (bb.y + bb.h) * fit.s) / H, 0.72, 0.96);
}

const _keepShadow = typeof keepShadow === "function" ? keepShadow : null;
if (_keepShadow) {
  keepShadow = function (cutCanvas, origImg) {
    seedFromOriginal(cutCanvas, origImg);
    return _keepShadow(cutCanvas, origImg);
  };
}
