import {
  PROFILE_SETS,
  type QualityExperiment,
  type QualityExperimentId,
  type QualityFixed,
} from '../../benchmark/quality';
import { formatExact, plural } from '../../format';

export function describeX(experiment: QualityExperimentId, x: number): string {
  switch (experiment) {
    case 'epochs':
      return `${x} ${plural(x, 'епоха', 'епохи', 'епох')}`;
    case 'hidden':
      return `${x} ${plural(x, 'прихований нейрон', 'приховані нейрони', 'прихованих нейронів')}`;
    case 'dataset':
      return `${x} на клас`;
  }
}

export function seriesLabel(experiment: QualityExperiment, key: string): string {
  return experiment.series.find((series) => series.key === key)?.label ?? key;
}

/** Повна назва варіанта для висновків і журналу */
export function describeCell(experiment: QualityExperiment, cell: { series: string; x: number }): string {
  switch (experiment.id) {
    case 'epochs':
      return `швидкість ${formatExact(Number(cell.series))}, ${describeX('epochs', cell.x)}`;
    case 'hidden':
      return describeX('hidden', cell.x);
    case 'dataset': {
      const set = PROFILE_SETS.find((candidate) => candidate.key === cell.series);
      return `набір «${set?.label ?? cell.series}», ${describeX('dataset', cell.x)}`;
    }
  }
}

/** Параметри, які дослід тримає незмінними, одним рядком */
export function describeFixed(experiment: QualityExperiment, fixed: QualityFixed): string {
  return experiment.fixedFields
    .map((field) => {
      switch (field) {
        case 'epochs':
          return `епох ${fixed.epochs}`;
        case 'learningRate':
          return `швидкість навчання ${formatExact(fixed.learningRate)}`;
        case 'hiddenNeurons':
          return `прихованих нейронів ${fixed.hiddenNeurons}`;
        case 'perClass':
          return `послідовностей на клас ${fixed.perClass}`;
      }
    })
    .join(', ');
}

/** Що саме змінює дослід */
export function describeVaried(experiment: QualityExperiment): string {
  const list = (values: readonly string[]): string => values.map((value) => formatExact(Number(value))).join('; ');
  switch (experiment.id) {
    case 'epochs':
      return `швидкість навчання ${list(experiment.series.map((series) => series.key))}; точність на епохах ${experiment.xs.join(', ')}`;
    case 'hidden':
      return `прихованих нейронів ${experiment.xs.join(', ')}`;
    case 'dataset':
      return `профілі: ${experiment.series.map((series) => series.label.toLowerCase()).join(', ')}; послідовностей на клас ${experiment.xs.join(', ')}`;
  }
}
