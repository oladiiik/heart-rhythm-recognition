import { afterEach, describe, expect, it, vi } from 'vitest';
import { BluetoothHeartRateSource, CONNECT_ATTEMPTS } from './bluetoothSource';
import type { HeartRateListener } from './heartRateSource';

const linkDropped = () => new DOMException('GATT Server is disconnected.', 'NetworkError');

/** Несправжній пристрій: перші dropsBeforeSuccess спроб обриваються на пошуку сервісу */
function fakeDevice(dropsBeforeSuccess: number, failure: () => unknown = linkDropped) {
  let attempts = 0;
  const characteristic = Object.assign(new EventTarget(), {
    value: new DataView(new Uint8Array([0x00, 72]).buffer),
    startNotifications: vi.fn(async () => undefined),
  });
  const gatt = {
    connected: false,
    connect: vi.fn(async () => {
      attempts += 1;
      gatt.connected = true;
      return gatt;
    }),
    disconnect: vi.fn(() => {
      gatt.connected = false;
    }),
    getPrimaryService: vi.fn(async () => {
      if (attempts <= dropsBeforeSuccess) {
        gatt.connected = false;
        throw failure();
      }
      return { getCharacteristic: async () => characteristic };
    }),
  };
  const device = Object.assign(new EventTarget(), { name: 'Pixel Watch 4', gatt });
  vi.stubGlobal('navigator', { bluetooth: { requestDevice: async () => device } });
  return { device, gatt, characteristic };
}

function listenerSpy() {
  return { onAttempt: vi.fn(), onSample: vi.fn(), onDisconnected: vi.fn() } satisfies HeartRateListener;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BluetoothHeartRateSource', () => {
  it('підключається з першої спроби й передає вимірювання', async () => {
    const { characteristic } = fakeDevice(0);
    const listener = listenerSpy();

    await expect(new BluetoothHeartRateSource(0).connect(listener)).resolves.toBe('Pixel Watch 4');
    characteristic.dispatchEvent(new Event('characteristicvaluechanged'));

    expect(listener.onAttempt).toHaveBeenCalledTimes(1);
    expect(listener.onSample).toHaveBeenCalledWith(expect.objectContaining({ bpm: 72 }));
  });

  it('повторює спробу, коли пристрій розриває зв’язок під час підключення', async () => {
    const { gatt } = fakeDevice(2);
    const listener = listenerSpy();

    await expect(new BluetoothHeartRateSource(0).connect(listener)).resolves.toBe('Pixel Watch 4');

    expect(gatt.connect).toHaveBeenCalledTimes(3);
    expect(listener.onAttempt).toHaveBeenLastCalledWith(3, CONNECT_ATTEMPTS);
    expect(listener.onDisconnected).not.toHaveBeenCalled();
  });

  it('після вичерпання спроб пояснює, що робити, і зберігає відповідь браузера', async () => {
    const { gatt } = fakeDevice(Infinity);
    const listener = listenerSpy();

    const failure = await new BluetoothHeartRateSource(0).connect(listener).catch((error: unknown) => error);

    expect(gatt.connect).toHaveBeenCalledTimes(CONNECT_ATTEMPTS);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('Connected Fitness');
    expect((failure as Error).cause).toBeInstanceOf(DOMException);
    expect(listener.onDisconnected).not.toHaveBeenCalled();
  });

  it('не повторює спробу після помилки, яку повтор не виправить', async () => {
    const { gatt } = fakeDevice(Infinity, () => new DOMException('Origin is not allowed.', 'SecurityError'));

    await expect(new BluetoothHeartRateSource(0).connect(listenerSpy())).rejects.toThrow('Origin is not allowed.');
    expect(gatt.connect).toHaveBeenCalledTimes(1);
  });

  it('повідомляє про розрив зв’язку після успішного підключення', async () => {
    const { device } = fakeDevice(0);
    const listener = listenerSpy();
    await new BluetoothHeartRateSource(0).connect(listener);

    device.dispatchEvent(new Event('gattserverdisconnected'));

    expect(listener.onDisconnected).toHaveBeenCalledTimes(1);
  });
});
