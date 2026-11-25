export function formatNumber(value: number, digits: number = 2): string {
  return value.toFixed(digits).replace('.', ',');
}

export function formatExact(value: number): string {
  return String(value).replace('.', ',');
}

export function formatPercent(share: number, digits: number = 1): string {
  return `${formatNumber(share * 100, digits)}%`;
}

/** Точність таймера браузера: коротші проміжки він показує як нуль */
const TIMER_RESOLUTION_MS = 0.1;

export function formatDuration(ms: number): string {
  if (ms < TIMER_RESOLUTION_MS) return `менше ${formatNumber(TIMER_RESOLUTION_MS, 1)} мс`;
  if (ms < 10) return `${formatNumber(ms)} мс`;
  if (ms < 1000) return `${Math.round(ms)} мс`;
  if (ms < 60000) return `${formatNumber(ms / 1000)} с`;
  const minutes = Math.floor(ms / 60000);
  return `${minutes} хв ${Math.round((ms % 60000) / 1000)} с`;
}

/** Українська форма слова після числа: 1 епоха, 2 епохи, 5 епох, 21 епоха */
export function plural(count: number, one: string, few: string, many: string): string {
  const units = Math.abs(count) % 10;
  const tens = Math.abs(count) % 100;
  if (!Number.isInteger(count)) return few;
  if (units === 1 && tens !== 11) return one;
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return few;
  return many;
}
