import { useState, type DragEvent } from 'react';

interface FileDropProps {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly accept: string;
  readonly onFile: (file: File) => void;
  readonly disabled?: boolean;
}

export function FileDrop({ id, label, hint, accept, onFile, disabled = false }: FileDropProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };

  const className = ['file-drop', dragging && 'file-drop-active', disabled && 'file-drop-disabled']
    .filter(Boolean)
    .join(' ');

  return (
    <label
      className={className}
      htmlFor={id}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <span className="file-drop-label">{label}</span>
      <span className="file-drop-hint">{hint}</span>
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          // Скидаємо вибір, щоб той самий файл можна було завантажити повторно
          event.target.value = '';
        }}
      />
    </label>
  );
}
