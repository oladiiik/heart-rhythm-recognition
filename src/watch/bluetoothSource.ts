import { parseHeartRateMeasurement } from './heartRateMeasurement';
import type { HeartRateListener, HeartRateSource } from './heartRateSource';

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function isChooserCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

/**
 * Зв'язок обірвався, поки з'єднання ще налаштовувалося. Так браузер повідомляє і про невдале
 * з'єднання, і про розрив під час пошуку сервісу («GATT Server is disconnected»)
 */
function isLinkDropped(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NetworkError';
}

export const CONNECT_ATTEMPTS = 6;
/** Пауза між спробами: за цей час користувач встигає підтвердити з'єднання на годиннику */
const RETRY_PAUSE_MS = 2500;

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Пристрій зі стандартним Bluetooth-профілем пульсу. Pixel Watch транслює його
 * в режимі Connected Fitness, тому окремий застосунок на годиннику не потрібен.
 *
 * Годинник приймає нове з'єднання не одразу: спершу показує запит на підтвердження, а доки
 * користувач не відповів, розриває зв'язок. Тому з'єднання встановлюється кількома спробами
 */
export class BluetoothHeartRateSource implements HeartRateSource {
  readonly kind = 'bluetooth';

  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private listener: HeartRateListener | null = null;

  constructor(private readonly retryPauseMs: number = RETRY_PAUSE_MS) {}

  async connect(listener: HeartRateListener): Promise<string> {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    const server = device.gatt;
    if (!server) {
      throw new Error('Пристрій не підтримує з’єднання GATT.');
    }
    this.device = device;
    this.listener = listener;

    try {
      this.characteristic = await this.subscribe(device, server, listener);
    } catch (error) {
      this.disconnect();
      throw error;
    }
    // Лише відтепер розрив означає кінець сесії: доти його обробляли повторні спроби
    device.addEventListener('gattserverdisconnected', this.handleDisconnected);
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

  private async subscribe(
    device: BluetoothDevice,
    server: BluetoothRemoteGATTServer,
    listener: HeartRateListener,
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    let lastDrop: unknown = null;
    for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
      if (attempt > 1) await pause(this.retryPauseMs);
      if (this.device !== device) throw new Error('Підключення скасовано.');
      listener.onAttempt(attempt, CONNECT_ATTEMPTS);
      try {
        await server.connect();
        const service = await server.getPrimaryService('heart_rate');
        const characteristic = await service.getCharacteristic('heart_rate_measurement');
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', this.handleValue);
        return characteristic;
      } catch (error) {
        if (!isLinkDropped(error)) throw error;
        lastDrop = error;
      }
    }
    throw new Error(
      `Пристрій ${CONNECT_ATTEMPTS} разів поспіль розірвав зв’язок одразу після з’єднання. ` +
        'Якщо годинник уже є серед пристроїв Bluetooth у Windows, вилучіть його звідти: стара пара заважає новому ' +
        'з’єднанню. Потім відкрийте на годиннику Connected Fitness, підключіться знову й підтвердьте запит на годиннику.',
      { cause: lastDrop },
    );
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
