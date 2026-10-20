/* One 1920×1080 group. Pots are copied unchanged. Only the ground and shadow are lit. */
(function () {
  function splitSprite(photo, bb) {
    const src = photo.getContext("2d", { willReadFrequently: true }).getImageData(bb.x, bb.y, bb.w, bb.h);
    const d = src.data;
    const pot = document.createElement("canvas");
    const sh = document.createElement("canvas");
    pot.width = sh.width = bb.w;
    pot.height = sh.height = bb.h;
    const pd = pot.getContext("2d").createImageData(bb.w, bb.h);
    const sd = sh.getContext("2d").createImageData(bb.w, bb.h);
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 8) continue;
      const L = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
      if (a > 196 && L > 26) {
        pd.data[i] = d[i];
        pd.data[i + 1] = d[i + 1];
        pd.data[i + 2] = d[i + 2];
        pd.data[i + 3] = a;
      } else {
        sd.data[i] = 20;
        sd.data[i + 1] = 18;
        sd.data[i + 2] = 16;
        sd.data[i + 3] = Math.min(150, a);
      }
    }
    pot.getContext("2d").putImageData(pd, 0, 0);
    sh.getContext("2d").putImageData(sd, 0, 0);
    return { pot: pot, shadow: sh };
  }

  function sprites(list) {
    const out = [];
    list.forEach(function (item) {
      const photo = item.cut && item.cut.photo;
      if (!photo || !photo.width) return;
      const bb = bboxFromAlpha(photo);
      if (!bb.w || !bb.h) return;
      out.push(Object.assign({ photo: photo, bb: bb, w: bb.w, h: bb.h }, splitSprite(photo, bb)));
    });
    out.sort(function (a, b) { return b.h - a.h; });
    return out;
  }

  function rowWidth(row, scale) {
    let w = 0;
    const overlap = 0.1;
    row.forEach(function (s, i) {
      w += s.w * scale * (i ? (1 - overlap) : 1);
    });
    return w;
  }

  function drawShadow(ctx, s, dx, dy, dw, dh, footY) {
    ctx.save();
    ctx.filter = "blur(10px)";
    ctx.globalAlpha = 0.72;
    ctx.drawImage(s.shadow, dx + dw * 0.03, dy + 2, dw, dh);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "rgba(30,26,22,0.28)";
    ctx.filter = "blur(6px)";
    ctx.beginPath();
    ctx.ellipse(dx + dw * 0.5, footY - 2, Math.max(10, dw * 0.22), Math.max(4, dh * 0.018), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRow(ctx, row, scale, footY) {
    if (!row.length) return;
    const overlap = 0.1;
    const total = rowWidth(row, scale);
    let x = (W - total) / 2;
    row.forEach(function (s) {
      const dw = s.w * scale;
      const dh = s.h * scale;
      const dx = x;
      const dy = footY - dh;
      drawShadow(ctx, s, dx, dy, dw, dh, footY);
      ctx.drawImage(s.pot, dx, dy, dw, dh);
      x += dw * (1 - overlap);
    });
  }

  function build(list) {
    const all = sprites(list);
    if (all.length < 2) return null;
    const split = Math.max(1, Math.ceil(all.length * 0.55));
    const back = all.slice(0, split);
    const front = all.slice(split);
    const tallest = all[0].h;
    let scale = (H * 0.58) / tallest;
    const margin = W * 0.05;
    const limit = W - margin * 2;
    const widest = Math.max(rowWidth(back, scale), front.length ? rowWidth(front, scale) : 0);
    if (widest > limit) scale *= limit / widest;
    const head = H * 0.06;
    const backFoot = H * 0.74;
    if (backFoot - tallest * scale < head) scale = (backFoot - head) / tallest;

    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const ctx = out.getContext("2d");
    paintPlate(ctx);
    drawRow(ctx, back, scale, backFoot);
    drawRow(ctx, front, scale, H * 0.92);
    return out;
  }

  const btn = document.getElementById("collection");
  if (!btn) return;
  btn.onclick = async function () {
    const picked = items.filter(function (it) {
      return it.selected !== false && it.cut && it.cut.photo;
    });
    if (picked.length < 2) {
      status(items.length ? "Tick at least two processed pictures, then Collection." : "Add pictures, Process, then Collection.");
      return;
    }
    btn.classList.add("on");
    status("Placing " + picked.length + " pieces. Lighting the ground only…");
    await new Promise(function (r) { setTimeout(r, 20); });
    const canvas = build(picked);
    if (!canvas) {
      btn.classList.remove("on");
      status("Process the pictures first, then Collection.");
      return;
    }
    const blob = await toBlob(canvas);
    const url = URL.createObjectURL(blob);
    const item = {
      name: "collection",
      file: new File([blob], "collection.jpg", { type: "image/jpeg" }),
      url: url,
      processedUrl: url,
      framed: canvas,
      selected: true,
      settings: readSettings()
    };
    items.unshift(item);
    activeItem = item;
    showHero(item);
    render();
    status("Collection ready. The pots are the original cut-outs. Only the ground and shadow were lit.");
  };
})();
