import { useMemo, useRef, useState } from 'react';
import { RHYTHM_CLASSES, WINDOW_SIZE } from '../../domain/rhythm';
import { fileTimestamp, formatFileSize, saveText } from '../../export/fileSave';
import { DEFAULT_TRAINING_CONFIG, TRAINING_LIMITS, type TrainingConfig } from '../../ml/model';
import { MAX_TEST_SHARE, MIN_TEST_SHARE, fileInfoOf, useApp, type ModelState } from '../../state/appStore';
import { ConfusionMatrix } from '../charts/ClassViews';
import { LossChart } from '../charts/LossChart';
import { FileDrop } from '../components/FileDrop';
import { FormError, NumberField, Placeholder } from '../components/Field';
import { InfoPopover, type InfoRow } from '../components/InfoPopover';
import { SaveImageControl } from '../components/SaveImageControl';
import { formatDuration, formatExact, formatNumber, formatPercent } from '../../format';

/** Поділ на навчальну й тестову частини фіксований, щоб досліди з різними параметрами були порівнянними */
const SPLIT_SEED = 1;

function modelInfo(state: ModelState): InfoRow[] {
  const { summary } = state.snapshot;
  const rows: InfoRow[] = [
    { label: 'Джерело', value: state.file ? 'завантажено з файла' : 'навчено в цьому сеансі' },
    {
      label: 'Архітектура',
      value: `${WINDOW_SIZE} входи – ${summary.config.hiddenNeurons} прихованих нейронів – ${RHYTHM_CLASSES.length} виходи`,
    },
    { label: 'Епох виконано', value: `${summary.epochsRun} із ${summary.config.epochs}` },
    { label: 'Швидкість навчання', value: formatExact(summary.config.learningRate) },
    { label: 'Поріг похибки', value: formatExact(summary.config.errorThreshold) },
    { label: 'Кінцева похибка', value: formatNumber(summary.finalError, 5) },
    { label: 'Навчальних послідовностей', value: summary.trainedOn },
    { label: 'Час навчання', value: formatDuration(summary.trainMs) },
    { label: 'Навчено', value: new Date(summary.trainedAt).toLocaleString('uk-UA') },
  ];
  if (state.file) {
    rows.push(
      { label: 'Назва файла', value: state.file.name },
      { label: 'Розмір файла', value: formatFileSize(state.file.sizeBytes) },
      { label: 'Розширення файла', value: state.file.extension },
    );
  }
  return rows;
}

export function TrainTab() {
  const { dataset, model, lossHistory, isTraining, train, cancelTraining, loadModel, log } = useApp();

  const [epochs, setEpochs] = useState(String(DEFAULT_TRAINING_CONFIG.epochs));
  const [learningRate, setLearningRate] = useState(String(DEFAULT_TRAINING_CONFIG.learningRate));
  const [hiddenNeurons, setHiddenNeurons] = useState(String(DEFAULT_TRAINING_CONFIG.hiddenNeurons));
  const [errorThreshold, setErrorThreshold] = useState(String(DEFAULT_TRAINING_CONFIG.errorThreshold));
  const [testPercent, setTestPercent] = useState('20');
  const [formError, setFormError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [runningEpochs, setRunningEpochs] = useState(DEFAULT_TRAINING_CONFIG.epochs);
  const chartRef = useRef<SVGSVGElement>(null);

  const info = useMemo(() => (model ? modelInfo(model) : []), [model]);
  const summary = model?.snapshot.summary;
  const metrics = summary?.metrics ?? null;
  const maxEpoch = isTraining ? runningEpochs : (lossHistory.at(-1)?.epoch ?? 1);

  const start = (): void => {
    const config: TrainingConfig = {
      epochs: Number(epochs),
      learningRate: Number(learningRate),
      hiddenNeurons: Number(hiddenNeurons),
      errorThreshold: Number(errorThreshold),
    };
    const problem = train({ config, testShare: Number(testPercent) / 100, splitSeed: SPLIT_SEED });
    setFormError(problem);
    if (problem) {
      log('warning', `Навчання не запущено: ${problem}`);
      return;
    }
    setRunningEpochs(config.epochs);
    setFileError(null);
  };

  const loadFile = async (file: File): Promise<void> => {
    try {
      loadModel(JSON.parse(await file.text()) as unknown, fileInfoOf(file));
      setFileError(null);
      setFormError(null);
      log('success', `Модель завантажено з файла ${file.name} (${formatFileSize(file.size)}).`);
    } catch (error) {
      const message =
        error instanceof SyntaxError
          ? 'Файл не є коректним JSON.'
          : error instanceof Error
            ? error.message
            : String(error);
      setFileError(message);
      log('error', `Модель із файла ${file.name} не завантажено: ${message}`);
    }
  };

  const saveModel = (): void => {
    if (!model) return;
    const fileName = `model_${fileTimestamp()}.json`;
    saveText(JSON.stringify(model.snapshot, null, 2), fileName, 'application/json');
    log('success', `Модель збережено у файл ${fileName}.`);
  };

  return (
    <div className="tab-layout">
      <section className="panel controls" aria-labelledby="train-controls-title">
        <h2 id="train-controls-title">Параметри навчання</h2>

        <NumberField
          id="epochs"
          label="Кількість епох"
          value={epochs}
          onChange={setEpochs}
          placeholder="напр. 2000"
          min={TRAINING_LIMITS.epochs.min}
          max={TRAINING_LIMITS.epochs.max}
          step={1}
          disabled={isTraining}
          hint="Скільки разів мережа пройде весь навчальний набір."
        />
        <NumberField
          id="learning-rate"
          label="Швидкість навчання"
          value={learningRate}
          onChange={setLearningRate}
          placeholder="напр. 0.3"
          min={TRAINING_LIMITS.learningRate.min}
          max={TRAINING_LIMITS.learningRate.max}
          step="any"
          disabled={isTraining}
          hint={`Від ${formatNumber(TRAINING_LIMITS.learningRate.min, 4)} до ${formatNumber(TRAINING_LIMITS.learningRate.max, 2)}. Більше — швидше, але менш стабільно.`}
        />
        <NumberField
          id="hidden-neurons"
          label="Нейронів у прихованому шарі"
          value={hiddenNeurons}
          onChange={setHiddenNeurons}
          placeholder="напр. 8"
          min={TRAINING_LIMITS.hiddenNeurons.min}
          max={TRAINING_LIMITS.hiddenNeurons.max}
          step={1}
          disabled={isTraining}
          hint={`Мережа має ${WINDOW_SIZE} входи та ${RHYTHM_CLASSES.length} виходи — по одному на клас.`}
        />
        <NumberField
          id="error-threshold"
          label="Поріг похибки"
          value={errorThreshold}
          onChange={setErrorThreshold}
          placeholder="напр. 0.005"
          min={TRAINING_LIMITS.errorThreshold.min}
          max={TRAINING_LIMITS.errorThreshold.max}
          step="any"
          disabled={isTraining}
          hint="Навчання зупиниться раніше, щойно похибка стане не більшою за поріг. 0 — виконати всі епохи."
        />
        <NumberField
          id="test-share"
          label="Частка тестових даних, %"
          value={testPercent}
          onChange={setTestPercent}
          placeholder="напр. 20"
          min={MIN_TEST_SHARE * 100}
          max={MAX_TEST_SHARE * 100}
          step={1}
          disabled={isTraining}
          hint="Ці послідовності мережа не бачить під час навчання — на них перевіряється точність."
        />

        <div className="button-row">
          <button type="button" className="button button-primary" disabled={isTraining} onClick={start}>
            Навчити мережу
          </button>
          <button type="button" className="button button-danger" disabled={!isTraining} onClick={cancelTraining}>
            Зупинити
          </button>
        </div>
        <FormError message={formError} />
        {!dataset && <p className="field-hint">Набору даних ще немає — створіть його на вкладці «Дані».</p>}

        <hr />

        <FileDrop
          id="model-file"
          label="Завантажити модель із файла"
          hint="JSON, збережений кнопкою «Зберегти модель». Перетягніть файл сюди або натисніть."
          accept=".json,application/json"
          onFile={(file) => void loadFile(file)}
          disabled={isTraining}
        />
        <FormError message={fileError} />
        <button type="button" className="button" disabled={!model || isTraining} onClick={saveModel}>
          Зберегти модель
        </button>
      </section>

      <section className="panel results" aria-labelledby="train-results-title">
        <header className="panel-header">
          <h2 id="train-results-title">Результат навчання</h2>
          {model && <InfoPopover subject="модель" rows={info} />}
        </header>

        {lossHistory.length === 0 ? (
          <Placeholder title="Графік похибки">
            {model
              ? 'Модель завантажено з файла, тому історії навчання немає. Графік з’явиться після нового навчання.'
              : 'Тут під час навчання з’явиться графік похибки за епохами. Задайте параметри ліворуч і натисніть «Навчити мережу».'}
          </Placeholder>
        ) : (
          <div className="figure-block">
            <LossChart history={lossHistory} maxEpoch={maxEpoch} svgRef={chartRef} />
            <SaveImageControl
              svgRef={chartRef}
              baseName="training-error"
              subject="графік похибки"
              disabled={isTraining}
            />
          </div>
        )}

        {summary && metrics ? (
          <>
            <div className="stats">
              <div className="stat">
                <div className="stat-label">Точність на тестових даних</div>
                <div className="stat-value">{formatPercent(metrics.accuracy)}</div>
                <div className="stat-note">
                  правильно {metrics.correct} із {metrics.total}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">Епох виконано</div>
                <div className="stat-value">{summary.epochsRun}</div>
                <div className="stat-note">із {summary.config.epochs} заданих</div>
              </div>
              <div className="stat">
                <div className="stat-label">Кінцева похибка</div>
                <div className="stat-value">{formatNumber(summary.finalError, 4)}</div>
                <div className="stat-note">поріг {formatExact(summary.config.errorThreshold)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Час навчання</div>
                <div className="stat-value">{formatDuration(summary.trainMs)}</div>
                <div className="stat-note">{summary.trainedOn} навчальних послідовностей</div>
              </div>
            </div>
            <ConfusionMatrix confusion={metrics.confusion} />
          </>
        ) : (
          <Placeholder title="Точність і матриця помилок">
            Після навчання тут з’являться точність на тестових даних, час навчання та матриця помилок за класами.
          </Placeholder>
        )}
      </section>
    </div>
  );
}
