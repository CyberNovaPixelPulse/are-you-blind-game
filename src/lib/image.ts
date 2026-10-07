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

const CROP_MAX_EDGE = 800;

function finiteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function safeCrop(area: Area, imageWidth: number, imageHeight: number) {
  const imageW = Math.max(1, Math.round(finiteNumber(imageWidth, 1)));
  const imageH = Math.max(1, Math.round(finiteNumber(imageHeight, 1)));
  let width = finiteNumber(area?.width, imageW);
  let height = finiteNumber(area?.height, imageH);
  let x = finiteNumber(area?.x, 0);
  let y = finiteNumber(area?.y, 0);
  if (width <= 0) width = imageW;
  if (height <= 0) height = imageH;
  x = Math.min(Math.max(0, x), imageW - 1);
  y = Math.min(Math.max(0, y), imageH - 1);
  width = Math.min(width, imageW - x);
  height = Math.min(height, imageH - y);
  if (width <= 0) width = imageW;
  if (height <= 0) height = imageH;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      resolve(blob);
    };
    try {
      canvas.toBlob((result) => finish(result), type, quality);
    } catch (error) {
      console.error("canvas.toBlob failed", {
        type,
        quality,
        width: canvas.width,
        height: canvas.height,
        error,
      });
      finish(null);
      return;
    }
    window.setTimeout(() => {
      if (settled) return;
      console.error("canvas.toBlob timed out", {
        type,
        quality,
        width: canvas.width,
        height: canvas.height,
      });
      finish(null);
    }, 4000);
  });
}

function fileFromBlob(blob: Blob, filename: string, type: string) {
  return new File([blob], filename, { type, lastModified: Date.now() });
}

async function jpegFileToWebp(file: File, edge: number, quality: number) {
  const options = {
    maxSizeMB: MAX_IMAGE_BYTES / (1024 * 1024),
    maxWidthOrHeight: Math.max(1, edge),
    fileType: "image/webp" as const,
    initialQuality: quality,
    maxIteration: 8,
    alwaysKeepResolution: false,
  };
  try {
    let compressed: File;
    try {
      compressed = await imageCompression(file, { ...options, useWebWorker: true });
    } catch {
      compressed = await imageCompression(file, { ...options, useWebWorker: false });
    }
    const webp = fileFromBlob(compressed, "crop.webp", "image/webp");
    if (webp.size > 0 && (await isWebpFile(webp))) return webp;
  } catch (error) {
    console.error("jpeg to webp failed", { edge, quality, bytes: file.size, error });
  }
  return null;
}

async function exportCanvas(canvas: HTMLCanvasElement, quality: number): Promise<File | null> {
  const webpBlob = await canvasToBlob(canvas, "image/webp", quality);
  if (webpBlob && webpBlob.size > 0 && (await isWebpFile(webpBlob))) {
    return fileFromBlob(webpBlob, "crop.webp", "image/webp");
  }

  const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.75);
  if (!jpegBlob || jpegBlob.size < 1) {
    console.error("canvas export produced no blob", {
      width: canvas.width,
      height: canvas.height,
      quality,
      webpBytes: webpBlob?.size ?? null,
      jpegBytes: jpegBlob?.size ?? null,
    });
    return null;
  }

  const jpegFile = fileFromBlob(jpegBlob, "crop.jpg", "image/jpeg");
  const converted = await jpegFileToWebp(jpegFile, Math.max(canvas.width, canvas.height), quality);
  return converted ?? jpegFile;
}

function drawCrop(
  source: CanvasImageSource,
  crop: { x: number; y: number; width: number; height: number },
  edge: number,
) {
  const scale = Math.min(1, edge / Math.max(crop.width, crop.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width * scale));
  canvas.height = Math.max(1, Math.round(crop.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    console.error("canvas.getContext failed", { edge, crop });
    return null;
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function renderCrop(
  source: CanvasImageSource,
  crop: { x: number; y: number; width: number; height: number },
  edge: number,
  quality: number,
) {
  const canvas = drawCrop(source, crop, edge);
  if (!canvas) return null;
  return exportCanvas(canvas, quality);
}

export async function compressCloseupToWebp(file: File, filename: string): Promise<File> {
  if (file.size > 0 && file.size <= MAX_IMAGE_BYTES) {
    return fileFromBlob(file, filename, file.type || "image/webp");
  }

  const image = await loadFile(file);
  const crop = {
    x: 0,
    y: 0,
    width: Math.max(1, image.naturalWidth || image.width),
    height: Math.max(1, image.naturalHeight || image.height),
  };
  const produced: File[] = [];
  const legalFiles: File[] = [];
  const take = (encoded: File | null) => {
    if (!encoded || encoded.size < 1) return null;
    produced.push(encoded);
    if (encoded.size <= MAX_IMAGE_BYTES) legalFiles.push(encoded);
    return encoded.size <= CLOSEUP_MAX_BYTES ? encoded : null;
  };

  for (const step of CLOSEUP_STEPS) {
    const ready = take(await renderCrop(image, crop, step.edge, step.quality));
    if (!ready) continue;
    return fileFromBlob(ready, filename, ready.type || "image/jpeg");
  }

  let edge = 400;
  let quality = 0.4;
  while (edge >= 96) {
    const ready = take(await renderCrop(image, crop, edge, quality));
    if (ready) return fileFromBlob(ready, filename, ready.type || "image/jpeg");
    edge = Math.round(edge * 0.75);
    quality = Math.max(0.3, quality - 0.05);
  }

  const legal = legalFiles.reduce<File | null>(
    (best, file) => (!best || file.size < best.size ? file : best),
    null,
  );
  if (legal) return fileFromBlob(legal, filename, legal.type || "image/jpeg");

  const fallback = produced.reduce<File | null>(
    (best, file) => (!best || file.size < best.size ? file : best),
    null,
  );
  if (fallback) return fileFromBlob(fallback, filename, fallback.type || "image/jpeg");
  console.error("close-up export produced no blob", { width: crop.width, height: crop.height, sourceBytes: file.size });
  throw new Error("圖片輸出失敗");
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
  const crop = safeCrop(area, image.naturalWidth || image.width, image.naturalHeight || image.height);
  const file = await renderCrop(image, crop, CROP_MAX_EDGE, 0.75);
  if (file && file.size > 0) return file;
  console.error("crop export produced no blob", crop);
  throw new Error("圖片輸出失敗");
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
    const crop = safeCrop(area, image.naturalWidth || image.width, image.naturalHeight || image.height);
    const canvas = drawCrop(image, crop, AI_PREVIEW_EDGE);
    if (!canvas) return null;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.7);
    });
    if (!blob || blob.type !== "image/jpeg" || blob.size < 1) return null;
    return blobToBase64(blob);
  } catch {
    return null;
  }
}
