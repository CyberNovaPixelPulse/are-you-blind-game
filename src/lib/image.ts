import imageCompression from "browser-image-compression";
import type { Area } from "react-easy-crop";

export const MAX_IMAGE_BYTES = 150 * 1024;

const WEBP_ERROR = "圖片必須是 150KB 以內的 WebP";
const CLOSEUP_MAX_BYTES = 140 * 1024;

const CLOSEUP_STEPS = [
  { edge: 800, quality: 0.75 },
  { edge: 800, quality: 0.65 },
  { edge: 800, quality: 0.55 },
  { edge: 650, quality: 0.45 },
  { edge: 500, quality: 0.45 },
] as const;

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

  if (webp.type !== "image/webp" || webp.size > MAX_IMAGE_BYTES || !(await isWebpFile(webp))) {
    throw new Error(WEBP_ERROR);
  }

  return webp;
}

async function isWebpFile(file: Blob) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const riff = String.fromCharCode(...header.slice(0, 4));
  const format = String.fromCharCode(...header.slice(8, 12));
  return riff === "RIFF" && format === "WEBP";
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), type, quality);
  });
}

async function encodeWebp(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  edge: number,
  quality: number,
  filename: string,
): Promise<File | null> {
  const scale = Math.min(1, edge / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  const direct = await canvasToBlob(canvas, "image/webp", quality);
  if (direct && (await isWebpFile(direct))) {
    return new File([direct], filename, { type: "image/webp", lastModified: Date.now() });
  }

  const png = await canvasToBlob(canvas, "image/png");
  if (!png) return null;
  const fallbackSource = new File([png], "closeup.png", { type: "image/png" });
  try {
    let compressed: File;
    try {
      compressed = await imageCompression(fallbackSource, {
        maxSizeMB: 1,
        maxWidthOrHeight: Math.max(canvas.width, canvas.height),
        fileType: "image/webp",
        initialQuality: quality,
        maxIteration: 1,
        useWebWorker: true,
        alwaysKeepResolution: true,
      });
    } catch {
      compressed = await imageCompression(fallbackSource, {
        maxSizeMB: 1,
        maxWidthOrHeight: Math.max(canvas.width, canvas.height),
        fileType: "image/webp",
        initialQuality: quality,
        maxIteration: 1,
        useWebWorker: false,
        alwaysKeepResolution: true,
      });
    }
    const webp = new File([compressed], filename, { type: "image/webp", lastModified: Date.now() });
    if (webp.size > 0 && (await isWebpFile(webp))) return webp;
  } catch {
    return null;
  }
  return null;
}

export async function compressCloseupToWebp(file: File, filename: string): Promise<File> {
  const image = await loadFile(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  let clearest: File | null = null;

  for (const step of CLOSEUP_STEPS) {
    const encoded = await encodeWebp(image, width, height, step.edge, step.quality, filename);
    if (!encoded || encoded.size > MAX_IMAGE_BYTES) continue;
    if (!clearest || encoded.size > clearest.size) clearest = encoded;
    if (encoded.size <= CLOSEUP_MAX_BYTES) return encoded;
  }

  let edge = 400;
  let quality = 0.4;
  let fitted = clearest;
  while (edge >= 160) {
    const encoded = await encodeWebp(image, width, height, edge, quality, filename);
    if (encoded && encoded.size <= CLOSEUP_MAX_BYTES) return encoded;
    if (encoded && encoded.size <= MAX_IMAGE_BYTES && (!fitted || encoded.size < fitted.size)) {
      fitted = encoded;
    }
    edge = Math.round(edge * 0.75);
    quality = Math.max(0.3, quality - 0.05);
  }

  if (fitted) return fitted;
  throw new Error("無法輸出裁切圖");
}

async function loadFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
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

const AI_PREVIEW_EDGE = 800;

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export async function cropToAiJpegBase64(imageSrc: string, area: Area): Promise<string | null> {
  try {
    const image = await loadImage(imageSrc);
    const sourceWidth = Math.max(1, Math.round(area.width));
    const sourceHeight = Math.max(1, Math.round(area.height));
    const scale = Math.min(1, AI_PREVIEW_EDGE / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
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
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.7);
    });
    if (!blob || blob.type !== "image/jpeg" || blob.size < 1) return null;
    return blobToBase64(blob);
  } catch {
    return null;
  }
}
