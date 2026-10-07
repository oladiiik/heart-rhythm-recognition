export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
  readonly id: number;
  readonly time: Date;
  readonly level: LogLevel;
  readonly message: string;
}

export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  info: 'ІНФО',
  success: 'УСПІХ',
  warning: 'УВАГА',
  error: 'ПОМИЛКА',
};

export const MAX_LOG_ENTRIES = 2000;

export function formatClock(time: Date): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}.${pad(time.getMilliseconds(), 3)}`;
}

export function logToText(entries: readonly LogEntry[]): string {
  return (
    entries
      .map((entry) => `${entry.time.toISOString()}\t${LOG_LEVEL_LABELS[entry.level]}\t${entry.message}`)
      .join('\n') + '\n'
  );
}
