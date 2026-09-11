/* Free in-browser cut. No API key. Model downloads once, then stays cached.
   IMG.LY ISNet (AGPL) — source is this public repo. */
import imglyRemoveBackground from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";

window.cutWithAI = async function cutWithAI(file, onStatus) {
  const blob = await imglyRemoveBackground(file, {
    model: "isnet_fp16",
    output: { format: "image/png", quality: 1 },
    progress: (key, current, total) => {
      if (!onStatus || !total) return;
      const pct = Math.round((100 * current) / total);
      onStatus("AI " + key + " " + pct + "%");
    },
  });
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  bmp.close();
  return c;
};
