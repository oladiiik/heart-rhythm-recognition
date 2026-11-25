export interface Summary {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  /** Вибіркове стандартне відхилення (ділення на n − 1); для одного значення нуль */
  readonly std: number;
}

export function summarize(values: readonly number[]): Summary {
  if (values.length === 0) throw new Error('Немає значень для підсумку.');
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / count;
  const middle = Math.floor(count / 2);
  const median =
    count % 2 === 1 ? (sorted[middle] as number) : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
  const variance = count > 1 ? sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1) : 0;
  return {
    count,
    min: sorted[0] as number,
    max: sorted[count - 1] as number,
    mean,
    median,
    std: Math.sqrt(variance),
  };
}

/** Квантиль 0,95 розподілу Стьюдента для 1–30 ступенів свободи */
const T_95 = [
  6.314, 2.92, 2.353, 2.132, 2.015, 1.943, 1.895, 1.86, 1.833, 1.812, 1.796, 1.782, 1.771, 1.761, 1.753, 1.746, 1.74,
  1.734, 1.729, 1.725, 1.721, 1.717, 1.714, 1.711, 1.708, 1.706, 1.703, 1.701, 1.699, 1.697,
] as const;

/** Квантиль 0,95 розподілу Стьюдента: межа однобічного 95-відсоткового інтервалу; понад 30 ступенів використовується 1,645 */
export function studentT95(degreesOfFreedom: number): number {
  if (!(degreesOfFreedom >= 1)) throw new Error('Ступенів свободи має бути щонайменше 1.');
  return T_95[Math.floor(degreesOfFreedom) - 1] ?? 1.645;
}

export interface PairedDifference {
  /** Середня різниця пар a − b */
  readonly difference: number;
  /** Верхня межа однобічного 95-відсоткового інтервалу середньої різниці */
  readonly upperBound: number;
  readonly degreesOfFreedom: number;
}

/**
 * Парне порівняння: a[i] і b[i] виміряно в однакових умовах (той самий навчальний набір), тож порівнюються
 * різниці пар, і спільна для пари випадковість у них скорочується. Верхня межа однобічного 95-відсоткового
 * інтервалу середньої різниці дає тест «a кращий за b не більш ніж на δ»: він пройдений, якщо межа не перевищує δ
 */
export function pairedDifference(a: readonly number[], b: readonly number[]): PairedDifference {
  if (a.length !== b.length) throw new Error('Парні вибірки мають бути однакової довжини.');
  if (a.length < 2) throw new Error('Для порівняння потрібно щонайменше дві пари.');
  const { mean, std, count } = summarize(a.map((value, i) => value - (b[i] as number)));
  const degreesOfFreedom = count - 1;
  return {
    difference: mean,
    upperBound: mean + studentT95(degreesOfFreedom) * (std / Math.sqrt(count)),
    degreesOfFreedom,
  };
}

export interface LinearFit {
  readonly slope: number;
  readonly intercept: number;
  /** Частка розкиду y, яку пояснює пряма: 1 означає, що всі точки лежать на ній */
  readonly r2: number;
}

/** Пряма y = slope · x + intercept за методом найменших квадратів */
export function fitLine(points: readonly { readonly x: number; readonly y: number }[]): LinearFit {
  if (points.length < 2) throw new Error('Для прямої потрібно щонайменше дві точки.');
  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const { x, y } of points) {
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (y - meanY);
    syy += (y - meanY) ** 2;
  }
  if (sxx === 0) throw new Error('Усі точки мають однакове x: пряму не визначено.');
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const residual = points.reduce((sum, { x, y }) => sum + (y - (slope * x + intercept)) ** 2, 0);
  return { slope, intercept, r2: syy === 0 ? 1 : 1 - residual / syy };
}
