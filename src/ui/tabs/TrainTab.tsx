import { useMemo, useRef, useState } from 'react';
import { RHYTHM_CLASSES, WINDOW_SIZE } from '../../domain/rhythm';
import { fileTimestamp, formatFileSize, saveText } from '../../export/fileSave';
import { DEFAULT_TRAINING_CONFIG, TRAINING_LIMITS, type TrainingConfig } from '../../ml/model';
import { MAX_TEST_SHARE, MIN_TEST_SHARE, fileInfoOf, useApp, type ModelState } from '../../state/appStore';
import { ConfusionMatrix } from '../charts/ClassViews';
import { LossChart } from '../charts/LossChart';
import { FormError, NumberField, Placeholder } from '../components/Field';
import { FileButton } from '../components/FileButton';
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
  const { model, lossHistory, isTraining, train, cancelTraining, loadModel, log } = useApp();

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
  // Поки триває нове навчання, показники попередньої моделі не показуємо: вони не стосуються графіка на екрані
  const summary = isTraining ? undefined : model?.snapshot.summary;
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
      <aside className="side" aria-label="Параметри навчання">
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
          hint={`Від ${TRAINING_LIMITS.epochs.min} до ${TRAINING_LIMITS.epochs.max}: скільки разів мережа пройде весь навчальний набір.`}
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
          hint={`Від ${formatNumber(TRAINING_LIMITS.learningRate.min, 4)} до ${formatNumber(TRAINING_LIMITS.learningRate.max, 2)}. Що більша, то швидше навчання, але воно менш стабільне.`}
        />
        <NumberField
          id="hidden-neurons"
          label="Прихованих нейронів"
          value={hiddenNeurons}
          onChange={setHiddenNeurons}
          placeholder="напр. 8"
          min={TRAINING_LIMITS.hiddenNeurons.min}
          max={TRAINING_LIMITS.hiddenNeurons.max}
          step={1}
          disabled={isTraining}
          hint={`Від ${TRAINING_LIMITS.hiddenNeurons.min} до ${TRAINING_LIMITS.hiddenNeurons.max}. Мережа має ${WINDOW_SIZE} входи та ${RHYTHM_CLASSES.length} виходи, по одному на клас.`}
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
          hint="Навчання зупиниться раніше, щойно похибка стане не більшою за поріг. Нуль означає виконати всі епохи."
        />
        <NumberField
          id="test-share"
          label="Тестових даних, %"
          value={testPercent}
          onChange={setTestPercent}
          placeholder="напр. 20"
          min={MIN_TEST_SHARE * 100}
          max={MAX_TEST_SHARE * 100}
          step={1}
          disabled={isTraining}
          hint={`Від ${MIN_TEST_SHARE * 100} до ${MAX_TEST_SHARE * 100}. Цих послідовностей мережа не бачить під час навчання: на них перевіряється точність.`}
        />

        {isTraining ? (
          <button type="button" className="button button-stop" onClick={cancelTraining}>
            Зупинити навчання
          </button>
        ) : (
          <button type="button" className="button button-primary" onClick={start}>
            Навчити мережу
          </button>
        )}
        <FormError message={formError} />

        <div className="side-group">
          <span className="side-label">Файл моделі</span>
          <div className="button-row">
            <FileButton
              id="model-file"
              label="Завантажити…"
              hint="JSON, збережений кнопкою «Зберегти модель». Файл можна перетягнути на кнопку."
              accept=".json,application/json"
              onFile={(file) => void loadFile(file)}
              disabled={isTraining}
            />
            <button type="button" className="button" disabled={!model || isTraining} onClick={saveModel}>
              Зберегти модель
            </button>
          </div>
          <FormError message={fileError} />
        </div>
      </aside>

      <section className="content" aria-label="Результат навчання">
        {lossHistory.length === 0 && !summary ? (
          <Placeholder title="Мережу ще не навчено">
            Тут з’являться графік похибки, точність на тестових даних і матриця помилок. Натисніть «Навчити мережу» або
            завантажте модель із файла.
          </Placeholder>
        ) : (
          <>
            {/* Поки навчання триває, показники й матриця мають зарезервоване місце: графік не стрибає, коли вони з’являються */}
            {!summary && isTraining && <div className="facts-slot" />}
            {summary && (
              <div className="content-head">
                <dl className="facts">
                  {metrics && (
                    <>
                      <div className="fact fact-primary">
                        <dt>Точність на тестових даних</dt>
                        <dd>{formatPercent(metrics.accuracy)}</dd>
                      </div>
                      <div className="fact">
                        <dt>Правильних відповідей</dt>
                        <dd>
                          {metrics.correct} <span className="fact-unit">із {metrics.total}</span>
                        </dd>
                      </div>
                    </>
                  )}
                  <div className="fact">
                    <dt>Кінцева похибка</dt>
                    <dd>{formatNumber(summary.finalError, 4)}</dd>
                  </div>
                  <div className="fact">
                    <dt>Епох виконано</dt>
                    <dd>
                      {summary.epochsRun} <span className="fact-unit">із {summary.config.epochs}</span>
                    </dd>
                  </div>
                </dl>
                {model && <InfoPopover subject="модель" rows={info} />}
              </div>
            )}

            {lossHistory.length > 0 && (
              <div className="figure-block">
                <LossChart history={lossHistory} maxEpoch={maxEpoch} svgRef={chartRef} />
                <div className="figure-footer">
                  <SaveImageControl
                    svgRef={chartRef}
                    baseName="training-error"
                    subject="графік похибки"
                    disabled={isTraining}
                  />
                </div>
              </div>
            )}

            {metrics ? (
              <ConfusionMatrix confusion={metrics.confusion} />
            ) : (
              isTraining && <div className="confusion-slot" />
            )}
          </>
        )}
      </section>
    </div>
  );
}
