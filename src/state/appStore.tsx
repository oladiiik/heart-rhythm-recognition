import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { MIN_TOTAL_SEQUENCES, type GeneratorConfig, type LabeledSequence } from '../domain/generator';
import { countByClass, splitDataset } from '../domain/metrics';
import { RHYTHM_CLASSES, type ClassProbabilities, type RhythmClass } from '../domain/rhythm';
import { MAX_LOG_ENTRIES, type LogEntry, type LogLevel } from '../log/operationLog';
import {
  parseModelSnapshot,
  validateTrainingConfig,
  type EpochStatus,
  type ModelSnapshot,
  type RhythmModel,
  type TrainingConfig,
} from '../ml/model';
import { startTraining, type TrainingJob } from '../ml/trainingClient';
import { formatDuration, formatNumber, formatPercent } from '../format';

export interface FileInfo {
  readonly name: string;
  readonly sizeBytes: number;
  readonly type: string;
  readonly lastModified: Date;
}

export type DatasetSource =
  | { readonly kind: 'generated'; readonly config: GeneratorConfig; readonly elapsedMs: number }
  | { readonly kind: 'file'; readonly file: FileInfo };

export interface DatasetState {
  readonly sequences: readonly LabeledSequence[];
  readonly source: DatasetSource;
  readonly createdAt: Date;
}

export interface ModelState {
  readonly model: RhythmModel;
  readonly snapshot: ModelSnapshot;
  readonly file: FileInfo | null;
}

export type ActivityOutcome = 'success' | 'cancelled' | 'error';

export type Activity =
  | { readonly status: 'idle' }
  | {
      readonly status: 'running';
      readonly title: string;
      readonly detail: string;
      readonly progress: number;
      readonly startedAt: number;
    }
  | {
      readonly status: 'finished';
      readonly title: string;
      readonly detail: string;
      readonly outcome: ActivityOutcome;
      readonly elapsedMs: number;
    };

export interface RecognitionRecord {
  readonly id: number;
  readonly time: Date;
  readonly series: readonly number[];
  readonly label: RhythmClass;
  readonly probabilities: ClassProbabilities;
  readonly perWindow: readonly ClassProbabilities[];
  readonly elapsedMs: number;
}

interface AppState {
  readonly dataset: DatasetState | null;
  readonly model: ModelState | null;
  readonly activity: Activity;
  readonly lossHistory: readonly EpochStatus[];
  readonly logEntries: readonly LogEntry[];
  readonly recognitions: readonly RecognitionRecord[];
}

type Action =
  | { type: 'datasetReplaced'; dataset: DatasetState }
  | { type: 'modelReplaced'; model: ModelState; lossHistory?: readonly EpochStatus[] }
  | { type: 'activityChanged'; activity: Activity }
  | { type: 'trainingStarted'; activity: Activity }
  | { type: 'epochReported'; status: EpochStatus; activity: Activity }
  | { type: 'logAppended'; entry: LogEntry }
  | { type: 'logCleared' }
  | { type: 'recognitionAdded'; record: RecognitionRecord }
  | { type: 'recognitionsCleared' };

const MAX_RECOGNITIONS = 200;

const initialState: AppState = {
  dataset: null,
  model: null,
  activity: { status: 'idle' },
  lossHistory: [],
  logEntries: [],
  recognitions: [],
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'datasetReplaced':
      return { ...state, dataset: action.dataset };
    case 'modelReplaced':
      return { ...state, model: action.model, lossHistory: action.lossHistory ?? [] };
    case 'activityChanged':
      return { ...state, activity: action.activity };
    case 'trainingStarted':
      return { ...state, activity: action.activity, lossHistory: [] };
    case 'epochReported':
      return { ...state, activity: action.activity, lossHistory: [...state.lossHistory, action.status] };
    case 'logAppended':
      return { ...state, logEntries: [...state.logEntries, action.entry].slice(-MAX_LOG_ENTRIES) };
    case 'logCleared':
      return { ...state, logEntries: [] };
    case 'recognitionAdded':
      return { ...state, recognitions: [action.record, ...state.recognitions].slice(0, MAX_RECOGNITIONS) };
    case 'recognitionsCleared':
      return { ...state, recognitions: [] };
  }
}

export interface TrainingRequest {
  readonly config: TrainingConfig;
  readonly testShare: number;
  readonly splitSeed: number;
}

interface AppActions {
  log(level: LogLevel, message: string): void;
  clearLog(): void;
  setDataset(dataset: DatasetState): void;
  loadModel(raw: unknown, file: FileInfo): void;
  train(request: TrainingRequest): string | null;
  cancelTraining(): void;
  reportActivity(activity: Activity): void;
  addRecognition(record: Omit<RecognitionRecord, 'id' | 'time'>): void;
  clearRecognitions(): void;
}

interface AppContextValue extends AppState, AppActions {
  readonly isTraining: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function fileInfoOf(file: File): FileInfo {
  return {
    name: file.name,
    sizeBytes: file.size,
    type: file.type || 'невідомий',
    lastModified: new Date(file.lastModified),
  };
}

export const MIN_TEST_SHARE = 0.05;
export const MAX_TEST_SHARE = 0.5;

function validateTrainingRequest(dataset: DatasetState | null, request: TrainingRequest): string | null {
  if (!dataset) return 'Немає набору даних: спершу згенеруйте або завантажте його на вкладці «Дані».';
  if (dataset.sequences.length < MIN_TOTAL_SEQUENCES) {
    return `Набір замалий: ${dataset.sequences.length} послідовностей, а потрібно щонайменше ${MIN_TOTAL_SEQUENCES}.`;
  }
  const counts = countByClass(dataset.sequences);
  if (RHYTHM_CLASSES.some((rhythm) => counts[rhythm] < 2)) {
    return 'У наборі мають бути послідовності всіх трьох класів.';
  }
  if (!(request.testShare >= MIN_TEST_SHARE && request.testShare <= MAX_TEST_SHARE)) {
    return `Частка тестових даних — від ${MIN_TEST_SHARE * 100}% до ${MAX_TEST_SHARE * 100}%.`;
  }
  return validateTrainingConfig(request.config);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const nextId = useRef(1);
  const job = useRef<TrainingJob | null>(null);
  const trainingStartedAt = useRef(0);
  const datasetRef = useRef(state.dataset);
  datasetRef.current = state.dataset;

  const log = useCallback((level: LogLevel, message: string) => {
    dispatch({ type: 'logAppended', entry: { id: nextId.current++, time: new Date(), level, message } });
  }, []);

  const clearLog = useCallback(() => dispatch({ type: 'logCleared' }), []);

  const reportActivity = useCallback((activity: Activity) => dispatch({ type: 'activityChanged', activity }), []);

  const setDataset = useCallback((dataset: DatasetState) => dispatch({ type: 'datasetReplaced', dataset }), []);

  const loadModel = useCallback((raw: unknown, file: FileInfo) => {
    const { model, snapshot } = parseModelSnapshot(raw);
    dispatch({ type: 'modelReplaced', model: { model, snapshot, file } });
  }, []);

  const train = useCallback(
    (request: TrainingRequest): string | null => {
      if (job.current) return 'Навчання вже триває.';
      const dataset = datasetRef.current;
      const problem = validateTrainingRequest(dataset, request);
      if (problem || !dataset) return problem;

      const { config } = request;
      const { train: trainSet, test: testSet } = splitDataset(dataset.sequences, request.testShare, request.splitSeed);
      const title = 'Навчання мережі';
      trainingStartedAt.current = performance.now();
      dispatch({
        type: 'trainingStarted',
        activity: {
          status: 'running',
          title,
          detail: `епоха 0 з ${config.epochs}`,
          progress: 0,
          startedAt: trainingStartedAt.current,
        },
      });
      log(
        'info',
        `Навчання розпочато: ${trainSet.length} навчальних і ${testSet.length} тестових послідовностей, ` +
          `епох ${config.epochs}, швидкість навчання ${config.learningRate}, ` +
          `прихованих нейронів ${config.hiddenNeurons}, поріг похибки ${config.errorThreshold}.`,
      );

      job.current = startTraining(
        { train: trainSet, test: testSet, config },
        {
          onEpoch: ({ epoch, totalEpochs, error }) =>
            dispatch({
              type: 'epochReported',
              status: { epoch, error },
              activity: {
                status: 'running',
                title,
                detail: `епоха ${epoch} з ${totalEpochs}, похибка ${formatNumber(error, 4)}`,
                progress: epoch / totalEpochs,
                startedAt: trainingStartedAt.current,
              },
            }),
          onEvaluating: ({ processed, total }) =>
            dispatch({
              type: 'activityChanged',
              activity: {
                status: 'running',
                title: 'Перевірка на тестових даних',
                detail: `оброблено ${processed} з ${total} послідовностей (${formatPercent(processed / total, 0)})`,
                progress: processed / total,
                startedAt: trainingStartedAt.current,
              },
            }),
          onDone: (result) => {
            job.current = null;
            const { model } = parseModelSnapshot(result.snapshot);
            const { summary } = result.snapshot;
            const stoppedEarly = summary.epochsRun < config.epochs;
            dispatch({
              type: 'modelReplaced',
              model: { model, snapshot: result.snapshot, file: null },
              lossHistory: result.history,
            });
            dispatch({
              type: 'activityChanged',
              activity: {
                status: 'finished',
                title,
                detail:
                  `${summary.epochsRun} епох` +
                  (stoppedEarly ? ' (похибка досягла порогу раніше)' : '') +
                  `, точність ${formatPercent(result.metrics.accuracy)}`,
                outcome: 'success',
                elapsedMs: result.trainMs + result.evaluationMs,
              },
            });
            log(
              'success',
              `Навчання завершено за ${formatDuration(result.trainMs)}: ${summary.epochsRun} епох з ${config.epochs}` +
                (stoppedEarly ? ' (рання зупинка за порогом похибки)' : '') +
                `, кінцева похибка ${formatNumber(summary.finalError, 5)}.`,
            );
            log(
              'success',
              `Перевірка на ${result.metrics.total} тестових послідовностях за ${formatDuration(result.evaluationMs)}: ` +
                `правильно ${result.metrics.correct}, точність ${formatPercent(result.metrics.accuracy)}.`,
            );
          },
          onFailed: (message) => {
            job.current = null;
            dispatch({
              type: 'activityChanged',
              activity: {
                status: 'finished',
                title,
                detail: message,
                outcome: 'error',
                elapsedMs: performance.now() - trainingStartedAt.current,
              },
            });
            log('error', `Навчання не вдалося: ${message}`);
          },
        },
      );
      return null;
    },
    [log],
  );

  const cancelTraining = useCallback(() => {
    if (!job.current) return;
    job.current.cancel();
    job.current = null;
    const elapsedMs = performance.now() - trainingStartedAt.current;
    dispatch({
      type: 'activityChanged',
      activity: {
        status: 'finished',
        title: 'Навчання мережі',
        detail: 'зупинено користувачем, попередня модель збережена',
        outcome: 'cancelled',
        elapsedMs,
      },
    });
    log('warning', `Навчання зупинено користувачем через ${formatDuration(elapsedMs)}.`);
  }, [log]);

  const addRecognition = useCallback((record: Omit<RecognitionRecord, 'id' | 'time'>) => {
    dispatch({ type: 'recognitionAdded', record: { ...record, id: nextId.current++, time: new Date() } });
  }, []);

  const clearRecognitions = useCallback(() => dispatch({ type: 'recognitionsCleared' }), []);

  const isTraining = state.activity.status === 'running';

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      isTraining,
      log,
      clearLog,
      setDataset,
      loadModel,
      train,
      cancelTraining,
      reportActivity,
      addRecognition,
      clearRecognitions,
    }),
    [
      state,
      isTraining,
      log,
      clearLog,
      setDataset,
      loadModel,
      train,
      cancelTraining,
      reportActivity,
      addRecognition,
      clearRecognitions,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp можна викликати лише всередині AppProvider.');
  return context;
}
