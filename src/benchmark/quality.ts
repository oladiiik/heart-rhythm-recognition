import {
  DATASET_PROFILES,
  MAX_PER_CLASS,
  MIN_PER_CLASS,
  PROFILE_LABELS,
  generateDataset,
  type DatasetProfile,
  type GeneratorConfig,
  type LabeledSequence,
} from '../domain/generator';
import { createRandom, shuffled } from '../domain/random';
import { RHYTHM_CLASSES, WINDOW_SIZE } from '../domain/rhythm';
import { validateTrainingConfig } from '../ml/model';
import { summarize, type Summary } from './statistics';

/**
 * Досліди якості: від чого залежить точність мережі. Кожен дослід змінює один чи два параметри,
 * решту тримає незмінними, а кожну точку повторює кілька разів, щоб відрізнити вплив параметра від випадковості
 */
export type QualityExperimentId = 'epochs' | 'hidden' | 'dataset';

export const QUALITY_EXPERIMENT_IDS: readonly QualityExperimentId[] = ['epochs', 'hidden', 'dataset'];

/** Параметри, які в досліді не змінюються */
export interface QualityFixed {
  readonly epochs: number;
  readonly learningRate: number;
  readonly hiddenNeurons: number;
  readonly perClass: number;
}

export type QualityFixedField = keyof QualityFixed;

export interface QualityPlan {
  readonly experiment: QualityExperimentId;
  readonly repeats: number;
  readonly fixed: QualityFixed;
}

/** Точність фіксується на цих епохах одного й того самого навчання: перші k епох довгого навчання і є навчанням на k епох */
export const EPOCH_CHECKPOINTS = [10, 25, 50, 100, 250, 500, 1000, 2000, 4000] as const;
/** Приблизно втричі більша за попередню: так швидкість від 0,01 до 0,9 покривається п'ятьма точками */
export const LEARNING_RATES = [0.01, 0.03, 0.1, 0.3, 0.9] as const;
export const HIDDEN_SIZES = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32] as const;
export const DATASET_SIZES = [100, 300, 1000, 3000] as const;

export interface ProfileSet {
  readonly key: string;
  readonly label: string;
  readonly profiles: readonly DatasetProfile[];
}

export const PROFILE_SETS: readonly ProfileSet[] = [
  ...DATASET_PROFILES.map((profile) => ({ key: profile, label: PROFILE_LABELS[profile], profiles: [profile] })),
  { key: 'all', label: 'Усі три', profiles: DATASET_PROFILES },
];

export const TRAIN_TOLERANCE = 3;

/**
 * Один тестовий набір на всі досліди: усі профілі, як у наборі за замовчуванням на вкладці «Дані».
 * Seed відмінний від seed навчальних наборів, тож тестові послідовності генеруються окремо від навчальних
 */
export const TEST_SET: GeneratorConfig = {
  perClass: 300,
  profiles: DATASET_PROFILES,
  tolerance: TRAIN_TOLERANCE,
  seed: 1000003,
};

export const TEST_SET_SIZE = TEST_SET.perClass * RHYTHM_CLASSES.length;

/**
 * Повтор r навчається на наборі з seed r + 1 в усіх точках досліду: точки одного повтору
 * відрізняються лише параметром, який досліджуємо. Початкові ваги мережі в кожному навчанні випадкові
 */
export function trainSeedOf(repeat: number): number {
  return repeat + 1;
}

/**
 * Навчальний набір у тому порядку, в якому його бачить мережа. Як і на вкладці «Навчання», послідовності перемішано:
 * brain.js змінює ваги після кожної послідовності, і набір, упорядкований за класами, зсував би мережу до класу,
 * що йде останнім. Сильніше за все це карало б великі швидкості навчання
 */
export function trainingSetOf(config: GeneratorConfig): LabeledSequence[] {
  return shuffled(generateDataset(config), createRandom(config.seed));
}

export const QUALITY_LIMITS = {
  repeats: { min: 2, max: 50 },
} as const;

export interface QualitySeries {
  readonly key: string;
  readonly label: string;
}

export interface QualityExperiment {
  readonly id: QualityExperimentId;
  readonly label: string;
  /** Назва параметра на осі x і в таблиці */
  readonly xTitle: string;
  /** Назва параметра, що розрізняє лінії; null, якщо лінія одна */
  readonly seriesTitle: string | null;
  readonly xs: readonly number[];
  readonly series: readonly QualitySeries[];
  /** Які незмінні параметри має сенс задавати в цьому досліді */
  readonly fixedFields: readonly QualityFixedField[];
}

const SINGLE_SERIES: QualitySeries = { key: 'all', label: 'Мережа' };

export const QUALITY_EXPERIMENTS: Record<QualityExperimentId, QualityExperiment> = {
  epochs: {
    id: 'epochs',
    label: 'Епохи і швидкість навчання',
    xTitle: 'Епох',
    seriesTitle: 'Швидкість навчання',
    xs: EPOCH_CHECKPOINTS,
    series: LEARNING_RATES.map((rate) => ({ key: String(rate), label: String(rate).replace('.', ',') })),
    fixedFields: ['hiddenNeurons', 'perClass'],
  },
  hidden: {
    id: 'hidden',
    label: 'Прихований шар',
    xTitle: 'Прихованих нейронів',
    seriesTitle: null,
    xs: HIDDEN_SIZES,
    series: [SINGLE_SERIES],
    fixedFields: ['epochs', 'learningRate', 'perClass'],
  },
  dataset: {
    id: 'dataset',
    label: 'Набір даних',
    xTitle: 'Послідовностей на клас',
    seriesTitle: 'Профілі',
    xs: DATASET_SIZES,
    series: PROFILE_SETS.map(({ key, label }) => ({ key, label })),
    fixedFields: ['epochs', 'learningRate', 'hiddenNeurons'],
  },
};

export function validateQualityPlan(plan: QualityPlan): string | null {
  const { repeats } = QUALITY_LIMITS;
  if (!Number.isInteger(plan.repeats) || plan.repeats < repeats.min || plan.repeats > repeats.max) {
    return `Кількість повторів має бути цілим числом від ${repeats.min} до ${repeats.max}.`;
  }
  const { epochs, learningRate, hiddenNeurons, perClass } = plan.fixed;
  const problem = validateTrainingConfig({ epochs, learningRate, hiddenNeurons, errorThreshold: 0 });
  if (problem) return problem;
  if (!Number.isInteger(perClass) || perClass < MIN_PER_CLASS || perClass > MAX_PER_CLASS) {
    return `Послідовностей на клас має бути від ${MIN_PER_CLASS} до ${MAX_PER_CLASS}.`;
  }
  return null;
}

export interface QualityTask {
  readonly id: number;
  readonly repeat: number;
  readonly series: string;
  /** Значення параметра на осі x; null означає, що x беруть із контрольних епох */
  readonly x: number | null;
  readonly train: GeneratorConfig;
  readonly learningRate: number;
  readonly hiddenNeurons: number;
  /** Епохи, на яких перевіряється точність, за зростанням; остання дорівнює кількості епох навчання */
  readonly checkpoints: readonly number[];
}

function trainSet(perClass: number, profiles: readonly DatasetProfile[], repeat: number): GeneratorConfig {
  return { perClass, profiles, tolerance: TRAIN_TOLERANCE, seed: trainSeedOf(repeat) };
}

/** Завдання впорядковано за повторами: перші результати одразу покривають усі точки досліду */
export function buildQualityTasks(plan: QualityPlan): QualityTask[] {
  const { fixed } = plan;
  const tasks: QualityTask[] = [];
  const add = (task: Omit<QualityTask, 'id'>): void => {
    tasks.push({ ...task, id: tasks.length });
  };
  for (let repeat = 0; repeat < plan.repeats; repeat++) {
    switch (plan.experiment) {
      case 'epochs':
        for (const rate of LEARNING_RATES) {
          add({
            repeat,
            series: String(rate),
            x: null,
            train: trainSet(fixed.perClass, DATASET_PROFILES, repeat),
            learningRate: rate,
            hiddenNeurons: fixed.hiddenNeurons,
            checkpoints: EPOCH_CHECKPOINTS,
          });
        }
        break;
      case 'hidden':
        for (const hidden of HIDDEN_SIZES) {
          add({
            repeat,
            series: SINGLE_SERIES.key,
            x: hidden,
            train: trainSet(fixed.perClass, DATASET_PROFILES, repeat),
            learningRate: fixed.learningRate,
            hiddenNeurons: hidden,
            checkpoints: [fixed.epochs],
          });
        }
        break;
      case 'dataset':
        for (const set of PROFILE_SETS) {
          for (const perClass of DATASET_SIZES) {
            add({
              repeat,
              series: set.key,
              x: perClass,
              train: trainSet(perClass, set.profiles, repeat),
              learningRate: fixed.learningRate,
              hiddenNeurons: fixed.hiddenNeurons,
              checkpoints: [fixed.epochs],
            });
          }
        }
        break;
    }
  }
  return tasks;
}

export function weightCount(hiddenNeurons: number): number {
  return (WINDOW_SIZE + 1) * hiddenNeurons + (hiddenNeurons + 1) * RHYTHM_CLASSES.length;
}

/**
 * Обсяг обчислень навчання: епохи × навчальні послідовності × ваги мережі.
 * Від нього пропорційно залежить час, але, на відміну від заміряного часу, він не змінюється від запуску до запуску
 */
export function trainingWork(epochs: number, sequences: number, hiddenNeurons: number): number {
  return epochs * sequences * weightCount(hiddenNeurons);
}

export function taskWork(task: QualityTask): number {
  const epochs = task.checkpoints.at(-1) ?? 0;
  return trainingWork(epochs, task.train.perClass * RHYTHM_CLASSES.length, task.hiddenNeurons);
}

export interface CheckpointResult {
  readonly epoch: number;
  /** Частка правильно розпізнаних тестових послідовностей */
  readonly accuracy: number;
  /** Середньоквадратична похибка на навчальному наборі після цієї епохи */
  readonly error: number;
  /** Час навчання від початку до цієї епохи без часу перевірок */
  readonly trainMs: number;
}

export interface QualityTrial {
  readonly taskId: number;
  readonly checkpoints: readonly CheckpointResult[];
}

export interface QualityCell {
  readonly series: string;
  readonly x: number;
  readonly accuracy: Summary;
  readonly error: Summary;
  readonly trainMs: Summary;
  readonly work: number;
}

interface Sample {
  readonly series: string;
  readonly x: number;
  readonly result: CheckpointResult;
  readonly work: number;
}

function samplesOf(task: QualityTask, trial: QualityTrial): Sample[] {
  const sequences = task.train.perClass * RHYTHM_CLASSES.length;
  if (task.x === null) {
    return trial.checkpoints.map((result) => ({
      series: task.series,
      x: result.epoch,
      result,
      work: trainingWork(result.epoch, sequences, task.hiddenNeurons),
    }));
  }
  const last = trial.checkpoints.at(-1);
  if (!last) return [];
  return [
    { series: task.series, x: task.x, result: last, work: trainingWork(last.epoch, sequences, task.hiddenNeurons) },
  ];
}

/** Зводить завершені навчання в точки досліду в порядку ліній і значень x. Точки без жодного результату пропускаються */
export function aggregateQuality(
  experiment: QualityExperiment,
  tasks: readonly QualityTask[],
  trials: readonly QualityTrial[],
): QualityCell[] {
  const groups = new Map<string, Sample[]>();
  for (const trial of trials) {
    const task = tasks[trial.taskId];
    if (!task) continue;
    for (const sample of samplesOf(task, trial)) {
      const key = `${sample.series}|${sample.x}`;
      const group = groups.get(key);
      if (group) group.push(sample);
      else groups.set(key, [sample]);
    }
  }
  const cells: QualityCell[] = [];
  for (const series of experiment.series) {
    for (const x of experiment.xs) {
      const group = groups.get(`${series.key}|${x}`);
      if (!group || group.length === 0) continue;
      cells.push({
        series: series.key,
        x,
        accuracy: summarize(group.map((sample) => sample.result.accuracy)),
        error: summarize(group.map((sample) => sample.result.error)),
        trainMs: summarize(group.map((sample) => sample.result.trainMs)),
        work: (group[0] as Sample).work,
      });
    }
  }
  return cells;
}

export interface QualityVerdict {
  readonly best: QualityCell;
  /** Нижня межа точності, з якої варіант вважається рівноцінним найкращому */
  readonly threshold: number;
  readonly cheapest: QualityCell;
}

/**
 * Найкраща точка має найбільшу середню точність. Рівноцінними їй вважаються точки, чия середня точність
 * не нижча за найгірший із запусків найкращої (але щонайменше на одну тестову послідовність нижче):
 * таку різницю дає вже сама випадковість початкових ваг. Серед рівноцінних обирається та, що потребує
 * найменше обчислень; за однакових обчислень вища середня точність
 */
export function judgeQuality(cells: readonly QualityCell[], repeats: number, testSize: number): QualityVerdict | null {
  const complete = cells.filter((cell) => cell.accuracy.count === repeats);
  if (complete.length === 0) return null;
  const byAccuracy = (a: QualityCell, b: QualityCell): number =>
    b.accuracy.mean - a.accuracy.mean || a.work - b.work || a.accuracy.std - b.accuracy.std;
  const best = [...complete].sort(byAccuracy)[0] as QualityCell;
  const threshold = best.accuracy.mean - Math.max(best.accuracy.mean - best.accuracy.min, 1 / testSize);
  const tolerance = 1e-9;
  const cheapest = complete
    .filter((cell) => cell.accuracy.mean >= threshold - tolerance)
    .sort((a, b) => a.work - b.work || b.accuracy.mean - a.accuracy.mean)[0] as QualityCell;
  return { best, threshold, cheapest };
}
