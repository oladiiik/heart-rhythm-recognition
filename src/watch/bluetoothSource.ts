import { parseHeartRateMeasurement } from './heartRateMeasurement';
import type { HeartRateListener, HeartRateSource } from './heartRateSource';

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function isChooserCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

/**
 * Пристрій зі стандартним Bluetooth-профілем пульсу. Pixel Watch транслює його
 * в режимі Connected Fitness, тому окремий застосунок на годиннику не потрібен
 */
export class BluetoothHeartRateSource implements HeartRateSource {
  readonly kind = 'bluetooth';

  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private listener: HeartRateListener | null = null;

  async connect(listener: HeartRateListener): Promise<string> {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    if (!device.gatt) {
      throw new Error('Пристрій не підтримує з’єднання GATT.');
    }
    this.device = device;
    this.listener = listener;
    device.addEventListener('gattserverdisconnected', this.handleDisconnected);

    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      characteristic.addEventListener('characteristicvaluechanged', this.handleValue);
      await characteristic.startNotifications();
      this.characteristic = characteristic;
    } catch (error) {
      this.disconnect();
      throw error;
    }
    return device.name ?? 'Пристрій без назви';
  }

  disconnect(): void {
    this.characteristic?.removeEventListener('characteristicvaluechanged', this.handleValue);
    this.device?.removeEventListener('gattserverdisconnected', this.handleDisconnected);
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.characteristic = null;
    this.device = null;
    this.listener = null;
  }

  private readonly handleValue = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value || !this.listener) return;
    const measurement = parseHeartRateMeasurement(value);
    this.listener.onSample({
      bpm: measurement.bpm,
      rrIntervalsMs: measurement.rrIntervalsMs,
      receivedAt: Date.now(),
    });
  };

  private readonly handleDisconnected = (): void => {
    const listener = this.listener;
    this.disconnect();
    listener?.onDisconnected();
  };
}
