import { generateDataset } from './domain/generator';
import { splitDataset } from './domain/metrics';
import { DEFAULT_TRAINING_CONFIG, parseModelSnapshot } from './ml/model';
import { startTraining } from './ml/trainingClient';

const out = document.getElementById('root') as HTMLElement;
const lines: string[] = [];
const print = (line: string): void => {
  lines.push(line);
  out.innerHTML = `<pre id="spike">${lines.join('\n')}</pre>`;
};

const dataset = generateDataset({ perClass: 300, profiles: ['clean', 'noisy', 'border'], tolerance: 3, seed: 1 });
const { train, test } = splitDataset(dataset, 0.2, 1);
print(`dataset ${dataset.length}, train ${train.length}, test ${test.length}`);

let epochMessages = 0;
startTraining(
  { train, test, config: DEFAULT_TRAINING_CONFIG },
  {
    onEpoch: (p) => {
      epochMessages++;
      if (epochMessages <= 3) print(`epoch ${p.epoch}/${p.totalEpochs} error ${p.error.toFixed(4)}`);
    },
    onEvaluating: (p) => print(`evaluating ${p.processed}/${p.total}`),
    onDone: (r) => {
      print(`DONE epochs ${r.snapshot.summary.epochsRun} error ${r.snapshot.summary.finalError.toFixed(4)}`);
      print(`train ${r.trainMs.toFixed(0)} ms, eval ${r.evaluationMs.toFixed(1)} ms, messages ${epochMessages}`);
      print(`accuracy ${(r.metrics.accuracy * 100).toFixed(1)}% ${JSON.stringify(r.metrics.confusion)}`);
      const { model } = parseModelSnapshot(JSON.parse(JSON.stringify(r.snapshot)));
      for (const series of [
        [72, 68, 75, 71, 69, 73, 70, 68, 74],
        [50, 49, 49, 51, 51],
        [95, 100, 104, 104, 102, 104, 104, 101, 96],
        [59, 61, 60, 59],
      ]) {
        const c = model.classifySeries(series);
        print(`${series.join(',')} -> ${c.label} ${JSON.stringify(c.probabilities)}`);
      }
    },
    onFailed: (m) => print(`FAILED ${m}`),
  },
);
