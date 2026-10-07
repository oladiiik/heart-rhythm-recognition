import type { Ref } from 'react';
import { CLASS_LABELS, bpmToIntervalSeconds, type RhythmClass } from '../../domain/rhythm';
import { CHART, CLASS_COLORS, niceTicks } from './chartTheme';
import { useChartTooltip } from './useChartTooltip';
import { formatNumber, formatPercent } from '../../format';

interface RhythmFigureProps {
  readonly series: readonly number[];
  readonly result?: { readonly label: RhythmClass; readonly confidence: number };
  readonly svgRef?: Ref<SVGSVGElement>;
}

const WIDTH = 640;
const HEIGHT = 380;
const PLOT_LEFT = 52;
const PLOT_RIGHT = 520;
const STRIP_BASE = 150;
const STRIP_PEAK = 96;
const BARS_TOP = 222;
const BARS_BASE = 332;
const MAX_BAR_WIDTH = 24;
const MAX_RENDER_WIDTH = 800;
const MAX_CAPTION_VALUES = 14;
const REFERENCE_INTERVALS = [
  { seconds: 0.6, label: '0,6 с — 100 уд/хв' },
  { seconds: 1.0, label: '1,0 с — 60 уд/хв' },
];

function caption(series: readonly number[]): string {
  const shown = series.slice(0, MAX_CAPTION_VALUES).join(', ');
  return series.length > MAX_CAPTION_VALUES ? `${shown}, … (усього ${series.length})` : shown;
}

function barPath(x: number, y: number, width: number, base: number): string {
  const radius = Math.min(4, width / 2, base - y);
  return (
    `M${x},${base} V${y + radius} Q${x},${y} ${x + radius},${y} ` +
    `H${x + width - radius} Q${x + width},${y} ${x + width},${y + radius} V${base} Z`
  );
}

export function RhythmFigure({ series, result, svgRef }: RhythmFigureProps) {
  const tooltip = useChartTooltip();
  const intervals = series.map(bpmToIntervalSeconds);
  const totalSeconds = intervals.reduce((sum, seconds) => sum + seconds, 0);
  const plotWidth = PLOT_RIGHT - PLOT_LEFT;

  const timeToX = (seconds: number): number => PLOT_LEFT + (seconds / totalSeconds) * plotWidth;
  const beatTimes = intervals.reduce<number[]>((times, seconds) => [...times, (times.at(-1) ?? 0) + seconds], [0]);
  const trace = beatTimes
    .map((time) => {
      const x = timeToX(time);
      return `L${x - 4},${STRIP_BASE} L${x - 2},${STRIP_BASE + 4} L${x},${STRIP_PEAK} L${x + 2},${STRIP_BASE + 9} L${x + 4},${STRIP_BASE}`;
    })
    .join(' ');

  const maxInterval = Math.max(1.2, ...intervals) * 1.1;
  const secondsToY = (seconds: number): number => BARS_BASE - (seconds / maxInterval) * (BARS_BASE - BARS_TOP);
  const slot = plotWidth / intervals.length;
  const barWidth = Math.max(1, Math.min(MAX_BAR_WIDTH, slot - 2));
  const labelEvery = Math.ceil(intervals.length / 16);

  return (
    <div className="chart" style={{ maxWidth: MAX_RENDER_WIDTH }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Серія ритму: ${caption(series)} уд/хв`}
        fontFamily={CHART.font}
      >
        <rect width={WIDTH} height={HEIGHT} fill={CHART.surface} />

        <text x={16} y={26} fontSize={14} fontWeight={600} fill={CHART.ink}>
          Серія, уд/хв: {caption(series)}
        </text>
        {result && (
          <g>
            <circle cx={22} cy={46} r={5} fill={CLASS_COLORS[result.label]} />
            <text x={34} y={51} fontSize={14} fill={CHART.ink}>
              {CLASS_LABELS[result.label]} — впевненість {formatPercent(result.confidence)}
            </text>
          </g>
        )}

        <text x={16} y={84} fontSize={12} fill={CHART.secondary}>
          R-зубці в часі
        </text>
        <path
          d={`M${PLOT_LEFT - 12},${STRIP_BASE} ${trace} L${PLOT_RIGHT + 12},${STRIP_BASE}`}
          fill="none"
          stroke={CHART.ink}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {niceTicks(0, totalSeconds, 6).map((seconds) => (
          <g key={seconds}>
            <line x1={timeToX(seconds)} x2={timeToX(seconds)} y1={166} y2={171} stroke={CHART.axis} />
            <text x={timeToX(seconds)} y={184} fontSize={11} textAnchor="middle" fill={CHART.muted}>
              {formatNumber(seconds, totalSeconds < 6 ? 1 : 0)} с
            </text>
          </g>
        ))}

        <text x={16} y={210} fontSize={12} fill={CHART.secondary}>
          Інтервали між ударами, с
        </text>
        {niceTicks(0, maxInterval, 3).map((seconds) => (
          <g key={seconds}>
            <line
              x1={PLOT_LEFT}
              x2={PLOT_RIGHT}
              y1={secondsToY(seconds)}
              y2={secondsToY(seconds)}
              stroke={CHART.grid}
            />
            <text x={PLOT_LEFT - 8} y={secondsToY(seconds) + 4} fontSize={11} textAnchor="end" fill={CHART.muted}>
              {formatNumber(seconds, 1)}
            </text>
          </g>
        ))}
        {REFERENCE_INTERVALS.map(({ seconds, label }) => (
          <g key={seconds}>
            <line
              x1={PLOT_LEFT}
              x2={PLOT_RIGHT + 6}
              y1={secondsToY(seconds)}
              y2={secondsToY(seconds)}
              stroke={CHART.secondary}
            />
            <text x={PLOT_RIGHT + 10} y={secondsToY(seconds) + 4} fontSize={11} fill={CHART.secondary}>
              {label}
            </text>
          </g>
        ))}
        {intervals.map((seconds, index) => {
          const x = PLOT_LEFT + index * slot + (slot - barWidth) / 2;
          const bpm = series[index] as number;
          return (
            <g key={index}>
              <path
                d={barPath(x, secondsToY(seconds), barWidth, BARS_BASE)}
                fill={CHART.series}
                onMouseMove={(event) =>
                  tooltip.show(
                    event,
                    <>
                      <strong>Інтервал {index + 1}</strong>
                      <span>
                        {formatNumber(seconds)} с · {bpm} уд/хв
                      </span>
                    </>,
                  )
                }
                onMouseLeave={tooltip.hide}
              />
              {index % labelEvery === 0 && (
                <text x={x + barWidth / 2} y={BARS_BASE + 16} fontSize={11} textAnchor="middle" fill={CHART.muted}>
                  {bpm}
                </text>
              )}
            </g>
          );
        })}
        <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={BARS_BASE} y2={BARS_BASE} stroke={CHART.axis} />
        <text x={PLOT_LEFT + plotWidth / 2} y={HEIGHT - 12} fontSize={11} textAnchor="middle" fill={CHART.muted}>
          частота кожного інтервалу, уд/хв
        </text>
      </svg>
      {tooltip.element}
    </div>
  );
}
