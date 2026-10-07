import { describe, expect, it } from 'vitest';
import { datasetToCsv, datasetToJson, parseDatasetFile } from './datasetFile';
import { generateDataset } from './generator';
import { countByClass, emptyConfusionMatrix, splitDataset, summarize } from './metrics';
import { normalizeBpm } from './normalize';
import { mostLikelyClass } from './rhythm';
import { averageProbabilities, parseSeries, toWindows } from './slidingWindow';

describe('toWindows', () => {
  it('розбиває серію на сусідні вікна з кроком 1', () => {
    expect(toWindows([1, 2, 3, 4, 5, 6])).toEqual([
      [1, 2, 3, 4],
      [2, 3, 4, 5],
      [3, 4, 5, 6],
    ]);
  });

  it('для серії з чотирьох чисел дає одне вікно, а коротшу відхиляє', () => {
    expect(toWindows([1, 2, 3, 4])).toEqual([[1, 2, 3, 4]]);
    expect(() => toWindows([1, 2, 3])).toThrow(/щонайменше 4/);
  });
});

describe('averageProbabilities', () => {
  it('усереднює відповіді вікон', () => {
    const average = averageProbabilities([
      { bradycardia: 1, normal: 0, tachycardia: 0 },
      { bradycardia: 0, normal: 1, tachycardia: 0 },
    ]);
    expect(average).toEqual({ bradycardia: 0.5, normal: 0.5, tachycardia: 0 });
  });

  it('обирає клас із найбільшою впевненістю', () => {
    expect(mostLikelyClass({ bradycardia: 0.1, normal: 0.2, tachycardia: 0.7 })).toBe('tachycardia');
  });
});

describe('parseSeries', () => {
  it('приймає різні роздільники', () => {
    expect(parseSeries('72, 68;75\n71 69')).toEqual({ ok: true, values: [72, 68, 75, 71, 69] });
  });

  it('пояснює, що не так із вводом', () => {
    expect(parseSeries('   ')).toMatchObject({ ok: false, message: expect.stringMatching(/Введіть/) });
    expect(parseSeries('72, abc, 70, 71')).toMatchObject({ ok: false, message: expect.stringMatching(/abc/) });
    expect(parseSeries('72, 68, 75')).toMatchObject({ ok: false, message: expect.stringMatching(/щонайменше/) });
    expect(parseSeries('72, 68, 75, 900')).toMatchObject({ ok: false, message: expect.stringMatching(/поза межами/) });
  });
});

describe('normalizeBpm', () => {
  it('стискає частоту до [0, 1] і притискає значення поза шкалою', () => {
    expect(normalizeBpm(30)).toBe(0);
    expect(normalizeBpm(160)).toBe(1);
    expect(normalizeBpm(95)).toBeCloseTo(0.5);
    expect(normalizeBpm(10)).toBe(0);
    expect(normalizeBpm(240)).toBe(1);
  });
});

describe('splitDataset', () => {
  const dataset = generateDataset({ perClass: 100, profiles: ['clean'], tolerance: 3, seed: 5 });

  it('зберігає пропорції класів і не губить послідовності', () => {
    const { train, test } = splitDataset(dataset, 0.2, 1);
    expect(countByClass(test)).toEqual({ bradycardia: 20, normal: 20, tachycardia: 20 });
    expect(countByClass(train)).toEqual({ bradycardia: 80, normal: 80, tachycardia: 80 });
  });

  it('відтворюється за тим самим seed', () => {
    expect(splitDataset(dataset, 0.2, 9)).toEqual(splitDataset(dataset, 0.2, 9));
  });
});

describe('summarize', () => {
  it('рахує точність за матрицею помилок', () => {
    const confusion = emptyConfusionMatrix();
    confusion.normal.normal = 8;
    confusion.normal.tachycardia = 2;
    confusion.bradycardia.bradycardia = 10;
    expect(summarize(confusion)).toMatchObject({ total: 20, correct: 18, accuracy: 0.9 });
  });
});

describe('файл набору даних', () => {
  const dataset = generateDataset({ perClass: 84, profiles: ['clean', 'noisy'], tolerance: 3, seed: 11 });

  it('CSV і JSON читаються назад без втрат', () => {
    expect(parseDatasetFile('set.csv', datasetToCsv(dataset))).toEqual(dataset);
    expect(parseDatasetFile('set.json', datasetToJson(dataset))).toEqual(dataset);
  });

  it('CSV без заголовка й профілю позначається як завантажений із файла', () => {
    expect(parseDatasetFile('x.csv', '59;61;60;59;normal\n')).toEqual([
      { values: [59, 61, 60, 59], label: 'normal', profile: 'imported' },
    ]);
  });

  it('називає рядок із помилкою', () => {
    expect(() => parseDatasetFile('x.csv', '59,61,60,59,normal\n50,49,51,slow')).toThrow(/Рядок 2/);
    expect(() => parseDatasetFile('x.csv', '59,61,60,59,fast')).toThrow(/невідомий клас/);
    expect(() => parseDatasetFile('x.json', '{"a":1}')).toThrow(/не файл набору/);
    expect(() => parseDatasetFile('x.csv', '')).toThrow(/немає жодної/);
  });
});
