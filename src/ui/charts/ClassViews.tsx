import type { ConfusionMatrix as Confusion } from '../../domain/metrics';
import {
  CLASS_HINTS,
  CLASS_LABELS,
  RHYTHM_CLASSES,
  type ClassProbabilities,
  type RhythmClass,
} from '../../domain/rhythm';
import { CLASS_COLORS } from './chartTheme';
import { formatPercent } from '../../format';

export function ClassDot({ rhythm }: { rhythm: RhythmClass }) {
  return <span className="class-dot" style={{ background: CLASS_COLORS[rhythm] }} aria-hidden="true" />;
}

export function ClassLegend() {
  return (
    <ul className="class-legend">
      {RHYTHM_CLASSES.map((rhythm) => (
        <li key={rhythm}>
          <ClassDot rhythm={rhythm} />
          {CLASS_LABELS[rhythm]} <span className="muted">({CLASS_HINTS[rhythm]})</span>
        </li>
      ))}
    </ul>
  );
}

export function ClassCounts({ counts }: { counts: Record<RhythmClass, number> }) {
  const total = RHYTHM_CLASSES.reduce((sum, rhythm) => sum + counts[rhythm], 0);
  return (
    <div className="class-counts">
      {RHYTHM_CLASSES.map((rhythm) => {
        const share = total === 0 ? 0 : counts[rhythm] / total;
        return (
          <div className="class-count" key={rhythm}>
            <div className="class-count-label">
              <ClassDot rhythm={rhythm} />
              {CLASS_LABELS[rhythm]}
            </div>
            <div className="class-count-value">{counts[rhythm]}</div>
            <div className="meter" title={`${formatPercent(share)} набору`}>
              <div className="meter-fill" style={{ width: `${share * 100}%`, background: CLASS_COLORS[rhythm] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProbabilityBars({ probabilities, best }: { probabilities: ClassProbabilities; best: RhythmClass }) {
  return (
    <div className="probabilities">
      {RHYTHM_CLASSES.map((rhythm) => (
        <div className={rhythm === best ? 'probability probability-best' : 'probability'} key={rhythm}>
          <div className="probability-label">
            <ClassDot rhythm={rhythm} />
            {CLASS_LABELS[rhythm]}
          </div>
          <div className="meter">
            <div
              className="meter-fill"
              style={{ width: `${probabilities[rhythm] * 100}%`, background: CLASS_COLORS[rhythm] }}
            />
          </div>
          <div className="probability-value">{formatPercent(probabilities[rhythm])}</div>
        </div>
      ))}
    </div>
  );
}

export function ConfusionMatrix({ confusion }: { confusion: Confusion }) {
  return (
    <table className="confusion">
      <caption>Рядки — справжній клас, стовпці — відповідь мережі</caption>
      <thead>
        <tr>
          <th scope="col">Справжній клас</th>
          {RHYTHM_CLASSES.map((rhythm) => (
            <th scope="col" key={rhythm}>
              {CLASS_LABELS[rhythm]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {RHYTHM_CLASSES.map((actual) => {
          const rowTotal = RHYTHM_CLASSES.reduce((sum, predicted) => sum + confusion[actual][predicted], 0);
          return (
            <tr key={actual}>
              <th scope="row">
                <ClassDot rhythm={actual} />
                {CLASS_LABELS[actual]}
              </th>
              {RHYTHM_CLASSES.map((predicted) => {
                const count = confusion[actual][predicted];
                const share = rowTotal === 0 ? 0 : count / rowTotal;
                return (
                  <td
                    key={predicted}
                    className={share > 0.55 ? 'confusion-cell confusion-cell-strong' : 'confusion-cell'}
                    style={{ background: `rgba(42, 120, 214, ${share * 0.9})` }}
                    title={`${count} із ${rowTotal} (${formatPercent(share)})`}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
