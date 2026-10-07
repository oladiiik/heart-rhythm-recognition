import { encodeBmp } from './bmpEncoder';

export const IMAGE_FORMATS = [
  { id: 'png', label: 'PNG', extension: 'png', mime: 'image/png' },
  { id: 'jpeg', label: 'JPG', extension: 'jpg', mime: 'image/jpeg' },
  { id: 'bmp', label: 'BMP', extension: 'bmp', mime: 'image/bmp' },
] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number]['id'];

const JPEG_QUALITY = 0.92;

export function imageFormatInfo(format: ImageFormat): (typeof IMAGE_FORMATS)[number] {
  return IMAGE_FORMATS.find((candidate) => candidate.id === format) ?? IMAGE_FORMATS[0];
}

export function canvasToBlob(canvas: HTMLCanvasElement, format: ImageFormat): Promise<Blob> {
  const { mime } = imageFormatInfo(format);
  if (format === 'bmp') {
    const context = canvas.getContext('2d');
    if (!context) return Promise.reject(new Error('Не вдалося прочитати зображення з полотна.'));
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const bytes = encodeBmp(pixels);
    return Promise.resolve(new Blob([bytes.buffer as ArrayBuffer], { type: mime }));
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Браузер не зміг закодувати зображення.'))),
      mime,
      JPEG_QUALITY,
    );
  });
}
