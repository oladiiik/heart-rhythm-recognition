import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES } from '../domain/generator';
import { countByClass } from '../domain/metrics';
import { DEFAULT_TRAINING_CONFIG } from '../ml/model';
import {
  EPOCH_CHECKPOINTS,
  QUALITY_EXPERIMENTS,
  aggregateQuality,
  buildQualityTasks,
  EQUIVALENCE_MARGIN,
  isEquivalent,
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
  profiles: DEFAULT_PROFILES,
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

  it('навчає досліди епох і шару на заданих профілях, а дослід набору перебирає профілі сам', () => {
    const clean = { ...fixed, profiles: ['clean'] as const };
    expect(buildQualityTasks({ ...plan('hidden'), fixed: clean })[0]?.train.profiles).toEqual(['clean']);
    expect(new Set(buildQualityTasks({ ...plan('dataset'), fixed: clean }).map((t) => t.train.profiles.length))).toEqual(
      new Set([1, 3]),
    );
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
    expect(validateQualityPlan({ ...plan('hidden'), fixed: { ...fixed, profiles: [] } })).not.toBeNull();
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
        { epoch: 10, accuracy: accuracy / 2, testAccuracy: accuracy / 2, error: 0.2, trainMs: 5 },
        { epoch: 25, accuracy, testAccuracy: accuracy - 0.01, error: 0.1, trainMs: 12 },
      ],
    });
    // Завдання 0 і 5 мають ту саму швидкість навчання в різних повторах
    const cells = aggregateQuality(experiment, tasks, [trial(0, 0.8), trial(5, 0.9)]);
    expect(cells.map((cell) => [cell.series, cell.x, cell.accuracy.count])).toEqual([
      ['0.01', 10, 2],
      ['0.01', 25, 2],
    ]);
    expect(cells[1]?.accuracy.mean).toBeCloseTo(0.85, 10);
    expect(cells[1]?.testAccuracy.mean).toBeCloseTo(0.84, 10);
    expect(cells[1]?.work).toBe(trainingWork(25, 900, fixed.hiddenNeurons));
    expect(cells[1]?.runs.map((run) => [run.repeat, run.accuracy])).toEqual([
      [0, 0.8],
      [1, 0.9],
    ]);
  });
});

describe('judgeQuality', () => {
  const cell = (x: number, accuracies: number[], work: number, series = 'all'): QualityCell => ({
    series,
    x,
    accuracy: summarize(accuracies),
    testAccuracy: summarize(accuracies),
    error: summarize(accuracies.map(() => 0.1)),
    trainMs: summarize(accuracies.map(() => 10)),
    work,
    runs: accuracies.map((accuracy, repeat) => ({ repeat, accuracy, testAccuracy: accuracy })),
  });
  const xs = (cells: readonly QualityCell[] | undefined) => cells?.map((c) => c.x);

  it('порівнює з найкращою попарно: стала різниця в межах запасу рівноцінна навіть за великого розкиду повторів', () => {
    const best = [0.9, 0.95, 0.97];
    const cells = [cell(1, best.map((a) => a - 0.002), 10), cell(2, best, 20)];
    const verdict = judgeQuality(cells, 3);
    expect(verdict?.best.x).toBe(2);
    expect(xs(verdict?.equivalent)).toEqual([1, 2]);
    expect(verdict?.comparisons[0]?.upperBound).toBeCloseTo(0.002, 10);
    expect(verdict?.margin).toBe(EQUIVALENCE_MARGIN);
  });

  it('не вважає рівноцінним варіант, який поступається більш ніж на запас', () => {
    const best = [0.95, 0.96, 0.97];
    const cells = [cell(1, best.map((a) => a - EQUIVALENCE_MARGIN - 0.001), 10), cell(2, best, 20)];
    expect(xs(judgeQuality(cells, 3)?.equivalent)).toEqual([2]);
    expect(isEquivalent(judgeQuality(cells, 3), { series: 'all', x: 1 })).toBe(false);
  });

  it('не вважає рівноцінним варіант із малою середньою різницею, але нестійкою від повтору до повтору', () => {
    const best = [0.95, 0.96, 0.97];
    const cells = [cell(1, [0.95, 0.96 - 0.02, 0.97 + 0.015], 10), cell(2, best, 20)];
    expect(xs(judgeQuality(cells, 3)?.equivalent)).toEqual([2]);
  });

  it('рекомендує найдешевшу рівноцінну точку на плато, а не на краю', () => {
    const best = [0.95, 0.96, 0.97];
    const near = best.map((a) => a - 0.001);
    const far = best.map((a) => a - 0.02);
    // x = 1 рівноцінна, але її дорожчий сусід x = 2 ні: край; з x = 3 рівноцінні всі дорожчі
    const cells = [cell(1, near, 10), cell(2, far, 20), cell(3, near, 30), cell(4, near, 40), cell(5, best, 50)];
    const verdict = judgeQuality(cells, 3);
    expect(verdict?.cheapest.x).toBe(1);
    expect(verdict?.recommended.x).toBe(3);
  });

  it('за однакових обчислень рекомендує варіант із меншим розкидом повторів', () => {
    const best = [0.95, 0.96, 0.97];
    const cells = [
      cell(1, [0.953, 0.96, 0.967], 10, 'steady'),
      cell(2, best, 20, 'steady'),
      cell(1, [0.948, 0.96, 0.972], 10, 'shaky'),
      cell(2, best, 20, 'shaky'),
    ];
    expect(judgeQuality(cells, 3)?.recommended.series).toBe('steady');
  });

  it('не враховує точки, де ще не завершилися всі повтори', () => {
    const cells = [cell(1, [0.99], 10), cell(2, [0.9, 0.91], 20)];
    expect(judgeQuality(cells, 2)?.best.x).toBe(2);
    expect(judgeQuality([cell(1, [0.99], 10)], 2)).toBeNull();
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
