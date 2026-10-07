import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface InfoRow {
  readonly label: string;
  readonly value: ReactNode;
}

interface InfoPopoverProps {
  readonly subject: string;
  readonly rows: readonly InfoRow[];
}

export function InfoPopover({ subject, rows }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent): void => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="info" ref={container}>
      <button
        type="button"
        className="info-button"
        aria-label={`Відомості: ${subject}`}
        aria-expanded={open}
        aria-controls={panelId}
        title={`Відомості: ${subject}`}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="6.2" r="1.1" fill="currentColor" />
          <path d="M10 9v5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="info-panel" id={panelId} role="dialog" aria-label={`Відомості: ${subject}`}>
          <p className="info-title">{subject}</p>
          <dl>
            {rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
