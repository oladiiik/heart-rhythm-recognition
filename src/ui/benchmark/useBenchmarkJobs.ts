import { useCallback, useEffect, useRef, useState } from 'react';
import { detectEnvironment, type BenchmarkEnvironment } from '../../benchmark/environment';
import {
  PIPELINE_LABELS,
  STAGE_LABELS,
  aggregatePerformance,
  buildPerformanceTasks,
  judgePerformance,
  validatePerformancePlan,
  type PerformancePipeline,
  type PerformancePlan,
  type PerformanceTask,
  type PerformanceTrial,
} from '../../benchmark/performance';
import {
  QUALITY_EXPERIMENTS,
  VALIDATION_SET_SIZE,
  aggregateQuality,
  buildQualityTasks,
  judgeQuality,
  validateQualityPlan,
  type QualityCell,
  type QualityExperimentId,
  type QualityPlan,
  type QualityTask,
  type QualityTrial,
} from '../../benchmark/quality';
import {
  startPerformanceRun,
  startQualityRun,
  type BenchmarkJob,
  type RunHandlers,
  type RunProgress,
} from '../../benchmark/runner';
import { formatDuration, formatExact, formatPercent, plural } from '../../format';
import { useApp } from '../../state/appStore';
import { describeCell, describeFixed } from './describe';

export type RunStatus = 'running' | 'completed' | 'cancelled' | 'failed';

export interface RunRecord<Plan, Task, Trial> {
  readonly plan: Plan;
  readonly tasks: readonly Task[];
  readonly trials: readonly Trial[];
  readonly status: RunStatus;
  readonly startedAt: Date;
  readonly elapsedMs: number;
  readonly workers: number;
  readonly environment: BenchmarkEnvironment;
  readonly error: string | null;
}

export type QualityRun = RunRecord<QualityPlan, QualityTask, QualityTrial>;
export type PerformanceRun = RunRecord<PerformancePlan, PerformanceTask, PerformanceTrial>;

type Update<Run> = (change: (run: Run | undefined) => Run | undefined) => void;

interface JobSpec<Plan, Task, Trial> {
  readonly title: string;
  /** Родовий відмінок множини для «завершено k з n …» */
  readonly unit: string;
  readonly plan: Plan;
  readonly tasks: readonly Task[];
  readonly update: Update<RunRecord<Plan, Task, Trial>>;
  start(tasks: readonly Task[], handlers: RunHandlers<Trial>): BenchmarkJob;
  startMessage(workers: number): string;
  /** Короткий підсумок для рядка стану і повний для журналу */
  finish(trials: readonly Trial[]): { readonly detail: string; readonly message: string };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Запуски бенчмарку: зберігає результати кожного досліду окремо, тож перемикання між ними нічого не губить.
 * Поки йде запуск, процесор зайнятий для решти застосунку (навчання не стартує)
 */
export function useBenchmarkJobs() {
  const { beginBenchmark, endBenchmark, reportActivity, log } = useApp();
  const [qualityRuns, setQualityRuns] = useState<Partial<Record<QualityExperimentId, QualityRun>>>({});
  const [performanceRuns, setPerformanceRuns] = useState<Partial<Record<PerformancePipeline, PerformanceRun>>>({});
  const job = useRef<BenchmarkJob | null>(null);

  useEffect(() => () => job.current?.cancel(), []);

  const runJob = useCallback(
    async <Plan, Task, Trial>(spec: JobSpec<Plan, Task, Trial>): Promise<string | null> => {
      const busy = beginBenchmark();
      if (busy) return busy;
      try {
        const environment = await detectEnvironment();
        const startedAt = performance.now();
        const trials: Trial[] = [];
        const report = ({ fraction, completedTasks, totalTasks }: RunProgress): void =>
          reportActivity({
            status: 'running',
            title: spec.title,
            detail: `завершено ${completedTasks} з ${totalTasks} ${spec.unit}`,
            progress: fraction,
            startedAt,
          });
        const current = spec.start(spec.tasks, {
          onTrial: (trial) => {
            trials.push(trial);
            const snapshot = trials.slice();
            spec.update((run) => run && { ...run, trials: snapshot });
          },
          onProgress: report,
        });
        job.current = current;
        spec.update(() => ({
          plan: spec.plan,
          tasks: spec.tasks,
          trials: [],
          status: 'running',
          startedAt: new Date(),
          elapsedMs: 0,
          workers: current.workers,
          environment,
          error: null,
        }));
        report({ fraction: 0, completedTasks: 0, totalTasks: spec.tasks.length });
        log('info', spec.startMessage(current.workers));

        let status: RunStatus;
        let error: string | null = null;
        try {
          status = await current.finished;
        } catch (failure) {
          status = 'failed';
          error = messageOf(failure);
        }
        const elapsedMs = performance.now() - startedAt;
        const snapshot = trials.slice();
        spec.update((run) => run && { ...run, trials: snapshot, status, elapsedMs, error });

        const progress = `завершено ${snapshot.length} з ${spec.tasks.length} ${spec.unit}`;
        if (status === 'completed') {
          const { detail, message } = spec.finish(snapshot);
          reportActivity({ status: 'finished', title: spec.title, detail, outcome: 'success', elapsedMs });
          log('success', `${spec.title} завершено за ${formatDuration(elapsedMs)}. ${message}`);
        } else if (status === 'cancelled') {
          reportActivity({
            status: 'finished',
            title: spec.title,
            detail: `зупинено, ${progress}`,
            outcome: 'cancelled',
            elapsedMs,
          });
          log('warning', `${spec.title} зупинено користувачем через ${formatDuration(elapsedMs)}: ${progress}.`);
        } else {
          reportActivity({ status: 'finished', title: spec.title, detail: error ?? '', outcome: 'error', elapsedMs });
          log('error', `${spec.title} не вдався: ${error}`);
        }
        return null;
      } finally {
        job.current = null;
        endBenchmark();
      }
    },
    [beginBenchmark, endBenchmark, reportActivity, log],
  );

  const startQuality = useCallback(
    (plan: QualityPlan): Promise<string | null> => {
      const problem = validateQualityPlan(plan);
      if (problem) return Promise.resolve(problem);
      const experiment = QUALITY_EXPERIMENTS[plan.experiment];
      const tasks = buildQualityTasks(plan);
      const fixedText = describeFixed(experiment, plan.fixed);
      return runJob<QualityPlan, QualityTask, QualityTrial>({
        title: `Дослід «${experiment.label}»`,
        unit: 'навчань',
        plan,
        tasks,
        update: (change) =>
          setQualityRuns((runs) => {
            const next = change(runs[plan.experiment]);
            return next ? { ...runs, [plan.experiment]: next } : runs;
          }),
        start: startQualityRun,
        startMessage: (workers) =>
          `Дослід «${experiment.label}» розпочато: ${tasks.length} ${plural(tasks.length, 'навчання', 'навчання', 'навчань')} ` +
          `у ${workers} ${plural(workers, 'потоці', 'потоках', 'потоках')}, кожна точка ${plan.repeats} ${plural(plan.repeats, 'раз', 'рази', 'разів')}; ${fixedText}; ` +
          `валідаційний і тестовий набори по ${VALIDATION_SET_SIZE} послідовностей.`,
        finish: (trials) => {
          const cells = aggregateQuality(experiment, tasks, trials);
          const verdict = judgeQuality(cells, plan.repeats);
          if (!verdict) return { detail: 'немає повних результатів', message: 'Повних результатів немає.' };
          const accuracies = (cell: QualityCell): string =>
            `валідація ${formatPercent(cell.accuracy.mean)}, тест ${formatPercent(cell.testAccuracy.mean)}`;
          const best = `${describeCell(experiment, verdict.best)} (${accuracies(verdict.best)})`;
          const recommended = `${describeCell(experiment, verdict.recommended)} (${accuracies(verdict.recommended)})`;
          return {
            detail: `найкраща точність ${formatPercent(verdict.best.accuracy.mean)}`,
            message:
              `Найкраща середня точність: ${best}. ` +
              (verdict.recommended === verdict.best
                ? 'Рекомендований варіант збігається з найкращим.'
                : `Рекомендований варіант: ${recommended}.`),
          };
        },
      });
    },
    [runJob],
  );

  const startPerformance = useCallback(
    (plan: PerformancePlan): Promise<string | null> => {
      const problem = validatePerformancePlan(plan);
      if (problem) return Promise.resolve(problem);
      const tasks = buildPerformanceTasks(plan);
      const label = PIPELINE_LABELS[plan.pipeline];
      return runJob<PerformancePlan, PerformanceTask, PerformanceTrial>({
        title: `Заміри «${label}»`,
        unit: 'запусків',
        plan,
        tasks,
        update: (change) =>
          setPerformanceRuns((runs) => {
            const next = change(runs[plan.pipeline]);
            return next ? { ...runs, [plan.pipeline]: next } : runs;
          }),
        start: startPerformanceRun,
        startMessage: () =>
          `Заміри «${label}» розпочато: файли до 500 КБ, 1, 5 і 10 МБ, кожен ${plan.repeats} ${plural(plan.repeats, 'раз', 'рази', 'разів')}, в одному потоці` +
          (plan.pipeline === 'training'
            ? `, ${plan.epochs} ${plural(plan.epochs, 'епоха', 'епохи', 'епох')} навчання.`
            : '.'),
        finish: (trials) => {
          const rows = aggregatePerformance(plan.pipeline, tasks, trials);
          const verdict = judgePerformance(rows, plan.repeats);
          const largest = rows.at(-1);
          if (!verdict || !largest) return { detail: 'немає повних результатів', message: 'Повних результатів немає.' };
          const bottleneck = `${STAGE_LABELS[verdict.bottleneck.stage].toLowerCase()} (${formatPercent(verdict.bottleneckShare, 0)} часу)`;
          return {
            detail: `${largest.size.label}: медіана ${formatDuration(largest.total.median)}`,
            message:
              `Медіана для ${largest.size.label}: ${formatDuration(largest.total.median)}; ` +
              `найдовший етап: ${bottleneck}` +
              (verdict.fit ? `; R² прямої ${formatExact(Number(verdict.fit.r2.toFixed(4)))}.` : '.'),
          };
        },
      });
    },
    [runJob],
  );

  const cancel = useCallback(() => job.current?.cancel(), []);

  return { qualityRuns, performanceRuns, startQuality, startPerformance, cancel };
}
