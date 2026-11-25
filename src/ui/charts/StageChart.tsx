import { useState, type Ref } from 'react';
import { STAGE_LABELS, type PerformanceRow, type PerformanceStage } from '../../benchmark/performance';
import { formatDuration, formatPercent } from '../../format';
import type { ElementSize } from '../useElementSize';
import { ChartFrame } from './ChartFrame';
import { CATEGORICAL, CHART, labelOn } from './chartTheme';

interface StageChartProps {
  readonly rows: readonly PerformanceRow[];
  readonly stages: readonly PerformanceStage[];
  readonly svgRef?: Ref<SVGSVGElement>;
}

const LEFT = 72;
const TOP = 76;
const RIGHT_MARGIN = 8;
const BOTTOM_MARGIN = 20;
const GAP = 2;
const MAX_BAR_HEIGHT = 64;
/** Вужчий сегмент не вміщує підпис частки; її видно в підказці й таблиці */
const MIN_LABEL_WIDTH = 40;

export function StageChart(props: StageChartProps) {
  return <ChartFrame>{(size) => <StagePlot {...props} size={size} />}</ChartFrame>;
}

interface Hovered {
  readonly row: number;
  readonly stage: PerformanceStage;
}

function StagePlot({ rows, stages, svgRef, size }: StageChartProps & { readonly size: ElementSize }) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const { width, height } = size;
  const plotWidth = Math.max(40, width - LEFT - RIGHT_MARGIN);
  const band = Math.max(24, (height - TOP - BOTTOM_MARGIN) / Math.max(1, rows.length));
  const barHeight = Math.min(MAX_BAR_HEIGHT, band * 0.62);
  const colorOf = (stage: PerformanceStage): string => CATEGORICAL[stages.indexOf(stage)] ?? CHART.series;

  const layout = rows.map((row, rowIndex) => {
    const total = row.stages.reduce((sum, timing) => sum + timing.ms, 0) || 1;
    let cursor = LEFT;
    const y = TOP + rowIndex * band + (band - barHeight) / 2;
    const segments = row.stages.map((timing) => {
      const share = timing.ms / total;
      const segmentWidth = share * plotWidth;
      const segment = { ...timing, share, x: cursor, width: segmentWidth };
      cursor += segmentWidth;
      return segment;
    });
    return { row, y, segments };
  });

  let legendCursor = 0;
  const legendItems = stages.map((stage) => {
    const x = legendCursor;
    legendCursor += STAGE_LABELS[stage].length * 7 + 34;
    return { stage, x };
  });

  const hoveredLayout = hovered ? layout[hovered.row] : undefined;
  const hoveredSegment = hoveredLayout?.segments.find((segment) => segment.stage === hovered?.stage);

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Частка етапів у часі обробки"
        fontFamily={CHART.font}
      >
        <rect width={width} height={height} fill={CHART.surface} />
        <text x={0} y={24} fontSize={14} fontWeight={600} fill={CHART.ink}>
          Частка етапів у часі обробки (медіана запусків)
        </text>
        <g fontSize={12}>
          {legendItems.map(({ stage, x }) => (
            <g key={stage}>
              <rect x={x} y={42} width={12} height={12} rx={2} fill={colorOf(stage)} />
              <text x={x + 18} y={52} fill={CHART.ink}>
                {STAGE_LABELS[stage]}
              </text>
            </g>
          ))}
        </g>

        {layout.map(({ row, y, segments }, rowIndex) => (
          <g key={row.size.key}>
            <text x={LEFT - 10} y={y + barHeight / 2 + 4} fontSize={12} textAnchor="end" fill={CHART.secondary}>
              {row.size.label}
            </text>
            {segments.map((segment) => {
              const fill = colorOf(segment.stage);
              const visibleWidth = Math.max(0, segment.width - GAP);
              return (
                <g key={segment.stage}>
                  <rect
                    x={segment.x}
                    y={y}
                    width={visibleWidth}
                    height={barHeight}
                    rx={visibleWidth > 8 ? 3 : 0}
                    fill={fill}
                  />
                  {visibleWidth >= MIN_LABEL_WIDTH && (
                    <text
                      x={segment.x + visibleWidth / 2}
                      y={y + barHeight / 2 + 4}
                      fontSize={12}
                      textAnchor="middle"
                      fill={labelOn(fill)}
                    >
                      {formatPercent(segment.share, 0)}
                    </text>
                  )}
                  <rect
                    data-export-skip
                    x={segment.x}
                    y={y}
                    width={Math.max(segment.width, 3)}
                    height={barHeight}
                    fill="transparent"
                    stroke={hovered?.row === rowIndex && hovered.stage === segment.stage ? CHART.ink : 'none'}
                    onMouseEnter={() => setHovered({ row: rowIndex, stage: segment.stage })}
                    onMouseLeave={() => setHovered(null)}
                  />
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      {hoveredLayout && hoveredSegment && (
        <div
          className="chart-tooltip"
          style={{ left: hoveredSegment.x + hoveredSegment.width / 2, top: hoveredLayout.y }}
          role="status"
        >
          <strong>
            {hoveredLayout.row.size.label}: {STAGE_LABELS[hoveredSegment.stage].toLowerCase()}
          </strong>
          <span>
            {formatDuration(hoveredSegment.ms)}, {formatPercent(hoveredSegment.share)} часу
          </span>
        </div>
      )}
    </>
  );
}
