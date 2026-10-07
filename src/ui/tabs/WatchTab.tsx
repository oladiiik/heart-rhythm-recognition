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
import { formatDuration, formatPercent } from '../../format';

interface SessionBeat extends LiveBeat {
  readonly confidence: number | null;
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected';

const MAX_SESSION_BEATS = 5000;

const SOURCE_LABELS: Record<HeartRateSourceKind, string> = {
  bluetooth: 'Pixel Watch (Bluetooth)',
  simulator: 'Симулятор пульсу',
};

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
  const [usesIntervals, setUsesIntervals] = useState<boolean | null>(null);
  const [beats, setBeats] = useState<readonly SessionBeat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<{ readonly number: number; readonly total: number } | null>(null);

  const source = useRef<HeartRateSource | null>(null);
  const beatsRef = useRef<readonly SessionBeat[]>([]);
  const lastLabel = useRef<RhythmClass | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => () => source.current?.disconnect(), []);

  const handleSample = (sample: HeartRateSample): void => {
    setUsesIntervals(sample.rrIntervalsMs.length > 0);
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
            `Годинник: ритм за останніми ${WINDOW_SIZE} значеннями [${window.join(', ')}] — ` +
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
    setUsesIntervals(null);
  };

  const saveSession = (): void => {
    const fileName = `watch-session_${fileTimestamp()}.csv`;
    saveText(sessionToCsv(beats), fileName, 'text/csv');
    log('success', `Сесію збережено у файл ${fileName} (${beats.length} значень).`);
  };

  const last = beats.at(-1);
  const first = beats[0];
  const busy = status !== 'idle';
  const bluetoothUnavailable = kind === 'bluetooth' && !bluetoothSupported;

  return (
    <div className="tab-layout">
      <section className="panel controls" aria-labelledby="watch-controls-title">
        <h2 id="watch-controls-title">Джерело пульсу</h2>

        <fieldset className="field">
          <legend>Звідки брати пульс</legend>
          {(Object.keys(SOURCE_LABELS) as HeartRateSourceKind[]).map((option) => (
            <label className="check" key={option}>
              <input
                type="radio"
                name="heart-rate-source"
                checked={kind === option}
                disabled={busy}
                onChange={() => setKind(option)}
              />
              <span>
                <strong>{SOURCE_LABELS[option]}</strong>
                {option === 'bluetooth'
                  ? ' — справжній пульс із годинника на руці'
                  : ' — несправжні дані за сценарієм: спокій, навантаження, відновлення, повільний ритм'}
              </span>
            </label>
          ))}
        </fieldset>

        {kind === 'bluetooth' && (
          <ol className="steps">
            <li>
              На годиннику проведіть униз від циферблата, відкрийте <strong>Connected Fitness</strong> і натисніть{' '}
              <strong>Connect</strong>. Першого разу увімкніть <strong>Wider device access</strong>. Не закривайте цей
              екран, доки триває підключення.
            </li>
            <li>Натисніть «Підключити» нижче й оберіть годинник у вікні браузера.</li>
            <li>
              Підтвердьте пристрій на годиннику. Якщо Windows покаже сповіщення про створення пари або попросить PIN,
              погодьтеся. Зв’язок може встановитися не з першої спроби — застосунок повторює її сам.
            </li>
          </ol>
        )}
        {bluetoothUnavailable && (
          <p className="notice" role="status">
            Цей браузер не підтримує Web Bluetooth. Відкрийте застосунок у Chrome або Edge на комп’ютері з Bluetooth чи
            оберіть симулятор.
          </p>
        )}

        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            disabled={busy || bluetoothUnavailable}
            onClick={() => void connect()}
          >
            {status === 'connecting' ? 'Підключення…' : 'Підключити'}
          </button>
          <button type="button" className="button" disabled={status !== 'connected'} onClick={disconnect}>
            Від’єднати
          </button>
        </div>
        <p className="connection" role="status">
          <span className={status === 'connected' ? 'connection-dot connection-dot-on' : 'connection-dot'} />
          {status === 'connected'
            ? `Підключено: ${deviceName}`
            : status === 'connecting'
              ? attempt && attempt.number > 1
                ? `Підключення… спроба ${attempt.number} з ${attempt.total}`
                : 'Підключення…'
              : 'Не підключено'}
        </p>
        {status === 'connecting' && kind === 'bluetooth' && (
          <p className="notice" role="status">
            Подивіться на годинник: якщо він запитує про з’єднання, підтвердьте його. Екран Connected Fitness має
            лишатися відкритим.
          </p>
        )}
        <FormError message={error} />
        {!model && (
          <p className="field-hint">
            Моделі ще немає: пульс відображатиметься, але клас ритму з’явиться після навчання мережі.
          </p>
        )}

        <hr />

        <div className="button-row">
          <button type="button" className="button" disabled={beats.length === 0} onClick={saveSession}>
            Зберегти сесію (CSV)
          </button>
          <button type="button" className="button" disabled={beats.length === 0} onClick={clearSession}>
            Очистити сесію
          </button>
        </div>
      </section>

      <section className="panel results" aria-labelledby="watch-results-title">
        <header className="panel-header">
          <h2 id="watch-results-title">Пульс у реальному часі</h2>
        </header>

        {!last || !first ? (
          <Placeholder title="Даних ще немає">
            Після підключення тут з’являться поточний пульс, графік останніх {LIVE_CHART_CAPACITY} значень і клас ритму,
            який мережа визначає за кожними {WINDOW_SIZE} останніми значеннями.
          </Placeholder>
        ) : (
          <>
            <div className="stats">
              <div className="stat">
                <div className="stat-label">Поточний пульс</div>
                <div className="stat-value stat-value-hero">{last.bpm}</div>
                <div className="stat-note">уд/хв</div>
              </div>
              <div className="stat">
                <div className="stat-label">Ритм за останніми {WINDOW_SIZE} значеннями</div>
                {last.label && last.confidence !== null ? (
                  <>
                    <div className="stat-value stat-value-class">
                      <ClassDot rhythm={last.label} />
                      {CLASS_LABELS[last.label]}
                    </div>
                    <div className="stat-note">впевненість {formatPercent(last.confidence)}</div>
                  </>
                ) : (
                  <div className="stat-note">
                    {model
                      ? `потрібно ще ${Math.max(1, WINDOW_SIZE - beats.length)} значень`
                      : 'потрібна навчена модель'}
                  </div>
                )}
              </div>
              <div className="stat">
                <div className="stat-label">Отримано значень</div>
                <div className="stat-value">{beats.length}</div>
                <div className="stat-note">за {formatDuration(last.at - first.at)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Що передає пристрій</div>
                <div className="stat-value stat-value-class">{usesIntervals ? 'RR-інтервали' : 'Частоту'}</div>
                <div className="stat-note">
                  {usesIntervals ? 'частота кожного окремого удару' : 'усереднений пульс, приблизно раз на секунду'}
                </div>
              </div>
            </div>

            <div className="figure-block">
              <LiveChart beats={beats.slice(-LIVE_CHART_CAPACITY)} svgRef={chartRef} />
              <ClassLegend />
              <SaveImageControl svgRef={chartRef} baseName="watch" subject="графік пульсу" />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
