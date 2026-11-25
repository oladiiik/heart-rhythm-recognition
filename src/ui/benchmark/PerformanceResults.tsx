import { useRef } from 'react';
import {
  PERFORMANCE_FILE_SEED,
  PERFORMANCE_NETWORK,
  PERFORMANCE_SIZES,
  PIPELINE_LABELS,
  PIPELINE_STAGES,
  STAGE_LABELS,
  microsecondsPerUnit,
  type PerformancePipeline,
  type PerformanceRow,
  type PerformanceVerdict,
} from '../../benchmark/performance';
import { DEFAULT_TRAINING_CONFIG } from '../../ml/model';
import { RHYTHM_CLASSES, WINDOW_SIZE } from '../../domain/rhythm';
import { formatDuration, formatExact, formatNumber, formatPercent, plural } from '../../format';
import { ScalingChart } from '../charts/ScalingChart';
import { StageChart } from '../charts/StageChart';
import { Placeholder } from '../components/Field';
import { InfoPopover, type InfoRow } from '../components/InfoPopover';
import { SaveImageControl } from '../components/SaveImageControl';
import { environmentRows } from './environmentRows';
import type { PerformanceRun } from './useBenchmarkJobs';

interface PerformanceResultsProps {
  readonly pipeline: PerformancePipeline;
  readonly run: PerformanceRun | undefined;
  readonly rows: readonly PerformanceRow[];
  readonly verdict: PerformanceVerdict | null;
}

const SIZE_LIST = PERFORMANCE_SIZES.map((size) => size.label).join(', ');
const ARCHITECTURE = `${WINDOW_SIZE}-${DEFAULT_TRAINING_CONFIG.hiddenNeurons}-${RHYTHM_CLASSES.length}`;

const PURPOSE: Record<PerformancePipeline, string> = {
  recognition:
    `Застосунок генерує серії пульсу розміром до ${SIZE_LIST} (по одному значенню в рядку, як файл для вкладки «Розпізнавання») ` +
    'і кілька разів розпізнає кожну: читання файла, розбір чисел, нарізання вікон по чотири значення, класифікація кожного вікна мережею й усереднення відповідей.',
  training:
    `Застосунок генерує набори даних у форматі CSV вкладки «Дані» розміром до ${SIZE_LIST} і кілька разів навчає на кожному нову мережу ${ARCHITECTURE}: ` +
    'читання файла, розбір рядків, підготовка даних із першою епохою і решта епох.',
};

const PURPOSE_TAIL =
  'Заміри йдуть в одному окремому потоці, щоб інтерфейс і паралельні обчислення не впливали на час. ' +
  'Генерування файлів і підготовка моделі виконуються до початку відліку.';

const UNIT_TITLES: Record<
  PerformancePipeline,
  { readonly column: string; readonly axis: string; readonly per: string }
> = {
  recognition: { column: 'Значень', axis: 'Значень пульсу', per: 'На одне значення' },
  training: { column: 'Послідовностей', axis: 'Послідовностей', per: 'На послідовність за епоху' },
};

function conditions(pipeline: PerformancePipeline, run: PerformanceRun): InfoRow[] {
  const model =
    pipeline === 'recognition'
      ? `мережа ${ARCHITECTURE}, навчена з параметрами за замовчуванням до початку замірів`
      : `нова мережа ${ARCHITECTURE}, швидкість навчання ${formatExact(PERFORMANCE_NETWORK.learningRate)}, ` +
        `${run.plan.epochs} ${plural(run.plan.epochs, 'епоха', 'епохи', 'епох')} без ранньої зупинки`;
  return [
    { label: 'Алгоритм', value: PIPELINE_LABELS[pipeline] },
    { label: 'Файли', value: `до ${SIZE_LIST}; seed ${PERFORMANCE_FILE_SEED}, однаковий вміст у кожному запуску` },
    { label: 'Запусків кожного файла', value: `${run.plan.repeats}, колами: у кожному колі всі розміри` },
    { label: 'Модель', value: model },
    { label: 'Відлік', value: 'performance.now() від читання файла до готового результату' },
    { label: 'Потоків', value: 1 },
    ...environmentRows(run.environment),
    { label: 'Почато', value: run.startedAt.toLocaleString('uk-UA') },
    { label: 'Тривалість', value: run.status === 'running' ? 'триває' : formatDuration(run.elapsedMs) },
  ];
}

function formatMs(ms: number): string {
  return formatNumber(ms, ms < 100 ? 2 : 1);
}

export function PerformanceResults({ pipeline, run, rows, verdict }: PerformanceResultsProps) {
  const scalingRef = useRef<SVGSVGElement>(null);
  const stagesRef = useRef<SVGSVGElement>(null);

  if (!run) {
    return (
      <Placeholder title={`Заміри «${PIPELINE_LABELS[pipeline]}» ще не запускали`}>
        {PURPOSE[pipeline]} {PURPOSE_TAIL}
      </Placeholder>
    );
  }

  const running = run.status === 'running';
  const units = UNIT_TITLES[pipeline];
  const largest = rows.at(-1);
  const runs = run.plan.repeats;

  return (
    <>
      <div className="content-head">
        {verdict && largest ? (
          <dl className="facts">
            <div className="fact fact-primary">
              <dt>Медіана для {largest.size.label}</dt>
              <dd>
                {formatDuration(largest.total.median)}
                <span className="fact-unit">
                  від {formatDuration(largest.total.min)} до {formatDuration(largest.total.max)}
                </span>
              </dd>
            </div>
            <div className="fact">
              <dt>{units.per}</dt>
              <dd>
                {formatNumber(microsecondsPerUnit(pipeline, largest, run.plan.epochs), 2)}
                <span className="fact-unit">мкс</span>
              </dd>
            </div>
            <div className="fact">
              <dt>Найдовший етап</dt>
              <dd>
                {STAGE_LABELS[verdict.bottleneck.stage]}
                <span className="fact-unit">{formatPercent(verdict.bottleneckShare, 0)} часу</span>
              </dd>
            </div>
            {verdict.fit && (
              <div className="fact" title="Частка розкиду часу, яку пояснює пряма «час = a · кількість + b»">
                <dt>Зростання часу</dt>
                <dd>
                  {verdict.fit.r2 >= 0.99 ? 'лінійне' : 'нелінійне'}
                  <span className="fact-unit">R² = {formatNumber(verdict.fit.r2, 4)}</span>
                </dd>
              </div>
            )}
            <div className="fact" title="Запуск, найдальший від медіани свого файла">
              <dt>Найбільше відхилення</dt>
              <dd>
                {verdict.outlier.excess >= 0 ? '+' : ''}
                {formatPercent(verdict.outlier.excess, 0)}
                <span className="fact-unit">
                  запуск {verdict.outlier.run + 1}, {verdict.outlier.size.label}
                </span>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="notice">
            {running
              ? 'Підсумок з’явиться після всіх запусків: до того таблиця й графіки показують уже завершені.'
              : run.status === 'cancelled'
                ? `Заміри зупинено: завершено ${run.trials.length} з ${run.tasks.length} запусків. Підсумок потребує всіх запусків, тож його не зроблено.`
                : `Заміри не вдалися: ${run.error ?? 'невідома помилка'}.`}
          </p>
        )}
        <InfoPopover subject="умови замірів" rows={conditions(pipeline, run)} />
      </div>

      {rows.length === 0 ? (
        <Placeholder title="Заміри тривають" inline>
          Перші результати з’являться після першого запуску. Спершу потік генерує файли
          {pipeline === 'recognition' ? ' і навчає модель' : ''}: це до відліку не входить.
        </Placeholder>
      ) : (
        <>
          <div className="figure-grid">
            <div className="figure-block">
              <ScalingChart rows={rows} fit={verdict?.fit ?? null} unitTitle={units.axis} svgRef={scalingRef} />
              <div className="figure-footer">
                <SaveImageControl
                  svgRef={scalingRef}
                  baseName={`benchmark-${pipeline}-scaling`}
                  subject="графік часу від обсягу"
                  disabled={running}
                />
              </div>
            </div>
            <div className="figure-block">
              <StageChart rows={rows} stages={PIPELINE_STAGES[pipeline]} svgRef={stagesRef} />
              <div className="figure-footer">
                <SaveImageControl
                  svgRef={stagesRef}
                  baseName={`benchmark-${pipeline}-stages`}
                  subject="графік етапів"
                  disabled={running}
                />
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="numeric">№</th>
                  <th>Межа розміру</th>
                  <th className="numeric">Розмір файла, байт</th>
                  <th className="numeric">{units.column}</th>
                  {Array.from({ length: runs }, (_, i) => (
                    <th key={i} className="numeric">
                      Запуск {i + 1}, мс
                    </th>
                  ))}
                  <th className="numeric">Мін., мс</th>
                  <th className="numeric">Макс., мс</th>
                  <th className="numeric">Середнє, мс</th>
                  <th className="numeric">Медіана, мс</th>
                  <th className="numeric">{units.per}, мкс</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.size.key}>
                    <td className="numeric">{index + 1}</td>
                    <td>{row.size.label}</td>
                    <td className="numeric">{row.fileBytes.toLocaleString('uk-UA')}</td>
                    <td className="numeric">{row.units.toLocaleString('uk-UA')}</td>
                    {Array.from({ length: runs }, (_, i) => (
                      <td key={i} className="numeric">
                        {row.runs[i] === undefined ? '' : formatMs(row.runs[i] as number)}
                      </td>
                    ))}
                    <td className="numeric">{formatMs(row.total.min)}</td>
                    <td className="numeric">{formatMs(row.total.max)}</td>
                    <td className="numeric">{formatMs(row.total.mean)}</td>
                    <td className="numeric">{formatMs(row.total.median)}</td>
                    <td className="numeric">{formatNumber(microsecondsPerUnit(pipeline, row, run.plan.epochs), 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
