import { useState, type MouseEvent, type Ref } from 'react';
import { CLASS_LABELS, type RhythmClass } from '../../domain/rhythm';
import { formatClock } from '../../log/operationLog';
import type { ElementSize } from '../useElementSize';
import { ChartFrame } from './ChartFrame';
import { CHART, CLASS_COLORS, niceTicks } from './chartTheme';

export interface LiveBeat {
  readonly bpm: number;
  readonly at: number;
  readonly label: RhythmClass | null;
}

interface LiveChartProps {
  readonly beats: readonly LiveBeat[];
  readonly svgRef?: Ref<SVGSVGElement>;
}

export const LIVE_CHART_CAPACITY = 60;

const LEFT = 52;
const TOP = 44;
const RIGHT_MARGIN = 90;
const BOTTOM_MARGIN = 58;
const STRIP_OFFSET = 30;
const STRIP_HEIGHT = 12;
const MIN_PLOT_SIZE = 40;
const Y_TICK_SPACING = 70;
const REFERENCE_RATES = [60, 100];

export function LiveChart(props: LiveChartProps) {
  return <ChartFrame>{(size) => <LivePlot {...props} size={size} />}</ChartFrame>;
}

function LivePlot({ beats, svgRef, size }: LiveChartProps & { readonly size: ElementSize }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { width, height } = size;
  const right = Math.max(LEFT + MIN_PLOT_SIZE, width - RIGHT_MARGIN);
  const base = Math.max(TOP + MIN_PLOT_SIZE, height - BOTTOM_MARGIN);
  const stripY = base + STRIP_OFFSET;

  const rates = beats.map((beat) => beat.bpm);
  const yMin = Math.min(40, ...rates.map((bpm) => bpm - 5));
  const yMax = Math.max(140, ...rates.map((bpm) => bpm + 5));
  const slot = (right - LEFT) / (LIVE_CHART_CAPACITY - 1);
  const indexToX = (index: number): number => LEFT + index * slot;
  const rateToY = (bpm: number): number => base - ((bpm - yMin) / (yMax - yMin)) * (base - TOP);

  const line = beats
    .map((beat, index) => `${index === 0 ? 'M' : 'L'}${indexToX(index)},${rateToY(beat.bpm)}`)
    .join(' ');
  const last = beats.at(-1);
  const hovered = hoveredIndex !== null ? beats[hoveredIndex] : undefined;

  const handleMove = (event: MouseEvent<SVGRectElement>): void => {
    if (beats.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) / bounds.width) * (LIVE_CHART_CAPACITY - 1);
    setHoveredIndex(Math.min(beats.length - 1, Math.max(0, Math.round(position))));
  };

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Графік пульсу в реальному часі"
        fontFamily={CHART.font}
      >
        <rect width={width} height={height} fill={CHART.surface} />
        <text x={0} y={24} fontSize={14} fontWeight={600} fill={CHART.ink}>
          Пульс, уд/хв
        </text>

        {niceTicks(yMin, yMax, Math.max(2, Math.round((base - TOP) / Y_TICK_SPACING))).map((bpm) => (
          <g key={bpm}>
            <line x1={LEFT} x2={right} y1={rateToY(bpm)} y2={rateToY(bpm)} stroke={CHART.grid} />
            <text x={LEFT - 8} y={rateToY(bpm) + 4} fontSize={12} textAnchor="end" fill={CHART.muted}>
              {bpm}
            </text>
          </g>
        ))}
        {REFERENCE_RATES.map((bpm) => (
          <g key={bpm}>
            <line x1={LEFT} x2={right + 6} y1={rateToY(bpm)} y2={rateToY(bpm)} stroke={CHART.secondary} />
            <text x={right + 10} y={rateToY(bpm) + 4} fontSize={12} fill={CHART.secondary}>
              межа {bpm}
            </text>
          </g>
        ))}

        <path d={line} fill="none" stroke={CHART.series} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {last && (
          <g>
            <circle
              cx={indexToX(beats.length - 1)}
              cy={rateToY(last.bpm)}
              r={5}
              fill={CHART.series}
              stroke={CHART.surface}
              strokeWidth={2}
            />
            <text x={indexToX(beats.length - 1) + 10} y={rateToY(last.bpm) - 8} fontSize={13} fill={CHART.ink}>
              {last.bpm}
            </text>
          </g>
        )}

        <text x={0} y={stripY + 10} fontSize={12} fill={CHART.secondary}>
          клас
        </text>
        {beats.map((beat, index) => (
          <rect
            key={beat.at}
            x={indexToX(index) - slot / 2 + 1}
            y={stripY}
            width={Math.max(1, slot - 2)}
            height={STRIP_HEIGHT}
            rx={2}
            fill={beat.label ? CLASS_COLORS[beat.label] : CHART.grid}
          />
        ))}

        {hovered && hoveredIndex !== null && (
          <g data-export-skip pointerEvents="none">
            <line x1={indexToX(hoveredIndex)} x2={indexToX(hoveredIndex)} y1={TOP} y2={base} stroke={CHART.axis} />
            <circle
              cx={indexToX(hoveredIndex)}
              cy={rateToY(hovered.bpm)}
              r={5}
              fill={CHART.series}
              stroke={CHART.surface}
              strokeWidth={2}
            />
          </g>
        )}
        <rect
          data-export-skip
          x={LEFT}
          y={TOP}
          width={right - LEFT}
          height={stripY + STRIP_HEIGHT - TOP}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoveredIndex(null)}
        />
      </svg>
      {hovered && hoveredIndex !== null && (
        <div
          className="chart-tooltip"
          style={{ left: indexToX(hoveredIndex), top: rateToY(hovered.bpm) }}
          role="status"
        >
          <strong>{hovered.bpm} уд/хв</strong>
          <span>{formatClock(new Date(hovered.at)).slice(0, 8)}</span>
          <span>{hovered.label ? CLASS_LABELS[hovered.label] : 'ще не розпізнано'}</span>
        </div>
      )}
    </>
  );
}
