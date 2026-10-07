import type { EpochProgress, EvaluationProgress, TrainRequest, TrainingResult, WorkerResponse } from './protocol';

export interface TrainingHandlers {
  onEpoch(progress: EpochProgress): void;
  onEvaluating(progress: EvaluationProgress): void;
  onDone(result: TrainingResult): void;
  onFailed(message: string): void;
}

export interface TrainingJob {
  cancel(): void;
}

/**
 * Запускає навчання в окремому потоці. На кожне навчання створюється новий воркер:
 * так «Зупинити» зводиться до завершення потоку, без проміжного стану, який треба прибирати
 */
export function startTraining(request: Omit<TrainRequest, 'type'>, handlers: TrainingHandlers): TrainingJob {
  const worker = new Worker(new URL('./training.worker.ts', import.meta.url), { type: 'module' });

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    switch (message.type) {
      case 'epoch':
        handlers.onEpoch(message);
        break;
      case 'evaluating':
        handlers.onEvaluating(message);
        break;
      case 'done':
        worker.terminate();
        handlers.onDone(message);
        break;
      case 'failed':
        worker.terminate();
        handlers.onFailed(message.message);
        break;
    }
  };
  worker.onerror = (event) => {
    worker.terminate();
    handlers.onFailed(event.message || 'Потік навчання завершився з помилкою.');
  };

  worker.postMessage({ type: 'train', ...request } satisfies TrainRequest);
  return { cancel: () => worker.terminate() };
}
