import { RHYTHM_CLASSES, WINDOW_SIZE, type ClassProbabilities } from './rhythm';

export const MIN_INPUT_BPM = 20;
export const MAX_INPUT_BPM = 250;

/**
 * Серія з N чисел → усі сусідні вікна по size чисел (крок 1).
 * Мережа навчена на вікнах фіксованої довжини, тому довшу серію розпізнаємо по частинах
 */
export function toWindows(series: readonly number[], size: number = WINDOW_SIZE): number[][] {
  if (series.length < size) {
    throw new Error(`Потрібно щонайменше ${size} чисел, отримано ${series.length}.`);
  }
  const windows: number[][] = [];
  for (let start = 0; start + size <= series.length; start++) {
    windows.push(series.slice(start, start + size));
  }
  return windows;
}

export function averageProbabilities(perWindow: readonly ClassProbabilities[]): ClassProbabilities {
  if (perWindow.length === 0) throw new Error('Немає жодного вікна для усереднення.');
  const total: ClassProbabilities = { bradycardia: 0, normal: 0, tachycardia: 0 };
  for (const probabilities of perWindow) {
    for (const rhythm of RHYTHM_CLASSES) total[rhythm] += probabilities[rhythm];
  }
  for (const rhythm of RHYTHM_CLASSES) total[rhythm] /= perWindow.length;
  return total;
}

export type ParsedSeries = { ok: true; values: number[] } | { ok: false; message: string };

export function parseSeries(text: string): ParsedSeries {
  const tokens = text.split(/[\s,;]+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return { ok: false, message: 'Введіть послідовність чисел.' };
  }
  const values: number[] = [];
  for (const token of tokens) {
    const value = Number(token);
    if (!Number.isFinite(value)) {
      return { ok: false, message: `«${token}» не є числом.` };
    }
    if (value < MIN_INPUT_BPM || value > MAX_INPUT_BPM) {
      return {
        ok: false,
        message: `Значення ${token} поза межами ${MIN_INPUT_BPM}–${MAX_INPUT_BPM} уд/хв.`,
      };
    }
    values.push(value);
  }
  if (values.length < WINDOW_SIZE) {
    return {
      ok: false,
      message: `Потрібно щонайменше ${WINDOW_SIZE} числа, введено ${values.length}.`,
    };
  }
  return { ok: true, values };
}
