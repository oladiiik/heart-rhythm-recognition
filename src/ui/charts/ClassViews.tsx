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
        <li key={rhythm} title={CLASS_HINTS[rhythm]}>
          <ClassDot rhythm={rhythm} />
          {CLASS_LABELS[rhythm]}
        </li>
      ))}
    </ul>
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

const HEAT_MAX_OPACITY = 0.86;
const LIGHT_TEXT_FROM_SHARE = 0.5;

export function ConfusionMatrix({ confusion }: { confusion: Confusion }) {
  return (
    <table className="confusion">
      <caption>Матриця помилок</caption>
      <thead>
        <tr>
          <td />
          {RHYTHM_CLASSES.map((rhythm) => (
            <th scope="col" key={rhythm} title="Відповідь мережі">
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
              <th scope="row" title="Справжній клас">
                <ClassDot rhythm={actual} />
                {CLASS_LABELS[actual]}
              </th>
              {RHYTHM_CLASSES.map((predicted) => {
                const count = confusion[actual][predicted];
                const share = rowTotal === 0 ? 0 : count / rowTotal;
                return (
                  <td
                    key={predicted}
                    className="confusion-cell"
                    style={{
                      background: `rgba(20, 20, 19, ${share * HEAT_MAX_OPACITY})`,
                      color: share >= LIGHT_TEXT_FROM_SHARE ? '#fff' : undefined,
                      fontWeight: actual === predicted ? 600 : undefined,
                    }}
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
