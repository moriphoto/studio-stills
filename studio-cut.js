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
        alpha[i] = (copy[i] + copy[i - 1] + copy[i + 1] + copy[i - w] + copy[i + w]) / 5;
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
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!ground[i]) { alpha[i] = 255; continue; }
    const cx = clamp(x, minX, maxX), cy = clamp(y, minY, maxY);
    const distPx = Math.hypot(x - cx, y - cy);
    alpha[i] = distPx <= FEATHER ? Math.round(255 * (1 - distPx / FEATHER)) : 0;
  }
  blurAlpha(alpha, w, h, 1);
  for (let i = 0; i < w * h; i++) d[i * 4 + 3] = alpha[i];
  ctx.putImageData(image, 0, 0);
  hardenMask(c, mask);
  return { canvas: c, bbox: { x:minX, y:minY, w:maxX-minX+1, h:maxY-minY+1 } };
}
