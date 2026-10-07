export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

const FILE_HEADER_SIZE = 14;
const INFO_HEADER_SIZE = 40;
const PIXELS_PER_METER = 3780; // 96 dpi

/**
 * Кодує зображення у 24-бітний BMP без стиснення. Браузерний canvas цього формату
 * не підтримує, тому файл збирається вручну. Прозорість накладається на білий фон
 */
export function encodeBmp(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = FILE_HEADER_SIZE + INFO_HEADER_SIZE + pixelDataSize;

  const bytes = new Uint8Array(fileSize);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x42; // 'B'
  bytes[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, FILE_HEADER_SIZE + INFO_HEADER_SIZE, true);

  view.setUint32(14, INFO_HEADER_SIZE, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // додатна висота означає, що рядки йдуть знизу вгору
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelDataSize, true);
  view.setInt32(38, PIXELS_PER_METER, true);
  view.setInt32(42, PIXELS_PER_METER, true);

  for (let y = 0; y < height; y++) {
    let target = FILE_HEADER_SIZE + INFO_HEADER_SIZE + (height - 1 - y) * rowSize;
    let source = y * width * 4;
    for (let x = 0; x < width; x++) {
      const alpha = (data[source + 3] as number) / 255;
      const blend = (channel: number): number => Math.round(channel * alpha + 255 * (1 - alpha));
      bytes[target++] = blend(data[source + 2] as number);
      bytes[target++] = blend(data[source + 1] as number);
      bytes[target++] = blend(data[source] as number);
      source += 4;
    }
  }
  return bytes;
}
