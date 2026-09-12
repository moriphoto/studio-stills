/* Admin: /?images=url,url&return=https://jmceramics.netlify.app/admin/stills.html */
(async function loadFromQuery() {
  const q = new URLSearchParams(location.search);
  const raw = q.get("images");
  const back = q.get("return");
  if (back && /^https:\/\/jmceramics\.netlify\.app\/admin\/stills\.html/.test(back)) {
    const bar = document.querySelector(".bar");
    if (bar && !document.getElementById("backMedia")) {
      const a = document.createElement("a");
      a.id = "backMedia";
      a.className = "ghost";
      a.href = back;
      a.textContent = "Return to media";
      a.style.cssText = "text-decoration:none;display:inline-block;";
      bar.appendChild(a);
    }
  }
  if (!raw || typeof addFiles !== "function") return;
  const urls = raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 20);
  if (!urls.length) return;
  status("Loading " + urls.length + " from media…");
  const files = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      let name = decodeURIComponent((url.split("/").pop() || "still.jpg").replace(/\?.*$/, ""));
      if (!/\.(jpe?g|png|webp)$/i.test(name)) name += ".jpg";
      files.push(new File([blob], name, { type: blob.type || "image/jpeg" }));
    } catch (e) {
      status("Could not load " + url);
    }
  }
  if (files.length) addFiles(files);
})();
