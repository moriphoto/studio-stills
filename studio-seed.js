const _paintPlate = paintPlate;
paintPlate = function (ctx) {
  const floor = typeof window.coveFloor === "number" ? window.coveFloor : 0.91;
  const fy = typeof window.itemFootY === "number" ? window.itemFootY : floor;
  const delta = clamp(fy - floor, -0.14, 0.14);
  const scale = 1 + delta * 0.65;
  const destH = H * scale;
  const destY = fy * H - floor * destH;

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

  if (Math.abs(delta) < 0.012) {
    _paintPlate(ctx);
    return;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (groundEl) {
    ctx.drawImage(groundEl, 0, 0, groundEl.width, groundEl.height, 0, destY, W, destH);
  } else {
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
    return;
  }
  fillGap(0, Math.max(0, destY), 0);
  fillGap(Math.min(H, destY + destH), H, Math.max(0, groundEl.height - 1));
};

function seedFootFromCut(cutCanvas, orig) {
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
    seedFootFromCut(cutCanvas, origImg);
    return _keepShadow(cutCanvas, origImg);
  };
}
