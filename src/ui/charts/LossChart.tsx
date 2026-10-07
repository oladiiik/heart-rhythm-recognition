import { useState, type MouseEvent, type Ref } from 'react';
import type { EpochStatus } from '../../ml/model';
import type { ElementSize } from '../useElementSize';
import { ChartFrame } from './ChartFrame';
import { CHART, niceTicks } from './chartTheme';
import { formatNumber } from '../../format';

interface LossChartProps {
  readonly history: readonly EpochStatus[];
  readonly maxEpoch: number;
  readonly svgRef?: Ref<SVGSVGElement>;
}

const LEFT = 60;
const TOP = 44;
const RIGHT_MARGIN = 70;
const BOTTOM_MARGIN = 50;
const MIN_PLOT_SIZE = 40;
const X_TICK_SPACING = 160;
const Y_TICK_SPACING = 70;

export function LossChart(props: LossChartProps) {
  return <ChartFrame>{(size) => <LossPlot {...props} size={size} />}</ChartFrame>;
}

function LossPlot({ history, maxEpoch, svgRef, size }: LossChartProps & { readonly size: ElementSize }) {
  const [hovered, setHovered] = useState<EpochStatus | null>(null);

  const { width, height } = size;
  const right = Math.max(LEFT + MIN_PLOT_SIZE, width - RIGHT_MARGIN);
  const base = Math.max(TOP + MIN_PLOT_SIZE, height - BOTTOM_MARGIN);

  const maxError = Math.max(...history.map((point) => point.error), 0.01);
  const yTicks = niceTicks(0, maxError, Math.max(2, Math.round((base - TOP) / Y_TICK_SPACING)));
  const yMax = Math.max(maxError, yTicks.at(-1) ?? maxError);
  const epochToX = (epoch: number): number => LEFT + (epoch / Math.max(1, maxEpoch)) * (right - LEFT);
  const errorToY = (error: number): number => base - (error / yMax) * (base - TOP);

  const line = history
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${epochToX(point.epoch)},${errorToY(point.error)}`)
    .join(' ');
  const last = history.at(-1);

  const handleMove = (event: MouseEvent<SVGRectElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const epoch = ((event.clientX - bounds.left) / bounds.width) * maxEpoch;
    let nearest = history[0];
    for (const point of history) {
      if (!nearest || Math.abs(point.epoch - epoch) < Math.abs(nearest.epoch - epoch)) nearest = point;
    }
    setHovered(nearest ?? null);
  };

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Графік похибки навчання за епохами"
        fontFamily={CHART.font}
      >
        <rect width={width} height={height} fill={CHART.surface} />
        <text x={0} y={24} fontSize={14} fontWeight={600} fill={CHART.ink}>
          Похибка навчання за епохами
        </text>

        {yTicks.map((error) => (
          <g key={error}>
            <line x1={LEFT} x2={right} y1={errorToY(error)} y2={errorToY(error)} stroke={CHART.grid} />
            <text x={LEFT - 8} y={errorToY(error) + 4} fontSize={12} textAnchor="end" fill={CHART.muted}>
              {formatNumber(error, yMax < 0.1 ? 3 : 2)}
            </text>
          </g>
        ))}
        <line x1={LEFT} x2={right} y1={base} y2={base} stroke={CHART.axis} />
        {niceTicks(0, maxEpoch, Math.max(2, Math.round((right - LEFT) / X_TICK_SPACING))).map((epoch) => (
          <g key={epoch}>
            <line x1={epochToX(epoch)} x2={epochToX(epoch)} y1={base} y2={base + 5} stroke={CHART.axis} />
            <text x={epochToX(epoch)} y={base + 19} fontSize={12} textAnchor="middle" fill={CHART.muted}>
              {epoch}
            </text>
          </g>
        ))}
        <text x={(LEFT + right) / 2} y={height - 10} fontSize={12} textAnchor="middle" fill={CHART.muted}>
          епоха
        </text>

        <path d={line} fill="none" stroke={CHART.series} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {last && (
          <g>
            <circle
              cx={epochToX(last.epoch)}
              cy={errorToY(last.error)}
              r={5}
              fill={CHART.series}
              stroke={CHART.surface}
              strokeWidth={2}
            />
            <text x={epochToX(last.epoch) + 10} y={errorToY(last.error) - 8} fontSize={13} fill={CHART.ink}>
              {formatNumber(last.error, 4)}
            </text>
          </g>
        )}

        {hovered && (
          <g data-export-skip pointerEvents="none">
            <line x1={epochToX(hovered.epoch)} x2={epochToX(hovered.epoch)} y1={TOP} y2={base} stroke={CHART.axis} />
            <circle
              cx={epochToX(hovered.epoch)}
              cy={errorToY(hovered.error)}
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
          height={base - TOP}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHovered(null)}
        />
      </svg>
      {hovered && (
        <div
          className="chart-tooltip"
          style={{ left: epochToX(hovered.epoch), top: errorToY(hovered.error) }}
          role="status"
        >
          <strong>Епоха {hovered.epoch}</strong>
          <span>похибка {formatNumber(hovered.error, 5)}</span>
        </div>
      )}
    </>
  );
}
