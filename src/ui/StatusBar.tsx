import { useEffect, useRef, useState } from 'react';
import { fileTimestamp, saveText } from '../export/fileSave';
import { LOG_LEVEL_LABELS, formatClock, logToText } from '../log/operationLog';
import { useApp, type Activity } from '../state/appStore';
import { formatDuration } from '../format';

const ELAPSED_REFRESH_MS = 50;

function useElapsedMs(activity: Activity): number | null {
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
  return null;
}

const OUTCOME_LABELS = { success: 'Готово', cancelled: 'Зупинено', error: 'Помилка' } as const;

export function StatusBar() {
  const { activity, logEntries: entries, log: appendLog, clearLog } = useApp();
  const [expanded, setExpanded] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const elapsedMs = useElapsedMs(activity);

  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries.length, expanded]);

  const progress = activity.status === 'running' ? activity.progress : activity.status === 'finished' ? 1 : 0;
  const percent = Math.round(progress * 100);
  const stateClass =
    activity.status === 'finished'
      ? `progress-${activity.outcome}`
      : activity.status === 'running'
        ? 'progress-running'
        : '';

  const saveLog = (): void => {
    const fileName = `operations-log_${fileTimestamp()}.txt`;
    saveText(logToText(entries), fileName, 'text/plain');
    appendLog('success', `Лог збережено у файл ${fileName} (${entries.length} записів).`);
  };

  return (
    <footer className="status-bar">
      <div className="activity">
        <div className="activity-text" role="status" aria-live="polite">
          {activity.status === 'idle' ? (
            <span className="muted">Жодна операція не виконується</span>
          ) : (
            <>
              <strong>
                {activity.status === 'finished' ? `${OUTCOME_LABELS[activity.outcome]}: ` : ''}
                {activity.title}
              </strong>
              <span>{activity.detail}</span>
            </>
          )}
        </div>
        <div
          className={`progress ${stateClass}`}
          role="progressbar"
          aria-label="Хід виконання операції"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="progress-percent">{activity.status === 'idle' ? '—' : `${percent}%`}</div>
        <div className="elapsed" title="Час виконання операції">
          <span className="elapsed-label">Час виконання</span>
          <span className="elapsed-value">{elapsedMs === null ? '—' : formatDuration(elapsedMs)}</span>
        </div>
      </div>

      <div className="log">
        <div className="log-header">
          <h2>Лог операцій</h2>
          <span className="muted">записів: {entries.length}</span>
          <div className="log-actions">
            <button type="button" className="button button-small" onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Згорнути' : 'Розгорнути'}
            </button>
            <button type="button" className="button button-small" disabled={entries.length === 0} onClick={saveLog}>
              Зберегти лог
            </button>
            <button type="button" className="button button-small" disabled={entries.length === 0} onClick={clearLog}>
              Очистити
            </button>
          </div>
        </div>
        <ol className={expanded ? 'log-list log-list-expanded' : 'log-list'} ref={list} aria-label="Записи логу">
          {entries.length === 0 ? (
            <li className="log-empty">
              Тут з’являтимуться записи про кожну операцію: генерування, навчання, розпізнавання, збереження файлів.
            </li>
          ) : (
            entries.map((entry) => (
              <li key={entry.id} className={`log-entry log-${entry.level}`}>
                <time dateTime={entry.time.toISOString()}>{formatClock(entry.time)}</time>
                <span className="log-level">{LOG_LEVEL_LABELS[entry.level]}</span>
                <span className="log-message">{entry.message}</span>
              </li>
            ))
          )}
        </ol>
      </div>
    </footer>
  );
}
