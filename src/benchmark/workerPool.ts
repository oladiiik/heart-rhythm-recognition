import type { BenchmarkRequest, BenchmarkResponse, BenchmarkResult } from './protocol';

export interface PoolHandlers {
  onProgress(taskId: number, fraction: number): void;
  onResult(result: BenchmarkResult): void;
}

export type PoolOutcome = 'completed' | 'cancelled';

export interface PoolRun {
  /** Відхиляється з повідомленням воркера, якщо хоч одне завдання не вдалося */
  readonly finished: Promise<PoolOutcome>;
  cancel(): void;
}

/**
 * Половина логічних ядер: на процесорах із Hyper-Threading це по потоку на фізичне ядро.
 * Два навчання на одному фізичному ядрі ділили б його й заважали одне одному
 */
export function defaultPoolSize(): number {
  return Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2));
}

/**
 * Роздає завдання воркерам: кожен бере наступне, щойно закінчить попереднє.
 * Зупинка й помилка завершують усі потоки одразу, тож незакінчені завдання просто відкидаються
 */
export function runInWorkers(requests: readonly BenchmarkRequest[], size: number, handlers: PoolHandlers): PoolRun {
  const workers: Worker[] = [];
  let nextIndex = 0;
  let completed = 0;
  let settled = false;
  let resolveRun: (outcome: PoolOutcome) => void = () => {};
  let rejectRun: (error: Error) => void = () => {};
  const finished = new Promise<PoolOutcome>((resolve, reject) => {
    resolveRun = resolve;
    rejectRun = reject;
  });

  const settle = (finish: () => void): void => {
    if (settled) return;
    settled = true;
    for (const worker of workers) worker.terminate();
    finish();
  };

  const feed = (worker: Worker): void => {
    const request = requests[nextIndex++];
    if (request) worker.postMessage(request);
  };

  const workerCount = Math.min(Math.max(1, size), requests.length);
  for (let i = 0; i < workerCount; i++) {
    const worker = new Worker(new URL('./benchmark.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<BenchmarkResponse>) => {
      if (settled) return;
      const message = event.data;
      switch (message.type) {
        case 'progress':
          handlers.onProgress(message.taskId, message.fraction);
          break;
        case 'quality-done':
        case 'performance-done':
          handlers.onResult(message);
          completed++;
          if (completed === requests.length) settle(() => resolveRun('completed'));
          else feed(worker);
          break;
        case 'failed':
          settle(() => rejectRun(new Error(message.message)));
          break;
      }
    };
    worker.onerror = (event) => {
      settle(() => rejectRun(new Error(event.message || 'Потік бенчмарку завершився з помилкою.')));
    };
    workers.push(worker);
    feed(worker);
  }
  if (requests.length === 0) settle(() => resolveRun('completed'));

  return { finished, cancel: () => settle(() => resolveRun('cancelled')) };
}
