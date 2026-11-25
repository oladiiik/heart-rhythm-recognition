import type { LabeledSequence } from '../domain/generator';
import { emptyConfusionMatrix, summarize, type EvaluationMetrics } from '../domain/metrics';
import { mostLikelyClass } from '../domain/rhythm';
import type { RhythmModel } from './model';

/** Перевірка на тестових послідовностях: кожна розпізнається окремо, відповіді збираються в матрицю помилок */
export function evaluateModel(
  model: RhythmModel,
  test: readonly LabeledSequence[],
  onProgress?: (processed: number, total: number) => void,
): EvaluationMetrics {
  const confusion = emptyConfusionMatrix();
  test.forEach((sequence, index) => {
    const predicted = mostLikelyClass(model.classifyWindow(sequence.values));
    confusion[sequence.label][predicted]++;
    onProgress?.(index + 1, test.length);
  });
  return summarize(confusion);
}
