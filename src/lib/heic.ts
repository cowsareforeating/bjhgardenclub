// Client-side HEIC/HEIF → JPEG conversion so iPhone uploads render in every browser.
// heic2any bundles libheif as wasm (~700KB) so we dynamic-import — non-iPhone
// users never download it.

export function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif');
}

export async function convertHeicToJpeg(file: File): Promise<File> {
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.85
  });
  // heic2any returns Blob or Blob[] (when the file has multiple frames).
  const blob = Array.isArray(out) ? out[0] : out;
  const baseName = file.name.replace(/\.(heic|heif)$/i, '') || 'photo';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}
