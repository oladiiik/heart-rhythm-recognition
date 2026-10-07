import { describe, expect, it } from 'vitest';
import { parseHeartRateMeasurement } from './heartRateMeasurement';
import { sampleToBeats } from './heartRateSource';
import { SimulatedHeartRateSource } from './simulatedSource';

const packet = (...bytes: number[]): DataView => new DataView(new Uint8Array(bytes).buffer);

describe('parseHeartRateMeasurement', () => {
  it('читає однобайтову частоту без додаткових полів', () => {
    expect(parseHeartRateMeasurement(packet(0x00, 72))).toEqual({ bpm: 72, rrIntervalsMs: [], sensorContact: null });
  });

  it('читає двобайтову частоту', () => {
    expect(parseHeartRateMeasurement(packet(0x01, 0x2c, 0x01)).bpm).toBe(300);
  });

  it('читає RR-інтервали в одиницях 1/1024 с', () => {
    // 1024 одиниці = 1000 мс, 512 одиниць = 500 мс
    const measurement = parseHeartRateMeasurement(packet(0x10, 60, 0x00, 0x04, 0x00, 0x02));
    expect(measurement.rrIntervalsMs).toEqual([1000, 500]);
  });

  it('пропускає поле витраченої енергії перед RR-інтервалами', () => {
    const measurement = parseHeartRateMeasurement(packet(0x18, 60, 0xff, 0xff, 0x00, 0x04));
    expect(measurement.rrIntervalsMs).toEqual([1000]);
  });

  it('повідомляє про контакт сенсора зі шкірою', () => {
    expect(parseHeartRateMeasurement(packet(0x06, 70)).sensorContact).toBe(true);
    expect(parseHeartRateMeasurement(packet(0x04, 70)).sensorContact).toBe(false);
  });

  it('відхиляє закороткий пакет', () => {
    expect(() => parseHeartRateMeasurement(packet(0x00))).toThrow(/закороткий/);
  });
});

describe('sampleToBeats', () => {
  it('перетворює RR-інтервали на миттєву частоту кожного удару', () => {
    expect(sampleToBeats({ bpm: 70, rrIntervalsMs: [1000, 500], receivedAt: 0 })).toEqual([60, 120]);
  });

  it('без RR-інтервалів бере частоту пристрою', () => {
    expect(sampleToBeats({ bpm: 70, rrIntervalsMs: [], receivedAt: 0 })).toEqual([70]);
  });
});

describe('SimulatedHeartRateSource', () => {
  it('проходить через повільний, нормальний і швидкий ритм у правдоподібних межах', () => {
    const source = new SimulatedHeartRateSource(1000, 7);
    const values = Array.from({ length: 96 }, () => source.nextBpm());
    expect(Math.min(...values)).toBeGreaterThan(40);
    expect(Math.max(...values)).toBeLessThan(135);
    expect(values.some((bpm) => bpm < 58)).toBe(true);
    expect(values.some((bpm) => bpm > 105)).toBe(true);
  });

  it('відтворюється за тим самим seed', () => {
    const first = new SimulatedHeartRateSource(1000, 3);
    const second = new SimulatedHeartRateSource(1000, 3);
    expect(Array.from({ length: 20 }, () => first.nextBpm())).toEqual(
      Array.from({ length: 20 }, () => second.nextBpm()),
    );
  });
});
