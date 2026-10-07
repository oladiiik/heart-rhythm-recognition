import { useEffect, useId, useRef, useState } from 'react';
import { fileTimestamp, saveText } from '../export/fileSave';
import { LOG_LEVEL_LABELS, formatClock, logToText } from '../log/operationLog';
import { useApp, type Activity } from '../state/appStore';
import { formatDuration } from '../format';

const ELAPSED_REFRESH_MS = 50;

function useElapsedMs(activity: Activity): number {
  const [now, setNow] = useState(() => performance.now());
  const running = activity.status === 'running';

  useEffect(() => {
    if (!running) return;
    setNow(performance.now());
    const timer = setInterval(() => setNow(performance.now()), ELAPSED_REFRESH_MS);
    return () => clearInterval(timer);
  }, [running]);

  if (activity.status === 'running') return Math.max(0, now - activity.startedAt);
  if (activity.status === 'finished') return activity.elapsedMs;
  return 0;
}

const OUTCOME_LABELS = { success: 'Готово', cancelled: 'Зупинено', error: 'Помилка' } as const;

export function StatusBar() {
  const { activity, logEntries: entries, log: appendLog, clearLog } = useApp();
  const [logRequested, setLogRequested] = useState(false);
  const footer = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const drawerId = useId();
  const elapsedMs = useElapsedMs(activity);

  const hasEntries = entries.length > 0;
  const logOpen = logRequested && hasEntries;

  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries.length, logOpen]);

  useEffect(() => {
    if (!logOpen) return;
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!footer.current?.contains(event.target as Node)) setLogRequested(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setLogRequested(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [logOpen]);

  if (activity.status === 'idle' && !hasEntries) return null;

  const progress = activity.status === 'running' ? activity.progress : 1;
  const percent = Math.round(progress * 100);
  const stateClass = activity.status === 'finished' ? `progress progress-${activity.outcome}` : 'progress';

  const saveLog = (): void => {
    const fileName = `operations-log_${fileTimestamp()}.txt`;
    saveText(logToText(entries), fileName, 'text/plain');
    appendLog('success', `Лог збережено у файл ${fileName} (${entries.length} записів).`);
  };

  return (
    <footer className="status" ref={footer}>
      {logOpen && (
        <section className="log-drawer" id={drawerId} aria-label="Лог операцій">
          <header className="log-header">
            <h2>Лог операцій</h2>
            <div className="log-actions">
              <button type="button" className="button button-quiet" onClick={clearLog}>
                Очистити
              </button>
              <button type="button" className="button" onClick={saveLog}>
                Зберегти лог
              </button>
            </div>
          </header>
          <ol className="log-list" ref={list} aria-label="Записи логу">
            {entries.map((entry) => (
              <li key={entry.id} className={`log-entry log-${entry.level}`}>
                <time dateTime={entry.time.toISOString()}>{formatClock(entry.time)}</time>
                <span className="log-level">{LOG_LEVEL_LABELS[entry.level]}</span>
                <span className="log-message">{entry.message}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="status-line">
        {activity.status !== 'idle' && (
          <>
            <div className="activity-text" role="status" aria-live="polite">
              <strong>
                {activity.status === 'finished' ? `${OUTCOME_LABELS[activity.outcome]}: ` : ''}
                {activity.title}
              </strong>
              <span>{activity.detail}</span>
            </div>
            <div
              className={stateClass}
              role="progressbar"
              aria-label="Хід виконання операції"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="progress-percent">{percent}%</div>
            <div className="elapsed">
              <span className="elapsed-label">Час виконання</span>
              <span className="elapsed-value">{formatDuration(elapsedMs)}</span>
            </div>
          </>
        )}
        {hasEntries && (
          <button
            type="button"
            className="button log-toggle"
            aria-expanded={logOpen}
            aria-controls={drawerId}
            onClick={() => setLogRequested((value) => !value)}
          >
            Лог операцій
            <span className="segment-count">{entries.length}</span>
          </button>
        )}
      </div>
    </footer>
  );
}
