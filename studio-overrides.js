/* Patches the pinned engine. */
window.paintSit = function paintSit() {};

window.gradeCut = function gradeCut(canvas, contrast) {
  contrast = Number(contrast) || 1;
  if (Math.abs(contrast - 1) < 0.02) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    d[i] = contrastPx(d[i], contrast);
    d[i + 1] = contrastPx(d[i + 1], contrast);
    d[i + 2] = contrastPx(d[i + 2], contrast);
  }
  ctx.putImageData(image, 0, 0);
};

window.keepFoot = function keepFoot(cutCanvas, origImg, footPct) {
  footPct = Number(footPct);
  if (!origImg || footPct < 2) return;
  const w = cutCanvas.width, h = cutCanvas.height;
  const orig = toCanvas(origImg, w, h);
  const ctx = cutCanvas.getContext("2d", { willReadFrequently: true });
  const cut = ctx.getImageData(0, 0, w, h);
  const od = orig.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const d = cut.data;
  const bb = bboxFromAlpha(cutCanvas);
  const pad = bb.w * (0.05 + footPct / 450);
  const strip = Math.max(8, (footPct / 100) * Math.max(18, bb.h * 0.32));
  const y0 = Math.floor(bb.y + bb.h * 0.82);
  const y1 = Math.min(h - 1, Math.ceil(bb.y + bb.h + strip));
  const x0 = Math.max(0, Math.floor(bb.x - pad));
  const x1 = Math.min(w - 1, Math.ceil(bb.x + bb.w + pad));
  const cx0 = bb.x + bb.w / 2;
  const rx = bb.w / 2 + pad;
  for (let y = y0; y <= y1; y++) {
    const fade = Math.pow(1 - (y - y0) / Math.max(1, y1 - y0), 1.2);
    for (let x = x0; x <= x1; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 240) continue;
      const side = (x - cx0) / rx;
      const horiz = Math.max(0, 1 - side * side);
      const keep = fade * horiz * (footPct / 80);
      if (keep < 0.03) continue;
      const oa = Math.round(Math.min(190, keep * 200));
      if (oa <= d[i + 3]) continue;
      d[i] = od[i]; d[i + 1] = od[i + 1]; d[i + 2] = od[i + 2];
      d[i + 3] = Math.max(d[i + 3], oa);
    }
  }
  ctx.putImageData(cut, 0, 0);
};

window.sitOnPlate = function sitOnPlate(cutCanvas, origImg, s) {
  s = s || readSettings();
  hardenMask(cutCanvas, s.mask);
  keepFoot(cutCanvas, origImg, s.foot);
  gradeCut(cutCanvas, s.contrast || 1);
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
  ctx.drawImage(cutCanvas, bb.x, bb.y, bb.w, bb.h, dx, dy, dw, dh);
  return { canvas: out, photo: cutCanvas, bbox: { x: dx, y: dy, w: dw, h: dh }, meanLuma: tone.l, width: W, height: H };
};

function waitForAI(onStatus, ms) {
  ms = ms || 120000;
  const start = Date.now();
  return new Promise(function (res, rej) {
    (function tick() {
      if (typeof window.cutWithAI === "function" && window.AI_READY) return res();
      if (window.AI_ERROR) return rej(new Error(window.AI_ERROR));
      if (Date.now() - start > ms) return rej(new Error("AI timed out loading"));
      if (onStatus) onStatus("Waiting for AI cut model…");
      setTimeout(tick, 400);
    })();
  });
}

window.cutFromFile = async function cutFromFile(file, s, onStatus) {
  s = s || readSettings();
  const orig = await loadImage(file);
  if (s.ai) {
    try {
      await waitForAI(onStatus, 180000);
      if (onStatus) onStatus("AI cutting…");
      let rgba = await window.cutWithAI(file, onStatus);
      rgba = toCanvas(rgba, orig.width, orig.height);
      return forceFrame(placeOnPlate(rgba, s.contrast, orig, s));
    } catch (err) {
      if (onStatus) onStatus("AI failed: " + (err && err.message ? err.message : "cut") + " — paper match.");
    }
  }
  return forceFrame(frameStill(orig, s));
};

(function bindProcess() {
  const btn = document.getElementById("run");
  if (!btn) return;
  btn.onclick = async function () {
    if (!items.length) { status("Add original JPEGs first, then Process all."); return; }
    const bar = readSettings();
    btn.disabled = true;
    try {
      if (typeof loadAssets === "function") {
        if (!window.assetsReady) window.assetsReady = loadAssets();
        await window.assetsReady;
      }
      if (bar.ai) {
        try { await waitForAI(status, 180000); }
        catch (e) { status("AI not ready: " + e.message); }
      }
      for (let i = 0; i < items.length; i++) {
        const s = items[i].settings || bar;
        status("Cutting " + (i + 1) + " of " + items.length + "…");
        items[i].cut = await cutFromFile(items[i].file, s, status);
        items[i].framed = items[i].cut.canvas;
        items[i].processedUrl = URL.createObjectURL(await toBlob(items[i].framed));
        render();
        const hero = document.getElementById("hero");
        const wrap = document.getElementById("heroWrap");
        if (hero && wrap) { wrap.hidden = false; hero.src = items[i].processedUrl; }
      }
      const ok = items.filter(function (x) { return x.framed; }).length;
      status(ok ? ("Done — " + ok + " still(s) at 1920 × 1080.") : "Cut failed.");
    } catch (err) {
      status("Process failed: " + (err && err.message ? err.message : "error"));
    }
    btn.disabled = false;
  };
})();
