import { useMemo, useRef, useState } from 'react';
import { datasetToCsv, datasetToJson, parseDatasetFile } from '../../domain/datasetFile';
import {
  DATASET_PROFILES,
  MAX_PER_CLASS,
  MAX_TOLERANCE,
  MIN_PER_CLASS,
  MIN_TOTAL_SEQUENCES,
  ORIGIN_LABELS,
  PROFILE_HINTS,
  PROFILE_LABELS,
  generateDataset,
  validateGeneratorConfig,
  type DatasetProfile,
  type GeneratorConfig,
  type SequenceOrigin,
} from '../../domain/generator';
import { countByClass } from '../../domain/metrics';
import { CLASS_LABELS, RHYTHM_CLASSES, WINDOW_SIZE, type RhythmClass } from '../../domain/rhythm';
import { fileTimestamp, formatFileSize, saveText } from '../../export/fileSave';
import { fileInfoOf, useApp, type DatasetState } from '../../state/appStore';
import { ClassCounts, ClassDot } from '../charts/ClassViews';
import { RhythmFigure } from '../charts/RhythmFigure';
import { FileDrop } from '../components/FileDrop';
import { FormError, NumberField, Placeholder } from '../components/Field';
import { InfoPopover, type InfoRow } from '../components/InfoPopover';
import { SaveImageControl } from '../components/SaveImageControl';
import { formatDuration } from '../../format';

const PAGE_SIZE = 12;

type ClassFilter = RhythmClass | 'all';

function datasetInfo(dataset: DatasetState): InfoRow[] {
  const { sequences, source } = dataset;
  const counts = countByClass(sequences);
  const origins = new Map<SequenceOrigin, number>();
  let lowest = Infinity;
  let highest = -Infinity;
  for (const sequence of sequences) {
    origins.set(sequence.profile, (origins.get(sequence.profile) ?? 0) + 1);
    for (const value of sequence.values) {
      lowest = Math.min(lowest, value);
      highest = Math.max(highest, value);
    }
  }

  const common: InfoRow[] = [
    { label: 'Послідовностей', value: sequences.length },
    { label: 'Чисел у послідовності', value: WINDOW_SIZE },
    {
      label: 'За класами',
      value: RHYTHM_CLASSES.map((rhythm) => `${CLASS_LABELS[rhythm]}: ${counts[rhythm]}`).join('; '),
    },
    {
      label: 'За профілями',
      value: [...origins].map(([origin, count]) => `${ORIGIN_LABELS[origin]}: ${count}`).join('; '),
    },
    { label: 'Діапазон значень', value: `${lowest}–${highest} уд/хв` },
    { label: 'Створено', value: dataset.createdAt.toLocaleString('uk-UA') },
  ];

  if (source.kind === 'generated') {
    return [
      { label: 'Джерело', value: 'згенеровано в застосунку' },
      ...common,
      { label: 'Допуск Tol', value: `${source.config.tolerance} уд/хв` },
      { label: 'Seed', value: source.config.seed },
      { label: 'Час генерування', value: formatDuration(source.elapsedMs) },
    ];
  }
  return [
    { label: 'Джерело', value: 'завантажено з файла' },
    { label: 'Назва файла', value: source.file.name },
    { label: 'Розмір файла', value: formatFileSize(source.file.sizeBytes) },
    { label: 'Тип файла', value: source.file.type },
    { label: 'Файл змінено', value: source.file.lastModified.toLocaleString('uk-UA') },
    ...common,
  ];
}

export function DataTab() {
  const { dataset, setDataset, log, reportActivity, isTraining } = useApp();

  const [profiles, setProfiles] = useState<readonly DatasetProfile[]>(DATASET_PROFILES);
  const [perClass, setPerClass] = useState('300');
  const [tolerance, setTolerance] = useState('3');
  const [seed, setSeed] = useState('1');
  const [formError, setFormError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [filter, setFilter] = useState<ClassFilter>('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const figureRef = useRef<SVGSVGElement>(null);

  const perClassNumber = Number(perClass);
  const totalHint =
    Number.isInteger(perClassNumber) && perClassNumber > 0
      ? `Разом ${perClassNumber * RHYTHM_CLASSES.length} послідовностей.`
      : '';

  const rows = useMemo(() => {
    if (!dataset) return [];
    return dataset.sequences
      .map((sequence, index) => ({ sequence, index }))
      .filter(({ sequence }) => filter === 'all' || sequence.label === filter);
  }, [dataset, filter]);
  const info = useMemo(() => (dataset ? datasetInfo(dataset) : []), [dataset]);
  const counts = useMemo(() => (dataset ? countByClass(dataset.sequences) : null), [dataset]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selectedSequence = selected !== null ? dataset?.sequences[selected] : undefined;

  const replaceDataset = (next: DatasetState): void => {
    setDataset(next);
    setPage(0);
    setSelected(0);
  };

  const toggleProfile = (profile: DatasetProfile): void => {
    setProfiles((current) =>
      current.includes(profile)
        ? current.filter((item) => item !== profile)
        : DATASET_PROFILES.filter((item) => item === profile || current.includes(item)),
    );
  };

  const generate = (): void => {
    const config: GeneratorConfig = {
      perClass: Number(perClass),
      profiles,
      tolerance: Number(tolerance),
      seed: Number(seed),
    };
    const problem = validateGeneratorConfig(config);
    setFormError(problem);
    if (problem) {
      log('warning', `Набір не згенеровано: ${problem}`);
      return;
    }
    const startedAt = performance.now();
    const sequences = generateDataset(config);
    const elapsedMs = performance.now() - startedAt;
    replaceDataset({ sequences, source: { kind: 'generated', config, elapsedMs }, createdAt: new Date() });
    setFileError(null);

    const profileNames = profiles.map((profile) => PROFILE_LABELS[profile]).join(', ');
    reportActivity({
      status: 'finished',
      title: 'Генерування набору',
      detail: `${sequences.length} послідовностей`,
      outcome: 'success',
      elapsedMs,
    });
    log(
      'success',
      `Згенеровано ${sequences.length} послідовностей (${config.perClass} на клас) за ${formatDuration(elapsedMs)}: ` +
        `профілі ${profileNames}; допуск ${config.tolerance} уд/хв; seed ${config.seed}.`,
    );
  };

  const loadFile = async (file: File): Promise<void> => {
    const startedAt = performance.now();
    try {
      const sequences = parseDatasetFile(file.name, await file.text());
      const elapsedMs = performance.now() - startedAt;
      replaceDataset({ sequences, source: { kind: 'file', file: fileInfoOf(file) }, createdAt: new Date() });
      setFileError(null);
      setFormError(null);
      reportActivity({
        status: 'finished',
        title: 'Завантаження набору',
        detail: `${file.name}, ${sequences.length} послідовностей`,
        outcome: 'success',
        elapsedMs,
      });
      log(
        'success',
        `Завантажено набір із файла ${file.name} (${formatFileSize(file.size)}): ` +
          `${sequences.length} послідовностей за ${formatDuration(elapsedMs)}.`,
      );
      if (sequences.length < MIN_TOTAL_SEQUENCES) {
        log(
          'warning',
          `У наборі лише ${sequences.length} послідовностей; для навчання потрібно щонайменше ${MIN_TOTAL_SEQUENCES}.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFileError(message);
      log('error', `Файл ${file.name} не завантажено: ${message}`);
    }
  };

  const saveDataset = (format: 'csv' | 'json'): void => {
    if (!dataset) return;
    const fileName = `dataset_${fileTimestamp()}.${format}`;
    if (format === 'csv') saveText(datasetToCsv(dataset.sequences), fileName, 'text/csv');
    else saveText(datasetToJson(dataset.sequences), fileName, 'application/json');
    log('success', `Набір збережено у файл ${fileName} (${dataset.sequences.length} послідовностей).`);
  };

  return (
    <div className="tab-layout">
      <section className="panel controls" aria-labelledby="data-controls-title">
        <h2 id="data-controls-title">Параметри набору</h2>

        <fieldset className="field">
          <legend>Профілі набору</legend>
          {DATASET_PROFILES.map((profile) => (
            <label className="check" key={profile}>
              <input type="checkbox" checked={profiles.includes(profile)} onChange={() => toggleProfile(profile)} />
              <span>
                <strong>{PROFILE_LABELS[profile]}</strong> — {PROFILE_HINTS[profile]}
              </span>
            </label>
          ))}
        </fieldset>

        <NumberField
          id="per-class"
          label="Послідовностей на клас"
          value={perClass}
          onChange={setPerClass}
          placeholder={`від ${MIN_PER_CLASS}, напр. 300`}
          min={MIN_PER_CLASS}
          max={MAX_PER_CLASS}
          step={1}
          hint={`Від ${MIN_PER_CLASS} до ${MAX_PER_CLASS}. ${totalHint}`}
        />
        <NumberField
          id="tolerance"
          label="Допуск Tol, уд/хв"
          value={tolerance}
          onChange={setTolerance}
          placeholder="напр. 3"
          min={0}
          max={MAX_TOLERANCE}
          step={1}
          hint="Наскільки частота може відхилятися всередині однієї послідовності."
        />
        <NumberField
          id="seed"
          label="Seed генератора"
          value={seed}
          onChange={setSeed}
          placeholder="напр. 1"
          min={0}
          step={1}
          hint="Той самий seed дає той самий набір — зручно для повторних дослідів."
        />

        <button type="button" className="button button-primary" onClick={generate}>
          Згенерувати набір
        </button>
        <FormError message={formError} />

        <hr />

        <FileDrop
          id="dataset-file"
          label="Завантажити набір із файла"
          hint="CSV або JSON: чотири числа, клас і (необов’язково) профіль. Перетягніть файл сюди або натисніть."
          accept=".csv,.json,text/csv,application/json"
          onFile={(file) => void loadFile(file)}
          disabled={isTraining}
        />
        <FormError message={fileError} />

        <div className="button-row">
          <button type="button" className="button" disabled={!dataset} onClick={() => saveDataset('csv')}>
            Зберегти як CSV
          </button>
          <button type="button" className="button" disabled={!dataset} onClick={() => saveDataset('json')}>
            Зберегти як JSON
          </button>
        </div>
      </section>

      <section className="panel results" aria-labelledby="data-results-title">
        <header className="panel-header">
          <h2 id="data-results-title">Набір даних</h2>
          {dataset && <InfoPopover subject="набір даних" rows={info} />}
        </header>

        {!dataset || !counts ? (
          <Placeholder title="Набір ще не створено">
            Тут з’являться кількість послідовностей кожного класу, таблиця набору та графік вибраної послідовності.
            Задайте параметри ліворуч і натисніть «Згенерувати набір» або завантажте файл.
          </Placeholder>
        ) : (
          <>
            <ClassCounts counts={counts} />

            <div className="table-toolbar">
              <label htmlFor="class-filter">Показати клас</label>
              <select
                id="class-filter"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value as ClassFilter);
                  setPage(0);
                }}
              >
                <option value="all">Усі класи</option>
                {RHYTHM_CLASSES.map((rhythm) => (
                  <option key={rhythm} value={rhythm}>
                    {CLASS_LABELS[rhythm]}
                  </option>
                ))}
              </select>
              <div className="pager">
                <button
                  type="button"
                  className="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  ← Попередня
                </button>
                <span>
                  Сторінка {currentPage + 1} з {pageCount}
                </span>
                <button
                  type="button"
                  className="button"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Наступна →
                </button>
              </div>
            </div>

            <div className="data-split">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col" rowSpan={2}>
                        №
                      </th>
                      <th scope="colgroup" colSpan={WINDOW_SIZE} className="group-header">
                        Частота, уд/хв
                      </th>
                      <th scope="col" rowSpan={2}>
                        Клас
                      </th>
                      <th scope="col" rowSpan={2}>
                        Профіль
                      </th>
                    </tr>
                    <tr>
                      {Array.from({ length: WINDOW_SIZE }, (_, i) => (
                        <th scope="col" className="numeric" key={i}>
                          {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(({ sequence, index }) => (
                      <tr
                        key={index}
                        className={index === selected ? 'row-selected' : undefined}
                        onClick={() => setSelected(index)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelected(index);
                          }
                        }}
                        aria-selected={index === selected}
                      >
                        <td className="muted">{index + 1}</td>
                        {sequence.values.map((value, i) => (
                          <td className="numeric" key={i}>
                            {value}
                          </td>
                        ))}
                        <td>
                          <ClassDot rhythm={sequence.label} />
                          {CLASS_LABELS[sequence.label]}
                        </td>
                        <td>{ORIGIN_LABELS[sequence.profile]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="figure-block">
                {selectedSequence ? (
                  <>
                    <RhythmFigure series={selectedSequence.values} svgRef={figureRef} />
                    <SaveImageControl
                      svgRef={figureRef}
                      baseName="sequence"
                      subject={`послідовність № ${(selected ?? 0) + 1}`}
                    />
                  </>
                ) : (
                  <Placeholder title="Графік послідовності">
                    Натисніть рядок таблиці, щоб побачити R-зубці та інтервали цієї послідовності.
                  </Placeholder>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
