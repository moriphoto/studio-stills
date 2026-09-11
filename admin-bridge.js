/* Admin can open:
   /?images=https://jmceramics.netlify.app/media/a.jpg,https://...
   Stills land in the tray. Process all as usual.
*/
(async function loadFromQuery() {
  const raw = new URLSearchParams(location.search).get("images");
  if (!raw || typeof addFiles !== "function") return;
  const urls = raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 20);
  if (!urls.length) return;
  status("Loading " + urls.length + " from the site…");
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
