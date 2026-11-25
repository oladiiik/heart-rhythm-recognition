import { describe, expect, it } from 'vitest';
import { parseDatasetFile } from '../domain/datasetFile';
import { generateDataset } from '../domain/generator';
import { countByClass } from '../domain/metrics';
import { parseSeries } from '../domain/slidingWindow';
import { RhythmModel } from '../ml/model';
import {
  PERFORMANCE_SIZES,
  aggregatePerformance,
  buildPerformanceTasks,
  generateDatasetFile,
  generateSeriesFile,
  judgePerformance,
  measureRecognition,
  measureTraining,
  type PerformanceTrial,
} from './performance';

describe('generateSeriesFile', () => {
  const maxBytes = 500 * 1024;
  const text = generateSeriesFile(maxBytes, 7);

  it('заповнює файл майже до межі, не перевищуючи її', () => {
    // Найдовший рядок: тризначне число і перенесення
    expect(text.length).toBeLessThanOrEqual(maxBytes);
    expect(text.length).toBeGreaterThan(maxBytes - 4);
  });

  it('дає серію, яку приймає розбір вкладки «Розпізнавання», і відтворюється за seed', () => {
    const parsed = parseSeries(text);
    expect(parsed.ok).toBe(true);
    expect(generateSeriesFile(maxBytes, 7)).toBe(text);
  });
});

describe('generateDatasetFile', () => {
  const maxBytes = 64 * 1024;
  const text = generateDatasetFile(maxBytes, 7);

  it('дає набір у форматі вкладки «Дані» з порівну послідовностей кожного класу', () => {
    expect(text.length).toBeLessThanOrEqual(maxBytes);
    expect(text.length).toBeGreaterThan(maxBytes - 60);
    const counts = Object.values(countByClass(parseDatasetFile('set.csv', text)));
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe('buildPerformanceTasks', () => {
  it('іде колами: у кожному запуску всі розміри від меншого до більшого', () => {
    const tasks = buildPerformanceTasks({ pipeline: 'recognition', repeats: 2, epochs: 10 });
    expect(tasks.map((task) => [task.run, task.size.key])).toEqual([
      ...PERFORMANCE_SIZES.map((size) => [0, size.key]),
      ...PERFORMANCE_SIZES.map((size) => [1, size.key]),
    ]);
  });
});

describe('заміри', () => {
  it('розпізнавання вимірює кожен етап, і їхня сума дорівнює загальному часу', async () => {
    const model = RhythmModel.untrained(8);
    const train = generateDataset({ perClass: 100, profiles: ['clean'], tolerance: 3, seed: 1 });
    model.train(train, { epochs: 1, learningRate: 0.3, hiddenNeurons: 8, errorThreshold: 0 }, () => {});
    const text = generateSeriesFile(20 * 1024, 1);
    const result = await measureRecognition(new Blob([text]), model);
    expect(result.fileBytes).toBe(text.length);
    expect(result.stages.map((timing) => timing.stage)).toEqual(['read', 'parse', 'windows', 'classify', 'average']);
    const sum = result.stages.reduce((total, timing) => total + timing.ms, 0);
    expect(sum).toBeCloseTo(result.totalMs, 6);
  });

  it('навчання рахує послідовності з файла й відокремлює першу епоху', async () => {
    const text = generateDatasetFile(16 * 1024, 1);
    const result = await measureTraining(new Blob([text]), 3);
    expect(result.units).toBe(parseDatasetFile('set.csv', text).length);
    expect(result.stages.map((timing) => timing.stage)).toEqual(['read', 'parse', 'firstEpoch', 'epochs']);
  });
});

describe('aggregatePerformance і judgePerformance', () => {
  const tasks = buildPerformanceTasks({ pipeline: 'recognition', repeats: 3, epochs: 10 });
  const trials: PerformanceTrial[] = tasks.map((task) => {
    const scale = task.size.maxBytes / 1024;
    // Перший запуск найменшого файла повільніший, як буває до прогріву рушія
    const slowdown = task.id === 0 ? 2 : 1;
    const classify = scale * slowdown;
    return {
      taskId: task.id,
      fileBytes: task.size.maxBytes,
      units: scale * 100,
      stages: [
        { stage: 'read', ms: 1 },
        { stage: 'parse', ms: scale / 10 },
        { stage: 'windows', ms: scale / 10 },
        { stage: 'classify', ms: classify },
        { stage: 'average', ms: 1 },
      ],
      totalMs: 2 + scale / 5 + classify,
    };
  });

  it('зводить запуски кожного розміру в порядку запусків', () => {
    const rows = aggregatePerformance('recognition', tasks, trials);
    expect(rows.map((row) => row.size.key)).toEqual(PERFORMANCE_SIZES.map((size) => size.key));
    expect(rows[0]?.runs).toHaveLength(3);
    expect(rows[0]?.runs[0]).toBeGreaterThan(rows[0]?.runs[1] ?? Infinity);
  });

  it('знаходить вузьке місце, лінійність і повільніший перший запуск', () => {
    const verdict = judgePerformance(aggregatePerformance('recognition', tasks, trials), 3);
    expect(verdict?.bottleneck.stage).toBe('classify');
    expect(verdict?.fit?.r2).toBeGreaterThan(0.99);
    expect(verdict?.outlier.size.key).toBe(PERFORMANCE_SIZES[0]?.key);
    expect(verdict?.outlier.run).toBe(0);
    expect(verdict?.outlier.excess).toBeGreaterThan(0.5);
  });

  it('не дає поодинокому повільному запуску великого файла зіпсувати пряму', () => {
    const lastId = tasks.filter((task) => task.size.key === PERFORMANCE_SIZES.at(-1)?.key).at(-1)?.id;
    const slowed = trials.map((trial) => (trial.taskId === lastId ? { ...trial, totalMs: trial.totalMs * 3 } : trial));
    const verdict = judgePerformance(aggregatePerformance('recognition', tasks, slowed), 3);
    expect(verdict?.fit?.r2).toBeGreaterThan(0.99);
    expect(verdict?.outlier.excess).toBeGreaterThan(1);
  });
});
