// Client-side image processing: HEIC→JPEG (reuses heic.ts), EXIF-correct
// orientation, downscale, and center-crop. Keeps uploads small without a server.

import { isHeic, convertHeicToJpeg } from './heic';

interface Drawable {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

// createImageBitmap honors EXIF orientation with `imageOrientation: 'from-image'`,
// so phone photos aren't sideways. Falls back to an <img> element where needed.
async function loadDrawable(file: File): Promise<Drawable> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Could not read image'));
        i.src = url;
      });
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close: () => URL.revokeObjectURL(url)
      };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Image encode failed'));
        resolve(new File([blob], name, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Center-crop to a square and downscale to `size`×`size`, as a small JPEG.
 * Used for avatars (displayed in a CSS circle).
 */
export async function processAvatar(input: File, size = 256, quality = 0.85): Promise<File> {
  const file = isHeic(input) ? await convertHeicToJpeg(input) : input;
  const { source, width, height, close } = await loadDrawable(file);
  try {
    const side = Math.min(width, height);
    const sx = (width - side) / 2;
    const sy = (height - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
    return await toJpeg(canvas, quality, 'avatar.jpg');
  } finally {
    close();
  }
}

/**
 * Downscale to fit within `maxDim` (preserving aspect ratio) as a JPEG.
 * Used for care-session photos. If the image is already small enough and not
 * HEIC, it's returned unchanged.
 */
export async function processPhoto(input: File, maxDim = 1200, quality = 0.82): Promise<File> {
  const heic = isHeic(input);
  const file = heic ? await convertHeicToJpeg(input) : input;
  const { source, width, height, close } = await loadDrawable(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(width, height));
    if (scale === 1 && !heic) return file; // already web-friendly and small
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return await toJpeg(canvas, quality, `${base}.jpg`);
  } finally {
    close();
  }
}
