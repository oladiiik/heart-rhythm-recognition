import { useEffect, useRef, useState } from 'react';
import { CLASS_LABELS, WINDOW_SIZE, mostLikelyClass, type RhythmClass } from '../../domain/rhythm';
import { MAX_INPUT_BPM, MIN_INPUT_BPM } from '../../domain/slidingWindow';
import { fileTimestamp, saveText } from '../../export/fileSave';
import { useApp } from '../../state/appStore';
import { BluetoothHeartRateSource, isBluetoothSupported, isChooserCancelled } from '../../watch/bluetoothSource';
import {
  sampleToBeats,
  type HeartRateSample,
  type HeartRateSource,
  type HeartRateSourceKind,
} from '../../watch/heartRateSource';
import { SimulatedHeartRateSource } from '../../watch/simulatedSource';
import { ClassDot, ClassLegend } from '../charts/ClassViews';
import { LIVE_CHART_CAPACITY, LiveChart, type LiveBeat } from '../charts/LiveChart';
import { FormError, Placeholder } from '../components/Field';
import { SaveImageControl } from '../components/SaveImageControl';
import { Segmented, type SegmentOption } from '../components/Segmented';
import { formatDuration, formatPercent } from '../../format';

interface SessionBeat extends LiveBeat {
  readonly confidence: number | null;
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected';

const MAX_SESSION_BEATS = 5000;

const SOURCES: readonly SegmentOption<HeartRateSourceKind>[] = [
  { value: 'bluetooth', label: 'Годинник' },
  { value: 'simulator', label: 'Симулятор' },
];

function createSource(kind: HeartRateSourceKind): HeartRateSource {
  return kind === 'bluetooth' ? new BluetoothHeartRateSource() : new SimulatedHeartRateSource();
}

function sessionToCsv(beats: readonly SessionBeat[]): string {
  const rows = beats.map((beat) =>
    [new Date(beat.at).toISOString(), beat.bpm, beat.label ?? '', beat.confidence?.toFixed(4) ?? ''].join(','),
  );
  return ['time,bpm,class,confidence', ...rows].join('\n') + '\n';
}

export function WatchTab() {
  const { model, log } = useApp();
  const bluetoothSupported = isBluetoothSupported();

  const [kind, setKind] = useState<HeartRateSourceKind>(bluetoothSupported ? 'bluetooth' : 'simulator');
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [beats, setBeats] = useState<readonly SessionBeat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<{ readonly number: number; readonly total: number } | null>(null);

  const source = useRef<HeartRateSource | null>(null);
  const beatsRef = useRef<readonly SessionBeat[]>([]);
  const lastLabel = useRef<RhythmClass | null>(null);
  const payloadLogged = useRef(false);
  const modelRef = useRef(model);
  modelRef.current = model;
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => () => source.current?.disconnect(), []);

  const handleSample = (sample: HeartRateSample): void => {
    if (!payloadLogged.current) {
      payloadLogged.current = true;
      log(
        'info',
        sample.rrIntervalsMs.length > 0
          ? 'Пристрій передає RR-інтервали: частота рахується для кожного окремого удару.'
          : 'Пристрій передає усереднений пульс без RR-інтервалів, приблизно раз на секунду.',
      );
    }
    const next = beatsRef.current.slice();
    sampleToBeats(sample).forEach((bpm, index) => {
      // Нуль і завеликі значення годинник надсилає, коли втрачає контакт зі шкірою
      if (bpm < MIN_INPUT_BPM || bpm > MAX_INPUT_BPM) return;
      const window = [...next.slice(-(WINDOW_SIZE - 1)).map((beat) => beat.bpm), bpm];
      let label: RhythmClass | null = null;
      let confidence: number | null = null;
      if (modelRef.current && window.length === WINDOW_SIZE) {
        const probabilities = modelRef.current.model.classifyWindow(window);
        label = mostLikelyClass(probabilities);
        confidence = probabilities[label];
        if (label !== lastLabel.current) {
          log(
            'info',
            `Годинник: ритм за останніми ${WINDOW_SIZE} значеннями [${window.join(', ')}]: ` +
              `${CLASS_LABELS[label]}, впевненість ${formatPercent(confidence)}.`,
          );
          lastLabel.current = label;
        }
      }
      next.push({ bpm, at: sample.receivedAt + index, label, confidence });
    });
    beatsRef.current = next.slice(-MAX_SESSION_BEATS);
    setBeats(beatsRef.current);
  };

  const finishSession = (): void => {
    source.current = null;
    lastLabel.current = null;
    payloadLogged.current = false;
    setStatus('idle');
    setDeviceName(null);
  };

  const connect = async (): Promise<void> => {
    setError(null);
    setStatus('connecting');
    const next = createSource(kind);
    try {
      const name = await next.connect({
        onAttempt: (number, total) => {
          setAttempt({ number, total });
          if (number > 1) log('info', `Пристрій розірвав зв’язок під час підключення; спроба ${number} з ${total}.`);
        },
        onSample: handleSample,
        onDisconnected: () => {
          finishSession();
          setError('З’єднання з пристроєм розірвано. Перевірте, чи годинник поруч, і підключіться знову.');
          log('warning', 'Пристрій пульсу від’єднався.');
        },
      });
      source.current = next;
      setDeviceName(name);
      setStatus('connected');
      log('success', `Підключено джерело пульсу: ${name}.`);
    } catch (cause) {
      next.disconnect();
      setStatus('idle');
      if (isChooserCancelled(cause)) {
        log('info', 'Вибір пристрою скасовано.');
        return;
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      const reason =
        cause instanceof Error && cause.cause instanceof Error ? ` Відповідь браузера: ${cause.cause.message}` : '';
      setError(`Не вдалося підключитися. ${message}`);
      log('error', `Не вдалося підключити джерело пульсу. ${message}${reason}`);
    } finally {
      setAttempt(null);
    }
  };

  const disconnect = (): void => {
    source.current?.disconnect();
    finishSession();
    log('info', `Джерело пульсу від’єднано; за сесію отримано ${beatsRef.current.length} значень.`);
  };

  const clearSession = (): void => {
    beatsRef.current = [];
    lastLabel.current = null;
    setBeats([]);
  };

  const saveSession = (): void => {
    const fileName = `watch-session_${fileTimestamp()}.csv`;
    saveText(sessionToCsv(beats), fileName, 'text/csv');
    log('success', `Сесію збережено у файл ${fileName} (${beats.length} значень).`);
  };

  const last = beats.at(-1);
  const first = beats[0];
  const bluetoothUnavailable = kind === 'bluetooth' && !bluetoothSupported;
  const connectionText =
    status === 'connected'
      ? `Підключено: ${deviceName}`
      : attempt && attempt.number > 1
        ? `Підключення… спроба ${attempt.number} з ${attempt.total}`
        : 'Підключення…';

  return (
    <div className="tab-layout">
      <aside className="side" aria-label="Джерело пульсу">
        <Segmented
          label="Джерело пульсу"
          name="heart-rate-source"
          value={kind}
          options={SOURCES}
          onChange={setKind}
          disabled={status !== 'idle'}
        />

        {status === 'connected' ? (
          <button type="button" className="button button-stop" onClick={disconnect}>
            Від’єднати
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            disabled={status === 'connecting' || bluetoothUnavailable}
            onClick={() => void connect()}
          >
            Підключити
          </button>
        )}
        {status !== 'idle' && (
          <p className="connection" role="status">
            <span className={status === 'connected' ? 'connection-dot connection-dot-on' : 'connection-dot'} />
            {connectionText}
          </p>
        )}
        {status === 'connecting' && kind === 'bluetooth' && (
          <p className="notice" role="status">
            Якщо годинник запитує про з’єднання, підтвердьте його. Екран Connected Fitness має лишатися відкритим.
          </p>
        )}
        {bluetoothUnavailable && (
          <p className="notice" role="status">
            Цей браузер не підтримує Web Bluetooth. Відкрийте застосунок у Chrome або Edge чи оберіть симулятор.
          </p>
        )}
        <FormError message={error} />

        <div className="side-group">
          <span className="side-label">Сесія</span>
          <div className="button-row">
            <button type="button" className="button" disabled={beats.length === 0} onClick={saveSession}>
              Зберегти сесію (CSV)
            </button>
            <button type="button" className="button" disabled={beats.length === 0} onClick={clearSession}>
              Очистити
            </button>
          </div>
        </div>
      </aside>

      <section className="content" aria-label="Пульс у реальному часі">
        {!last || !first ? (
          <Placeholder title="Даних ще немає">
            Після підключення тут з’являться поточний пульс, клас ритму за останніми {WINDOW_SIZE} значеннями та графік.
          </Placeholder>
        ) : (
          <>
            <dl className="facts">
              <div className="fact fact-primary">
                <dt>Пульс</dt>
                <dd>
                  {last.bpm} <span className="fact-unit">уд/хв</span>
                </dd>
              </div>
              <div className="fact">
                <dt>Ритм за останніми {WINDOW_SIZE} значеннями</dt>
                <dd>
                  {last.label && last.confidence !== null ? (
                    <>
                      <ClassDot rhythm={last.label} />
                      {CLASS_LABELS[last.label]}
                      <span className="fact-unit">{formatPercent(last.confidence)}</span>
                    </>
                  ) : (
                    <span className="fact-unit fact-unit-only">
                      {model ? `ще ${Math.max(1, WINDOW_SIZE - beats.length)} значень` : 'потрібна навчена модель'}
                    </span>
                  )}
                </dd>
              </div>
              <div className="fact">
                <dt>Отримано значень</dt>
                <dd>
                  {beats.length} <span className="fact-unit">за {formatDuration(last.at - first.at)}</span>
                </dd>
              </div>
            </dl>

            <div className="figure-block">
              <LiveChart beats={beats.slice(-LIVE_CHART_CAPACITY)} svgRef={chartRef} />
              <div className="figure-footer">
                <ClassLegend />
                <SaveImageControl svgRef={chartRef} baseName="watch" subject="графік пульсу" />
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
