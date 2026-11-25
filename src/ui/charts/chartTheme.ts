import type { RhythmClass } from '../../domain/rhythm';

/**
 * Кольори графіків задано константами, а не CSS-змінними: графік зберігається у файл
 * як самостійний SVG, і все, що потрібно для його вигляду, має бути в самому SVG
 */
export const CHART = {
  surface: '#ffffff',
  ink: '#141413',
  secondary: '#55544f',
  muted: '#8b8a84',
  grid: '#ebeae6',
  axis: '#c9c8c1',
  series: '#141413',
  font: 'system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export const CLASS_COLORS: Record<RhythmClass, string> = {
  bradycardia: '#2a78d6',
  normal: '#1baf7a',
  tachycardia: '#eb6834',
};

export function niceTicks(min: number, max: number, target: number = 5): number[] {
  if (!(max > min)) return [min];
  const rawStep = (max - min) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
}

/**
 * Один відтінок від світлого до темного для значень із природним порядком (швидкість навчання).
 * П'ять кроків перевірено на розрізнюваність сусідніх ліній, зокрема за дальтонізму
 */
export const ORDINAL_BLUE = ['#86b6ef', '#3987e5', '#256abf', '#184f95', '#0d366b'] as const;

/**
 * Різні сутності без порядку (профілі набору, етапи обробки). Кольори беруться лише в цьому порядку:
 * саме для нього перевірено, що сусідні відрізняються і за дальтонізму. Світлі мають підписи або таблицю поруч
 */
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const;

/** Підпис усередині кольорової заливки: білий, крім жовтої, на якій він не читається */
export function labelOn(fill: string): string {
  return fill === '#eda100' ? CHART.ink : '#ffffff';
}

/** Послідовна шкала для величини: що темніше, то більше */
const SEQUENTIAL_BLUE = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
] as const;

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** t від 0 (найсвітліший) до 1 (найтемніший) */
export function sequentialColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const position = clamped * (SEQUENTIAL_BLUE.length - 1);
  const index = Math.min(SEQUENTIAL_BLUE.length - 2, Math.floor(position));
  const from = channels(SEQUENTIAL_BLUE[index] as string);
  const to = channels(SEQUENTIAL_BLUE[index + 1] as string);
  const share = position - index;
  const mixed = from.map((channel, i) => Math.round(channel + ((to[i] as number) - channel) * share));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** На темніших кроках шкали текст білий: чорний там уже не має контрасту */
export function labelOnSequential(t: number): string {
  return t > 0.5 ? '#ffffff' : CHART.ink;
}
