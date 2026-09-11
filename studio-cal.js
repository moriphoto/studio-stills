/* Calibrate the cove from a set photo.
   Click dark (top of sweep). Click light (floor).
   Builds a 1920 × 1080 plate and uses it for every still. */
(function () {
  let srcImg = null;
  let step = 0;
  let dark = null;
  let light = null;

  function $(id) { return document.getElementById(id); }

  function sample(img, clientX, clientY, el) {
    const rect = el.getBoundingClientRect();
    const x = clamp(((clientX - rect.left) / rect.width) * img.width, 0, img.width - 1);
    const y = clamp(((clientY - rect.top) / rect.height) * img.height, 0, img.height - 1);
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const r = 6;
    const x0 = Math.max(0, Math.round(x) - r);
    const y0 = Math.max(0, Math.round(y) - r);
    const x1 = Math.min(img.width, Math.round(x) + r + 1);
    const y1 = Math.min(img.height, Math.round(y) + r + 1);
    const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      R += data[i]; G += data[i + 1]; B += data[i + 2]; n++;
    }
    return { r: R / n, g: G / n, b: B / n, y: y / img.height };
  }

  function liftBlack(c) {
    const L = luma(c.r, c.g, c.b);
    if (L >= 8) return c;
    const g = 8 / (L || 1);
    return { r: Math.min(32, c.r * g), g: Math.min(32, c.g * g), b: Math.min(32, c.b * g) };
  }

  function ease(t) {
    return t * t * (3 - 2 * t);
  }

  function buildPlate(top, bot) {
    top = liftBlack(top);
    const c = document.createElement("canvas");
    c.width = 1920;
    c.height = 1080;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(1920, 1080);
    const d = img.data;
    for (let y = 0; y < 1080; y++) {
      const t = ease(y / 1079);
      const r = top.r + (bot.r - top.r) * t;
      const g = top.g + (bot.g - top.g) * t;
      const b = top.b + (bot.b - top.b) * t;
      const rr = r | 0, gg = g | 0, bb = b | 0;
      for (let x = 0; x < 1920; x++) {
        const i = (y * 1920 + x) * 4;
        d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function applyPlate(canvas) {
    const img = new Image();
    img.onload = function () {
      groundEl = img;
      const mid = canvas.getContext("2d").getImageData(960, 700, 1, 1).data;
      tone = { l: luma(mid[0], mid[1], mid[2]), r: mid[0], g: mid[1], b: mid[2] };
      try {
        localStorage.setItem("cove-plate", canvas.toDataURL("image/jpeg", 0.92));
      } catch (e) {}
      status("Plate calibrated. Process the set on this cove.");
    };
    img.src = canvas.toDataURL("image/jpeg", 0.92);
    $("calPrev").src = img.src;
    $("calPrevWrap").hidden = false;
  }

  function restorePlate() {
    try {
      const data = localStorage.getItem("cove-plate");
      if (!data) return;
      const img = new Image();
      img.onload = function () { groundEl = img; };
      img.src = data;
    } catch (e) {}
  }

  function openCal() {
    const src = items[0] && items[0].url;
    if (!src) { status("Add a set JPEG first, then Calibrate."); return; }
    $("cal").hidden = false;
    $("calSrc").src = src;
    srcImg = new Image();
    srcImg.onload = function () { step = 0; dark = light = null; status("Click the dark top of the cove."); };
    srcImg.src = src;
  }

  function onPick(e) {
    if (!srcImg || !srcImg.width) return;
    const el = $("calSrc");
    const sw = sample(srcImg, e.clientX, e.clientY, el);
    if (step === 0) {
      dark = sw;
      step = 1;
      status("Dark locked. Click the light floor.");
      return;
    }
    light = sw;
    step = 2;
    const plate = buildPlate(dark, light);
    applyPlate(plate);
  }

  document.addEventListener("DOMContentLoaded", restorePlate);
  restorePlate();

  const btn = $("calibrate");
  if (btn) btn.onclick = openCal;
  const srcEl = $("calSrc");
  if (srcEl) srcEl.onclick = onPick;
  const useBtn = $("calUse");
  if (useBtn) useBtn.onclick = function () {
    if (step < 2) { status("Pick dark, then light."); return; }
    status("Plate in use. Process all.");
  };
  const dlBtn = $("calDl");
  if (dlBtn) dlBtn.onclick = function () {
    if (!groundEl) { status("Calibrate first."); return; }
    const c = document.createElement("canvas");
    c.width = 1920; c.height = 1080;
    c.getContext("2d").drawImage(groundEl, 0, 0, 1920, 1080);
    c.toBlob(function (b) {
      if (b) download(b, "studio-ground.jpg");
    }, "image/jpeg", 0.92);
  };
  const closeBtn = $("calClose");
  if (closeBtn) closeBtn.onclick = function () { $("cal").hidden = true; };
})();
