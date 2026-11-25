import { datasetCsvHeader, datasetCsvRow, parseDatasetFile } from '../domain/datasetFile';
import { DATASET_PROFILES, DEFAULT_PER_CLASS, DEFAULT_PROFILES, generateSequence, generateSeries, type DatasetProfile } from '../domain/generator';
import { createRandom, randomInt } from '../domain/random';
import { RHYTHM_CLASSES, mostLikelyClass, type RhythmClass } from '../domain/rhythm';
import { averageProbabilities, parseSeries, toWindows } from '../domain/slidingWindow';
import { DEFAULT_TRAINING_CONFIG, RhythmModel } from '../ml/model';
import { TRAIN_TOLERANCE, trainingSetOf } from './quality';
import { fitLine, summarize, type LinearFit, type Summary } from './statistics';

/**
 * Заміри швидкодії: скільки часу займає обробка вхідного файла заданого розміру.
 * Для варіанта з ритмами серця вхідних файлів два: серія пульсу для розпізнавання і набір даних для навчання
 */
export type PerformancePipeline = 'recognition' | 'training';

export const PERFORMANCE_PIPELINES: readonly PerformancePipeline[] = ['recognition', 'training'];

export const PIPELINE_LABELS: Record<PerformancePipeline, string> = {
  recognition: 'Розпізнавання серії',
  training: 'Навчання з файла набору',
};

export interface PerformanceSize {
  readonly key: string;
  readonly label: string;
  /** Найбільший розмір файла; згенерований файл не перевищує його */
  readonly maxBytes: number;
}

const KB = 1024;
const MB = 1024 * KB;

export const PERFORMANCE_SIZES: readonly PerformanceSize[] = [
  { key: '500k', label: '500 КБ', maxBytes: 500 * KB },
  { key: '1m', label: '1 МБ', maxBytes: 1 * MB },
  { key: '5m', label: '5 МБ', maxBytes: 5 * MB },
  { key: '10m', label: '10 МБ', maxBytes: 10 * MB },
];

/** Той самий seed для файлів усіх розмірів і всіх запусків: кожен запуск обробляє однаковий вміст */
export const PERFORMANCE_FILE_SEED = 20261125;

export type PerformanceStage = 'read' | 'parse' | 'windows' | 'classify' | 'average' | 'firstEpoch' | 'epochs';

export const STAGE_LABELS: Record<PerformanceStage, string> = {
  read: 'Читання файла',
  parse: 'Розбір чисел',
  windows: 'Нарізання вікон',
  classify: 'Класифікація вікон',
  average: 'Усереднення',
  firstEpoch: 'Підготовка і перша епоха',
  epochs: 'Решта епох',
};

export const PIPELINE_STAGES: Record<PerformancePipeline, readonly PerformanceStage[]> = {
  recognition: ['read', 'parse', 'windows', 'classify', 'average'],
  training: ['read', 'parse', 'firstEpoch', 'epochs'],
};

/** Мережа та швидкість навчання для заміру навчання: як за замовчуванням на вкладці «Навчання», без ранньої зупинки */
export const PERFORMANCE_NETWORK = {
  hiddenNeurons: DEFAULT_TRAINING_CONFIG.hiddenNeurons,
  learningRate: DEFAULT_TRAINING_CONFIG.learningRate,
} as const;

export const PERFORMANCE_LIMITS = {
  repeats: { min: 5, max: 30 },
  // Щонайменше дві епохи: час решти епох рахується окремо від першої
  epochs: { min: 2, max: 200 },
} as const;

export interface PerformancePlan {
  readonly pipeline: PerformancePipeline;
  readonly repeats: number;
  /** Лише для навчання */
  readonly epochs: number;
}

export function validatePerformancePlan(plan: PerformancePlan): string | null {
  const { repeats, epochs } = PERFORMANCE_LIMITS;
  if (!Number.isInteger(plan.repeats) || plan.repeats < repeats.min || plan.repeats > repeats.max) {
    return `Кількість запусків має бути цілим числом від ${repeats.min} до ${repeats.max}.`;
  }
  if (
    plan.pipeline === 'training' &&
    (!Number.isInteger(plan.epochs) || plan.epochs < epochs.min || plan.epochs > epochs.max)
  ) {
    return `Кількість епох має бути цілим числом від ${epochs.min} до ${epochs.max}.`;
  }
  return null;
}

export interface PerformanceTask {
  readonly id: number;
  readonly pipeline: PerformancePipeline;
  /** Номер запуску від 0 */
  readonly run: number;
  readonly size: PerformanceSize;
  readonly epochs: number;
}

/**
 * Запуски йдуть колами: у кожному колі всі розміри від меншого до більшого.
 * Так прогрів рушія JavaScript припадає лише на перший запуск першого розміру, а не на всі запуски одного файла
 */
export function buildPerformanceTasks(plan: PerformancePlan): PerformanceTask[] {
  const tasks: PerformanceTask[] = [];
  for (let run = 0; run < plan.repeats; run++) {
    for (const size of PERFORMANCE_SIZES) {
      tasks.push({ id: tasks.length, pipeline: plan.pipeline, run, size, epochs: plan.epochs });
    }
  }
  return tasks;
}

/** Відносна вага завдання для загального поступу: час пропорційний розміру файла, а для навчання ще й епохам */
export function performanceTaskWork(task: PerformanceTask): number {
  return task.size.maxBytes * (task.pipeline === 'training' ? task.epochs : 1);
}

// Епізод серії: відрізок одного ритму завдовжки як запис від півхвилини до кількох хвилин
const EPISODE_MIN_BEATS = 30;
const EPISODE_MAX_BEATS = 300;

/**
 * Серія пульсу для розпізнавання: епізоди випадкових ритмів, по одному значенню в рядку,
 * як у файлі, який користувач завантажує на вкладці «Розпізнавання»
 */
export function generateSeriesFile(maxBytes: number, seed: number): string {
  const random = createRandom(seed);
  const lines: string[] = [];
  let bytes = 0;
  for (;;) {
    const rhythm = RHYTHM_CLASSES[randomInt(random, 0, RHYTHM_CLASSES.length - 1)] as RhythmClass;
    const length = randomInt(random, EPISODE_MIN_BEATS, EPISODE_MAX_BEATS);
    for (const value of generateSeries(rhythm, length, TRAIN_TOLERANCE, random)) {
      const line = `${value}\n`;
      if (bytes + line.length > maxBytes) return lines.join('');
      lines.push(line);
      bytes += line.length;
    }
  }
}

/** Набір даних у форматі CSV вкладки «Дані»: класи і профілі чергуються, тож їх у файлі порівну */
export function generateDatasetFile(maxBytes: number, seed: number): string {
  const random = createRandom(seed);
  const header = `${datasetCsvHeader()}\n`;
  const lines: string[] = [header];
  let bytes = header.length;
  for (let index = 0; ; index++) {
    const rhythm = RHYTHM_CLASSES[index % RHYTHM_CLASSES.length] as RhythmClass;
    const profile = DATASET_PROFILES[
      Math.floor(index / RHYTHM_CLASSES.length) % DATASET_PROFILES.length
    ] as DatasetProfile;
    const line = `${datasetCsvRow(generateSequence(rhythm, profile, TRAIN_TOLERANCE, random))}\n`;
    if (bytes + line.length > maxBytes) return lines.join('');
    lines.push(line);
    bytes += line.length;
  }
}

export function generatePerformanceFile(pipeline: PerformancePipeline, size: PerformanceSize): Blob {
  const text =
    pipeline === 'recognition'
      ? generateSeriesFile(size.maxBytes, PERFORMANCE_FILE_SEED)
      : generateDatasetFile(size.maxBytes, PERFORMANCE_FILE_SEED);
  return new Blob([text], { type: 'text/plain' });
}

/**
 * Модель для заміру розпізнавання: мережа з параметрами за замовчуванням, навчена на наборі за замовчуванням.
 * Час розпізнавання залежить від розміру мережі, а не від значень ваг, тож результат не залежить від моделі на вкладці «Навчання»
 */
export function trainReferenceModel(): RhythmModel {
  const model = RhythmModel.untrained(DEFAULT_TRAINING_CONFIG.hiddenNeurons);
  const dataset = trainingSetOf({
    perClass: DEFAULT_PER_CLASS,
    profiles: DEFAULT_PROFILES,
    tolerance: TRAIN_TOLERANCE,
    seed: 1,
  });
  model.train(dataset, DEFAULT_TRAINING_CONFIG, () => {});
  return model;
}

export interface StageTiming {
  readonly stage: PerformanceStage;
  readonly ms: number;
}

export interface PerformanceTrial {
  readonly taskId: number;
  readonly fileBytes: number;
  /** Значень пульсу в серії або послідовностей у наборі */
  readonly units: number;
  readonly stages: readonly StageTiming[];
  readonly totalMs: number;
}

/**
 * Секундомір етапів одного запуску. Кожен етап також позначається через performance.measure з назвою
 * «<мітка> <етап>», тож у DevTools і трасі Chrome його видно окремим відрізком поруч із паузами прибирання сміття
 */
class StageClock {
  private readonly startedAt = performance.now();
  private last = this.startedAt;
  private readonly timings: StageTiming[] = [];

  constructor(private readonly label: string | undefined) {}

  lap(stage: PerformanceStage): void {
    const now = performance.now();
    this.timings.push({ stage, ms: now - this.last });
    if (this.label) performance.measure(`${this.label} ${stage}`, { start: this.last, end: now });
    this.last = now;
  }

  has(stage: PerformanceStage): boolean {
    return this.timings.some((timing) => timing.stage === stage);
  }

  result(): Pick<PerformanceTrial, 'stages' | 'totalMs'> {
    return { stages: this.timings, totalMs: this.last - this.startedAt };
  }
}

/**
 * Ті самі кроки, що й у RhythmModel.classifySeries, але з окремим заміром кожного.
 * Відлік починається з читання вмісту файла (як після вибору файла користувачем) і закінчується готовою відповіддю
 */
export async function measureRecognition(
  file: Blob,
  model: RhythmModel,
  label?: string,
): Promise<Omit<PerformanceTrial, 'taskId'>> {
  const clock = new StageClock(label);
  const text = await file.text();
  clock.lap('read');
  const parsed = parseSeries(text);
  if (!parsed.ok) throw new Error(parsed.message);
  clock.lap('parse');
  const windows = toWindows(parsed.values);
  clock.lap('windows');
  const perWindow = windows.map((window) => model.classifyWindow(window));
  clock.lap('classify');
  mostLikelyClass(averageProbabilities(perWindow));
  clock.lap('average');
  return { fileBytes: file.size, units: parsed.values.length, ...clock.result() };
}

/**
 * Навчання нової мережі на наборі з файла. Перша епоха вимірюється окремо, бо до неї входить
 * підготовка даних (нормалізація, кодування класів, ініціалізація мережі)
 */
export async function measureTraining(
  file: Blob,
  epochs: number,
  label?: string,
): Promise<Omit<PerformanceTrial, 'taskId'>> {
  const clock = new StageClock(label);
  const text = await file.text();
  clock.lap('read');
  const dataset = parseDatasetFile('benchmark.csv', text);
  clock.lap('parse');
  const model = RhythmModel.untrained(PERFORMANCE_NETWORK.hiddenNeurons);
  model.train(dataset, { ...PERFORMANCE_NETWORK, epochs, errorThreshold: 0 }, ({ epoch }) => {
    if (epoch === 1) clock.lap('firstEpoch');
  });
  if (!clock.has('firstEpoch')) throw new Error('Навчання завершилося раніше першої епохи.');
  clock.lap('epochs');
  return { fileBytes: file.size, units: dataset.length, ...clock.result() };
}

export interface PerformanceRow {
  readonly size: PerformanceSize;
  readonly fileBytes: number;
  readonly units: number;
  /** Загальний час кожного запуску в порядку запусків */
  readonly runs: readonly number[];
  readonly total: Summary;
  /** Медіана кожного етапу: на неї не впливає одиничний повільний запуск */
  readonly stages: readonly StageTiming[];
}

export function aggregatePerformance(
  pipeline: PerformancePipeline,
  tasks: readonly PerformanceTask[],
  trials: readonly PerformanceTrial[],
): PerformanceRow[] {
  const rows: PerformanceRow[] = [];
  for (const size of PERFORMANCE_SIZES) {
    const sizeTrials = trials
      .filter((trial) => tasks[trial.taskId]?.size.key === size.key)
      .sort((a, b) => (tasks[a.taskId]?.run ?? 0) - (tasks[b.taskId]?.run ?? 0));
    const first = sizeTrials[0];
    if (!first) continue;
    rows.push({
      size,
      fileBytes: first.fileBytes,
      units: first.units,
      runs: sizeTrials.map((trial) => trial.totalMs),
      total: summarize(sizeTrials.map((trial) => trial.totalMs)),
      stages: PIPELINE_STAGES[pipeline].map((stage) => ({
        stage,
        ms: summarize(sizeTrials.map((trial) => trial.stages.find((timing) => timing.stage === stage)?.ms ?? 0)).median,
      })),
    });
  }
  return rows;
}

/** Мікросекунд на одиницю даних: на значення пульсу для розпізнавання, на послідовність за епоху для навчання */
export function microsecondsPerUnit(pipeline: PerformancePipeline, row: PerformanceRow, epochs: number): number {
  if (pipeline === 'recognition') return (row.total.median * 1000) / row.units;
  const epochStage = row.stages.find((timing) => timing.stage === 'epochs')?.ms ?? 0;
  return (epochStage * 1000) / ((epochs - 1) * row.units);
}

/** Запуск, найдальший від медіани свого файла */
export interface RunOutlier {
  readonly size: PerformanceSize;
  /** Номер запуску від нуля */
  readonly run: number;
  /** На скільки запуск довший за медіану файла (частка); від'ємна, якщо коротший */
  readonly excess: number;
}

export interface PerformanceVerdict {
  /** Етап, що займає найбільшу частку часу на найбільшому файлі */
  readonly bottleneck: StageTiming;
  readonly bottleneckShare: number;
  /**
   * Пряма «медіана часу від кількості даних»; R² близький до 1 означає лінійне зростання. Пряма йде через медіани,
   * а не через усі запуски: поодинокий повільний запуск інакше нахилив би її й занизив R², хоча зростання лінійне
   */
  readonly fit: LinearFit | null;
  /** Поодинокі аномальні запуски видно тут, а не в прямій */
  readonly outlier: RunOutlier;
}

export function judgePerformance(rows: readonly PerformanceRow[], repeats: number): PerformanceVerdict | null {
  const complete = rows.filter((row) => row.runs.length === repeats);
  const largest = complete.at(-1);
  if (!largest) return null;
  const stageTotal = largest.stages.reduce((sum, timing) => sum + timing.ms, 0);
  const bottleneck = [...largest.stages].sort((a, b) => b.ms - a.ms)[0] as StageTiming;
  const deviations = complete.flatMap((row) =>
    row.runs.map((ms, run) => ({ size: row.size, run, excess: ms / row.total.median - 1 })),
  );
  const outlier = deviations.reduce((worst, item) => (Math.abs(item.excess) > Math.abs(worst.excess) ? item : worst));
  return {
    bottleneck,
    bottleneckShare: stageTotal > 0 ? bottleneck.ms / stageTotal : 0,
    fit: complete.length >= 2 ? fitLine(complete.map((row) => ({ x: row.units, y: row.total.median }))) : null,
    outlier,
  };
}
