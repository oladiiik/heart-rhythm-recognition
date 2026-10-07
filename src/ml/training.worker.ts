import { emptyConfusionMatrix, summarize, type EvaluationMetrics } from '../domain/metrics';
import { mostLikelyClass } from '../domain/rhythm';
import type { LabeledSequence } from '../domain/generator';
import { RhythmModel, type EpochStatus } from './model';
import type { TrainRequest, WorkerRequest, WorkerResponse } from './protocol';

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}

const scope = self as unknown as WorkerScope;

const PROGRESS_INTERVAL_MS = 40;
const MAX_HISTORY_POINTS = 400;

function createThrottle(): (isLast: boolean) => boolean {
  let lastSentAt = -Infinity;
  return (isLast) => {
    const now = performance.now();
    if (!isLast && now - lastSentAt < PROGRESS_INTERVAL_MS) return false;
    lastSentAt = now;
    return true;
  };
}

function evaluate(model: RhythmModel, test: readonly LabeledSequence[]): EvaluationMetrics {
  const confusion = emptyConfusionMatrix();
  const shouldReport = createThrottle();
  test.forEach((sequence, index) => {
    const predicted = mostLikelyClass(model.classifyWindow(sequence.values));
    confusion[sequence.label][predicted]++;
    const processed = index + 1;
    if (shouldReport(processed === test.length)) {
      scope.postMessage({ type: 'evaluating', processed, total: test.length });
    }
  });
  return summarize(confusion);
}

/** Рівномірно проріджує історію похибки, завжди зберігаючи першу й останню епоху */
function downsample(history: readonly EpochStatus[]): EpochStatus[] {
  if (history.length <= MAX_HISTORY_POINTS) return history.slice();
  const step = (history.length - 1) / (MAX_HISTORY_POINTS - 1);
  return Array.from({ length: MAX_HISTORY_POINTS }, (_, i) => history[Math.round(i * step)] as EpochStatus);
}

function runTraining(request: TrainRequest): void {
  const { config } = request;
  const model = RhythmModel.untrained(config.hiddenNeurons);
  const shouldReport = createThrottle();
  const history: EpochStatus[] = [];

  const trainStartedAt = performance.now();
  const outcome = model.train(request.train, config, ({ epoch, error }) => {
    history.push({ epoch, error });
    if (shouldReport(epoch === config.epochs)) {
      scope.postMessage({ type: 'epoch', epoch, totalEpochs: config.epochs, error });
    }
  });
  const trainMs = performance.now() - trainStartedAt;
  // Рання зупинка могла пропустити останнє повідомлення, тому надсилаємо фактичний підсумок
  scope.postMessage({
    type: 'epoch',
    epoch: outcome.epochsRun,
    totalEpochs: config.epochs,
    error: outcome.finalError,
  });

  const evaluationStartedAt = performance.now();
  const metrics = evaluate(model, request.test);
  const evaluationMs = performance.now() - evaluationStartedAt;

  scope.postMessage({
    type: 'done',
    snapshot: model.snapshot({
      config,
      epochsRun: outcome.epochsRun,
      finalError: outcome.finalError,
      trainedOn: request.train.length,
      trainMs,
      trainedAt: new Date().toISOString(),
      metrics,
    }),
    metrics,
    history: downsample(history),
    trainMs,
    evaluationMs,
  });
}

scope.onmessage = (event) => {
  try {
    runTraining(event.data);
  } catch (error) {
    scope.postMessage({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
  }
};
