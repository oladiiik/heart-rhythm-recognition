import { useState, type DragEvent } from 'react';

interface FileButtonProps {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly accept: string;
  readonly onFile: (file: File) => void;
  readonly disabled?: boolean;
}

export function FileButton({ id, label, hint, accept, onFile, disabled = false }: FileButtonProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };

  const className = ['button', 'file-button', dragging && 'file-button-active', disabled && 'file-button-disabled']
    .filter(Boolean)
    .join(' ');

  return (
    <label
      className={className}
      htmlFor={id}
      title={hint}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {label}
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
