/* Calibrate the cove from a set photo.
   Click dark (top). Click light (floor). Use this plate. */
(function () {
  let srcImg = null;
  let step = 0;
  let dark = null;
  let light = null;
  let plateCanvas = null;

  function $(id) { return document.getElementById(id); }

  function markLive(on) {
    ["calUse", "calibrate"].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      if (on) el.classList.add("on");
      else el.classList.remove("on");
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
    const PW = 3840, PH = 2160;
    const c = document.createElement("canvas");
    c.width = PW; c.height = PH;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(PW, PH);
    const d = img.data;
    for (let y = 0; y < PH; y++) {
      const t = ease(y / (PH - 1));
      const r = top.r + (bot.r - top.r) * t;
      const g = top.g + (bot.g - top.g) * t;
      const b = top.b + (bot.b - top.b) * t;
      const rr = r | 0, gg = g | 0, bb = b | 0;
      for (let x = 0; x < PW; x++) {
        const i = (y * PW + x) * 4;
        d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const out = document.createElement("canvas");
    out.width = 1920; out.height = 1080;
    const octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(c, 0, 0, 1920, 1080);
    return out;
  }

  function applyPlate(canvas) {
    plateCanvas = canvas;
    const img = new Image();
    img.onload = function () {
      groundEl = img;
      window.coveFloor = light && light.y ? Math.min(0.94, Math.max(0.78, light.y + 0.04)) : 0.9;
      const midY = Math.round(1080 * 0.72);
      const mid = canvas.getContext("2d").getImageData(960, midY, 1, 1).data;
      tone = { l: luma(mid[0], mid[1], mid[2]), r: mid[0], g: mid[1], b: mid[2] };
      try { localStorage.setItem("cove-plate", canvas.toDataURL("image/jpeg", 0.95)); } catch (e) {}
      markLive(true);
      status("Plate live. Process the set.");
    };
    img.src = canvas.toDataURL("image/jpeg", 0.95);
    $("calPrev").src = img.src;
    $("calPrevWrap").hidden = false;
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
    if (!src) { status("Add a set JPEG first, then Calibrate."); return; }
    $("cal").hidden = false;
    $("calSrc").src = src;
    srcImg = new Image();
    srcImg.onload = function () { step = 0; dark = light = null; status("Click the dark top of the cove."); };
    srcImg.src = src;
  }

  function onPick(e) {
    if (!srcImg || !srcImg.width) return;
    const sw = sample(srcImg, e.clientX, e.clientY, $("calSrc"));
    if (step === 0) {
      dark = sw;
      step = 1;
      status("Dark locked. Click the light floor.");
      return;
    }
    light = sw;
    step = 2;
    applyPlate(buildPlate(dark, light));
  }

  restorePlate();

  const btn = $("calibrate");
  if (btn) btn.onclick = openCal;
  const srcEl = $("calSrc");
  if (srcEl) srcEl.onclick = onPick;
  const useBtn = $("calUse");
  if (useBtn) useBtn.onclick = function () {
    if (plateCanvas) {
      applyPlate(plateCanvas);
      return;
    }
    if (step >= 2 && dark && light) {
      applyPlate(buildPlate(dark, light));
      return;
    }
    status("Pick dark, then light, then Use this plate.");
  };
  const dlBtn = $("calDl");
  if (dlBtn) dlBtn.onclick = function () {
    if (!groundEl) { status("Calibrate first."); return; }
    const c = document.createElement("canvas");
    c.width = 1920; c.height = 1080;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(groundEl, 0, 0, 1920, 1080);
    c.toBlob(function (b) { if (b) download(b, "studio-ground.jpg"); }, "image/jpeg", 0.95);
  };
  const closeBtn = $("calClose");
  if (closeBtn) closeBtn.onclick = function () { $("cal").hidden = true; };
})();
