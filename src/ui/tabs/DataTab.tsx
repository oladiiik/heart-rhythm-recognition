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
import { ClassDot } from '../charts/ClassViews';
import { RhythmFigure } from '../charts/RhythmFigure';
import { FormError, NumberField, Placeholder } from '../components/Field';
import { FileButton } from '../components/FileButton';
import { InfoPopover, type InfoRow } from '../components/InfoPopover';
import { SaveImageControl } from '../components/SaveImageControl';
import { Segmented, type SegmentOption } from '../components/Segmented';
import { useRowsThatFit } from '../components/useRowsThatFit';
import { formatDuration } from '../../format';

const DEFAULT_PAGE_SIZE = 12;

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
    { label: 'Розширення файла', value: source.file.extension },
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
  const [tableWrap, pageSize] = useRowsThatFit<HTMLDivElement>(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<number | null>(null);
  const figureRef = useRef<SVGSVGElement>(null);

  const rows = useMemo(() => {
    if (!dataset) return [];
    return dataset.sequences
      .map((sequence, index) => ({ sequence, index }))
      .filter(({ sequence }) => filter === 'all' || sequence.label === filter);
  }, [dataset, filter]);
  const info = useMemo(() => (dataset ? datasetInfo(dataset) : []), [dataset]);
  const filterOptions = useMemo((): SegmentOption<ClassFilter>[] => {
    if (!dataset) return [];
    const counts = countByClass(dataset.sequences);
    return [
      {
        value: 'all',
        label: (
          <>
            Усі <span className="segment-count">{dataset.sequences.length}</span>
          </>
        ),
      },
      ...RHYTHM_CLASSES.map((rhythm) => ({
        value: rhythm,
        label: (
          <>
            <ClassDot rhythm={rhythm} />
            {CLASS_LABELS[rhythm]} <span className="segment-count">{counts[rhythm]}</span>
          </>
        ),
      })),
    ];
  }, [dataset]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selectedSequence = selected !== null ? dataset?.sequences[selected] : undefined;

  const replaceDataset = (next: DatasetState): void => {
    setDataset(next);
    setFilter('all');
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
      <aside className="side" aria-label="Параметри набору">
        <div className="field-stack" role="group" aria-labelledby="profiles-label">
          <span className="side-label" id="profiles-label">
            Профілі набору
          </span>
          <div className="chips">
            {DATASET_PROFILES.map((profile) => (
              <label className="chip" key={profile} title={PROFILE_HINTS[profile]}>
                <input type="checkbox" checked={profiles.includes(profile)} onChange={() => toggleProfile(profile)} />
                {PROFILE_LABELS[profile]}
              </label>
            ))}
          </div>
        </div>

        <NumberField
          id="per-class"
          label="Послідовностей на клас"
          value={perClass}
          onChange={setPerClass}
          placeholder="напр. 300"
          min={MIN_PER_CLASS}
          max={MAX_PER_CLASS}
          step={1}
          hint={`Від ${MIN_PER_CLASS} до ${MAX_PER_CLASS}; класів ${RHYTHM_CLASSES.length}.`}
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
          hint={`Від 0 до ${MAX_TOLERANCE}: наскільки частота може відхилятися всередині однієї послідовності.`}
        />
        <NumberField
          id="seed"
          label="Seed генератора"
          value={seed}
          onChange={setSeed}
          placeholder="напр. 1"
          min={0}
          step={1}
          hint="Той самий seed дає той самий набір."
        />

        <button type="button" className="button button-primary" onClick={generate}>
          Згенерувати набір
        </button>
        <FormError message={formError} />

        <div className="side-group">
          <span className="side-label">Файл набору</span>
          <div className="button-row">
            <FileButton
              id="dataset-file"
              label="Завантажити…"
              hint="CSV або JSON: чотири числа, клас і (необов’язково) профіль. Файл можна перетягнути на кнопку."
              accept=".csv,.json,text/csv,application/json"
              onFile={(file) => void loadFile(file)}
              disabled={isTraining}
            />
          </div>
          <div className="button-row">
            <button type="button" className="button" disabled={!dataset} onClick={() => saveDataset('csv')}>
              Зберегти CSV
            </button>
            <button type="button" className="button" disabled={!dataset} onClick={() => saveDataset('json')}>
              Зберегти JSON
            </button>
          </div>
          <FormError message={fileError} />
        </div>
      </aside>

      <section className="content" aria-label="Набір даних">
        {!dataset ? (
          <Placeholder title="Набору ще немає">
            Тут з’являться таблиця послідовностей і графік вибраної. Натисніть «Згенерувати набір» або завантажте файл.
          </Placeholder>
        ) : (
          <>
            <div className="content-head">
              <Segmented
                className="class-filter"
                label="Показати клас"
                name="class-filter"
                value={filter}
                options={filterOptions}
                onChange={(next) => {
                  setFilter(next);
                  setPage(0);
                }}
              />
              <InfoPopover subject="набір даних" rows={info} />
            </div>

            <div className="data-split">
              <div className="table-block">
                <div className="table-wrap" ref={tableWrap}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">№</th>
                        <th scope="colgroup" colSpan={WINDOW_SIZE} className="numeric">
                          Частота, уд/хв
                        </th>
                        <th scope="col">Клас</th>
                        <th scope="col">Профіль</th>
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
                          <td className="muted">{ORIGIN_LABELS[sequence.profile]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pager">
                  <button
                    type="button"
                    className="button"
                    aria-label="Попередня сторінка"
                    title="Попередня сторінка"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    ‹
                  </button>
                  <span>
                    {currentPage + 1} з {pageCount}
                  </span>
                  <button
                    type="button"
                    className="button"
                    aria-label="Наступна сторінка"
                    title="Наступна сторінка"
                    disabled={currentPage >= pageCount - 1}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    ›
                  </button>
                </div>
              </div>

              {selectedSequence && (
                <div className="figure-block">
                  <RhythmFigure series={selectedSequence.values} rhythm={selectedSequence.label} svgRef={figureRef} />
                  <div className="figure-footer">
                    <SaveImageControl
                      svgRef={figureRef}
                      baseName="sequence"
                      subject={`послідовність № ${(selected ?? 0) + 1}`}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
