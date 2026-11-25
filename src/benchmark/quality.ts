import {
  DATASET_PROFILES,
  DEFAULT_PER_CLASS,
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
import { pairedDifference, summarize, type Summary } from './statistics';

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
  /** Профілі навчального набору */
  readonly profiles: readonly DatasetProfile[];
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

/** Набір із PROFILE_SETS з тими самими профілями, якщо такий є */
export function profileSetOf(profiles: readonly DatasetProfile[]): ProfileSet | undefined {
  return PROFILE_SETS.find(
    (set) => set.profiles.length === profiles.length && set.profiles.every((profile) => profiles.includes(profile)),
  );
}

export const TRAIN_TOLERANCE = 3;

/**
 * Валідаційний набір: за ним порівнюються варіанти й обирається найкращий. Усі профілі, бо розпізнавати
 * доведеться будь-які послідовності, хоч на яких профілях навчено мережу; seed відмінний від seed навчальних наборів
 */
export const VALIDATION_SET: GeneratorConfig = {
  perClass: DEFAULT_PER_CLASS,
  profiles: DATASET_PROFILES,
  tolerance: TRAIN_TOLERANCE,
  seed: 1000002,
};

/**
 * Тестовий набір: на вибір варіанта не впливає, тож його точність є чесною оцінкою обраного варіанта.
 * Так само влаштований, як валідаційний, але з іншим seed
 */
export const TEST_SET: GeneratorConfig = { ...VALIDATION_SET, seed: 1000003 };

export const VALIDATION_SET_SIZE = VALIDATION_SET.perClass * RHYTHM_CLASSES.length;
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
    xTitle: 'Епохи',
    seriesTitle: 'Швидкість навчання',
    xs: EPOCH_CHECKPOINTS,
    series: LEARNING_RATES.map((rate) => ({ key: String(rate), label: String(rate).replace('.', ',') })),
    fixedFields: ['hiddenNeurons', 'perClass', 'profiles'],
  },
  hidden: {
    id: 'hidden',
    label: 'Прихований шар',
    xTitle: 'Прихованих нейронів',
    seriesTitle: null,
    xs: HIDDEN_SIZES,
    series: [SINGLE_SERIES],
    fixedFields: ['epochs', 'learningRate', 'perClass', 'profiles'],
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
  const { epochs, learningRate, hiddenNeurons, perClass, profiles } = plan.fixed;
  const problem = validateTrainingConfig({ epochs, learningRate, hiddenNeurons, errorThreshold: 0 });
  if (problem) return problem;
  if (!Number.isInteger(perClass) || perClass < MIN_PER_CLASS || perClass > MAX_PER_CLASS) {
    return `Послідовностей на клас має бути від ${MIN_PER_CLASS} до ${MAX_PER_CLASS}.`;
  }
  if (profiles.length === 0) return 'Оберіть щонайменше один профіль навчального набору.';
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
            train: trainSet(fixed.perClass, fixed.profiles, repeat),
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
            train: trainSet(fixed.perClass, fixed.profiles, repeat),
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
  /** Частка правильно розпізнаних послідовностей валідаційного набору: за нею обирається варіант */
  readonly accuracy: number;
  /** Частка правильно розпізнаних послідовностей тестового набору */
  readonly testAccuracy: number;
  /** Середньоквадратична похибка на навчальному наборі після цієї епохи */
  readonly error: number;
  /** Час навчання від початку до цієї епохи без часу перевірок */
  readonly trainMs: number;
}

export interface QualityTrial {
  readonly taskId: number;
  readonly checkpoints: readonly CheckpointResult[];
}

/** Результат одного повтору в точці досліду: за ними точки порівнюються попарно */
export interface QualityRun {
  readonly repeat: number;
  readonly accuracy: number;
  readonly testAccuracy: number;
}

export interface QualityCell {
  readonly series: string;
  readonly x: number;
  /** Точність на валідаційному наборі */
  readonly accuracy: Summary;
  /** Точність на тестовому наборі */
  readonly testAccuracy: Summary;
  readonly error: Summary;
  readonly trainMs: Summary;
  readonly work: number;
  /** Повтори за зростанням номера */
  readonly runs: readonly QualityRun[];
}

interface Sample {
  readonly repeat: number;
  readonly series: string;
  readonly x: number;
  readonly result: CheckpointResult;
  readonly work: number;
}

function samplesOf(task: QualityTask, trial: QualityTrial): Sample[] {
  const sequences = task.train.perClass * RHYTHM_CLASSES.length;
  if (task.x === null) {
    return trial.checkpoints.map((result) => ({
      repeat: task.repeat,
      series: task.series,
      x: result.epoch,
      result,
      work: trainingWork(result.epoch, sequences, task.hiddenNeurons),
    }));
  }
  const last = trial.checkpoints.at(-1);
  if (!last) return [];
  return [
    {
      repeat: task.repeat,
      series: task.series,
      x: task.x,
      result: last,
      work: trainingWork(last.epoch, sequences, task.hiddenNeurons),
    },
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
        testAccuracy: summarize(group.map((sample) => sample.result.testAccuracy)),
        error: summarize(group.map((sample) => sample.result.error)),
        trainMs: summarize(group.map((sample) => sample.result.trainMs)),
        work: (group[0] as Sample).work,
        runs: [...group]
          .sort((a, b) => a.repeat - b.repeat)
          .map(({ repeat, result }) => ({ repeat, accuracy: result.accuracy, testAccuracy: result.testAccuracy })),
      });
    }
  }
  return cells;
}

/**
 * Запас рівноцінності δ: на скільки середня точність варіанта може поступатися найкращому, щоб вважатися
 * рівноцінною. Задано до дослідів: пів відсоткового пункту, тобто 4–5 послідовностей з 900 валідаційних.
 * Це менше за стандартну похибку однієї оцінки точності на наборі такого розміру (√(p(1 − p)/N) ≈ 0,65 в. п.
 * при p = 96 %): меншу різницю не помітити навіть на власному наборі користувача того самого розміру
 */
export const EQUIVALENCE_MARGIN = 0.005;

/** Парне порівняння точки з найкращою: різниця «найкраща − точка» та її верхня межа */
export interface QualityComparison {
  readonly series: string;
  readonly x: number;
  readonly difference: number;
  readonly upperBound: number;
}

export interface QualityVerdict {
  readonly best: QualityCell;
  readonly margin: number;
  /** Порівняння кожної завершеної точки з найкращою, у порядку точок досліду */
  readonly comparisons: readonly QualityComparison[];
  /** Варіанти, рівноцінні найкращому, разом із ним, у порядку точок досліду */
  readonly equivalent: readonly QualityCell[];
  /** Найдешевший рівноцінний варіант */
  readonly cheapest: QualityCell;
  /** Найдешевший рівноцінний варіант, наступний дорожчий сусід якого на тій самій лінії теж рівноцінний */
  readonly recommended: QualityCell;
}

/**
 * Дешевший варіант іде першим. За однакових обчислень (різні швидкості навчання чи профілі) першим іде той,
 * у якого менший розкид точності між повторами: користувач отримує одне навчання, а не середнє
 */
const cheaperFirst = (a: QualityCell, b: QualityCell): number =>
  a.work - b.work || a.accuracy.std - b.accuracy.std || b.accuracy.mean - a.accuracy.mean;

/**
 * Найкраща точка має найбільшу середню точність на валідаційному наборі. Решта порівнюються з нею попарно:
 * повтор r усіх точок навчався на тому самому наборі, тож порівнюється різниця «найкраща − точка» в кожному
 * повторі. Точка рівноцінна найкращій, якщо верхня межа однобічного 95-відсоткового інтервалу середньої різниці
 * не перевищує запасу δ (тест «не гірше більш ніж на δ»). Рекомендованою стає найдешевша рівноцінна точка, у якої
 * наступна дорожча точка тієї самої лінії теж рівноцінна: точка на плато, а не на краю, де рівноцінність
 * трималася б випадково. Якщо такої немає, рекомендується найкраща
 */
export function judgeQuality(cells: readonly QualityCell[], repeats: number): QualityVerdict | null {
  const complete = cells.filter((cell) => cell.runs.length === repeats);
  if (complete.length === 0 || repeats < 2) return null;
  const byAccuracy = (a: QualityCell, b: QualityCell): number => b.accuracy.mean - a.accuracy.mean || a.work - b.work;
  const best = [...complete].sort(byAccuracy)[0] as QualityCell;
  const bestRuns = best.runs.map((run) => run.accuracy);
  const comparisons = complete.map((cell): QualityComparison => {
    const { difference, upperBound } = pairedDifference(
      bestRuns,
      cell.runs.map((run) => run.accuracy),
    );
    return { series: cell.series, x: cell.x, difference, upperBound };
  });
  const tolerance = 1e-12;
  const passes = complete.map((_, i) => (comparisons[i] as QualityComparison).upperBound <= EQUIVALENCE_MARGIN + tolerance);
  const equivalent = complete.filter((_, i) => passes[i]);
  const onPlateau = complete.filter((cell, i) => {
    if (!passes[i]) return false;
    const next = complete.findIndex((other, j) => j > i && other.series === cell.series);
    return next === -1 || (passes[next] as boolean);
  });
  const [cheapest] = [...equivalent].sort(cheaperFirst) as [QualityCell];
  const recommended = [...onPlateau].sort(cheaperFirst)[0] ?? best;
  return { best, margin: EQUIVALENCE_MARGIN, comparisons, equivalent, cheapest, recommended };
}

/** Чи рівноцінна точка найкращій; точки порівнюються за лінією і значенням x, тож підходить і точка з JSON */
export function isEquivalent(verdict: QualityVerdict | null, cell: Pick<QualityCell, 'series' | 'x'>): boolean {
  return verdict?.equivalent.some((other) => other.series === cell.series && other.x === cell.x) ?? false;
}
