import { useRef } from 'react';
import {
  EPOCH_CHECKPOINTS,
  LEARNING_RATES,
  TEST_SET,
  TEST_SET_SIZE,
  TRAIN_TOLERANCE,
  trainSeedOf,
  type QualityCell,
  type QualityExperiment,
  type QualityVerdict,
} from '../../benchmark/quality';
import { formatDuration, formatExact, formatNumber, formatPercent, plural } from '../../format';
import { HeatmapChart } from '../charts/HeatmapChart';
import { SweepChart, type SweepMark, type SweepSeries } from '../charts/SweepChart';
import { CATEGORICAL, CHART, ORDINAL_BLUE } from '../charts/chartTheme';
import { stepDecimals } from '../charts/scales';
import { Placeholder } from '../components/Field';
import { InfoPopover, type InfoRow } from '../components/InfoPopover';
import { SaveImageControl } from '../components/SaveImageControl';
import { describeCell, describeFixed, describeVaried, describeX, seriesLabel } from './describe';
import { environmentRows } from './environmentRows';
import type { QualityRun } from './useBenchmarkJobs';

interface QualityResultsProps {
  readonly experiment: QualityExperiment;
  readonly run: QualityRun | undefined;
  readonly cells: readonly QualityCell[];
  readonly verdict: QualityVerdict | null;
}

const EXPERIMENT_PURPOSE: Record<QualityExperiment['id'], string> = {
  epochs:
    `Мережу навчають до ${EPOCH_CHECKPOINTS.at(-1)} епох із кожною з п'яти швидкостей навчання ` +
    `(${LEARNING_RATES.map(formatExact).join('; ')}) ` +
    `і перевіряють точність на ${EPOCH_CHECKPOINTS.length} контрольних епохах. Дослід показує, скільки епох потрібно і з якою швидкістю.`,
  hidden:
    'Мережу навчають із прихованим шаром від 1 до 32 нейронів за однакових епох і швидкості. ' +
    'Дослід показує, з якого розміру шару точність перестає рости, а час навчання продовжує.',
  dataset:
    'Мережу навчають на наборах із чотирьох комбінацій профілів і чотирьох розмірів, від 100 до 3000 послідовностей на клас. ' +
    'Дослід показує, на якому наборі мережа найкраще розпізнає змішані дані.',
};

const PURPOSE_TAIL =
  `Точність щоразу перевіряють на тих самих ${TEST_SET_SIZE} тестових послідовностях, яких мережа не бачила. ` +
  'Кожну точку навчають кілька разів з іншим набором і початковими вагами: розкид між запусками показує, яку різницю дає сама випадковість.';

function seriesColor(experiment: QualityExperiment, index: number): string {
  if (experiment.series.length === 1) return CHART.series;
  return (experiment.id === 'epochs' ? ORDINAL_BLUE[index] : CATEGORICAL[index]) ?? CHART.series;
}

function conditions(experiment: QualityExperiment, run: QualityRun): InfoRow[] {
  const { plan } = run;
  return [
    { label: 'Змінюється', value: describeVaried(experiment) },
    { label: 'Незмінні параметри', value: describeFixed(experiment, plan.fixed) },
    { label: 'Рання зупинка', value: 'вимкнена: виконуються всі епохи' },
    { label: 'Навчань кожної точки', value: plan.repeats },
    {
      label: 'Навчальні набори',
      value: `seed від ${trainSeedOf(0)} до ${trainSeedOf(plan.repeats - 1)}, свій у кожному повторі; допуск ${TRAIN_TOLERANCE} уд/хв`,
    },
    { label: 'Тестовий набір', value: `${TEST_SET_SIZE} послідовностей, усі профілі, seed ${TEST_SET.seed}` },
    { label: 'Потоків', value: run.workers },
    ...environmentRows(run.environment),
    { label: 'Почато', value: run.startedAt.toLocaleString('uk-UA') },
    { label: 'Тривалість', value: run.status === 'running' ? 'триває' : formatDuration(run.elapsedMs) },
  ];
}

function thresholdNote(verdict: QualityVerdict): string {
  const { best } = verdict;
  return best.accuracy.mean - best.accuracy.min >= 1 / TEST_SET_SIZE
    ? 'найгірший запуск найкращого'
    : 'на одну тестову послідовність нижче найкращої';
}

function savingNote(verdict: QualityVerdict): string {
  if (verdict.cheapest === verdict.best) return 'той самий варіант';
  return `обчислень у ${formatNumber(verdict.best.work / verdict.cheapest.work, 1)} раза менше`;
}

function verdictLabel(cell: QualityCell, verdict: QualityVerdict | null): string {
  if (!verdict) return '';
  if (cell === verdict.best) return cell === verdict.cheapest ? 'найкраща й найдешевша' : 'найкраща';
  if (cell === verdict.cheapest) return 'найдешевша рівноцінна';
  return cell.accuracy.mean >= verdict.threshold - 1e-9 ? 'рівноцінна' : '';
}

function marksOf(verdict: QualityVerdict | null): SweepMark[] {
  if (!verdict) return [];
  const { best, cheapest } = verdict;
  if (best === cheapest) return [{ series: best.series, x: best.x, label: 'найкраща', dashed: false }];
  return [
    { series: best.series, x: best.x, label: 'найкраща', dashed: false },
    { series: cheapest.series, x: cheapest.x, label: 'найдешевша рівноцінна', dashed: true },
  ];
}

type CellPoint = QualityCell & { readonly mean: number; readonly min: number; readonly max: number };

export function QualityResults({ experiment, run, cells, verdict }: QualityResultsProps) {
  const accuracyRef = useRef<SVGSVGElement>(null);
  const sideRef = useRef<SVGSVGElement>(null);

  if (!run) {
    return (
      <Placeholder title={`Дослід «${experiment.label}» ще не запускали`}>
        {EXPERIMENT_PURPOSE[experiment.id]} {PURPOSE_TAIL}
      </Placeholder>
    );
  }

  const running = run.status === 'running';
  const multiSeries = experiment.series.length > 1;
  const seriesOf = (
    pick: (cell: QualityCell) => { mean: number; min: number; max: number },
  ): SweepSeries<CellPoint>[] =>
    experiment.series.map((series, index) => ({
      key: series.key,
      label: series.label,
      color: seriesColor(experiment, index),
      points: cells.filter((cell) => cell.series === series.key).map((cell) => ({ ...cell, ...pick(cell) })),
    }));
  const accuracySeries = seriesOf((cell) => cell.accuracy);
  const marks = marksOf(verdict);
  const focus = verdict?.best.series ?? (multiSeries ? null : (experiment.series[0]?.key ?? null));

  const cellTooltip = (cell: QualityCell) => (
    <>
      <strong>
        {multiSeries ? `${experiment.seriesTitle} ${seriesLabel(experiment, cell.series)}, ` : ''}
        {describeX(experiment.id, cell.x)}
      </strong>
      <span>
        точність {formatPercent(cell.accuracy.mean)} (від {formatPercent(cell.accuracy.min)} до{' '}
        {formatPercent(cell.accuracy.max)})
      </span>
      <span>
        σ {formatPercent(cell.accuracy.std, 2)}, {cell.accuracy.count}{' '}
        {plural(cell.accuracy.count, 'навчання', 'навчання', 'навчань')}
      </span>
      <span>час навчання {formatDuration(cell.trainMs.median)} (медіана)</span>
    </>
  );

  // Колір теплової карти за часткою помилок у логарифмі: так розрізняються й 95%, і 99%, а не лише 40% і 90%
  const errorRates = cells.map((cell) => Math.max(1 - cell.accuracy.mean, 1 / TEST_SET_SIZE));
  const worstError = Math.max(...errorRates);
  const bestError = Math.min(...errorRates);
  const shade = (cell: QualityCell): number => {
    const error = Math.max(1 - cell.accuracy.mean, 1 / TEST_SET_SIZE);
    return worstError === bestError ? 1 : Math.log(worstError / error) / Math.log(worstError / bestError);
  };
  const cellByKey = new Map(cells.map((cell) => [`${cell.series}|${cell.x}`, cell]));

  return (
    <>
      <div className="content-head">
        {verdict ? (
          <dl className="facts">
            <div className="fact fact-primary">
              <dt>Найкраща середня точність</dt>
              <dd>
                {formatPercent(verdict.best.accuracy.mean)}
                <span className="fact-unit">
                  з {verdict.best.accuracy.count}{' '}
                  {plural(verdict.best.accuracy.count, 'навчання', 'навчання', 'навчань')}
                </span>
              </dd>
            </div>
            <div className="fact">
              <dt>Найкращий варіант</dt>
              <dd>{describeCell(experiment, verdict.best)}</dd>
            </div>
            <div
              className="fact"
              title="Варіанти із середньою точністю не нижче цієї межі відрізняються від найкращого не більше, ніж запуски найкращого між собою"
            >
              <dt>Межа рівноцінності</dt>
              <dd>
                {formatPercent(verdict.threshold)}
                <span className="fact-unit">{thresholdNote(verdict)}</span>
              </dd>
            </div>
            <div className="fact">
              <dt>Найдешевший рівноцінний</dt>
              <dd>
                {describeCell(experiment, verdict.cheapest)}
                <span className="fact-unit">{savingNote(verdict)}</span>
              </dd>
            </div>
            <div className="fact">
              <dt>Навчань</dt>
              <dd>
                {run.trials.length}
                <span className="fact-unit">
                  за {formatDuration(run.elapsedMs)}, {run.workers} {plural(run.workers, 'потік', 'потоки', 'потоків')}
                </span>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="notice">
            {running
              ? 'Висновок з’явиться, коли завершаться всі повтори: до того точки показують середнє з уже завершених навчань.'
              : run.status === 'cancelled'
                ? `Дослід зупинено: завершено ${run.trials.length} з ${run.tasks.length} навчань. Висновок потребує всіх повторів, тож його не зроблено.`
                : `Дослід не вдався: ${run.error ?? 'невідома помилка'}.`}
          </p>
        )}
        <InfoPopover subject="умови досліду" rows={conditions(experiment, run)} />
      </div>

      {cells.length === 0 ? (
        <Placeholder title="Навчання триває" inline>
          Перші точки з’являться, щойно завершиться перше навчання.
        </Placeholder>
      ) : (
        <>
          <div className="figure-grid">
            <div className="figure-block">
              <SweepChart
                title="Точність на тестовому наборі (середнє і розкид запусків)"
                xTitle={experiment.xTitle}
                legendTitle={experiment.seriesTitle}
                xs={experiment.xs}
                series={accuracySeries}
                formatY={(value, step) => formatPercent(value, stepDecimals(step * 100))}
                yLimit={{ max: 1 }}
                marks={marks}
                focus={focus}
                renderTooltip={(_, point) => cellTooltip(point)}
                svgRef={accuracyRef}
              />
              <div className="figure-footer">
                <span className="notice">Смуга: від найгіршого до найкращого запуску виділеної лінії</span>
                <SaveImageControl
                  svgRef={accuracyRef}
                  baseName={`benchmark-${experiment.id}-accuracy`}
                  subject="графік точності"
                  disabled={running}
                />
              </div>
            </div>
            <div className="figure-block">
              {multiSeries ? (
                <HeatmapChart
                  title="Середня точність кожного варіанта"
                  rowTitle={experiment.seriesTitle ?? ''}
                  colTitle={experiment.xTitle}
                  rows={experiment.series}
                  cols={experiment.xs}
                  cellAt={(row, col) => cellByKey.get(`${row}|${col}`)}
                  shade={shade}
                  formatCell={(cell) => formatPercent(cell.accuracy.mean)}
                  isEquivalent={(cell) => verdict !== null && cell.accuracy.mean >= verdict.threshold - 1e-9}
                  best={verdict ? { row: verdict.best.series, col: verdict.best.x } : null}
                  cheapest={verdict ? { row: verdict.cheapest.series, col: verdict.cheapest.x } : null}
                  scaleLabels={[formatPercent(1 - worstError), formatPercent(1 - bestError)]}
                  renderTooltip={(_, __, cell) => cellTooltip(cell)}
                  svgRef={sideRef}
                />
              ) : (
                <SweepChart
                  title="Час навчання одного варіанта (медіана і розкид)"
                  xTitle={experiment.xTitle}
                  legendTitle={null}
                  xs={experiment.xs}
                  series={seriesOf((cell) => ({
                    mean: cell.trainMs.median,
                    min: cell.trainMs.min,
                    max: cell.trainMs.max,
                  }))}
                  formatY={(value) => (value === 0 ? '0' : formatDuration(value))}
                  yLimit={{ min: 0 }}
                  focus={focus}
                  renderTooltip={(_, point) => cellTooltip(point)}
                  svgRef={sideRef}
                />
              )}
              <div className="figure-footer">
                <span className="notice">
                  {multiSeries
                    ? 'Колір за часткою помилок у логарифмічній шкалі: різниця 95% і 99% видна так само, як 50% і 90%'
                    : `Навчання йшли паралельно в ${run.workers} ${plural(run.workers, 'потоці', 'потоках', 'потоках')}, тому час більший, ніж для одного навчання`}
                </span>
                <SaveImageControl
                  svgRef={sideRef}
                  baseName={`benchmark-${experiment.id}-${multiSeries ? 'heatmap' : 'time'}`}
                  subject={multiSeries ? 'теплова карта точності' : 'графік часу навчання'}
                  disabled={running}
                />
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {multiSeries && <th>{experiment.seriesTitle}</th>}
                  <th className="numeric">{experiment.xTitle}</th>
                  <th className="numeric">Точність, середня</th>
                  <th className="numeric">Мін.</th>
                  <th className="numeric">Макс.</th>
                  <th className="numeric">σ</th>
                  <th className="numeric">Навчань</th>
                  <th
                    className="numeric"
                    title="Середньоквадратична похибка на навчальному наборі після останньої епохи"
                  >
                    Похибка навчання
                  </th>
                  <th className="numeric">Час навчання, медіана</th>
                  <th className="numeric" title="Епохи × навчальні послідовності × ваги мережі">
                    Обчислень, млн
                  </th>
                  <th>Висновок</th>
                </tr>
              </thead>
              <tbody>
                {cells.map((cell) => (
                  <tr key={`${cell.series}|${cell.x}`} className={cell === verdict?.best ? 'row-selected' : undefined}>
                    {multiSeries && <td>{seriesLabel(experiment, cell.series)}</td>}
                    <td className="numeric">{cell.x}</td>
                    <td className="numeric">{formatPercent(cell.accuracy.mean, 2)}</td>
                    <td className="numeric">{formatPercent(cell.accuracy.min, 2)}</td>
                    <td className="numeric">{formatPercent(cell.accuracy.max, 2)}</td>
                    <td className="numeric">{formatPercent(cell.accuracy.std, 2)}</td>
                    <td className="numeric">{cell.accuracy.count}</td>
                    <td className="numeric">{formatNumber(cell.error.mean, 4)}</td>
                    <td className="numeric">{formatDuration(cell.trainMs.median)}</td>
                    <td className="numeric">{formatNumber(cell.work / 1e6, 1)}</td>
                    <td>{verdictLabel(cell, verdict)}</td>
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
