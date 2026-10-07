import { describe, expect, it } from 'vitest';
import { encodeBmp } from './bmpEncoder';

describe('encodeBmp', () => {
  // 3×2: верхній рядок червоний, зелений, синій; нижній — білий, чорний, напівпрозорий чорний
  const image = {
    width: 3,
    height: 2,
    data: new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0,
    ]),
  };
  const bytes = encodeBmp(image);
  const view = new DataView(bytes.buffer);

  it('пише заголовок 24-бітного BMP із правильними розмірами', () => {
    expect(String.fromCharCode(bytes[0] as number, bytes[1] as number)).toBe('BM');
    // Рядок із 3 пікселів займає 9 байт і доповнюється до 12
    expect(bytes.length).toBe(54 + 12 * 2);
    expect(view.getUint32(2, true)).toBe(bytes.length);
    expect(view.getUint32(10, true)).toBe(54);
    expect(view.getInt32(18, true)).toBe(3);
    expect(view.getInt32(22, true)).toBe(2);
    expect(view.getUint16(28, true)).toBe(24);
  });

  it('зберігає рядки знизу вгору в порядку BGR', () => {
    expect(Array.from(bytes.slice(54, 54 + 9))).toEqual([255, 255, 255, 0, 0, 0, 255, 255, 255]);
    expect(Array.from(bytes.slice(66, 66 + 9))).toEqual([0, 0, 255, 0, 255, 0, 255, 0, 0]);
  });
});
