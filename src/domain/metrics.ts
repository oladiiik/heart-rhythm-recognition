import type { LabeledSequence } from './generator';
import { createRandom, shuffled } from './random';
import { RHYTHM_CLASSES, type RhythmClass } from './rhythm';

/** Рядки відповідають справжньому класу, стовпці відповіді мережі */
export type ConfusionMatrix = Record<RhythmClass, Record<RhythmClass, number>>;

export interface EvaluationMetrics {
  readonly total: number;
  readonly correct: number;
  readonly accuracy: number;
  readonly confusion: ConfusionMatrix;
}

export function emptyConfusionMatrix(): ConfusionMatrix {
  const row = (): Record<RhythmClass, number> => ({ bradycardia: 0, normal: 0, tachycardia: 0 });
  return { bradycardia: row(), normal: row(), tachycardia: row() };
}

export function summarize(confusion: ConfusionMatrix): EvaluationMetrics {
  let total = 0;
  let correct = 0;
  for (const actual of RHYTHM_CLASSES) {
    for (const predicted of RHYTHM_CLASSES) {
      total += confusion[actual][predicted];
      if (actual === predicted) correct += confusion[actual][predicted];
    }
  }
  return { total, correct, accuracy: total === 0 ? 0 : correct / total, confusion };
}

export interface DatasetSplit {
  readonly train: LabeledSequence[];
  readonly test: LabeledSequence[];
}

/**
 * Поділ на навчальну й тестову частини окремо в кожному класі,
 * щоб пропорції класів збереглися в обох частинах
 */
export function splitDataset(dataset: readonly LabeledSequence[], testShare: number, seed: number): DatasetSplit {
  const random = createRandom(seed);
  const train: LabeledSequence[] = [];
  const test: LabeledSequence[] = [];
  for (const rhythm of RHYTHM_CLASSES) {
    const ofClass = shuffled(
      dataset.filter((sequence) => sequence.label === rhythm),
      random,
    );
    const testCount = Math.round(ofClass.length * testShare);
    test.push(...ofClass.slice(0, testCount));
    train.push(...ofClass.slice(testCount));
  }
  return { train: shuffled(train, random), test };
}

export function countByClass(dataset: readonly LabeledSequence[]): Record<RhythmClass, number> {
  const counts: Record<RhythmClass, number> = { bradycardia: 0, normal: 0, tachycardia: 0 };
  for (const sequence of dataset) counts[sequence.label]++;
  return counts;
}
