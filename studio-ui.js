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
function chosen() {
  return items.filter(function (it) { return it.selected !== false; });
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
      "<button type=\"button\" class=\"tick" + (item.selected !== false ? " on" : "") + "\" aria-label=\"Include\"></button>" +
      "<span class=\"pick\">" + item.name + "</span>" +
      "<button type=\"button\" class=\"kill\" title=\"Delete\">×</button>" +
      "</div>";
    el.querySelector("img").onclick = function () { showHero(item); render(); };
    el.querySelector(".tick").onclick = function (e) {
      e.stopPropagation();
      item.selected = item.selected === false;
      render();
      const n = chosen().length;
      status(n ? (n + " ticked.") : "None ticked.");
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
}

document.getElementById("dl").onclick = async () => {
  const picked = tickedFramed();
  if (!picked.length) { status("Tick a finished picture, then Singles."); return; }
  const blobs = [];
  for (const item of picked) {
    const tag = item.framed.width + "x" + item.framed.height;
    blobs.push({ blob: await toBlob(item.framed), name: item.name + "-" + tag + ".jpg" });
  }
  blobs.forEach(function (file) { download(file.blob, file.name); });
  status(blobs.length + " single" + (blobs.length === 1 ? "" : "s") + " downloading.");
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
    if (n) status(n + " ticked picture" + (n === 1 ? "" : "s") + " in one zip.");
  } catch (err) {
    status("Folder zip failed: " + (err && err.message ? err.message : "error"));
  }
};

const dlCeramics = document.getElementById("dlCeramics");
if (dlCeramics) dlCeramics.onclick = async function () {
  const picked = tickedFramed();
  if (!picked.length) {
    status(items.length ? "Tick a finished picture, then To media." : "Add pictures, then Process.");
    return;
  }
  dlCeramics.classList.add("on");
  const stamp = packStamp();
  status("Packing " + picked.length + "…");
  try {
    const n = await zipTicked("inbox/" + stamp, "inbox-" + stamp);
    status(n + " ticked picture" + (n === 1 ? "" : "s") + " in one zip.");
  } catch (err) {
    dlCeramics.classList.remove("on");
    status("Could not pack them. " + (err && err.message ? err.message : ""));
  }
};
