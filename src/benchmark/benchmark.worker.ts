import { generateDataset, type LabeledSequence } from '../domain/generator';
import { evaluateModel } from '../ml/evaluation';
import { RhythmModel } from '../ml/model';
import { createThrottle } from '../ml/throttle';
import {
  generatePerformanceFile,
  measureRecognition,
  measureTraining,
  trainReferenceModel,
  type PerformanceTask,
} from './performance';
import type { BenchmarkRequest, BenchmarkResponse } from './protocol';
import { TEST_SET, trainingSetOf, type CheckpointResult, type QualityTask } from './quality';

interface WorkerScope {
  onmessage: ((event: MessageEvent<BenchmarkRequest>) => void) | null;
  postMessage(message: BenchmarkResponse): void;
}

const scope = self as unknown as WorkerScope;

const PROGRESS_INTERVAL_MS = 100;

// Воркер обробляє завдання одне за одним, тому підготовлене для першого завдання знадобиться й наступним
let testSet: LabeledSequence[] | null = null;
let referenceModel: RhythmModel | null = null;
const files = new Map<string, Blob>();

function reportProgress(taskId: number): (fraction: number) => void {
  const shouldReport = createThrottle(PROGRESS_INTERVAL_MS);
  return (fraction) => {
    if (shouldReport(fraction >= 1)) scope.postMessage({ type: 'progress', taskId, fraction });
  };
}

/**
 * Одне навчання до найбільшої контрольної епохи. На кожній контрольній епосі навчання призупиняється,
 * мережа перевіряється на тестовому наборі, і цей час не входить у час навчання
 */
function runQuality(task: QualityTask): void {
  testSet ??= generateDataset(TEST_SET);
  const test = testSet;
  const train = trainingSetOf(task.train);
  const epochs = task.checkpoints.at(-1) ?? 0;
  const checkpoints = new Set(task.checkpoints);
  const progress = reportProgress(task.id);
  const model = RhythmModel.untrained(task.hiddenNeurons);
  const results: CheckpointResult[] = [];
  let pausedMs = 0;
  const startedAt = performance.now();
  model.train(
    train,
    { epochs, learningRate: task.learningRate, hiddenNeurons: task.hiddenNeurons, errorThreshold: 0 },
    ({ epoch, error }) => {
      if (checkpoints.has(epoch)) {
        const pausedAt = performance.now();
        const { accuracy } = evaluateModel(model, test);
        results.push({ epoch, accuracy, error, trainMs: pausedAt - startedAt - pausedMs });
        pausedMs += performance.now() - pausedAt;
      }
      progress(epoch / epochs);
    },
  );
  scope.postMessage({ type: 'quality-done', trial: { taskId: task.id, checkpoints: results } });
}

function fileFor(task: PerformanceTask): Blob {
  const key = `${task.pipeline}:${task.size.key}`;
  let file = files.get(key);
  if (!file) {
    file = generatePerformanceFile(task.pipeline, task.size);
    files.set(key, file);
  }
  return file;
}

/** Файл і модель готуються до початку відліку, тож у заміряний час не входять */
async function runPerformance(task: PerformanceTask): Promise<void> {
  const file = fileFor(task);
  const measurement =
    task.pipeline === 'recognition'
      ? await measureRecognition(file, (referenceModel ??= trainReferenceModel()))
      : await measureTraining(file, task.epochs);
  scope.postMessage({ type: 'performance-done', trial: { taskId: task.id, ...measurement } });
}

scope.onmessage = (event) => {
  const request = event.data;
  const fail = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    scope.postMessage({ type: 'failed', taskId: request.task.id, message });
  };
  try {
    if (request.type === 'quality') runQuality(request.task);
    else runPerformance(request.task).catch(fail);
  } catch (error) {
    fail(error);
  }
};
