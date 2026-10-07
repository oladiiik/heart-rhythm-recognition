export const NORMALIZATION_MIN_BPM = 30;
export const NORMALIZATION_MAX_BPM = 160;

export function normalizeBpm(bpm: number): number {
  const scaled = (bpm - NORMALIZATION_MIN_BPM) / (NORMALIZATION_MAX_BPM - NORMALIZATION_MIN_BPM);
  return Math.min(1, Math.max(0, scaled));
}

export function normalizeSequence(values: readonly number[]): number[] {
  return values.map(normalizeBpm);
}
