function downscaled(width, height, maxSize) {
  const factor = Math.min(1, maxSize / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

function rgbaOf(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function alphaOf(data) {
  const alpha = new Uint8Array(data.length / 4);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return alpha;
}

async function loadPixels(src, maxSize) {
  try {
    const texture = await foundry.canvas.loadTexture(src);
    const source = texture?.baseTexture?.resource?.source;
    const imageWidth = texture?.width;
    const imageHeight = texture?.height;
    if (!source || !(imageWidth > 0) || !(imageHeight > 0)) return null;
    const { width, height } = downscaled(imageWidth, imageHeight, maxSize);
    return { width, height, data: rgbaOf(source, width, height), scale: imageWidth / width, imageWidth, imageHeight };
  } catch (err) {
    console.warn("Floorer | could not read level image", src, err);
    return null;
  }
}

export async function loadAlpha(src, maxSize = 512) {
  const image = await loadPixels(src, maxSize);
  if (!image) return null;
  const { data, ...rest } = image;
  return { ...rest, alpha: alphaOf(data) };
}
