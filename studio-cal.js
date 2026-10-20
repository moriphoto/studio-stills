/* Top from the photo or a swatch. Base from the photo, beside the object. */
(function () {
  let srcImg = null;
  let step = 0;
  let dark = null;
  let light = null;
  let pickedTop = null;
  let plateCanvas = null;
  let colourOn = false;
  let pickMode = "base";
  function $(id) { return document.getElementById(id); }
  function markLive(on) {
    ["calUse", "calibrate"].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      if (on) el.classList.add("on"); else el.classList.remove("on");
    });
  }
  function hexRgb(hex, y) {
    const h = String(hex || "#000000").replace("#", "");
    return {
      r: parseInt(h.slice(0, 2), 16) || 0,
      g: parseInt(h.slice(2, 4), 16) || 0,
      b: parseInt(h.slice(4, 6), 16) || 0,
      y: y == null ? 0 : y
    };
  }
  function paintDot(id, c) {
    const dot = $(id);
    if (!dot || !c) return;
    dot.style.background = "rgb(" + (c.r | 0) + "," + (c.g | 0) + "," + (c.b | 0) + ")";
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
  function ease(t) { return t * t * (3 - 2 * t); }
  function buildPlate(top, bot) {
    const PW = 3840, PH = 2160;
    const c = document.createElement("canvas");
    c.width = PW; c.height = PH;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(PW, PH);
    const d = img.data;
    for (let y = 0; y < PH; y++) {
      const t = ease(y / (PH - 1));
      const rr = (top.r + (bot.r - top.r) * t) | 0;
      const gg = (top.g + (bot.g - top.g) * t) | 0;
      const bb = (top.b + (bot.b - top.b) * t) | 0;
      for (let x = 0; x < PW; x++) {
        const i = (y * PW + x) * 4;
        d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const out = document.createElement("canvas");
    out.width = 1920; out.height = 1080;
    const o = out.getContext("2d");
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";
    o.drawImage(c, 0, 0, 1920, 1080);
    return out;
  }
  function previewPlate() {
    const src = plateCanvas || groundEl;
    if (!src) return;
    const c = document.createElement("canvas");
    c.width = 1920; c.height = 1080;
    c.getContext("2d").drawImage(src, 0, 0, 1920, 1080);
    if ($("calPrev")) $("calPrev").src = c.toDataURL("image/jpeg", 0.9);
    if ($("calPrevWrap")) $("calPrevWrap").hidden = false;
  }
  window.refreshShadowPreview = previewPlate;
  function applyPlate(canvas, floorY) {
    plateCanvas = canvas;
    groundEl = canvas;
    window.plateLocked = true;
    window.autoCove = false;
    window.coveFloor = typeof floorY === "number" ? Math.min(0.94, Math.max(0.8, floorY)) : 0.91;
    markLive(true);
    try { localStorage.setItem("cove-plate", canvas.toDataURL("image/jpeg", 0.95)); } catch (e) {}
    if ($("cal")) $("cal").hidden = false;
    previewPlate();
    status("Plate locked. Process uses this cove.");
  }
  function rebuildFromStops() {
    if (!dark || !light) return;
    applyPlate(buildPlate(dark, light), light.y + 0.04);
  }
  function calTarget() {
    if (typeof activeItem !== "undefined" && activeItem) return activeItem;
    const picked = items.filter(function (it) { return it.selected !== false; });
    return picked[0] || items[0] || null;
  }
  function samplePx(img, x, y) {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const r = 10;
    const x0 = Math.max(0, Math.round(x) - r);
    const y0 = Math.max(0, Math.round(y) - r);
    const x1 = Math.min(img.width, Math.round(x) + r + 1);
    const y1 = Math.min(img.height, Math.round(y) + r + 1);
    const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) { R += data[i]; G += data[i + 1]; B += data[i + 2]; n++; }
    return { r: R / n, g: G / n, b: B / n, y: y / img.height };
  }
  function topStop() {
    if (colourOn && $("calTop")) return hexRgb($("calTop").value, 0);
    if (pickedTop) return pickedTop;
    if (!srcImg || !srcImg.width) return hexRgb("#1a1a1a", 0);
    return samplePx(srcImg, srcImg.width * 0.5, srcImg.height * 0.06);
  }
  function setPickMode(mode) {
    pickMode = mode === "top" ? "top" : "base";
    const top = $("pickTop");
    const base = $("pickBase");
    if (top) top.classList.toggle("on", pickMode === "top");
    if (base) base.classList.toggle("on", pickMode === "base");
    const hint = $("calHint");
    if (hint) hint.textContent = pickMode === "top"
      ? "Tap a colour in the photo for the top of the cove."
      : "Tap the colour around the base.";
  }
  function setColourOn(on) {
    colourOn = !!on;
    const btn = $("calColorOn");
    const wrap = $("calTopWrap");
    if (btn) btn.classList.toggle("on", colourOn);
    if (wrap) wrap.hidden = !colourOn;
    if (colourOn && $("calTop")) {
      dark = hexRgb($("calTop").value, 0);
      paintDot("topDot", dark);
      if (light) rebuildFromStops();
    }
    status(colourOn ? "Swatch on. That colour is the top. Then tap the base on the photo." : "Swatch off. Tap the photo instead.");
  }
  function restorePlate() {
    try {
      const data = localStorage.getItem("cove-plate");
      if (!data) return;
      const img = new Image();
      img.onload = function () { groundEl = img; window.plateLocked = true; markLive(true); };
      img.src = data;
    } catch (e) {}
  }
  function openCal() {
    const item = calTarget();
    if (!item) { status("Add a JPEG, tap the thumb you want, then Calibrate."); return; }
    showHero(item);
    $("cal").hidden = false;
    $("calSrc").src = item.url;
    step = 1;
    light = null;
    dark = null;
    pickedTop = null;
    setPickMode("base");
    srcImg = new Image();
    srcImg.onload = function () {
      status(pickMode === "top"
        ? "Tap a colour in the photo for the top."
        : "Tap the colour around the base. Top takes a colour from the photo too.");
    };
    srcImg.src = item.url;
    if (plateCanvas || groundEl) previewPlate();
  }
  function onPick(e) {
    if (!srcImg || !srcImg.width) return;
    const sw = sample(srcImg, e.clientX, e.clientY, $("calSrc"));
    if (pickMode === "top") {
      colourOn = false;
      const btn = $("calColorOn");
      const wrap = $("calTopWrap");
      if (btn) btn.classList.remove("on");
      if (wrap) wrap.hidden = true;
      pickedTop = { r: sw.r, g: sw.g, b: sw.b, y: 0 };
      dark = pickedTop;
      paintDot("topDot", dark);
      setPickMode("base");
      status(light ? "Top taken from the photo." : "Top taken. Now tap the colour around the base.");
      if (light) rebuildFromStops();
      return;
    }
    light = sw;
    step = 2;
    paintDot("baseDot", light);
    dark = topStop();
    paintDot("topDot", dark);
    rebuildFromStops();
    status("Base taken from the photo. Use this plate if the cove looks right.");
  }
  restorePlate();
  if ($("calibrate")) $("calibrate").onclick = openCal;
  if ($("calSrc")) $("calSrc").onclick = onPick;
  if ($("pickTop")) $("pickTop").onclick = function () {
    setPickMode("top");
    status("Tap a colour in the photo for the top of the cove.");
  };
  if ($("pickBase")) $("pickBase").onclick = function () {
    setPickMode("base");
    status("Tap the colour around the base.");
  };
  if ($("calColorOn")) $("calColorOn").onclick = function () { setColourOn(!colourOn); };
  if ($("calTop")) $("calTop").oninput = function () {
    if (!colourOn) return;
    dark = hexRgb(this.value, 0);
    colourOn = true;
    paintDot("topDot", dark);
    if (light) rebuildFromStops();
  };
  if ($("calUse")) $("calUse").onclick = function () {
    if (plateCanvas) applyPlate(plateCanvas, window.coveFloor);
    else if (groundEl) { markLive(true); window.plateLocked = true; previewPlate(); status("Plate locked."); }
    else status("Click the floor, or use this plate.");
  };
  if ($("calClose")) $("calClose").onclick = function () { $("cal").hidden = true; };
})();
