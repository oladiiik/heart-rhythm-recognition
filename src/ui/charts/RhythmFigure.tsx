import type { Ref } from 'react';
import { CLASS_LABELS, bpmToIntervalSeconds, type RhythmClass } from '../../domain/rhythm';
import type { ElementSize } from '../useElementSize';
import { ChartFrame } from './ChartFrame';
import { CHART, CLASS_COLORS, niceTicks } from './chartTheme';
import { useChartTooltip } from './useChartTooltip';
import { formatNumber, formatPercent } from '../../format';

interface RhythmFigureProps {
  readonly series: readonly number[];
  readonly rhythm?: RhythmClass;
  readonly confidence?: number;
  readonly svgRef?: Ref<SVGSVGElement>;
}

const PLOT_LEFT = 52;
const RIGHT_MARGIN = 124;
const MIN_PLOT_WIDTH = 80;
const HEADER_HEIGHT = 96;
const BETWEEN_HEIGHT = 72;
const FOOTER_HEIGHT = 48;
const MIN_PLOTS_HEIGHT = 120;
const STRIP_SHARE = 0.3;
const MAX_STRIP_HEIGHT = 150;
const MAX_BAR_WIDTH = 48;
const BAR_SHARE = 0.6;
const TIME_TICK_SPACING = 110;
const INTERVAL_TICK_SPACING = 70;
const LABEL_SPACING = 30;
const CAPTION_VALUE_WIDTH = 30;
const CAPTION_PREFIX_WIDTH = 230;
const REFERENCE_INTERVALS = [
  { seconds: 0.6, label: '0,6 с (100 уд/хв)' },
  { seconds: 1.0, label: '1,0 с (60 уд/хв)' },
];

function caption(series: readonly number[], maxValues: number): string {
  const shown = series.slice(0, maxValues).join(', ');
  return series.length > maxValues ? `${shown}, … (усього ${series.length})` : shown;
}

function barPath(x: number, y: number, width: number, base: number): string {
  const radius = Math.min(4, width / 2, base - y);
  return (
    `M${x},${base} V${y + radius} Q${x},${y} ${x + radius},${y} ` +
    `H${x + width - radius} Q${x + width},${y} ${x + width},${y + radius} V${base} Z`
  );
}

export function RhythmFigure(props: RhythmFigureProps) {
  return <ChartFrame>{(size) => <RhythmPlot {...props} size={size} />}</ChartFrame>;
}

function RhythmPlot({ series, rhythm, confidence, svgRef, size }: RhythmFigureProps & { readonly size: ElementSize }) {
  const tooltip = useChartTooltip();
  const { width, height } = size;

  const plotRight = Math.max(PLOT_LEFT + MIN_PLOT_WIDTH, width - RIGHT_MARGIN);
  const plotWidth = plotRight - PLOT_LEFT;
  const plotsHeight = Math.max(MIN_PLOTS_HEIGHT, height - HEADER_HEIGHT - BETWEEN_HEIGHT - FOOTER_HEIGHT);
  const stripHeight = Math.min(MAX_STRIP_HEIGHT, plotsHeight * STRIP_SHARE);
  const stripPeak = HEADER_HEIGHT;
  const stripBase = stripPeak + stripHeight;
  const barsTop = stripBase + BETWEEN_HEIGHT;
  const barsBase = barsTop + plotsHeight - stripHeight;

  const intervals = series.map(bpmToIntervalSeconds);
  const totalSeconds = intervals.reduce((sum, seconds) => sum + seconds, 0);
  const timeToX = (seconds: number): number => PLOT_LEFT + (seconds / totalSeconds) * plotWidth;
  const beatTimes = intervals.reduce<number[]>((times, seconds) => [...times, (times.at(-1) ?? 0) + seconds], [0]);
  const trace = beatTimes
    .map((time) => {
      const x = timeToX(time);
      return `L${x - 4},${stripBase} L${x - 2},${stripBase + 4} L${x},${stripPeak} L${x + 2},${stripBase + 9} L${x + 4},${stripBase}`;
    })
    .join(' ');

  const maxInterval = Math.max(1.2, ...intervals) * 1.1;
  const secondsToY = (seconds: number): number => barsBase - (seconds / maxInterval) * (barsBase - barsTop);
  const slot = plotWidth / intervals.length;
  const barWidth = Math.max(1, Math.min(MAX_BAR_WIDTH, slot * BAR_SHARE, slot - 2));
  const labelEvery = Math.max(1, Math.ceil(LABEL_SPACING / slot));
  const title = caption(series, Math.max(4, Math.floor((width - CAPTION_PREFIX_WIDTH) / CAPTION_VALUE_WIDTH)));

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Серія ритму: ${title} уд/хв`}
        fontFamily={CHART.font}
      >
        <rect width={width} height={height} fill={CHART.surface} />

        <text x={0} y={26} fontSize={14} fontWeight={600} fill={CHART.ink}>
          Серія, уд/хв: {title}
        </text>
        {rhythm && (
          // На екрані клас уже названо поруч із графіком, а збережений файл має пояснювати себе сам
          <g data-export-only>
            <circle cx={6} cy={46} r={5} fill={CLASS_COLORS[rhythm]} />
            <text x={18} y={51} fontSize={14} fill={CHART.ink}>
              {CLASS_LABELS[rhythm]}
              {confidence !== undefined && `, впевненість ${formatPercent(confidence)}`}
            </text>
          </g>
        )}

        <text x={0} y={stripPeak - 12} fontSize={13} fill={CHART.secondary}>
          R-зубці в часі
        </text>
        <path
          d={`M${PLOT_LEFT - 12},${stripBase} ${trace} L${plotRight + 12},${stripBase}`}
          fill="none"
          stroke={CHART.ink}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {niceTicks(0, totalSeconds, Math.max(2, Math.round(plotWidth / TIME_TICK_SPACING))).map((seconds) => (
          <g key={seconds}>
            <line
              x1={timeToX(seconds)}
              x2={timeToX(seconds)}
              y1={stripBase + 16}
              y2={stripBase + 21}
              stroke={CHART.axis}
            />
            <text x={timeToX(seconds)} y={stripBase + 34} fontSize={12} textAnchor="middle" fill={CHART.muted}>
              {formatNumber(seconds, totalSeconds < 6 ? 1 : 0)} с
            </text>
          </g>
        ))}

        <text x={0} y={barsTop - 12} fontSize={13} fill={CHART.secondary}>
          Інтервали між ударами, с
        </text>
        {niceTicks(0, maxInterval, Math.max(2, Math.round((barsBase - barsTop) / INTERVAL_TICK_SPACING))).map(
          (seconds) => (
            <g key={seconds}>
              <line
                x1={PLOT_LEFT}
                x2={plotRight}
                y1={secondsToY(seconds)}
                y2={secondsToY(seconds)}
                stroke={CHART.grid}
              />
              <text x={PLOT_LEFT - 8} y={secondsToY(seconds) + 4} fontSize={12} textAnchor="end" fill={CHART.muted}>
                {formatNumber(seconds, 1)}
              </text>
            </g>
          ),
        )}
        {REFERENCE_INTERVALS.map(({ seconds, label }) => (
          <g key={seconds}>
            <line
              x1={PLOT_LEFT}
              x2={plotRight + 6}
              y1={secondsToY(seconds)}
              y2={secondsToY(seconds)}
              stroke={CHART.secondary}
            />
            <text x={plotRight + 10} y={secondsToY(seconds) + 4} fontSize={12} fill={CHART.secondary}>
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
                d={barPath(x, secondsToY(seconds), barWidth, barsBase)}
                fill={rhythm ? CLASS_COLORS[rhythm] : CHART.series}
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
                <text x={x + barWidth / 2} y={barsBase + 16} fontSize={12} textAnchor="middle" fill={CHART.muted}>
                  {bpm}
                </text>
              )}
            </g>
          );
        })}
        <line x1={PLOT_LEFT} x2={plotRight} y1={barsBase} y2={barsBase} stroke={CHART.axis} />
        <text x={PLOT_LEFT + plotWidth / 2} y={barsBase + 36} fontSize={12} textAnchor="middle" fill={CHART.muted}>
          частота кожного інтервалу, уд/хв
        </text>
      </svg>
      {tooltip.element}
    </>
  );
}
