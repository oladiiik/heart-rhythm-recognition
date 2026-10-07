import { describe, expect, it } from 'vitest';
import { generateDataset } from '../domain/generator';
import { splitDataset } from '../domain/metrics';
import { RHYTHM_CLASSES, mostLikelyClass } from '../domain/rhythm';
import {
  DEFAULT_TRAINING_CONFIG,
  RhythmModel,
  parseModelSnapshot,
  validateTrainingConfig,
  type TrainingSummary,
} from './model';

const dataset = generateDataset({ perClass: 300, profiles: ['clean', 'noisy', 'border'], tolerance: 3, seed: 1 });
const { train, test } = splitDataset(dataset, 0.2, 1);
const config = { ...DEFAULT_TRAINING_CONFIG, epochs: 300, errorThreshold: 0 };

function trainedModel(): { model: RhythmModel; epochs: number[]; summary: TrainingSummary } {
  const model = RhythmModel.untrained(config.hiddenNeurons);
  const epochs: number[] = [];
  const outcome = model.train(train, config, ({ epoch }) => epochs.push(epoch));
  const summary: TrainingSummary = {
    config,
    epochsRun: outcome.epochsRun,
    finalError: outcome.finalError,
    trainedOn: train.length,
    trainMs: 0,
    trainedAt: new Date(0).toISOString(),
    metrics: null,
  };
  return { model, epochs, summary };
}

describe('RhythmModel', () => {
  const { model, epochs, summary } = trainedModel();

  it('повідомляє про кожну епоху по порядку', () => {
    expect(epochs).toHaveLength(config.epochs);
    expect(epochs[0]).toBe(1);
    expect(epochs[epochs.length - 1]).toBe(config.epochs);
  });

  it('після навчання правильно розпізнає більшість тестових послідовностей', () => {
    const correct = test.filter(
      (sequence) => mostLikelyClass(model.classifyWindow(sequence.values)) === sequence.label,
    );
    expect(correct.length / test.length).toBeGreaterThan(0.9);
  });

  it('повертає частки впевненості, що в сумі дають одиницю', () => {
    const probabilities = model.classifyWindow([72, 68, 75, 71]);
    const sum = RHYTHM_CLASSES.reduce((total, rhythm) => total + probabilities[rhythm], 0);
    expect(sum).toBeCloseTo(1);
  });

  it('розпізнає приклади з методики, зокрема серії довші за чотири числа', () => {
    expect(model.classifySeries([72, 68, 75, 71, 69, 73, 70, 68, 74]).label).toBe('normal');
    expect(model.classifySeries([50, 49, 49, 51, 51]).label).toBe('bradycardia');
    expect(model.classifySeries([95, 100, 104, 104, 102, 104, 104, 101, 96]).label).toBe('tachycardia');
    expect(model.classifySeries([72, 68, 75, 71, 69, 73]).perWindow).toHaveLength(3);
  });

  it('після збереження й відновлення дає ті самі відповіді', () => {
    const file = JSON.parse(JSON.stringify(model.snapshot(summary))) as unknown;
    const { model: restored, snapshot } = parseModelSnapshot(file);
    expect(snapshot.summary.epochsRun).toBe(config.epochs);
    expect(restored.classifyWindow([59, 61, 60, 59])).toEqual(model.classifyWindow([59, 61, 60, 59]));
  });

  it('відхиляє вікно неправильної довжини', () => {
    expect(() => model.classifyWindow([70, 71, 72])).toThrow(/рівно 4/);
  });
});

describe('parseModelSnapshot', () => {
  it('відхиляє сторонні й пошкоджені файли', () => {
    expect(() => parseModelSnapshot(null)).toThrow(/не містить моделі/);
    expect(() => parseModelSnapshot({ format: 'other' })).toThrow(/не файл моделі/);
    expect(() => parseModelSnapshot({ format: 'heart-rhythm-model', version: 1 })).toThrow(/пошкоджений/);
  });
});

describe('validateTrainingConfig', () => {
  it('приймає типові налаштування й відхиляє значення поза межами', () => {
    expect(validateTrainingConfig(DEFAULT_TRAINING_CONFIG)).toBeNull();
    expect(validateTrainingConfig({ ...DEFAULT_TRAINING_CONFIG, epochs: 0 })).toMatch(/епох/);
    expect(validateTrainingConfig({ ...DEFAULT_TRAINING_CONFIG, learningRate: 0 })).toMatch(/Швидкість/);
    expect(validateTrainingConfig({ ...DEFAULT_TRAINING_CONFIG, hiddenNeurons: 0 })).toMatch(/Нейронів/);
    expect(validateTrainingConfig({ ...DEFAULT_TRAINING_CONFIG, errorThreshold: Number.NaN })).toMatch(/Поріг/);
  });
});
