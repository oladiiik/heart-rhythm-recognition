import type { RhythmClass } from '../../domain/rhythm';

/**
 * Кольори графіків задано константами, а не CSS-змінними: графік зберігається у файл
 * як самостійний SVG, і все, що потрібно для його вигляду, має бути в самому SVG
 */
export const CHART = {
  surface: '#fcfcfb',
  ink: '#0b0b0b',
  secondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  series: '#2a78d6',
  seriesWash: 'rgba(42, 120, 214, 0.10)',
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
