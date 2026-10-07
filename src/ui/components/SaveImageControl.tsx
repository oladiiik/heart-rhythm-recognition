import { useState, type RefObject } from 'react';
import { fileTimestamp, formatFileSize, saveBlob } from '../../export/fileSave';
import { IMAGE_FORMATS, canvasToBlob, imageFormatInfo, type ImageFormat } from '../../export/imageExport';
import { svgToCanvas } from '../../export/svgExport';
import { useApp } from '../../state/appStore';

interface SaveImageControlProps {
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly baseName: string;
  readonly subject: string;
  readonly disabled?: boolean;
}

export function SaveImageControl({ svgRef, baseName, subject, disabled = false }: SaveImageControlProps) {
  const { log } = useApp();
  const [format, setFormat] = useState<ImageFormat>('png');
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    const svg = svgRef.current;
    if (!svg) return;
    setSaving(true);
    try {
      const info = imageFormatInfo(format);
      const canvas = await svgToCanvas(svg);
      const blob = await canvasToBlob(canvas, format);
      const fileName = `${baseName}_${fileTimestamp()}.${info.extension}`;
      saveBlob(blob, fileName);
      log(
        'success',
        `Збережено зображення (${subject}): ${fileName}, ${info.label}, ` +
          `${canvas.width}×${canvas.height} пікселів, ${formatFileSize(blob.size)}.`,
      );
    } catch (error) {
      log('error', `Не вдалося зберегти зображення: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="save-image">
      <select
        aria-label="Формат зображення"
        title="Формат зображення"
        value={format}
        disabled={disabled}
        onChange={(event) => setFormat(event.target.value as ImageFormat)}
      >
        {IMAGE_FORMATS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="button" className="button" disabled={disabled || saving} onClick={() => void save()}>
        Зберегти зображення
      </button>
    </div>
  );
}
