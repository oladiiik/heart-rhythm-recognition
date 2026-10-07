import { DATASET_PROFILES, type LabeledSequence, type SequenceOrigin } from './generator';
import { WINDOW_SIZE, isRhythmClass } from './rhythm';
import { MAX_INPUT_BPM, MIN_INPUT_BPM } from './slidingWindow';

const DATASET_FORMAT = 'heart-rhythm-dataset';
const DATASET_VERSION = 1;

const CSV_HEADER = [...Array.from({ length: WINDOW_SIZE }, (_, i) => `bpm${i + 1}`), 'class', 'profile'];

function toOrigin(value: unknown): SequenceOrigin {
  return (DATASET_PROFILES as readonly unknown[]).includes(value) ? (value as SequenceOrigin) : 'imported';
}

function toSequence(values: unknown, label: unknown, profile: unknown, where: string): LabeledSequence {
  if (!Array.isArray(values) || values.length !== WINDOW_SIZE) {
    throw new Error(`${where}: потрібно рівно ${WINDOW_SIZE} числа.`);
  }
  const numbers = values.map((value) => Number(value));
  for (const value of numbers) {
    if (!Number.isFinite(value) || value < MIN_INPUT_BPM || value > MAX_INPUT_BPM) {
      throw new Error(`${where}: значення мають бути числами від ${MIN_INPUT_BPM} до ${MAX_INPUT_BPM} уд/хв.`);
    }
  }
  if (!isRhythmClass(label)) {
    throw new Error(`${where}: невідомий клас «${String(label)}» (очікується bradycardia, normal або tachycardia).`);
  }
  return { values: numbers, label, profile: toOrigin(profile) };
}

export function datasetToCsv(dataset: readonly LabeledSequence[]): string {
  const rows = dataset.map((sequence) => [...sequence.values, sequence.label, sequence.profile].join(','));
  return [CSV_HEADER.join(','), ...rows].join('\n') + '\n';
}

export function datasetToJson(dataset: readonly LabeledSequence[]): string {
  return JSON.stringify({ format: DATASET_FORMAT, version: DATASET_VERSION, sequences: dataset }, null, 2);
}

function parseCsv(text: string): LabeledSequence[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const hasHeader = lines.length > 0 && Number.isNaN(Number((lines[0] as string).split(/[,;]/)[0]));
  const dataset: LabeledSequence[] = [];
  lines.forEach((line, index) => {
    if (hasHeader && index === 0) return;
    const cells = line.split(/[,;]/).map((cell) => cell.trim());
    dataset.push(
      toSequence(cells.slice(0, WINDOW_SIZE), cells[WINDOW_SIZE], cells[WINDOW_SIZE + 1], `Рядок ${index + 1}`),
    );
  });
  return dataset;
}

function parseJson(text: string): LabeledSequence[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Файл не є коректним JSON.');
  }
  const container = raw as { format?: unknown; sequences?: unknown };
  if (container?.format !== DATASET_FORMAT || !Array.isArray(container.sequences)) {
    throw new Error('Це не файл набору даних цього застосунку.');
  }
  return container.sequences.map((item: { values?: unknown; label?: unknown; profile?: unknown }, index) =>
    toSequence(item?.values, item?.label, item?.profile, `Послідовність ${index + 1}`),
  );
}

export function parseDatasetFile(fileName: string, text: string): LabeledSequence[] {
  const dataset = fileName.toLowerCase().endsWith('.json') ? parseJson(text) : parseCsv(text);
  if (dataset.length === 0) {
    throw new Error('У файлі немає жодної послідовності.');
  }
  return dataset;
}
