import type { Attachment } from "../types";

const MAX_INPUT_MB = 20;
const MAX_EDGE = 1568; // larger images are downscaled by the models anyway
const THUMB_EDGE = 160;

export class ImageTooLargeError extends Error {
  constructor() {
    super("image too large");
  }
}
export const MAX_IMAGE_MB = MAX_INPUT_MB;

async function load(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function draw(img: ImageBitmap, edge: number): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Reads an image file into a size-capped base64 attachment plus a thumbnail. */
export async function toAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_INPUT_MB * 1024 * 1024) throw new ImageTooLargeError();
  const img = await load(file);
  const keepPng = file.type === "image/png" && Math.max(img.width, img.height) <= MAX_EDGE && file.size < 1.5 * 1024 * 1024;
  const full = draw(img, MAX_EDGE).toDataURL(keepPng ? "image/png" : "image/jpeg", 0.88);
  const thumb = draw(img, THUMB_EDGE).toDataURL("image/jpeg", 0.8);
  img.close();
  const [head, data] = full.split(",");
  return {
    id: crypto.randomUUID(),
    name: file.name || "image",
    mimeType: head.slice(5, head.indexOf(";")),
    data,
    thumb,
  };
}
