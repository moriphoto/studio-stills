/* One 1920×1080 group from the ticked cut-outs. Large pieces behind, small in front. */
(function () {
  function sprites(list) {
    const out = [];
    list.forEach(function (item) {
      const photo = item.cut && item.cut.photo;
      if (!photo || !photo.width) return;
      const bb = bboxFromAlpha(photo);
      if (!bb.w || !bb.h) return;
      out.push({ photo: photo, bb: bb, w: bb.w, h: bb.h });
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
      ctx.save();
      ctx.fillStyle = "rgba(18,16,14,0.38)";
      ctx.filter = "blur(8px)";
      ctx.beginPath();
      ctx.ellipse(dx + dw * 0.5, footY - 4, Math.max(12, dw * 0.32), Math.max(7, dh * 0.03), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.drawImage(s.photo, s.bb.x, s.bb.y, s.bb.w, s.bb.h, dx, dy, dw, dh);
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
    status("Placing " + picked.length + " pieces…");
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
    status("Collection is ready, 1920 × 1080. Tick it and use To media, or download it.");
  };
})();
