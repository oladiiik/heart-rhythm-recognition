import { describe, expect, it } from 'vitest';
import { fitLine, pairedDifference, studentT95, summarize } from './statistics';

describe('summarize', () => {
  it('рахує мінімум, максимум, середнє, медіану й вибіркове відхилення', () => {
    const summary = summarize([9, 2, 4, 4, 5, 4, 7, 5]);
    expect(summary).toMatchObject({ count: 8, min: 2, max: 9, mean: 5, median: 4.5 });
    expect(summary.std).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });

  it('для непарної кількості бере середнє значення як медіану', () => {
    expect(summarize([3, 1, 2]).median).toBe(2);
  });

  it('для одного значення дає нульове відхилення, для жодного відмовляє', () => {
    expect(summarize([7]).std).toBe(0);
    expect(() => summarize([])).toThrow();
  });
});

describe('fitLine', () => {
  it('точно відновлює пряму, якщо всі точки на ній', () => {
    const fit = fitLine([1, 2, 3, 4].map((x) => ({ x, y: 3 * x + 1 })));
    expect(fit.slope).toBeCloseTo(3, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
  });

  it('дає R² менше одиниці для точок, що відхиляються від прямої', () => {
    const fit = fitLine([1, 2, 3, 4, 5].map((x) => ({ x, y: x * x })));
    expect(fit.r2).toBeGreaterThan(0.9);
    expect(fit.r2).toBeLessThan(1);
  });

  it('відмовляє, якщо пряму не визначено', () => {
    expect(() => fitLine([{ x: 1, y: 1 }])).toThrow();
    expect(() =>
      fitLine([
        { x: 1, y: 1 },
        { x: 1, y: 2 },
      ]),
    ).toThrow();
  });
});

describe('pairedDifference', () => {
  it('рахує середню різницю пар і верхню межу однобічного інтервалу', () => {
    // Різниці пар 1, 2, 3: середнє 2, σ 1, стандартна похибка 1/√3, ступенів свободи 2
    const result = pairedDifference([11, 12, 13], [10, 10, 10]);
    expect(result.difference).toBeCloseTo(2, 10);
    expect(result.degreesOfFreedom).toBe(2);
    expect(result.upperBound).toBeCloseTo(2 + 2.92 / Math.sqrt(3), 10);
  });

  it('прибирає спільний для пари розкид: однакова різниця в кожній парі дає межу, рівну різниці', () => {
    expect(pairedDifference([0.9, 0.95, 0.97], [0.89, 0.94, 0.96]).upperBound).toBeCloseTo(0.01, 10);
  });

  it('відмовляє для вибірок різної довжини або однієї пари', () => {
    expect(() => pairedDifference([1, 2], [1])).toThrow();
    expect(() => pairedDifference([1], [1])).toThrow();
  });
});

describe('studentT95', () => {
  it('округлює ступені свободи вниз і для великих бере нормальний розподіл', () => {
    expect(studentT95(9.5)).toBe(1.833);
    expect(studentT95(500)).toBe(1.645);
  });
});
