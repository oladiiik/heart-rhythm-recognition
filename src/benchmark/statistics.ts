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
