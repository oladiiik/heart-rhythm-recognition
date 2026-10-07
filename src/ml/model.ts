import { NeuralNetwork } from 'brain.js';
import type { LabeledSequence } from '../domain/generator';
import type { EvaluationMetrics } from '../domain/metrics';
import { normalizeSequence } from '../domain/normalize';
import {
  RHYTHM_CLASSES,
  WINDOW_SIZE,
  mostLikelyClass,
  type ClassProbabilities,
  type RhythmClass,
} from '../domain/rhythm';
import { averageProbabilities, toWindows } from '../domain/slidingWindow';

type Network = NeuralNetwork<number[], number[]>;
export type NetworkJSON = ReturnType<Network['toJSON']>;

export interface TrainingConfig {
  readonly epochs: number;
  readonly learningRate: number;
  readonly hiddenNeurons: number;
  readonly errorThreshold: number;
}

export const TRAINING_LIMITS = {
  epochs: { min: 1, max: 100000 },
  // Brain.js приймає швидкість навчання лише строго між 0 і 1
  learningRate: { min: 0.0001, max: 0.99 },
  hiddenNeurons: { min: 1, max: 64 },
  errorThreshold: { min: 0, max: 0.5 },
} as const;

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  epochs: 2000,
  learningRate: 0.3,
  hiddenNeurons: 8,
  errorThreshold: 0.005,
};

export function validateTrainingConfig(config: TrainingConfig): string | null {
  const { epochs, learningRate, hiddenNeurons, errorThreshold } = TRAINING_LIMITS;
  if (!Number.isInteger(config.epochs) || config.epochs < epochs.min || config.epochs > epochs.max) {
    return `Кількість епох — ціле число від ${epochs.min} до ${epochs.max}.`;
  }
  if (!(config.learningRate >= learningRate.min && config.learningRate <= learningRate.max)) {
    return `Швидкість навчання — число від ${learningRate.min} до ${learningRate.max}.`;
  }
  if (
    !Number.isInteger(config.hiddenNeurons) ||
    config.hiddenNeurons < hiddenNeurons.min ||
    config.hiddenNeurons > hiddenNeurons.max
  ) {
    return `Нейронів у прихованому шарі — ціле число від ${hiddenNeurons.min} до ${hiddenNeurons.max}.`;
  }
  if (!(config.errorThreshold >= errorThreshold.min && config.errorThreshold <= errorThreshold.max)) {
    return `Поріг похибки — число від ${errorThreshold.min} до ${errorThreshold.max}.`;
  }
  return null;
}

export interface EpochStatus {
  readonly epoch: number;
  readonly error: number;
}

export interface TrainingOutcome {
  readonly epochsRun: number;
  readonly finalError: number;
}

export interface SeriesClassification {
  readonly label: RhythmClass;
  readonly probabilities: ClassProbabilities;
  readonly perWindow: readonly ClassProbabilities[];
}

export interface TrainingSummary {
  readonly config: TrainingConfig;
  readonly epochsRun: number;
  readonly finalError: number;
  readonly trainedOn: number;
  readonly trainMs: number;
  readonly trainedAt: string;
  readonly metrics: EvaluationMetrics | null;
}

const MODEL_FORMAT = 'heart-rhythm-model';
const MODEL_VERSION = 1;

export interface ModelSnapshot {
  readonly format: typeof MODEL_FORMAT;
  readonly version: typeof MODEL_VERSION;
  readonly network: NetworkJSON;
  readonly summary: TrainingSummary;
}

function toOneHot(label: RhythmClass): number[] {
  return RHYTHM_CLASSES.map((rhythm) => (rhythm === label ? 1 : 0));
}

export class RhythmModel {
  private constructor(private readonly network: Network) {}

  static untrained(hiddenNeurons: number): RhythmModel {
    return new RhythmModel(
      new NeuralNetwork<number[], number[]>({
        inputSize: WINDOW_SIZE,
        hiddenLayers: [hiddenNeurons],
        outputSize: RHYTHM_CLASSES.length,
        activation: 'sigmoid',
      }),
    );
  }

  static restore(network: NetworkJSON): RhythmModel {
    const sizes = network.sizes;
    if (sizes[0] !== WINDOW_SIZE || sizes[sizes.length - 1] !== RHYTHM_CLASSES.length) {
      throw new Error(
        `Модель має форму ${sizes.join('–')}, а потрібна мережа з ${WINDOW_SIZE} входами і ${RHYTHM_CLASSES.length} виходами.`,
      );
    }
    const restored = new NeuralNetwork<number[], number[]>();
    restored.fromJSON(network);
    return new RhythmModel(restored);
  }

  train(
    samples: readonly LabeledSequence[],
    config: TrainingConfig,
    onEpoch: (status: EpochStatus) => void,
  ): TrainingOutcome {
    const data = samples.map((sample) => ({
      input: normalizeSequence(sample.values),
      output: toOneHot(sample.label),
    }));
    const status = this.network.train(data, {
      iterations: config.epochs,
      learningRate: config.learningRate,
      // Brain.js не приймає нульовий поріг, тому «без ранньої зупинки» — це недосяжно малий поріг
      errorThresh: config.errorThreshold > 0 ? config.errorThreshold : Number.MIN_VALUE,
      callbackPeriod: 1,
      callback: ({ iterations, error }) => onEpoch({ epoch: iterations, error }),
    });
    return { epochsRun: status.iterations, finalError: status.error };
  }

  classifyWindow(values: readonly number[]): ClassProbabilities {
    if (values.length !== WINDOW_SIZE) {
      throw new Error(`Вікно має містити рівно ${WINDOW_SIZE} числа, отримано ${values.length}.`);
    }
    const output = this.network.run(normalizeSequence(values));
    let sum = 0;
    for (let i = 0; i < RHYTHM_CLASSES.length; i++) sum += output[i] ?? 0;
    const share = (index: number): number =>
      sum > 0 ? (output[index] ?? 0) / sum : 1 / RHYTHM_CLASSES.length;
    return { bradycardia: share(0), normal: share(1), tachycardia: share(2) };
  }

  classifySeries(series: readonly number[]): SeriesClassification {
    const perWindow = toWindows(series).map((window) => this.classifyWindow(window));
    const probabilities = averageProbabilities(perWindow);
    return { label: mostLikelyClass(probabilities), probabilities, perWindow };
  }

  get hiddenNeurons(): number {
    return this.network.sizes[1] ?? 0;
  }

  snapshot(summary: TrainingSummary): ModelSnapshot {
    return { format: MODEL_FORMAT, version: MODEL_VERSION, network: this.network.toJSON(), summary };
  }
}

export function parseModelSnapshot(raw: unknown): { model: RhythmModel; snapshot: ModelSnapshot } {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Файл не містить моделі.');
  }
  const candidate = raw as Partial<ModelSnapshot>;
  if (candidate.format !== MODEL_FORMAT) {
    throw new Error('Це не файл моделі цього застосунку.');
  }
  if (candidate.version !== MODEL_VERSION) {
    throw new Error(`Непідтримувана версія файла моделі: ${String(candidate.version)}.`);
  }
  if (!candidate.network || !Array.isArray(candidate.network.sizes) || !candidate.summary) {
    throw new Error('Файл моделі пошкоджений: бракує ваг мережі або підсумку навчання.');
  }
  const snapshot = candidate as ModelSnapshot;
  return { model: RhythmModel.restore(snapshot.network), snapshot };
}
