function toBlob(c){ return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("export failed")),"image/jpeg",0.92)); }
function download(blob,name){
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name;
  a.rel="noopener"; document.body.appendChild(a); a.click(); a.remove();
}
function status(t){ document.getElementById("status").textContent = t || ""; }
function render() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  items.forEach((item) => {
    const el = document.createElement("article");
    el.innerHTML = `<img src="${item.processedUrl||item.url}" alt=""><div class="m"><span>${item.name}</span></div>`;
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
  const framed = picked.some(f => /-1920/i.test(f.name));
  status(picked.length + " added. Process all." + (framed ? " Use the original JPEG, not a -1920." : ""));
}

window.shadowDir = 0;
function setShadowDir(val, id) {
  window.shadowDir = val;
  ["shL", "shC", "shR"].forEach(function (k) {
    const b = document.getElementById(k);
    if (b) b.classList.toggle("on", k === id);
  });
  status("Shadow " + (val < 0 ? "left" : val > 0 ? "right" : "under") + ". Process again.");
}
const shL = document.getElementById("shL"); if (shL) shL.onclick = function () { setShadowDir(-1, "shL"); };
const shC = document.getElementById("shC"); if (shC) shC.onclick = function () { setShadowDir(0, "shC"); };
const shR = document.getElementById("shR"); if (shR) shR.onclick = function () { setShadowDir(1, "shR"); };

document.getElementById("files").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
const enhance = document.getElementById("enhance");
if (enhance) enhance.oninput = e => { const v = document.getElementById("enhancev"); if (v) v.textContent = (Number(e.target.value)/100).toFixed(2); };
const edge = document.getElementById("edge");
if (edge) edge.oninput = e => { const v = document.getElementById("edgev"); if (v) v.textContent = e.target.value; };
const drop = document.getElementById("drop");
drop.onclick = () => document.getElementById("files").click();
drop.ondragover = e => e.preventDefault();
drop.ondrop = e => { e.preventDefault(); addFiles(e.dataTransfer.files); };

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
        if (items[i].framed.width !== W || items[i].framed.height !== H) {
          items[i].cut = forceFrame(items[i].cut);
          items[i].framed = items[i].cut.canvas;
        }
        items[i].processedUrl = URL.createObjectURL(await toBlob(items[i].framed));
      } catch (one) {
        status("Skipped " + items[i].name + ": " + (one && one.message ? one.message : "error"));
        continue;
      }
      render();
      const hero = document.getElementById("hero");
      const wrap = document.getElementById("heroWrap");
      if (hero && wrap) {
        wrap.hidden = false;
        hero.src = items[i].processedUrl;
      }
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
  groupUrl = null;
  document.getElementById("grid").innerHTML = "";
  document.getElementById("heroWrap").hidden = true;
  document.getElementById("files").value = "";
  const hero = document.getElementById("hero");
  if (hero) hero.removeAttribute("src");
  const web = document.getElementById("resWeb"); if (web) web.checked = true;
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
