import imageCompression from "browser-image-compression";
import type { Area } from "react-easy-crop";

export const MAX_IMAGE_BYTES = 150 * 1024;

const WEBP_ERROR = "圖片必須是 150KB 以內的 WebP";

async function compressOnce(file: File, useWebWorker: boolean): Promise<File> {
  return imageCompression(file, {
    maxSizeMB: MAX_IMAGE_BYTES / (1024 * 1024),
    maxWidthOrHeight: 1920,
    fileType: "image/webp",
    initialQuality: 0.8,
    useWebWorker,
  });
}

export async function compressToWebp(file: File, filename: string): Promise<File> {
  let compressed: File;
  try {
    compressed = await compressOnce(file, true);
  } catch {
    compressed = await compressOnce(file, false);
  }

  const webp = new File([compressed], filename, {
    type: "image/webp",
    lastModified: Date.now(),
  });

  if (webp.type !== "image/webp" || webp.size > MAX_IMAGE_BYTES) {
    throw new Error(WEBP_ERROR);
  }

  const header = new Uint8Array(await webp.slice(0, 12).arrayBuffer());
  const riff = String.fromCharCode(...header.slice(0, 4));
  const format = String.fromCharCode(...header.slice(8, 12));
  if (riff !== "RIFF" || format !== "WEBP") {
    throw new Error(WEBP_ERROR);
  }

  return webp;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("無法讀取圖片"));
    image.src = src;
  });
}

export async function cropToFile(imageSrc: string, area: Area): Promise<File> {
  const image = await loadImage(imageSrc);
  const sourceWidth = Math.max(1, Math.round(area.width));
  const sourceHeight = Math.max(1, Math.round(area.height));
  const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("無法裁切圖片");
  }

  context.drawImage(
    image,
    Math.round(area.x),
    Math.round(area.y),
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("無法輸出裁切圖"));
        return;
      }
      resolve(result);
    }, "image/png");
  });

  return new File([blob], "crop.png", { type: "image/png" });
}
