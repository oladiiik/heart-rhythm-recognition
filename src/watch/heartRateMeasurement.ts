export interface HeartRateMeasurement {
  readonly bpm: number;
  readonly rrIntervalsMs: number[];
  readonly sensorContact: boolean | null;
}

const FLAG_UINT16_RATE = 0x01;
const FLAG_CONTACT_DETECTED = 0x02;
const FLAG_CONTACT_SUPPORTED = 0x04;
const FLAG_ENERGY_EXPENDED = 0x08;
const FLAG_RR_INTERVALS = 0x10;

/** RR-інтервали передаються в одиницях 1/1024 секунди */
const RR_UNITS_PER_SECOND = 1024;

/**
 * Розбір характеристики Heart Rate Measurement (0x2A37) стандартного
 * Bluetooth-профілю пульсу: байт прапорців, частота, необов'язкові поля
 */
export function parseHeartRateMeasurement(data: DataView): HeartRateMeasurement {
  if (data.byteLength < 2) {
    throw new Error('Пакет пульсу закороткий.');
  }
  const flags = data.getUint8(0);
  let offset = 1;

  let bpm: number;
  if (flags & FLAG_UINT16_RATE) {
    bpm = data.getUint16(offset, true);
    offset += 2;
  } else {
    bpm = data.getUint8(offset);
    offset += 1;
  }

  if (flags & FLAG_ENERGY_EXPENDED) offset += 2;

  const rrIntervalsMs: number[] = [];
  if (flags & FLAG_RR_INTERVALS) {
    for (; offset + 2 <= data.byteLength; offset += 2) {
      rrIntervalsMs.push((data.getUint16(offset, true) / RR_UNITS_PER_SECOND) * 1000);
    }
  }

  const sensorContact = flags & FLAG_CONTACT_SUPPORTED ? (flags & FLAG_CONTACT_DETECTED) !== 0 : null;
  return { bpm, rrIntervalsMs, sensorContact };
}
