import { createRandom, randomInt, type Random } from './random';
import { CLASS_RANGES, RHYTHM_CLASSES, WINDOW_SIZE, type BpmRange, type RhythmClass } from './rhythm';

/** Профіль набору є аналогом «папки за якістю»: користувач обирає, на яких профілях навчати */
export const DATASET_PROFILES = ['clean', 'noisy', 'border'] as const;

export type DatasetProfile = (typeof DATASET_PROFILES)[number];

export const PROFILE_LABELS: Record<DatasetProfile, string> = {
  clean: 'Чисті',
  noisy: 'Зашумлені',
  border: 'Граничні',
};

export const PROFILE_HINTS: Record<DatasetProfile, string> = {
  clean: 'два рівні частоти (Tmax і Tmin) з малим допуском, як у методиці генерування',
  noisy: 'довільні значення між Tmin і Tmax, допуск утричі більший',
  border: 'частоти біля меж класів (60 і 100 уд/хв), де класи найважче розрізнити',
};

export type SequenceOrigin = DatasetProfile | 'imported';

export const ORIGIN_LABELS: Record<SequenceOrigin, string> = {
  ...PROFILE_LABELS,
  imported: 'Із файла',
};

export interface LabeledSequence {
  readonly values: readonly number[];
  readonly label: RhythmClass;
  readonly profile: SequenceOrigin;
}

export interface GeneratorConfig {
  readonly perClass: number;
  readonly profiles: readonly DatasetProfile[];
  /** Tol(r): найбільше відхилення частоти всередині серії, уд/хв */
  readonly tolerance: number;
  readonly seed: number;
}

export const MIN_TOTAL_SEQUENCES = 250;
export const MIN_PER_CLASS = Math.ceil(MIN_TOTAL_SEQUENCES / RHYTHM_CLASSES.length);
export const MAX_PER_CLASS = 20000;
export const MAX_TOLERANCE = 15;

const NOISY_TOLERANCE_FACTOR = 3;
const BORDER_BAND = 6;

function borderRanges(rhythm: RhythmClass): BpmRange[] {
  const { min, max } = CLASS_RANGES[rhythm];
  switch (rhythm) {
    case 'bradycardia':
      return [{ min: max - BORDER_BAND + 1, max }];
    case 'normal':
      return [
        { min, max: min + BORDER_BAND - 1 },
        { min: max - BORDER_BAND + 1, max },
      ];
    case 'tachycardia':
      return [{ min, max: min + BORDER_BAND - 1 }];
  }
}

function pickMaxRate(rhythm: RhythmClass, profile: DatasetProfile, random: Random): number {
  if (profile !== 'border') {
    const { min, max } = CLASS_RANGES[rhythm];
    return randomInt(random, min, max);
  }
  const ranges = borderRanges(rhythm);
  const range = ranges[randomInt(random, 0, ranges.length - 1)] as BpmRange;
  return randomInt(random, range.min, range.max);
}

/**
 * Одна послідовність за методикою генерування ритмів:
 *   Tmax = random(діапазон класу),  Tmin = Tmax - random(Tol),
 * далі кожне число серії випадково дорівнює Tmax або Tmin
 * (для профілю «Зашумлені» це будь-яке ціле між ними)
 */
export function generateSequence(
  rhythm: RhythmClass,
  profile: DatasetProfile,
  tolerance: number,
  random: Random,
  length: number = WINDOW_SIZE,
): LabeledSequence {
  const maxDeviation = profile === 'noisy' ? tolerance * NOISY_TOLERANCE_FACTOR : tolerance;
  const maxRate = pickMaxRate(rhythm, profile, random);
  const minRate = maxRate - randomInt(random, 0, maxDeviation);

  const values: number[] = [];
  for (let i = 0; i < length; i++) {
    values.push(profile === 'noisy' ? randomInt(random, minRate, maxRate) : random() < 0.5 ? maxRate : minRate);
  }
  return { values, label: rhythm, profile };
}

export function validateGeneratorConfig(config: GeneratorConfig): string | null {
  if (!Number.isInteger(config.perClass) || config.perClass < MIN_PER_CLASS) {
    return `На кожен клас потрібно щонайменше ${MIN_PER_CLASS} послідовностей (разом не менше ${MIN_TOTAL_SEQUENCES}).`;
  }
  if (config.perClass > MAX_PER_CLASS) {
    return `Забагато послідовностей: найбільше ${MAX_PER_CLASS} на клас.`;
  }
  if (config.profiles.length === 0) {
    return 'Оберіть хоча б один профіль набору.';
  }
  if (!Number.isInteger(config.tolerance) || config.tolerance < 0 || config.tolerance > MAX_TOLERANCE) {
    return `Допуск має бути цілим числом від 0 до ${MAX_TOLERANCE} уд/хв.`;
  }
  if (!Number.isInteger(config.seed) || config.seed < 0) {
    return 'Seed має бути невід’ємним цілим числом.';
  }
  return null;
}

export function generateDataset(config: GeneratorConfig): LabeledSequence[] {
  const problem = validateGeneratorConfig(config);
  if (problem) throw new Error(problem);

  const random = createRandom(config.seed);
  const dataset: LabeledSequence[] = [];
  for (const rhythm of RHYTHM_CLASSES) {
    for (let i = 0; i < config.perClass; i++) {
      const profile = config.profiles[i % config.profiles.length] as DatasetProfile;
      dataset.push(generateSequence(rhythm, profile, config.tolerance, random));
    }
  }
  return dataset;
}

export function generateSeries(rhythm: RhythmClass, length: number, tolerance: number, random: Random): number[] {
  return generateSequence(rhythm, 'noisy', tolerance, random, length).values.slice();
}
