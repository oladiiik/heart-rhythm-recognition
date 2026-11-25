import type { PerformanceTask, PerformanceTrial } from './performance';
import type { QualityTask, QualityTrial } from './quality';

export type BenchmarkRequest =
  | { readonly type: 'quality'; readonly task: QualityTask }
  | { readonly type: 'performance'; readonly task: PerformanceTask };

export type BenchmarkResponse =
  | { readonly type: 'progress'; readonly taskId: number; readonly fraction: number }
  | { readonly type: 'quality-done'; readonly trial: QualityTrial }
  | { readonly type: 'performance-done'; readonly trial: PerformanceTrial }
  | { readonly type: 'failed'; readonly taskId: number; readonly message: string };

export type BenchmarkResult = Extract<BenchmarkResponse, { type: 'quality-done' | 'performance-done' }>;
