import { describe, expect, it } from 'vitest';
import { fitLine, summarize } from './statistics';

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
