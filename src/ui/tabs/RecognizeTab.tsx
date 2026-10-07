import { useRef, useState } from 'react';
import { generateSeries } from '../../domain/generator';
import { createRandom } from '../../domain/random';
import { CLASS_LABELS, RHYTHM_CLASSES, WINDOW_SIZE, mostLikelyClass, type RhythmClass } from '../../domain/rhythm';
import { MAX_INPUT_BPM, MIN_INPUT_BPM, parseSeries, toWindows } from '../../domain/slidingWindow';
import { formatFileSize } from '../../export/fileSave';
import { formatClock } from '../../log/operationLog';
import { useApp } from '../../state/appStore';
import { ClassDot, ProbabilityBars } from '../charts/ClassViews';
import { RhythmFigure } from '../charts/RhythmFigure';
import { FormError, Placeholder } from '../components/Field';
import { FileButton } from '../components/FileButton';
import { SaveImageControl } from '../components/SaveImageControl';
import { Segmented, type SegmentOption } from '../components/Segmented';
import { formatDuration, formatPercent } from '../../format';

type InputMode = 'four' | 'series';

const INPUT_MODES: readonly SegmentOption<InputMode>[] = [
  { value: 'four', label: 'Чотири числа' },
  { value: 'series', label: 'Довільна серія' },
];

const MAX_SERIES_LENGTH = 500;
const EXAMPLE_SERIES_LENGTH = 9;
const EXAMPLE_TOLERANCE = 2;
const HISTORY_SERIES_PREVIEW = 9;
const FOUR_PLACEHOLDERS = ['59', '61', '60', '59'];

function previewSeries(series: readonly number[]): string {
  const shown = series.slice(0, HISTORY_SERIES_PREVIEW).join(', ');
  return series.length > HISTORY_SERIES_PREVIEW ? `${shown}, …` : shown;
}

export function RecognizeTab() {
  const { model, recognitions, addRecognition, clearRecognitions, log, reportActivity } = useApp();

  const [mode, setMode] = useState<InputMode>('four');
  const [four, setFour] = useState<string[]>(Array.from({ length: WINDOW_SIZE }, () => ''));
  const [seriesText, setSeriesText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [viewedId, setViewedId] = useState<number | null>(null);
  const figureRef = useRef<SVGSVGElement>(null);

  const viewed = recognitions.find((record) => record.id === viewedId) ?? recognitions[0];

  const fillExample = (rhythm: RhythmClass): void => {
    const length = mode === 'four' ? WINDOW_SIZE : EXAMPLE_SERIES_LENGTH;
    const values = generateSeries(rhythm, length, EXAMPLE_TOLERANCE, createRandom(Date.now() >>> 0));
    if (mode === 'four') setFour(values.map(String));
    else setSeriesText(values.join(', '));
    setFormError(null);
  };

  const recognize = (): void => {
    if (!model) {
      const message = 'Немає навченої моделі: навчіть мережу або завантажте модель на вкладці «Навчання».';
      setFormError(message);
      log('warning', `Розпізнавання не виконано: ${message}`);
      return;
    }
    const text = mode === 'four' ? four.join(' ') : seriesText;
    const parsed = parseSeries(text);
    let problem = parsed.ok ? null : parsed.message;
    if (mode === 'four' && four.some((value) => value.trim() === '')) {
      problem = `Заповніть усі ${WINDOW_SIZE} поля.`;
    }
    if (parsed.ok && parsed.values.length > MAX_SERIES_LENGTH) {
      problem = `Серія задовга: ${parsed.values.length} чисел, а можна щонайбільше ${MAX_SERIES_LENGTH}.`;
    }
    setFormError(problem);
    if (problem || !parsed.ok) {
      log('warning', `Розпізнавання не виконано: ${problem ?? ''}`);
      return;
    }

    const startedAt = performance.now();
    const result = model.model.classifySeries(parsed.values);
    const elapsedMs = performance.now() - startedAt;

    addRecognition({ series: parsed.values, ...result, elapsedMs });
    setViewedId(null);
    const confidence = formatPercent(result.probabilities[result.label]);
    reportActivity({
      status: 'finished',
      title: 'Розпізнавання',
      detail: `серія з ${parsed.values.length} чисел, вікон ${result.perWindow.length}`,
      outcome: 'success',
      elapsedMs,
    });
    log(
      'success',
      `Розпізнано серію [${parsed.values.join(', ')}] за ${formatDuration(elapsedMs)}: ` +
        `${CLASS_LABELS[result.label]}, впевненість ${confidence}, вікон ${result.perWindow.length}.`,
    );
  };

  const loadFile = async (file: File): Promise<void> => {
    const text = (await file.text()).trim();
    setMode('series');
    setSeriesText(text);
    setFormError(null);
    log('info', `Серію завантажено з файла ${file.name} (${formatFileSize(file.size)}).`);
  };

  return (
    <div className="tab-layout">
      <aside className="side" aria-label="Вхідна послідовність">
        <Segmented label="Спосіб введення" name="input-mode" value={mode} options={INPUT_MODES} onChange={setMode} />

        {mode === 'four' ? (
          <div className="field-stack" role="group" aria-labelledby="four-label">
            <span className="side-label" id="four-label">
              Частота, уд/хв
            </span>
            <div
              className="four-inputs"
              title={`Чотири послідовні значення пульсу від ${MIN_INPUT_BPM} до ${MAX_INPUT_BPM}.`}
            >
              {four.map((value, index) => (
                <input
                  key={index}
                  type="number"
                  inputMode="numeric"
                  aria-label={`Число ${index + 1}`}
                  placeholder={FOUR_PLACEHOLDERS[index]}
                  min={MIN_INPUT_BPM}
                  max={MAX_INPUT_BPM}
                  value={value}
                  onChange={(event) => setFour(four.map((item, i) => (i === index ? event.target.value : item)))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') recognize();
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="field-stack">
            <label className="side-label" htmlFor="series-text">
              Серія частот, уд/хв
            </label>
            <textarea
              id="series-text"
              rows={4}
              placeholder="напр. 72, 68, 75, 71, 69, 73, 70, 68, 74"
              title={`Від ${WINDOW_SIZE} до ${MAX_SERIES_LENGTH} чисел через кому або пробіл. Серія розпізнається вікнами по ${WINDOW_SIZE} числа, відповіді усереднюються.`}
              value={seriesText}
              onChange={(event) => setSeriesText(event.target.value)}
            />
          </div>
        )}

        <div className="field-stack" role="group" aria-labelledby="examples-label">
          <span className="side-label" id="examples-label">
            Підставити випадковий приклад
          </span>
          <div className="examples">
            {RHYTHM_CLASSES.map((rhythm) => (
              <button type="button" className="button button-quiet" key={rhythm} onClick={() => fillExample(rhythm)}>
                {CLASS_LABELS[rhythm]}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="button button-primary" onClick={recognize}>
          Розпізнати
        </button>
        <FormError message={formError} />

        <div className="side-group">
          <span className="side-label">Серія з файла</span>
          <div className="button-row">
            <FileButton
              id="series-file"
              label="Завантажити…"
              hint="Текстовий файл або CSV з числами. Файл можна перетягнути на кнопку."
              accept=".txt,.csv,text/plain,text/csv"
              onFile={(file) => void loadFile(file)}
            />
          </div>
        </div>
      </aside>

      <section className="content" aria-label="Результат розпізнавання">
        {!viewed ? (
          <Placeholder title="Результату ще немає">
            Тут з’являться клас ритму, впевненість мережі для кожного класу та зображення серії. Введіть числа й
            натисніть «Розпізнати».
          </Placeholder>
        ) : (
          <div className="result-split">
            <div className="result-main">
              <div className="verdict">
                <div className="verdict-main">
                  <div className="verdict-class">
                    <ClassDot rhythm={viewed.label} />
                    {CLASS_LABELS[viewed.label]}
                  </div>
                </div>
                <ProbabilityBars probabilities={viewed.probabilities} best={viewed.label} />
              </div>

              <div className="figure-block">
                <RhythmFigure
                  series={viewed.series}
                  rhythm={viewed.label}
                  confidence={viewed.probabilities[viewed.label]}
                  svgRef={figureRef}
                />
                <div className="figure-footer">
                  {viewed.perWindow.length > 1 && (
                    <details className="windows">
                      <summary>Відповіді для кожного з {viewed.perWindow.length} вікон</summary>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th scope="col">Вікно</th>
                              <th scope="col">Числа</th>
                              <th scope="col">Клас</th>
                              <th scope="col" className="numeric">
                                Впевненість
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {toWindows(viewed.series).map((window, index) => {
                              const probabilities = viewed.perWindow[index];
                              if (!probabilities) return null;
                              const label = mostLikelyClass(probabilities);
                              return (
                                <tr key={index}>
                                  <td className="muted">{index + 1}</td>
                                  <td>{window.join(', ')}</td>
                                  <td>
                                    <ClassDot rhythm={label} />
                                    {CLASS_LABELS[label]}
                                  </td>
                                  <td className="numeric">{formatPercent(probabilities[label])}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                  <SaveImageControl svgRef={figureRef} baseName="rhythm" subject="результат розпізнавання" />
                </div>
              </div>
            </div>

            <div className="history-block">
              <div className="history-head">
                <h2 className="side-label">Історія</h2>
                <button type="button" className="button button-quiet" onClick={clearRecognitions}>
                  Очистити
                </button>
              </div>
              <ul className="history" aria-label="Історія розпізнавань">
                {recognitions.map((record) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      className={record.id === viewed.id ? 'history-item history-item-active' : 'history-item'}
                      aria-pressed={record.id === viewed.id}
                      onClick={() => setViewedId(record.id)}
                    >
                      <span className="history-verdict">
                        <ClassDot rhythm={record.label} />
                        {CLASS_LABELS[record.label]}
                        <span className="history-confidence">{formatPercent(record.probabilities[record.label])}</span>
                      </span>
                      <span className="history-series">
                        {formatClock(record.time).slice(0, 8)} · {previewSeries(record.series)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
