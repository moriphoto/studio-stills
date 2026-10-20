function makeTargetCursor(color) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const x = c.getContext("2d");
  x.strokeStyle = color;
  x.lineWidth = 1.4;
  x.beginPath(); x.arc(16, 16, 10, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(16, 3); x.lineTo(16, 29); x.moveTo(3, 16); x.lineTo(29, 16); x.stroke();
  x.fillStyle = color;
  x.beginPath(); x.arc(16, 16, 1.2, 0, Math.PI * 2); x.fill();
  return "url(" + c.toDataURL() + ") 16 16, crosshair";
}
const CURSOR_REMOVE = makeTargetCursor("#ff3b3b");

function toolCursor() {
  const hero = document.getElementById("hero");
  if (!hero) return;
  hero.style.cursor = window.removeOn ? CURSOR_REMOVE : "default";
}

window.magicOn = false;
window.shadowBrushOn = false;
window.removeOn = false;

function setTool(which) {
  window.removeOn = which === "remove";
  const r = document.getElementById("rmBrush");
  if (r) r.classList.toggle("on", window.removeOn);
  toolCursor();
  status(window.removeOn ? "Remove on. Paint the junk on the big picture. Keep saves this still." : "Remove off.");
}
const rmBtn = document.getElementById("rmBrush");
if (rmBtn) rmBtn.onclick = function () { setTool(window.removeOn ? "" : "remove"); };
const setBtn = document.getElementById("applyEdit");
if (setBtn) setBtn.onclick = function () { setCleanup(activeItem); };
function paintAll() {
  const btn = document.getElementById("selAll");
  if (!btn) return;
  const allOn = items.length > 0 && items.every(function (it) { return it.selected !== false; });
  btn.classList.toggle("on", allOn);
}
const selAll = document.getElementById("selAll");
if (selAll) selAll.onclick = function () {
  if (!items.length) { status("Add pictures first."); return; }
  items.forEach(function (it) { it.selected = true; });
  render();
  status(items.length + " ticked.");
};

const heroEl = document.getElementById("hero");
if (heroEl) {
  heroEl.onpointerdown = function (e) {
    if (!activeItem || !window.removeOn) return;
    e.preventDefault();
    const paint = function (ev) {
      const rect = heroEl.getBoundingClientRect();
      const fw = activeItem.framed ? activeItem.framed.width : 1920;
      const fh = activeItem.framed ? activeItem.framed.height : 1080;
      const x = (ev.clientX - rect.left) / rect.width * fw;
      const y = (ev.clientY - rect.top) / rect.height * fh;
      stampRemove(activeItem, x, y);
    };
    paint(e);
    const move = function (ev) { paint(ev); };
    const up = function () {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
}

function render() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  items.forEach((item, idx) => {
    const el = document.createElement("article");
    if (item === activeItem) el.style.outline = "1px solid #39ff14";
    el.innerHTML =
      "<img src=\"" + (item.processedUrl || item.url) + "\" alt=\"\">" +
      "<div class=\"m\">" +
      "<label class=\"pick\"><input type=\"checkbox\" " + (item.selected !== false ? "checked" : "") + "> " + item.name + "</label>" +
      "<button type=\"button\" class=\"kill\" title=\"Delete\">×</button>" +
      "</div>";
    el.querySelector("img").onclick = function () { showHero(item); render(); };
    el.querySelector("input").onchange = function (e) {
      e.stopPropagation();
      item.selected = e.target.checked;
      paintAll();
    };
    el.querySelector(".kill").onclick = function (e) {
      e.stopPropagation();
      items.splice(idx, 1);
      if (activeItem === item) activeItem = items[0] || null;
      if (activeItem) showHero(activeItem);
      else {
        const wrap = document.getElementById("heroWrap");
        if (wrap) wrap.hidden = true;
      }
      render();
    };
    grid.appendChild(el);
  });
  paintAll();
}

document.getElementById("dl").onclick = async () => {
  let n = 0;
  for (const item of items) {
    if (!item.framed) continue;
    if (item.selected === false) continue;
    const tag = item.framed.width + "x" + item.framed.height;
    download(await toBlob(item.framed), item.name + "-" + tag + ".jpg");
    n++;
    await new Promise(r => setTimeout(r, 250));
  }
  if (!n) status("Tick a processed still, then download.");
};

function packStamp() {
  const d = new Date();
  const p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function tickedFramed() {
  return items.filter(function (it) { return it.framed && it.selected !== false; });
}

async function zipTicked(innerFolder, zipName) {
  if (typeof JSZip === "undefined") throw new Error("Zip library did not load");
  const picked = tickedFramed();
  if (!picked.length) {
    status("Tick processed stills first.");
    return null;
  }
  const zip = new JSZip();
  const folder = zip.folder(innerFolder);
  for (let i = 0; i < picked.length; i++) {
    const item = picked[i];
    const tag = item.framed.width + "x" + item.framed.height;
    const blob = await toBlob(item.framed);
    folder.file(item.name + "-" + tag + ".jpg", blob);
  }
  const out = await zip.generateAsync({ type: "blob" });
  const name = zipName || String(innerFolder).replace(/\//g, "-");
  download(out, name + ".zip");
  return picked.length;
}

const dlFolder = document.getElementById("dlFolder");
if (dlFolder) dlFolder.onclick = async function () {
  try {
    const stamp = packStamp();
    const n = await zipTicked("stills-" + stamp, "stills-" + stamp);
    if (n) status(n + " stills in a folder zip. Unzip on the computer or phone.");
  } catch (err) {
    status("Folder zip failed: " + (err && err.message ? err.message : "error"));
  }
};

const dlCeramics = document.getElementById("dlCeramics");
if (dlCeramics) dlCeramics.onclick = async function () {
  const picked = tickedFramed();
  const notDone = items.filter(function (it) { return it.selected !== false && !it.framed; });
  if (!picked.length) {
    status(notDone.length ? "Process the pictures first, then To media." : "Tick a picture, then To media.");
    return;
  }
  status("To media… " + picked.length + " picture" + (picked.length === 1 ? "" : "s") + ".");
  const stamp = packStamp();
  try {
    if (typeof window.pushStillsToMedia === "function") {
      const n = await window.pushStillsToMedia(picked, stamp, status);
      status(n + " in Media, folder inbox/" + stamp + ".");
      window.open("https://moriphoto.github.io/jm-website/admin/", "_blank", "noopener");
      return;
    }
  } catch (err) {
    status("Could not sign in. Downloading a zip instead.");
  }
  try {
    const n = await zipTicked("inbox/" + stamp, "inbox-" + stamp);
    if (n) status(n + " pictures in the zip. The website did not take them.");
  } catch (err2) {
    status("To media failed. " + (err2 && err2.message ? err2.message : ""));
  }
};
