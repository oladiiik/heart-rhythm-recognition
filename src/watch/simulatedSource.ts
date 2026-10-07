import { createRandom, randomInt, type Random } from '../domain/random';
import type { HeartRateListener, HeartRateSource } from './heartRateSource';

interface Phase {
  readonly targetBpm: number;
  readonly samples: number;
}

const SCENARIO: readonly Phase[] = [
  { targetBpm: 72, samples: 10 },
  { targetBpm: 122, samples: 14 },
  { targetBpm: 82, samples: 10 },
  { targetBpm: 50, samples: 14 },
];

const START_BPM = 72;
const APPROACH_RATE = 0.35;
const JITTER_BPM = 2;

export class SimulatedHeartRateSource implements HeartRateSource {
  readonly kind = 'simulator';

  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly random: Random;
  private current = START_BPM;
  private phaseIndex = 0;
  private samplesInPhase = 0;

  constructor(
    private readonly intervalMs: number = 1000,
    seed: number = 7,
  ) {
    this.random = createRandom(seed);
  }

  connect(listener: HeartRateListener): Promise<string> {
    this.disconnect();
    this.timer = setInterval(() => {
      listener.onSample({ bpm: this.nextBpm(), rrIntervalsMs: [], receivedAt: Date.now() });
    }, this.intervalMs);
    return Promise.resolve('Симулятор пульсу');
  }

  disconnect(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  nextBpm(): number {
    const phase = SCENARIO[this.phaseIndex] as Phase;
    this.current += (phase.targetBpm - this.current) * APPROACH_RATE;
    this.samplesInPhase++;
    if (this.samplesInPhase >= phase.samples) {
      this.samplesInPhase = 0;
      this.phaseIndex = (this.phaseIndex + 1) % SCENARIO.length;
    }
    return Math.round(this.current) + randomInt(this.random, -JITTER_BPM, JITTER_BPM);
  }
}
