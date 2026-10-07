/** Класи ритму в порядку зростання частоти; цей порядок задає і порядок виходів мережі */
export const RHYTHM_CLASSES = ['bradycardia', 'normal', 'tachycardia'] as const;

export type RhythmClass = (typeof RHYTHM_CLASSES)[number];

/** Скільки чисел у послідовності, на якій навчається мережа (за умовою завдання) */
export const WINDOW_SIZE = 4;

export interface BpmRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Межі максимальної частоти (уд/хв) для кожного класу, з якої генерується серія.
 * Норма 60–100; повільніший ритм вважається брадикардією (від 40), швидший тахікардією (до 140)
 */
export const CLASS_RANGES: Record<RhythmClass, BpmRange> = {
  bradycardia: { min: 40, max: 59 },
  normal: { min: 60, max: 100 },
  tachycardia: { min: 101, max: 140 },
};

export const CLASS_LABELS: Record<RhythmClass, string> = {
  bradycardia: 'Брадикардія',
  normal: 'Нормальний ритм',
  tachycardia: 'Тахікардія',
};

export const CLASS_HINTS: Record<RhythmClass, string> = {
  bradycardia: 'повільний ритм, менше 60 уд/хв',
  normal: '60–100 уд/хв',
  tachycardia: 'швидкий ритм, понад 100 уд/хв',
};

export type ClassProbabilities = Record<RhythmClass, number>;

export function mostLikelyClass(probabilities: ClassProbabilities): RhythmClass {
  let best: RhythmClass = RHYTHM_CLASSES[0];
  for (const rhythm of RHYTHM_CLASSES) {
    if (probabilities[rhythm] > probabilities[best]) best = rhythm;
  }
  return best;
}

export function isRhythmClass(value: unknown): value is RhythmClass {
  return typeof value === 'string' && (RHYTHM_CLASSES as readonly string[]).includes(value);
}

export function bpmToIntervalSeconds(bpm: number): number {
  return 60 / bpm;
}
