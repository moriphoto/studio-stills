function toBlob(c){ return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("export failed")),"image/jpeg",0.92)); }
function download(blob,name){
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name;
  a.rel="noopener"; document.body.appendChild(a); a.click(); a.remove();
}
function status(t){ document.getElementById("status").textContent = t || ""; }

let activeItem = null;
window.magicOn = false;
window.shadowBrushOn = false;

function toolCursor() {
  const hero = document.getElementById("hero");
  if (hero) hero.style.cursor = (window.magicOn || window.shadowBrushOn) ? "crosshair" : "default";
}
function showHero(item) {
  activeItem = item;
  const hero = document.getElementById("hero");
  const wrap = document.getElementById("heroWrap");
  if (!hero || !wrap) return;
  wrap.hidden = false;
  hero.src = item.processedUrl || item.url;
  toolCursor();
}
function render() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  items.forEach((item) => {
    const el = document.createElement("article");
    el.style.cursor = "pointer";
    if (item === activeItem) el.style.outline = "1px solid #39ff14";
    el.innerHTML = `<img src="${item.processedUrl||item.url}" alt=""><div class="m"><span>${item.name}</span></div>`;
    el.onclick = function () { showHero(item); render(); };
    grid.appendChild(el);
  });
}
function addFiles(list){
  const picked = Array.from(list).filter(isStill).slice(0,20);
  if (!picked.length) { status("No JPEGs in that drop."); return; }
  picked.forEach(file => {
    const name = file.name.replace(/\.[^.]+$/,"");
    items.push({ name, file, url: URL.createObjectURL(file), selected: true, settings: readSettings() });
  });
  if (items.length > 20) items.length = 20;
  render();
  if (items.length) showHero(items[items.length - 1]);
  const framed = picked.some(f => /-1920/i.test(f.name));
  status(picked.length + " added. Tap a thumb for the big still." + (framed ? " Use the original JPEG, not a -1920." : ""));
}

window.shadowDir = 0;
function setShadowDir(val, id) {
  window.shadowDir = val;
  ["shL", "shC", "shR"].forEach(function (k) {
    const b = document.getElementById(k);
    if (b) b.classList.toggle("on", k === id);
  });
  if (typeof window.refreshShadowPreview === "function") window.refreshShadowPreview();
  status("Shadow " + (val < 0 ? "left" : val > 0 ? "right" : "under") + ". Process again.");
}
const shL = document.getElementById("shL"); if (shL) shL.onclick = function () { setShadowDir(-1, "shL"); };
const shC = document.getElementById("shC"); if (shC) shC.onclick = function () { setShadowDir(0, "shC"); };
const shR = document.getElementById("shR"); if (shR) shR.onclick = function () { setShadowDir(1, "shR"); };

function setTool(which) {
  window.magicOn = which === "magic";
  window.shadowBrushOn = which === "shadow";
  const m = document.getElementById("magic");
  const s = document.getElementById("shBrush");
  if (m) m.classList.toggle("on", window.magicOn);
  if (s) s.classList.toggle("on", window.shadowBrushOn);
  toolCursor();
  status(window.magicOn ? "Magic on. Paint to bring the original back." : window.shadowBrushOn ? "Shadow brush on. Paint the puddle to round it." : "Tools off.");
}
const magicBtn = document.getElementById("magic");
if (magicBtn) magicBtn.onclick = function () { setTool(window.magicOn ? "" : "magic"); };
const shBrushBtn = document.getElementById("shBrush");
if (shBrushBtn) shBrushBtn.onclick = function () { setTool(window.shadowBrushOn ? "" : "shadow"); };

async function stampOriginal(item, outX, outY) {
  if (!item.framed) { status("Process first, then paint."); return; }
  if (!item.origImg) item.origImg = await loadImage(item.file);
  const orig = item.origImg;
  const fw = item.framed.width, fh = item.framed.height;
  const fit = fitContain(orig.width, orig.height, fw, fh);
  const ctx = item.framed.getContext("2d");
  const r = Math.max(14, Math.round(fw * 0.018));
  ctx.save();
  ctx.beginPath();
  ctx.arc(outX, outY, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(orig, 0, 0, orig.width, orig.height, fit.dx, fit.dy, fit.dw, fit.dh);
  ctx.restore();
  item.processedUrl = URL.createObjectURL(await toBlob(item.framed));
  showHero(item);
  render();
}

async function stampShadow(item, outX, outY) {
  if (!item.framed) { status("Process first, then paint the shadow."); return; }
  const fw = item.framed.width, fh = item.framed.height;
  const ctx = item.framed.getContext("2d");
  const rx = Math.max(28, Math.round(fw * 0.034));
  const ry = Math.max(10, Math.round(rx * 0.38));
  const g = ctx.createRadialGradient(outX, outY, 2, outX, outY, rx);
  g.addColorStop(0, "rgba(16,16,16,0.26)");
  g.addColorStop(0.45, "rgba(16,16,16,0.12)");
  g.addColorStop(1, "rgba(16,16,16,0)");
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(outX, outY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  item.processedUrl = URL.createObjectURL(await toBlob(item.framed));
  showHero(item);
  render();
}

document.getElementById("files").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
const enhance = document.getElementById("enhance");
if (enhance) enhance.oninput = e => { const v = document.getElementById("enhancev"); if (v) v.textContent = (Number(e.target.value)/100).toFixed(2); };
const edge = document.getElementById("edge");
if (edge) edge.oninput = e => { const v = document.getElementById("edgev"); if (v) v.textContent = e.target.value; };
const drop = document.getElementById("drop");
drop.onclick = () => document.getElementById("files").click();
drop.ondragover = e => e.preventDefault();
drop.ondrop = e => { e.preventDefault(); addFiles(e.dataTransfer.files); };

const heroEl = document.getElementById("hero");
if (heroEl) {
  heroEl.onpointerdown = function (e) {
    if (!activeItem || (!window.magicOn && !window.shadowBrushOn)) return;
    e.preventDefault();
    const paint = function (ev) {
      const rect = heroEl.getBoundingClientRect();
      const fw = activeItem.framed ? activeItem.framed.width : 1920;
      const fh = activeItem.framed ? activeItem.framed.height : 1080;
      const x = (ev.clientX - rect.left) / rect.width * fw;
      const y = (ev.clientY - rect.top) / rect.height * fh;
      if (window.magicOn) stampOriginal(activeItem, x, y);
      else stampShadow(activeItem, x, y);
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

function loadImage(file){
  return new Promise((res,rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not read " + file.name));
    img.src = URL.createObjectURL(file);
  });
}

let assetsReady = null;
document.getElementById("run").onclick = async () => {
  if (!items.length) { status("Add original JPEGs first, then Process all."); return; }
  const bar = readSettings();
  const btn = document.getElementById("run");
  btn.disabled = true;
  try {
    if (!assetsReady) assetsReady = loadAssets();
    await assetsReady;
    for (let i=0;i<items.length;i++){
      status("Cutting " + (i+1) + " of " + items.length + "…");
      await new Promise(r => setTimeout(r, 20));
      try {
        items[i].cut = await cutFromFile(items[i].file, bar, status);
        items[i].framed = items[i].cut.canvas;
        items[i].origImg = await loadImage(items[i].file);
        if (items[i].framed.width !== W || items[i].framed.height !== H) {
          items[i].cut = forceFrame(items[i].cut);
          items[i].framed = items[i].cut.canvas;
        }
        items[i].processedUrl = URL.createObjectURL(await toBlob(items[i].framed));
        showHero(items[i]);
      } catch (one) {
        status("Skipped " + items[i].name + ": " + (one && one.message ? one.message : "error"));
        continue;
      }
      render();
    }
    const ok = items.filter(x => x.framed).length;
    status(ok ? ("Done — " + ok + " at " + W + " × " + H + ".") : "Cut failed. Use the original JPEG.");
  } catch (err) {
    status("Process failed: " + (err && err.message ? err.message : "open Chrome console"));
  }
  btn.disabled = false;
};
function resetStudio() {
  items.splice(0, items.length);
  activeItem = null;
  groupUrl = null;
  document.getElementById("grid").innerHTML = "";
  document.getElementById("heroWrap").hidden = true;
  document.getElementById("files").value = "";
  const hero = document.getElementById("hero");
  if (hero) hero.removeAttribute("src");
  const web = document.getElementById("resWeb"); if (web) web.checked = true;
  setTool("");
  setShadowDir(0, "shC");
  status("Reset.");
}
document.getElementById("reset").onclick = resetStudio;
document.getElementById("dl").onclick = async () => {
  let n = 0;
  for (const item of items) {
    if (!item.framed) continue;
    const tag = item.framed.width + "x" + item.framed.height;
    download(await toBlob(item.framed), item.name + "-" + tag + ".jpg");
    n++;
    await new Promise(r => setTimeout(r, 250));
  }
  if (!n) status("Process first, then download.");
};
