function makeTargetCursor(color) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const x = c.getContext("2d");
  x.strokeStyle = color;
  x.lineWidth = 1.4;
  x.beginPath(); x.arc(16, 16, 10, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.moveTo(16, 3); x.lineTo(16, 29); x.moveTo(3, 16); x.lineTo(29, 16); x.stroke();
  x.beginPath(); x.arc(16, 16, 1.2, 0, Math.PI * 2); x.fillStyle = color; x.fill();
  return "url(" + c.toDataURL() + ") 16 16, crosshair";
}
const CURSOR_MAGIC = makeTargetCursor("#3b82f6");
const CURSOR_SHADOW = makeTargetCursor("#39ff14");
const CURSOR_REMOVE = makeTargetCursor("#ff3b3b");

function toolCursor() {
  const hero = document.getElementById("hero");
  if (!hero) return;
  if (window.magicOn) hero.style.cursor = CURSOR_MAGIC;
  else if (window.shadowBrushOn) hero.style.cursor = CURSOR_SHADOW;
  else if (window.removeOn) hero.style.cursor = CURSOR_REMOVE;
  else hero.style.cursor = "default";
}

window.removeOn = false;
function setTool(which) {
  window.magicOn = which === "magic";
  window.shadowBrushOn = which === "shadow";
  window.removeOn = which === "remove";
  const m = document.getElementById("magic");
  const s = document.getElementById("shBrush");
  const r = document.getElementById("rmBrush");
  if (m) m.classList.toggle("on", window.magicOn);
  if (s) s.classList.toggle("on", window.shadowBrushOn);
  if (r) r.classList.toggle("on", window.removeOn);
  toolCursor();
  status(window.magicOn ? "Bring back on. Blue 30% preview. SET to bake." : window.shadowBrushOn ? "Shadow on. Green 30% preview. SET to bake." : window.removeOn ? "Remove on. Red 30% preview. SET to bake." : "Tools off.");
}
const magicBtn = document.getElementById("magic");
if (magicBtn) magicBtn.onclick = function () { setTool(window.magicOn ? "" : "magic"); };
const shBrushBtn = document.getElementById("shBrush");
if (shBrushBtn) shBrushBtn.onclick = function () { setTool(window.shadowBrushOn ? "" : "shadow"); };
const rmBtn = document.getElementById("rmBrush");
if (rmBtn) rmBtn.onclick = function () { setTool(window.removeOn ? "" : "remove"); };
const setBtn = document.getElementById("applyEdit");
if (setBtn) setBtn.onclick = function () { setCleanup(activeItem); };

const heroEl = document.getElementById("hero");
if (heroEl) {
  heroEl.onpointerdown = function (e) {
    if (!activeItem || (!window.magicOn && !window.shadowBrushOn && !window.removeOn)) return;
    e.preventDefault();
    const paint = function (ev) {
      const rect = heroEl.getBoundingClientRect();
      const fw = activeItem.framed ? activeItem.framed.width : 1920;
      const fh = activeItem.framed ? activeItem.framed.height : 1080;
      const x = (ev.clientX - rect.left) / rect.width * fw;
      const y = (ev.clientY - rect.top) / rect.height * fh;
      if (window.magicOn) stampOriginal(activeItem, x, y);
      else if (window.shadowBrushOn) stampShadow(activeItem, x, y);
      else stampRemove(activeItem, x, y);
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
    el.style.cursor = "pointer";
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
