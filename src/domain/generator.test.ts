import { describe, expect, it } from 'vitest';
import {
  DATASET_PROFILES,
  MIN_PER_CLASS,
  generateDataset,
  generateSequence,
  validateGeneratorConfig,
  type GeneratorConfig,
} from './generator';
import { countByClass } from './metrics';
import { createRandom } from './random';
import { CLASS_RANGES, RHYTHM_CLASSES, WINDOW_SIZE } from './rhythm';

const config: GeneratorConfig = { perClass: 300, profiles: ['clean', 'noisy', 'border'], tolerance: 3, seed: 42 };

describe('generateDataset', () => {
  it('дає порівну послідовностей кожного класу по чотири числа', () => {
    const dataset = generateDataset(config);
    expect(dataset).toHaveLength(900);
    expect(countByClass(dataset)).toEqual({ bradycardia: 300, normal: 300, tachycardia: 300 });
    expect(dataset.every((sequence) => sequence.values.length === WINDOW_SIZE)).toBe(true);
  });

  it('відтворюється за тим самим seed і змінюється за іншим', () => {
    expect(generateDataset(config)).toEqual(generateDataset(config));
    expect(generateDataset({ ...config, seed: 43 })).not.toEqual(generateDataset(config));
  });

  it('ділить послідовності класу порівну між обраними профілями', () => {
    const dataset = generateDataset(config);
    for (const profile of DATASET_PROFILES) {
      expect(dataset.filter((sequence) => sequence.profile === profile)).toHaveLength(300);
    }
  });

  it('тримає значення в межах класу з урахуванням допуску', () => {
    for (const sequence of generateDataset({ ...config, profiles: ['clean'] })) {
      const range = CLASS_RANGES[sequence.label];
      for (const value of sequence.values) {
        expect(value).toBeLessThanOrEqual(range.max);
        expect(value).toBeGreaterThanOrEqual(range.min - config.tolerance);
      }
    }
  });
});

describe('generateSequence', () => {
  it('у профілі «Чисті» має щонайбільше два різні рівні частоти (Tmax і Tmin)', () => {
    const random = createRandom(1);
    for (let i = 0; i < 200; i++) {
      const rhythm = RHYTHM_CLASSES[i % RHYTHM_CLASSES.length] as (typeof RHYTHM_CLASSES)[number];
      const { values } = generateSequence(rhythm, 'clean', 5, random);
      expect(new Set(values).size).toBeLessThanOrEqual(2);
    }
  });

  it('у профілі «Граничні» бере найбільшу частоту лише біля межі класів', () => {
    const random = createRandom(2);
    for (let i = 0; i < 200; i++) {
      const top = Math.max(...generateSequence('normal', 'border', 0, random).values);
      expect((top >= 60 && top <= 65) || (top >= 95 && top <= 100)).toBe(true);
    }
  });

  it('з нульовим допуском дає однакові числа', () => {
    const { values } = generateSequence('tachycardia', 'clean', 0, createRandom(3));
    expect(new Set(values).size).toBe(1);
  });
});

describe('validateGeneratorConfig', () => {
  it('приймає коректні налаштування', () => {
    expect(validateGeneratorConfig(config)).toBeNull();
  });

  it('відхиляє замалий набір, порожній список профілів і неприпустимий допуск', () => {
    expect(validateGeneratorConfig({ ...config, perClass: MIN_PER_CLASS - 1 })).toMatch(/щонайменше/);
    expect(validateGeneratorConfig({ ...config, profiles: [] })).toMatch(/профіль/);
    expect(validateGeneratorConfig({ ...config, tolerance: -1 })).toMatch(/Допуск/);
    expect(validateGeneratorConfig({ ...config, seed: 1.5 })).toMatch(/Seed/);
  });
});
