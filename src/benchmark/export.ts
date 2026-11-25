import type { BenchmarkEnvironment } from './environment';
import { PIPELINE_STAGES, type PerformancePipeline, type PerformanceRow } from './performance';
import type { QualityCell, QualityVerdict } from './quality';

const BENCHMARK_FORMAT = 'heart-rhythm-benchmark';
const BENCHMARK_VERSION = 1;

/** Усі дані запуску: за ними можна перебудувати таблиці й графіки, зокрема для звіту */
export function benchmarkToJson(
  kind: 'quality' | 'performance',
  environment: BenchmarkEnvironment,
  payload: Record<string, unknown>,
): string {
  return JSON.stringify(
    { format: BENCHMARK_FORMAT, version: BENCHMARK_VERSION, kind, environment, ...payload },
    null,
    2,
  );
}

function csv(rows: readonly (readonly (string | number)[])[]): string {
  return rows.map((row) => row.join(',')).join('\n') + '\n';
}

function verdictOf(cell: QualityCell, verdict: QualityVerdict | null): string {
  if (!verdict) return '';
  const tags: string[] = [];
  if (cell === verdict.best) tags.push('best');
  if (cell === verdict.cheapest) tags.push('cheapest_equivalent');
  if (tags.length === 0 && cell.accuracy.mean >= verdict.threshold - 1e-9) tags.push('equivalent');
  return tags.join(' ');
}

export function qualityToCsv(cells: readonly QualityCell[], verdict: QualityVerdict | null): string {
  return csv([
    [
      'series',
      'x',
      'trainings',
      'accuracy_mean',
      'accuracy_min',
      'accuracy_max',
      'accuracy_std',
      'error_mean',
      'train_ms_median',
      'work',
      'verdict',
    ],
    ...cells.map((cell) => [
      cell.series,
      cell.x,
      cell.accuracy.count,
      cell.accuracy.mean,
      cell.accuracy.min,
      cell.accuracy.max,
      cell.accuracy.std,
      cell.error.mean,
      cell.trainMs.median,
      cell.work,
      verdictOf(cell, verdict),
    ]),
  ]);
}

export function performanceToCsv(pipeline: PerformancePipeline, rows: readonly PerformanceRow[]): string {
  const runs = Math.max(0, ...rows.map((row) => row.runs.length));
  const stages = PIPELINE_STAGES[pipeline];
  return csv([
    [
      'size',
      'file_bytes',
      'units',
      ...Array.from({ length: runs }, (_, i) => `run${i + 1}_ms`),
      'min_ms',
      'max_ms',
      'mean_ms',
      'median_ms',
      'std_ms',
      ...stages.map((stage) => `${stage}_median_ms`),
    ],
    ...rows.map((row) => [
      row.size.key,
      row.fileBytes,
      row.units,
      ...Array.from({ length: runs }, (_, i) => row.runs[i] ?? ''),
      row.total.min,
      row.total.max,
      row.total.mean,
      row.total.median,
      row.total.std,
      ...stages.map((stage) => row.stages.find((timing) => timing.stage === stage)?.ms ?? ''),
    ]),
  ]);
}
