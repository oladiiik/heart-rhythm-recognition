import { useMemo, useState } from 'react';
import { benchmarkToJson, performanceToCsv, qualityToCsv } from '../../benchmark/export';
import {
  PERFORMANCE_LIMITS,
  PERFORMANCE_PIPELINES,
  PIPELINE_LABELS,
  aggregatePerformance,
  judgePerformance,
  type PerformancePipeline,
} from '../../benchmark/performance';
import {
  PROFILE_SETS,
  QUALITY_EXPERIMENTS,
  QUALITY_EXPERIMENT_IDS,
  QUALITY_LIMITS,
  TEST_SET,
  VALIDATION_SET,
  aggregateQuality,
  judgeQuality,
  profileSetOf,
  type QualityExperimentId,
  type QualityFixedField,
} from '../../benchmark/quality';
import { DEFAULT_PER_CLASS, DEFAULT_PROFILES, MAX_PER_CLASS, MIN_PER_CLASS } from '../../domain/generator';
import { fileTimestamp, formatFileSize, saveText } from '../../export/fileSave';
import { DEFAULT_TRAINING_CONFIG, TRAINING_LIMITS } from '../../ml/model';
import { useApp } from '../../state/appStore';
import { PerformanceResults } from '../benchmark/PerformanceResults';
import { QualityResults } from '../benchmark/QualityResults';
import { useBenchmarkJobs } from '../benchmark/useBenchmarkJobs';
import { FormError, NumberField } from '../components/Field';
import { Segmented } from '../components/Segmented';

type Mode = 'quality' | 'performance';

const MODE_OPTIONS = [
  { value: 'quality', label: 'Якість навчання' },
  { value: 'performance', label: 'Швидкодія' },
] as const;

const EXPERIMENT_HINTS: Record<QualityExperimentId, string> = {
  epochs: 'Скільки епох і з якою швидкістю навчання потрібно мережі для найкращої точності.',
  hidden: 'Скільки нейронів потрібно в прихованому шарі.',
  dataset: 'На якому наборі (профілі й кількість послідовностей) мережа навчається найкраще.',
};

const PIPELINE_HINTS: Record<PerformancePipeline, string> = {
  recognition: 'Час розпізнавання серії пульсу з файла до 500 КБ, 1, 5 і 10 МБ.',
  training: 'Час навчання мережі на наборі даних з файла до 500 КБ, 1, 5 і 10 МБ.',
};

interface FixedFieldSpec {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number | 'any';
  readonly hint: string;
}

type NumericFixedField = Exclude<QualityFixedField, 'profiles'>;

const FIXED_FIELDS: Record<NumericFixedField, FixedFieldSpec> = {
  epochs: {
    label: 'Епох',
    ...TRAINING_LIMITS.epochs,
    step: 1,
    hint: 'Скільки епох навчається кожна мережа досліду. Ранньої зупинки немає: усі мережі проходять однакову кількість епох.',
  },
  learningRate: {
    label: 'Швидкість навчання',
    ...TRAINING_LIMITS.learningRate,
    step: 'any',
    hint: 'Однакова для всіх мереж досліду.',
  },
  hiddenNeurons: {
    label: 'Прихованих нейронів',
    ...TRAINING_LIMITS.hiddenNeurons,
    step: 1,
    hint: 'Розмір прихованого шару всіх мереж досліду.',
  },
  perClass: {
    label: 'Послідовностей на клас',
    min: MIN_PER_CLASS,
    max: MAX_PER_CLASS,
    step: 1,
    hint: 'Розмір навчального набору. Валідаційний і тестовий набори окремі й завжди однакові.',
  },
};

const DEFAULT_FIXED: Record<NumericFixedField, number> = {
  epochs: DEFAULT_TRAINING_CONFIG.epochs,
  learningRate: DEFAULT_TRAINING_CONFIG.learningRate,
  hiddenNeurons: DEFAULT_TRAINING_CONFIG.hiddenNeurons,
  perClass: DEFAULT_PER_CLASS,
};

const DEFAULT_PROFILE_SET = profileSetOf(DEFAULT_PROFILES)?.key ?? 'all';

export function BenchmarkTab() {
  const { operation, log } = useApp();
  const { qualityRuns, performanceRuns, startQuality, startPerformance, cancel } = useBenchmarkJobs();

  const [mode, setMode] = useState<Mode>('quality');
  const [experimentId, setExperimentId] = useState<QualityExperimentId>('epochs');
  const [qualityRepeats, setQualityRepeats] = useState('10');
  const [profileSet, setProfileSet] = useState(DEFAULT_PROFILE_SET);
  const [fixed, setFixed] = useState<Record<NumericFixedField, string>>({
    epochs: String(DEFAULT_FIXED.epochs),
    learningRate: String(DEFAULT_FIXED.learningRate),
    hiddenNeurons: String(DEFAULT_FIXED.hiddenNeurons),
    perClass: String(DEFAULT_FIXED.perClass),
  });
  const [pipeline, setPipeline] = useState<PerformancePipeline>('recognition');
  const [performanceRepeats, setPerformanceRepeats] = useState(String(PERFORMANCE_LIMITS.repeats.min));
  const [performanceEpochs, setPerformanceEpochs] = useState('10');
  const [formError, setFormError] = useState<string | null>(null);

  const running = operation === 'benchmark';
  const experiment = QUALITY_EXPERIMENTS[experimentId];
  const qualityRun = qualityRuns[experimentId];
  const performanceRun = performanceRuns[pipeline];

  const quality = useMemo(() => {
    if (!qualityRun) return { cells: [], verdict: null };
    const cells = aggregateQuality(experiment, qualityRun.tasks, qualityRun.trials);
    const verdict =
      qualityRun.status === 'completed' ? judgeQuality(cells, qualityRun.plan.repeats) : null;
    return { cells, verdict };
  }, [experiment, qualityRun]);

  const speed = useMemo(() => {
    if (!performanceRun) return { rows: [], verdict: null };
    const rows = aggregatePerformance(pipeline, performanceRun.tasks, performanceRun.trials);
    const verdict = performanceRun.status === 'completed' ? judgePerformance(rows, performanceRun.plan.repeats) : null;
    return { rows, verdict };
  }, [pipeline, performanceRun]);

  const start = async (): Promise<void> => {
    setFormError(null);
    const problem =
      mode === 'quality'
        ? await startQuality({
            experiment: experimentId,
            repeats: Number(qualityRepeats),
            fixed: {
              epochs: Number(fixed.epochs),
              learningRate: Number(fixed.learningRate),
              hiddenNeurons: Number(fixed.hiddenNeurons),
              perClass: Number(fixed.perClass),
              profiles: PROFILE_SETS.find((set) => set.key === profileSet)?.profiles ?? DEFAULT_PROFILES,
            },
          })
        : await startPerformance({
            pipeline,
            repeats: Number(performanceRepeats),
            epochs: Number(performanceEpochs),
          });
    if (problem) {
      setFormError(problem);
      log('warning', `Бенчмарк не запущено: ${problem}`);
    }
  };

  const save = (format: 'csv' | 'json'): void => {
    const stamp = fileTimestamp();
    let text: string;
    let fileName: string;
    if (mode === 'quality') {
      if (!qualityRun) return;
      fileName = `benchmark-quality-${experimentId}_${stamp}.${format}`;
      text =
        format === 'csv'
          ? qualityToCsv(quality.cells, quality.verdict)
          : benchmarkToJson('quality', qualityRun.environment, {
              experiment: experimentId,
              status: qualityRun.status,
              startedAt: qualityRun.startedAt.toISOString(),
              elapsedMs: qualityRun.elapsedMs,
              workers: qualityRun.workers,
              plan: qualityRun.plan,
              validationSet: VALIDATION_SET,
              testSet: TEST_SET,
              cells: quality.cells,
              verdict: quality.verdict,
              tasks: qualityRun.tasks,
              trials: qualityRun.trials,
            });
    } else {
      if (!performanceRun) return;
      fileName = `benchmark-performance-${pipeline}_${stamp}.${format}`;
      text =
        format === 'csv'
          ? performanceToCsv(pipeline, speed.rows)
          : benchmarkToJson('performance', performanceRun.environment, {
              pipeline,
              status: performanceRun.status,
              startedAt: performanceRun.startedAt.toISOString(),
              elapsedMs: performanceRun.elapsedMs,
              plan: performanceRun.plan,
              rows: speed.rows,
              verdict: speed.verdict,
              tasks: performanceRun.tasks,
              trials: performanceRun.trials,
            });
    }
    saveText(text, fileName, format === 'csv' ? 'text/csv' : 'application/json');
    log('success', `Результати бенчмарку збережено у файл ${fileName} (${formatFileSize(new Blob([text]).size)}).`);
  };

  const currentRun = mode === 'quality' ? qualityRun : performanceRun;
  const canSave = currentRun !== undefined && currentRun.status !== 'running' && currentRun.trials.length > 0;

  return (
    <div className="tab-layout">
      <aside className="side" aria-label="Параметри бенчмарку">
        <Segmented
          label="Що вимірювати"
          name="benchmark-mode"
          value={mode}
          options={MODE_OPTIONS}
          onChange={(value) => {
            setMode(value);
            setFormError(null);
          }}
        />

        <div className="side-section" hidden={mode !== 'quality'}>
          <div className="field-stack" title={EXPERIMENT_HINTS[experimentId]}>
            <label className="side-label" htmlFor="benchmark-experiment">
              Дослід
            </label>
            <select
              id="benchmark-experiment"
              value={experimentId}
              onChange={(event) => setExperimentId(event.target.value as QualityExperimentId)}
            >
              {QUALITY_EXPERIMENT_IDS.map((id) => (
                <option key={id} value={id}>
                  {QUALITY_EXPERIMENTS[id].label}
                </option>
              ))}
            </select>
          </div>
          <NumberField
            id="benchmark-quality-repeats"
            label="Навчань кожної точки"
            value={qualityRepeats}
            onChange={setQualityRepeats}
            placeholder="напр. 10"
            min={QUALITY_LIMITS.repeats.min}
            max={QUALITY_LIMITS.repeats.max}
            step={1}
            disabled={running}
            hint={`Від ${QUALITY_LIMITS.repeats.min} до ${QUALITY_LIMITS.repeats.max}. Кожна точка навчається стільки разів з іншим набором і початковими вагами: розкид показує, яку різницю дає випадковість.`}
          />
          {experiment.fixedFields.map((field) => {
            if (field === 'profiles') {
              return (
                <div
                  key={field}
                  className="field-stack"
                  title="Профілі навчального набору. Валідаційний і тестовий набори завжди містять усі три профілі."
                >
                  <label className="side-label" htmlFor="benchmark-fixed-profiles">
                    Профілі набору
                  </label>
                  <select
                    id="benchmark-fixed-profiles"
                    value={profileSet}
                    disabled={running}
                    onChange={(event) => setProfileSet(event.target.value)}
                  >
                    {PROFILE_SETS.map((set) => (
                      <option key={set.key} value={set.key}>
                        {set.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }
            const spec = FIXED_FIELDS[field];
            return (
              <NumberField
                key={field}
                id={`benchmark-fixed-${field}`}
                label={spec.label}
                value={fixed[field]}
                onChange={(value) => setFixed((current) => ({ ...current, [field]: value }))}
                placeholder={`напр. ${DEFAULT_FIXED[field]}`}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                disabled={running}
                hint={`Від ${spec.min} до ${spec.max}. ${spec.hint}`}
              />
            );
          })}
        </div>

        <div className="side-section" hidden={mode !== 'performance'}>
          <div className="field-stack" title={PIPELINE_HINTS[pipeline]}>
            <label className="side-label" htmlFor="benchmark-pipeline">
              Алгоритм
            </label>
            <select
              id="benchmark-pipeline"
              value={pipeline}
              onChange={(event) => setPipeline(event.target.value as PerformancePipeline)}
            >
              {PERFORMANCE_PIPELINES.map((id) => (
                <option key={id} value={id}>
                  {PIPELINE_LABELS[id]}
                </option>
              ))}
            </select>
          </div>
          <NumberField
            id="benchmark-performance-repeats"
            label="Запусків кожного файла"
            value={performanceRepeats}
            onChange={setPerformanceRepeats}
            placeholder="напр. 5"
            min={PERFORMANCE_LIMITS.repeats.min}
            max={PERFORMANCE_LIMITS.repeats.max}
            step={1}
            disabled={running}
            hint={`Від ${PERFORMANCE_LIMITS.repeats.min} до ${PERFORMANCE_LIMITS.repeats.max}. З усіх запусків рахуються мінімум, максимум, середнє й медіана.`}
          />
          {pipeline === 'training' && (
            <NumberField
              id="benchmark-performance-epochs"
              label="Епох навчання"
              value={performanceEpochs}
              onChange={setPerformanceEpochs}
              placeholder="напр. 10"
              min={PERFORMANCE_LIMITS.epochs.min}
              max={PERFORMANCE_LIMITS.epochs.max}
              step={1}
              disabled={running}
              hint={`Від ${PERFORMANCE_LIMITS.epochs.min} до ${PERFORMANCE_LIMITS.epochs.max}. Час епох росте пропорційно їхній кількості, тож для заміру досить кількох.`}
            />
          )}
        </div>

        {running ? (
          <button type="button" className="button button-stop" onClick={cancel}>
            Зупинити бенчмарк
          </button>
        ) : (
          <button type="button" className="button button-primary" onClick={() => void start()}>
            {mode === 'quality' ? 'Запустити дослід' : 'Запустити заміри'}
          </button>
        )}
        <FormError message={formError} />

        <div className="side-group">
          <span className="side-label">Результати</span>
          <div className="button-row">
            <button type="button" className="button" disabled={!canSave} onClick={() => save('csv')}>
              Зберегти CSV
            </button>
            <button type="button" className="button" disabled={!canSave} onClick={() => save('json')}>
              Зберегти JSON
            </button>
          </div>
        </div>
      </aside>

      <section className="content" aria-label="Результати бенчмарку">
        {mode === 'quality' ? (
          <QualityResults experiment={experiment} run={qualityRun} cells={quality.cells} verdict={quality.verdict} />
        ) : (
          <PerformanceResults pipeline={pipeline} run={performanceRun} rows={speed.rows} verdict={speed.verdict} />
        )}
      </section>
    </div>
  );
}
