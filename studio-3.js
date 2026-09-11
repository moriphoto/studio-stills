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
    el.innerHTML = `<img src="${item.processedUrl||item.url}" alt=""><div class="m"><span>${item.name}</span><label><input type="checkbox" ${item.selected?"checked":""}> in group</label></div>`;
    el.querySelector("input").onchange = e => { item.selected = e.target.checked; };
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
  status(picked.length + " added. Process all when ready." + (framed ? " Tip: use the original phone JPEG, not a -1920." : ""));
}

document.getElementById("files").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
document.getElementById("tol").oninput = e => { document.getElementById("tolv").textContent = e.target.value; };
document.getElementById("con").oninput = e => { document.getElementById("conv").textContent = (Number(e.target.value)/100).toFixed(2); };
["mask","foot"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.oninput = e => { const v = document.getElementById(id + "v"); if (v) v.textContent = e.target.value; };
});
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
      const s = items[i].settings || bar;
      status("Processing " + (i+1) + " of " + items.length + "…");
      await new Promise(r => setTimeout(r, 20));
      try {
        items[i].cut = await cutFromFile(items[i].file, s, status);
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
    status(ok ? ("Done — " + ok + " file(s) at 1920 × 1080.") : "Nothing processed. If AI is ticked, wait for the model or untick AI cut.");
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
  document.getElementById("group").hidden = true;
  document.getElementById("files").value = "";
  const hero = document.getElementById("hero");
  if (hero) hero.removeAttribute("src");
  const gi = document.getElementById("groupImg");
  if (gi) gi.removeAttribute("src");
  const mask = document.getElementById("mask"); if (mask) { mask.value = 68; document.getElementById("maskv").textContent = "68"; }
  const foot = document.getElementById("foot"); if (foot) { foot.value = 58; document.getElementById("footv").textContent = "58"; }
  const tol = document.getElementById("tol"); if (tol) { tol.value = 64; document.getElementById("tolv").textContent = "64"; }
  const con = document.getElementById("con"); if (con) { con.value = 110; document.getElementById("conv").textContent = "1.10"; }
  status("Reset.");
}
document.getElementById("reset").onclick = resetStudio;
document.getElementById("selectAll").onclick = () => {
  if (!items.length) { status("Add JPEGs first."); return; }
  items.forEach(i => i.selected = true);
  render();
  status("All " + items.length + " selected.");
};
document.getElementById("applyAll").onclick = () => {
  if (!items.length) { status("Add JPEGs first."); return; }
  const s = readSettings();
  items.forEach(i => { i.settings = Object.assign({}, s); i.selected = true; });
  render();
  status("Preset copied to " + items.length + " — Mask " + s.mask + ", Foot " + s.foot + ", Paper " + s.tol + ". Process all.");
};
document.getElementById("dl").onclick = async () => {
  let n = 0;
  for (const item of items) {
    if (!item.framed) continue;
    download(await toBlob(item.framed), item.name + "-1920.jpg");
    n++;
    await new Promise(r => setTimeout(r, 250));
  }
  if (!n) status("Process first, then download.");
};
document.getElementById("groupBtn").onclick = async () => {
  const chosen = items.filter(i => i.selected && i.cut);
  if (!chosen.length) { status("Process first."); return; }
  if (!assetsReady) assetsReady = loadAssets();
  await assetsReady;
  const blob = await toBlob(composeCollection(chosen.map(i => i.cut)));
  groupUrl = URL.createObjectURL(blob);
  document.getElementById("group").hidden = false;
  document.getElementById("groupImg").src = groupUrl;
  status("");
};
document.getElementById("dlGroup").onclick = async () => {
  if (!groupUrl) return;
  download(await fetch(groupUrl).then(r => r.blob()), "collection-1920.jpg");
};
