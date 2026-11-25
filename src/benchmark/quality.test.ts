import { describe, expect, it } from 'vitest';
import { countByClass } from '../domain/metrics';
import { DEFAULT_TRAINING_CONFIG } from '../ml/model';
import {
  EPOCH_CHECKPOINTS,
  QUALITY_EXPERIMENTS,
  aggregateQuality,
  buildQualityTasks,
  judgeQuality,
  trainingSetOf,
  trainingWork,
  validateQualityPlan,
  weightCount,
  type QualityCell,
  type QualityPlan,
  type QualityTrial,
} from './quality';
import { summarize } from './statistics';

const fixed = {
  epochs: DEFAULT_TRAINING_CONFIG.epochs,
  learningRate: DEFAULT_TRAINING_CONFIG.learningRate,
  hiddenNeurons: DEFAULT_TRAINING_CONFIG.hiddenNeurons,
  perClass: 300,
};

function plan(experiment: QualityPlan['experiment'], repeats = 3): QualityPlan {
  return { experiment, repeats, fixed };
}

describe('buildQualityTasks', () => {
  it('створює по навчанню на кожну точку досліду в кожному повторі', () => {
    expect(buildQualityTasks(plan('epochs'))).toHaveLength(3 * 5);
    expect(buildQualityTasks(plan('hidden'))).toHaveLength(3 * 10);
    expect(buildQualityTasks(plan('dataset'))).toHaveLength(3 * 4 * 4);
  });

  it('у межах повтору навчає на тому самому наборі, а повтори беруть різні набори', () => {
    const tasks = buildQualityTasks(plan('hidden'));
    const seedsOf = (repeat: number) => new Set(tasks.filter((t) => t.repeat === repeat).map((t) => t.train.seed));
    expect(seedsOf(0).size).toBe(1);
    expect([...seedsOf(0)]).not.toEqual([...seedsOf(1)]);
    expect(tasks.map((task) => task.id)).toEqual(tasks.map((_, index) => index));
  });

  it('навчає дослід епох до останньої контрольної епохи, інші до заданої кількості', () => {
    expect(buildQualityTasks(plan('epochs'))[0]?.checkpoints).toEqual(EPOCH_CHECKPOINTS);
    expect(buildQualityTasks(plan('dataset'))[0]?.checkpoints).toEqual([fixed.epochs]);
  });
});

describe('validateQualityPlan', () => {
  it('приймає параметри за замовчуванням і відхиляє замало повторів', () => {
    expect(validateQualityPlan(plan('epochs', 10))).toBeNull();
    expect(validateQualityPlan(plan('epochs', 1))).not.toBeNull();
    expect(validateQualityPlan({ ...plan('hidden'), fixed: { ...fixed, perClass: 10 } })).not.toBeNull();
  });
});

describe('weightCount', () => {
  it('рахує ваги й зсуви мережі 4-8-3', () => {
    // 4·8 + 8 між входом і прихованим шаром, 8·3 + 3 між прихованим і вихідним
    expect(weightCount(8)).toBe(67);
  });
});

describe('aggregateQuality', () => {
  it('розкладає контрольні епохи одного навчання на окремі точки й пропускає точки без результатів', () => {
    const experiment = QUALITY_EXPERIMENTS.epochs;
    const tasks = buildQualityTasks(plan('epochs', 2));
    const trial = (taskId: number, accuracy: number): QualityTrial => ({
      taskId,
      checkpoints: [
        { epoch: 10, accuracy: accuracy / 2, error: 0.2, trainMs: 5 },
        { epoch: 25, accuracy, error: 0.1, trainMs: 12 },
      ],
    });
    // Завдання 0 і 5 мають ту саму швидкість навчання в різних повторах
    const cells = aggregateQuality(experiment, tasks, [trial(0, 0.8), trial(5, 0.9)]);
    expect(cells.map((cell) => [cell.series, cell.x, cell.accuracy.count])).toEqual([
      ['0.01', 10, 2],
      ['0.01', 25, 2],
    ]);
    expect(cells[1]?.accuracy.mean).toBeCloseTo(0.85, 10);
    expect(cells[1]?.work).toBe(trainingWork(25, 900, fixed.hiddenNeurons));
  });
});

describe('judgeQuality', () => {
  const cell = (x: number, accuracies: number[], work: number): QualityCell => ({
    series: 'all',
    x,
    accuracy: summarize(accuracies),
    error: summarize(accuracies.map(() => 0.1)),
    trainMs: summarize(accuracies.map(() => 10)),
    work,
  });

  it('обирає найточніший варіант і найдешевший серед рівноцінних йому', () => {
    const cells = [cell(1, [0.7, 0.72, 0.71], 10), cell(2, [0.94, 0.95, 0.96], 20), cell(3, [0.95, 0.96, 0.97], 40)];
    const verdict = judgeQuality(cells, 3, 900);
    expect(verdict?.best.x).toBe(3);
    // Найгірший запуск найкращого дав 0,95, а середнє варіанта 2 саме 0,95
    expect(verdict?.threshold).toBeCloseTo(0.95, 10);
    expect(verdict?.cheapest.x).toBe(2);
  });

  it('вважає рівноцінними щонайменше різницю в одну тестову послідовність', () => {
    const cells = [cell(1, [0.9, 0.9], 10), cell(2, [0.9 + 1 / 900, 0.9 + 1 / 900], 20)];
    expect(judgeQuality(cells, 2, 900)?.cheapest.x).toBe(1);
  });

  it('не враховує точки, де ще не завершилися всі повтори', () => {
    const cells = [cell(1, [0.99], 10), cell(2, [0.9, 0.91], 20)];
    expect(judgeQuality(cells, 2, 900)?.best.x).toBe(2);
    expect(judgeQuality([cell(1, [0.99], 10)], 2, 900)).toBeNull();
  });
});

describe('trainingSetOf', () => {
  it('перемішує класи, але зберігає склад набору і відтворюється за seed', () => {
    const config = { perClass: 100, profiles: ['clean', 'noisy', 'border'] as const, tolerance: 3, seed: 5 };
    const set = trainingSetOf(config);
    expect(set).toEqual(trainingSetOf(config));
    expect(new Set(set.slice(0, 30).map((sequence) => sequence.label)).size).toBeGreaterThan(1);
    expect(countByClass(set)).toEqual({ bradycardia: 100, normal: 100, tachycardia: 100 });
  });
});
