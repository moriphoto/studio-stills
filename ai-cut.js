/* Browser cut. Tried rembg U2-Net + ISNet on a Mackenzie sphere — both cut
   the ceramic clean. This page runs the same class of model (RMBG-1.4) via
   transformers.js. No API key. First load ~50MB, then cached. */
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
    image.putAlpha(mask);
    return image.toCanvas();
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
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  bmp.close();
  return c;
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
