/* Browser cut. RMBG / ISNet supply a mask. The ceramic pixels
   always come from the original JPEG — never from the model RGB. */
import {
  AutoModel,
  AutoProcessor,
  RawImage,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/+esm";

env.allowLocalModels = false;
env.useBrowserCache = true;

let pack = null;

async function loadRmbg(onStatus) {
  if (pack) return pack;
  if (onStatus) onStatus("Loading RMBG cut model (once, ~50MB)…");
  const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
    config: { model_type: "custom" },
  });
  const processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
    config: {
      do_normalize: true,
      do_pad: false,
      do_rescale: true,
      do_resize: true,
      image_mean: [0.5, 0.5, 0.5],
      feature_extractor_type: "ImageFeatureExtractor",
      image_std: [1, 1, 1],
      resample: 2,
      rescale_factor: 0.00392156862745098,
      size: { width: 1024, height: 1024 },
    },
  });
  pack = { model, processor };
  return pack;
}

function canvasFromFile(file) {
  return createImageBitmap(file).then((bmp) => {
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    bmp.close();
    return c;
  });
}

function applyMaskToOriginal(origCanvas, maskCanvasOrData, mw, mh) {
  const w = origCanvas.width, h = origCanvas.height;
  const ctx = origCanvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let alpha;
  if (maskCanvasOrData instanceof HTMLCanvasElement) {
    const mctx = maskCanvasOrData.getContext("2d", { willReadFrequently: true });
    if (maskCanvasOrData.width !== w || maskCanvasOrData.height !== h) {
      const tmp = document.createElement("canvas");
      tmp.width = w; tmp.height = h;
      tmp.getContext("2d").drawImage(maskCanvasOrData, 0, 0, w, h);
      alpha = tmp.getContext("2d").getImageData(0, 0, w, h).data;
    } else {
      alpha = mctx.getImageData(0, 0, w, h).data;
    }
    for (let i = 0; i < w * h; i++) d[i * 4 + 3] = alpha[i * 4 + 3];
  } else {
    const src = maskCanvasOrData;
    const ch = src.length === w * h ? 1 : src.length === w * h * 4 ? 4 : (src.length / (mw * mh)) | 0 || 1;
    if (mw === w && mh === h && ch === 1) {
      for (let i = 0; i < w * h; i++) d[i * 4 + 3] = src[i];
    } else if (mw === w && mh === h && ch === 4) {
      for (let i = 0; i < w * h; i++) d[i * 4 + 3] = src[i * 4];
    } else {
      const tmp = document.createElement("canvas");
      tmp.width = mw; tmp.height = mh;
      const tctx = tmp.getContext("2d");
      const tid = tctx.createImageData(mw, mh);
      for (let i = 0; i < mw * mh; i++) {
        const a = ch === 1 ? src[i] : src[i * ch];
        tid.data[i * 4] = a;
        tid.data[i * 4 + 1] = a;
        tid.data[i * 4 + 2] = a;
        tid.data[i * 4 + 3] = 255;
      }
      tctx.putImageData(tid, 0, 0);
      const scaled = document.createElement("canvas");
      scaled.width = w; scaled.height = h;
      scaled.getContext("2d").drawImage(tmp, 0, 0, w, h);
      const sd = scaled.getContext("2d").getImageData(0, 0, w, h).data;
      for (let i = 0; i < w * h; i++) d[i * 4 + 3] = sd[i * 4];
    }
  }
  ctx.putImageData(img, 0, 0);
  return origCanvas;
}

async function cutRmbg(file, onStatus) {
  const { model, processor } = await loadRmbg(onStatus);
  if (onStatus) onStatus("AI cutting ceramic…");
  const url = URL.createObjectURL(file);
  try {
    const image = await RawImage.fromURL(url);
    const { pixel_values } = await processor(image);
    const { output } = await model({ input: pixel_values });
    const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(
      image.width,
      image.height
    );
    const orig = await canvasFromFile(file);
    const data = mask.data;
    return applyMaskToOriginal(orig, data, mask.width, mask.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function cutImgly(file, onStatus) {
  const { default: imglyRemoveBackground } = await import(
    "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm"
  );
  const blob = await imglyRemoveBackground(file, {
    model: "isnet_fp16",
    output: { format: "image/png", quality: 1 },
    progress: (key, current, total) => {
      if (!onStatus || !total) return;
      onStatus("ISNet " + key + " " + Math.round((100 * current) / total) + "%");
    },
  });
  const cut = await createImageBitmap(blob);
  const maskC = document.createElement("canvas");
  maskC.width = cut.width;
  maskC.height = cut.height;
  maskC.getContext("2d").drawImage(cut, 0, 0);
  cut.close();
  const orig = await canvasFromFile(file);
  return applyMaskToOriginal(orig, maskC);
}

window.cutWithAI = async function cutWithAI(file, onStatus) {
  try {
    return await cutRmbg(file, onStatus);
  } catch (err) {
    if (onStatus) onStatus("RMBG failed, trying ISNet…");
    try {
      return await cutImgly(file, onStatus);
    } catch (err2) {
      throw err;
    }
  }
};
