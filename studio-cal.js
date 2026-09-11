/* Auto cove: stretch the real edge of the photo left and right. */
(function () {
  let srcImg = null;
  let step = 0;
  let dark = null;
  let light = null;
  let plateCanvas = null;
  function $(id) { return document.getElementById(id); }
  function markLive(on) {
    ["calUse", "calibrate", "calAuto"].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      if (on) el.classList.add("on"); else el.classList.remove("on");
    });
  }
  function sample(img, clientX, clientY, el) {
    const rect = el.getBoundingClientRect();
    const x = clamp(((clientX - rect.left) / rect.width) * img.width, 0, img.width - 1);
    const y = clamp(((clientY - rect.top) / rect.height) * img.height, 0, img.height - 1);
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const r = 8;
    const x0 = Math.max(0, Math.round(x) - r);
    const y0 = Math.max(0, Math.round(y) - r);
    const x1 = Math.min(img.width, Math.round(x) + r + 1);
    const y1 = Math.min(img.height, Math.round(y) + r + 1);
    const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) { R += data[i]; G += data[i + 1]; B += data[i + 2]; n++; }
    return { r: R / n, g: G / n, b: B / n, y: y / img.height };
  }
  function liftBlack(c) {
    const L = luma(c.r, c.g, c.b);
    if (L >= 8) return c;
    const g = 8 / (L || 1);
    return { r: Math.min(32, c.r * g), g: Math.min(32, c.g * g), b: Math.min(32, c.b * g) };
  }
  function ease(t) { return t * t * (3 - 2 * t); }
  function buildPlate(top, bot) {
    top = liftBlack(top);
    const out = document.createElement("canvas");
    out.width = 1920; out.height = 1080;
    const ctx = out.getContext("2d");
    const img = ctx.createImageData(1920, 1080);
    const d = img.data;
    for (let y = 0; y < 1080; y++) {
      const t = ease(y / 1079);
      const rr = (top.r + (bot.r - top.r) * t) | 0;
      const gg = (top.g + (bot.g - top.g) * t) | 0;
      const bb = (top.b + (bot.b - top.b) * t) | 0;
      for (let x = 0; x < 1920; x++) {
        const i = (y * 1920 + x) * 4;
        d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return out;
  }

  function extendFromImage(img) {
    const sw = img.width, sh = img.height;
    const band = Math.max(16, Math.floor(sw * 0.07));
    const strip = document.createElement("canvas");
    strip.width = band * 2;
    strip.height = sh;
    const sctx = strip.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.filter = "blur(1.4px)";
    sctx.drawImage(img, 0, 0, band, sh, 0, 0, band, sh);
    sctx.drawImage(img, sw - band, 0, band, sh, band, 0, band, sh);
    const outW = typeof W === "number" ? W : 1920;
    const outH = typeof H === "number" ? H : 1080;
    const out = document.createElement("canvas");
    out.width = outW; out.height = outH;
    const ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = "blur(0.8px)";
    ctx.drawImage(strip, 0, 0, strip.width, sh, 0, 0, outW, outH);
    ctx.filter = "none";
    return out;
  }
  window.extendFromImage = extendFromImage;

  function applyPlate(canvas, floorY) {
    plateCanvas = canvas;
    const img = new Image();
    img.onload = function () {
      groundEl = img;
      window.autoCove = true;
      window.coveFloor = typeof floorY === "number" ? Math.min(0.94, Math.max(0.8, floorY)) : 0.91;
      markLive(true);
      status("Cove extended from the photo edges. Process the set.");
    };
    img.src = canvas.toDataURL("image/jpeg", 0.95);
    if ($("calPrev")) $("calPrev").src = img.src;
    if ($("calPrevWrap")) $("calPrevWrap").hidden = false;
    if ($("cal")) $("cal").hidden = false;
  }
  function restorePlate() {
    try {
      const data = localStorage.getItem("cove-plate");
      if (!data) return;
      const img = new Image();
      img.onload = function () { groundEl = img; markLive(true); };
      img.src = data;
    } catch (e) {}
  }
  function openCal() {
    const src = items[0] && items[0].url;
    if (!src) { status("Add a JPEG first."); return; }
    $("cal").hidden = false;
    $("calSrc").src = src;
    srcImg = new Image();
    srcImg.src = src;
  }
  function runAuto() {
    const item = items[0];
    if (!item) { status("Add a JPEG first."); return; }
    status("Reading cove from the photo…");
    const img = new Image();
    img.onload = function () {
      srcImg = img;
      if ($("calSrc")) $("calSrc").src = item.url;
      applyPlate(extendFromImage(img), 0.91);
    };
    img.src = item.url;
  }
  function onPick(e) {
    if (!srcImg || !srcImg.width) return;
    const sw = sample(srcImg, e.clientX, e.clientY, $("calSrc"));
    if (step === 0) { dark = sw; step = 1; status("Dark locked. Click the light floor."); return; }
    light = sw; step = 2;
    applyPlate(buildPlate(dark, light), light.y + 0.04);
  }
  restorePlate();
  if ($("calibrate")) $("calibrate").onclick = openCal;
  if ($("calAuto")) $("calAuto").onclick = runAuto;
  if ($("calSrc")) $("calSrc").onclick = onPick;
  if ($("calUse")) $("calUse").onclick = function () {
    if (plateCanvas) applyPlate(plateCanvas, window.coveFloor);
    else if (srcImg) applyPlate(extendFromImage(srcImg), 0.91);
  };
  if ($("calDl")) $("calDl").onclick = function () {
    if (!groundEl) return;
    const c = document.createElement("canvas");
    c.width = 1920; c.height = 1080;
    c.getContext("2d").drawImage(groundEl, 0, 0, 1920, 1080);
    c.toBlob(function (b) { if (b) download(b, "studio-ground.jpg"); }, "image/jpeg", 0.95);
  };
  if ($("calClose")) $("calClose").onclick = function () { $("cal").hidden = true; };
})();
