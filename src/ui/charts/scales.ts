import { niceTicks } from './chartTheme';

export type Scale = (value: number) => number;

export function linearScale(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number): Scale {
  const span = domainMax - domainMin || 1;
  return (value) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
}

/** Для параметрів, що зростають у рази (епохи, нейрони, розмір набору): рівні відстані означають однакову кратність */
export function logScale(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number): Scale {
  const from = Math.log(domainMin);
  const span = Math.log(domainMax) - from || 1;
  return (value) => rangeMin + ((Math.log(value) - from) / span) * (rangeMax - rangeMin);
}

export interface NiceDomain {
  readonly min: number;
  readonly max: number;
  readonly ticks: readonly number[];
  /** Відстань між сусідніми поділками */
  readonly step: number;
}

/** Скільки знаків після коми потрібно, щоб сусідні поділки з кроком step не злилися в один підпис */
export function stepDecimals(step: number): number {
  const [, fraction = ''] = String(Number(step.toPrecision(6))).split('.');
  return fraction.length;
}

/** Межі осі, округлені до кроку поділок, щоб крайні поділки збігалися з краями графіка */
export function niceDomain(
  min: number,
  max: number,
  target: number,
  limit?: { min?: number; max?: number },
): NiceDomain {
  const low = limit?.min !== undefined ? Math.max(limit.min, min) : min;
  const high = limit?.max !== undefined ? Math.min(limit.max, max) : max;
  const rough = niceTicks(low, high > low ? high : low + 1, target);
  const step = rough.length > 1 ? (rough[1] as number) - (rough[0] as number) : Math.abs(high) || 1;
  let niceMin = Math.floor(low / step + 1e-9) * step;
  let niceMax = Math.ceil(high / step - 1e-9) * step;
  if (niceMax <= niceMin) niceMax = niceMin + step;
  if (limit?.min !== undefined) niceMin = Math.max(limit.min, niceMin);
  if (limit?.max !== undefined) niceMax = Math.min(limit.max, niceMax);
  const ticks: number[] = [];
  for (let value = Math.ceil(niceMin / step - 1e-9) * step; value <= niceMax + step * 1e-9; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return { min: niceMin, max: niceMax, ticks, step };
}

/** Розсуває підписи по вертикалі, щоб вони не накладалися; порядок підписів зберігається */
export function spreadLabels(positions: readonly number[], gap: number, top: number, bottom: number): number[] {
  const order = positions.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y);
  const placed = order.map((item) => item.y);
  for (let i = 1; i < placed.length; i++) {
    placed[i] = Math.max(placed[i] as number, (placed[i - 1] as number) + gap);
  }
  const overflow = (placed.at(-1) ?? bottom) - bottom;
  if (overflow > 0) {
    for (let i = 0; i < placed.length; i++) placed[i] = Math.max(top, (placed[i] as number) - overflow);
  }
  const result = new Array<number>(positions.length);
  order.forEach((item, i) => {
    result[item.index] = placed[i] as number;
  });
  return result;
}
