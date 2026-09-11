/* AI cut: load the model as soon as the page opens.
   Model returns a mask. Pixels stay the original JPEG. */
import {
  AutoModel,
  AutoProcessor,
  RawImage,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/+esm";

env.allowLocalModels = false;
env.useBrowserCache = true;

let pack = null;
window.AI_READY = false;
window.AI_ERROR = null;

async function loadRmbg(onStatus) {
  if (pack) return pack;
  if (onStatus) onStatus("Loading AI cut model…");
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

function stampAlpha(orig, maskCanvas) {
  const w = orig.width, h = orig.height;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  tmp.getContext("2d").drawImage(maskCanvas, 0, 0, w, h);
  const a = tmp.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const ctx = orig.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) img.data[i * 4 + 3] = a[i * 4 + 3];
  ctx.putImageData(img, 0, 0);
  return orig;
}

async function cutRmbg(file, onStatus) {
  const { model, processor } = await loadRmbg(onStatus);
  if (onStatus) onStatus("AI cutting…");
  const url = URL.createObjectURL(file);
  try {
    const image = await RawImage.fromURL(url);
    const { pixel_values } = await processor(image);
    const { output } = await model({ input: pixel_values });
    const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(
      image.width,
      image.height
    );
    image.putAlpha(mask);
    const maskCanvas = image.toCanvas();
    const orig = await canvasFromFile(file);
    return stampAlpha(orig, maskCanvas);
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
      onStatus("AI " + key + " " + Math.round((100 * current) / total) + "%");
    },
  });
  const cut = await createImageBitmap(blob);
  const maskC = document.createElement("canvas");
  maskC.width = cut.width;
  maskC.height = cut.height;
  maskC.getContext("2d").drawImage(cut, 0, 0);
  cut.close();
  const orig = await canvasFromFile(file);
  return stampAlpha(orig, maskC);
}

window.cutWithAI = async function cutWithAI(file, onStatus) {
  try {
    return await cutRmbg(file, onStatus);
  } catch (err) {
    if (onStatus) onStatus("RMBG failed, trying ISNet…");
    return await cutImgly(file, onStatus);
  }
};

loadRmbg(function (t) {
  const el = document.getElementById("status");
  if (el) el.textContent = t;
})
  .then(function () {
    window.AI_READY = true;
    const el = document.getElementById("status");
    if (el) el.textContent = "AI cut ready.";
  })
  .catch(function (err) {
    window.AI_ERROR = err && err.message ? err.message : "model failed";
    const el = document.getElementById("status");
    if (el) el.textContent = "AI model: " + window.AI_ERROR;
  });
