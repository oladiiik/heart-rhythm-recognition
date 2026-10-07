import { formatNumber } from '../format';

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Браузер починає завантаження асинхронно, тому посилання звільняємо із затримкою
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveText(text: string, fileName: string, mime: string): void {
  saveBlob(new Blob([text], { type: `${mime};charset=utf-8` }), fileName);
}

export function fileTimestamp(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} КБ`;
  return `${formatNumber(bytes / (1024 * 1024))} МБ`;
}
