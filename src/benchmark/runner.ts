import { createThrottle } from '../ml/throttle';
import { performanceTaskWork, type PerformanceTask, type PerformanceTrial } from './performance';
import type { BenchmarkRequest, BenchmarkResult } from './protocol';
import { taskWork, type QualityTask, type QualityTrial } from './quality';
import { defaultPoolSize, runInWorkers, type PoolOutcome } from './workerPool';

export interface RunProgress {
  /** Частка виконаної роботи з урахуванням того, що завдання різні за обсягом */
  readonly fraction: number;
  readonly completedTasks: number;
  readonly totalTasks: number;
}

export interface RunHandlers<Trial> {
  onTrial(trial: Trial): void;
  onProgress(progress: RunProgress): void;
}

export interface BenchmarkJob {
  readonly finished: Promise<PoolOutcome>;
  readonly workers: number;
  cancel(): void;
}

const PROGRESS_INTERVAL_MS = 100;

function startRun<Trial>(
  requests: readonly BenchmarkRequest[],
  weights: readonly number[],
  workers: number,
  pick: (result: BenchmarkResult) => Trial | null,
  handlers: RunHandlers<Trial>,
): BenchmarkJob {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const fractions = new Map<number, number>();
  let doneWeight = 0;
  let completedTasks = 0;
  const shouldReport = createThrottle(PROGRESS_INTERVAL_MS);
  const report = (): void => {
    const isLast = completedTasks === requests.length;
    if (!shouldReport(isLast)) return;
    let partial = doneWeight;
    for (const [taskId, fraction] of fractions) partial += (weights[taskId] ?? 0) * fraction;
    handlers.onProgress({ fraction: partial / totalWeight, completedTasks, totalTasks: requests.length });
  };

  const run = runInWorkers(requests, workers, {
    onProgress: (taskId, fraction) => {
      fractions.set(taskId, fraction);
      report();
    },
    onResult: (result) => {
      const trial = pick(result);
      if (!trial) return;
      const taskId = result.trial.taskId;
      fractions.delete(taskId);
      doneWeight += weights[taskId] ?? 0;
      completedTasks++;
      handlers.onTrial(trial);
      report();
    },
  });
  return { finished: run.finished, workers: Math.min(workers, requests.length), cancel: run.cancel };
}

/** Досліди якості незалежні між собою, тож виконуються паралельно на всіх фізичних ядрах */
export function startQualityRun(tasks: readonly QualityTask[], handlers: RunHandlers<QualityTrial>): BenchmarkJob {
  return startRun(
    tasks.map((task) => ({ type: 'quality', task })),
    tasks.map(taskWork),
    defaultPoolSize(),
    (result) => (result.type === 'quality-done' ? result.trial : null),
    handlers,
  );
}

/** Заміри швидкодії виконуються по одному: паралельні потоки ділили б кеш і пам'ять процесора й спотворювали час */
export function startPerformanceRun(
  tasks: readonly PerformanceTask[],
  handlers: RunHandlers<PerformanceTrial>,
): BenchmarkJob {
  return startRun(
    tasks.map((task) => ({ type: 'performance', task })),
    tasks.map(performanceTaskWork),
    1,
    (result) => (result.type === 'performance-done' ? result.trial : null),
    handlers,
  );
}
