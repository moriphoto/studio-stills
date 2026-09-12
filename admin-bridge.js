/* Home → admin. Optional ?return=  */
(function setHome() {
  const a = document.getElementById("home");
  if (!a) return;
  const q = new URLSearchParams(location.search);
  const back = q.get("return");
  const allowed = /^https:\/\/(jmceramics\.netlify\.app\/admin\/?|moriphoto\.github\.io\/jm-website\/admin\/?)/;
  if (back && allowed.test(back)) a.href = back;
})();

(async function loadFromQuery() {
  const q = new URLSearchParams(location.search);
  const raw = q.get("images");
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
