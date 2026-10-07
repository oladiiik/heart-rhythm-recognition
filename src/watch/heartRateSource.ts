export interface HeartRateSample {
  readonly bpm: number;
  readonly rrIntervalsMs: readonly number[];
  readonly receivedAt: number;
}

export interface HeartRateListener {
  onSample(sample: HeartRateSample): void;
  onDisconnected(): void;
}

export type HeartRateSourceKind = 'bluetooth' | 'simulator';

export interface HeartRateSource {
  readonly kind: HeartRateSourceKind;
  connect(listener: HeartRateListener): Promise<string>;
  disconnect(): void;
}

export function sampleToBeats(sample: HeartRateSample): number[] {
  if (sample.rrIntervalsMs.length > 0) {
    return sample.rrIntervalsMs.map((interval) => Math.round(60000 / interval));
  }
  return [sample.bpm];
}
