import { useState, type ReactNode, type Ref } from 'react';
import type { ElementSize } from '../useElementSize';
import { ChartFrame } from './ChartFrame';
import { CHART, labelOnSequential, sequentialColor } from './chartTheme';

export interface HeatmapRow {
  readonly key: string;
  readonly label: string;
}

export interface HeatmapCellRef {
  readonly row: string;
  readonly col: number;
}

interface HeatmapChartProps<C> {
  readonly title: string;
  readonly rowTitle: string;
  readonly colTitle: string;
  readonly rows: readonly HeatmapRow[];
  readonly cols: readonly number[];
  readonly cellAt: (row: string, col: number) => C | undefined;
  /** Положення клітинки на шкалі кольору від 0 (найгірше) до 1 (найкраще) */
  readonly shade: (cell: C) => number;
  readonly formatCell: (cell: C) => string;
  /** Клітинки, рівноцінні найкращій: їхні значення виділено жирним */
  readonly isEquivalent: (cell: C) => boolean;
  readonly best: HeatmapCellRef | null;
  readonly recommended: HeatmapCellRef | null;
  /** Підписи кінців шкали кольору */
  readonly scaleLabels: readonly [string, string];
  readonly renderTooltip: (row: HeatmapRow, col: number, cell: C) => ReactNode;
  readonly svgRef?: Ref<SVGSVGElement>;
}

const LEFT = 116;
const TOP = 96;
const RIGHT_MARGIN = 8;
const BOTTOM_MARGIN = 46;
const GAP = 2;
const SCALE_WIDTH = 160;
const SCALE_STEPS = 24;

export function HeatmapChart<C>(props: HeatmapChartProps<C>) {
  return <ChartFrame>{(size) => <HeatmapPlot {...props} size={size} />}</ChartFrame>;
}

function HeatmapPlot<C>({
  title,
  rowTitle,
  colTitle,
  rows,
  cols,
  cellAt,
  shade,
  formatCell,
  isEquivalent,
  best,
  recommended,
  scaleLabels,
  renderTooltip,
  svgRef,
  size,
}: HeatmapChartProps<C> & { readonly size: ElementSize }) {
  const [hovered, setHovered] = useState<HeatmapCellRef | null>(null);
  const { width, height } = size;
  const plotWidth = Math.max(40, width - LEFT - RIGHT_MARGIN);
  const plotHeight = Math.max(40, height - TOP - BOTTOM_MARGIN);
  const cellWidth = plotWidth / Math.max(1, cols.length);
  const cellHeight = plotHeight / Math.max(1, rows.length);
  const fontSize = Math.min(13, Math.max(10, cellWidth / 5.5));
  const isSame = (a: HeatmapCellRef | null, row: string, col: number): boolean => a?.row === row && a.col === col;
  const outlineOf = (row: string, col: number): 'solid' | 'dashed' | null =>
    isSame(best, row, col) ? 'solid' : isSame(recommended, row, col) ? 'dashed' : null;

  const hoveredRow = hovered ? rows.find((row) => row.key === hovered.row) : undefined;
  const hoveredCell = hovered ? cellAt(hovered.row, hovered.col) : undefined;
  const scaleX = width - SCALE_WIDTH - RIGHT_MARGIN;

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        fontFamily={CHART.font}
      >
        <rect width={width} height={height} fill={CHART.surface} />
        <text x={0} y={24} fontSize={14} fontWeight={600} fill={CHART.ink}>
          {title}
        </text>

        <g fontSize={12} fill={CHART.ink}>
          <rect x={1} y={41} width={18} height={12} fill="none" stroke={CHART.ink} strokeWidth={2} />
          <text x={26} y={51}>
            найкраща
          </text>
          <rect
            x={101}
            y={41}
            width={18}
            height={12}
            fill="none"
            stroke={CHART.ink}
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          <text x={126} y={51}>
            рекомендована
          </text>
          <text x={0} y={72} fill={CHART.secondary}>
            жирним: рівноцінні найкращій
          </text>
        </g>
        <g fontSize={11} fill={CHART.muted}>
          {Array.from({ length: SCALE_STEPS }, (_, step) => (
            <rect
              key={step}
              x={scaleX + (step * SCALE_WIDTH) / SCALE_STEPS}
              y={40}
              width={SCALE_WIDTH / SCALE_STEPS + 0.5}
              height={10}
              fill={sequentialColor(step / (SCALE_STEPS - 1))}
            />
          ))}
          <text x={scaleX} y={64}>
            {scaleLabels[0]}
          </text>
          <text x={scaleX + SCALE_WIDTH} y={64} textAnchor="end">
            {scaleLabels[1]}
          </text>
        </g>

        <text x={0} y={TOP - 8} fontSize={12} fill={CHART.muted}>
          {rowTitle}
        </text>
        {rows.map((row, rowIndex) => (
          <text
            key={row.key}
            x={LEFT - 10}
            y={TOP + rowIndex * cellHeight + cellHeight / 2 + 4}
            fontSize={12}
            textAnchor="end"
            fill={CHART.secondary}
          >
            {row.label}
          </text>
        ))}
        {cols.map((col, colIndex) => (
          <text
            key={col}
            x={LEFT + colIndex * cellWidth + cellWidth / 2}
            y={TOP + plotHeight + 18}
            fontSize={12}
            textAnchor="middle"
            fill={CHART.muted}
          >
            {col}
          </text>
        ))}
        <text x={LEFT + plotWidth / 2} y={height - 8} fontSize={12} textAnchor="middle" fill={CHART.muted}>
          {colTitle}
        </text>

        {rows.map((row, rowIndex) =>
          cols.map((col, colIndex) => {
            const cell = cellAt(row.key, col);
            const x = LEFT + colIndex * cellWidth;
            const y = TOP + rowIndex * cellHeight;
            if (!cell) {
              return (
                <rect
                  key={`${row.key}-${col}`}
                  x={x + GAP / 2}
                  y={y + GAP / 2}
                  width={cellWidth - GAP}
                  height={cellHeight - GAP}
                  fill={CHART.grid}
                />
              );
            }
            const t = shade(cell);
            return (
              <g key={`${row.key}-${col}`}>
                <rect
                  x={x + GAP / 2}
                  y={y + GAP / 2}
                  width={cellWidth - GAP}
                  height={cellHeight - GAP}
                  fill={sequentialColor(t)}
                />
                <text
                  x={x + cellWidth / 2}
                  y={y + cellHeight / 2 + fontSize / 3}
                  fontSize={fontSize}
                  fontWeight={isEquivalent(cell) ? 700 : 400}
                  textAnchor="middle"
                  fill={labelOnSequential(t)}
                >
                  {formatCell(cell)}
                </text>
              </g>
            );
          }),
        )}

        {/* Рамки поверх усіх клітинок, щоб сусідня клітинка не перекрила їх */}
        {rows.map((row, rowIndex) =>
          cols.map((col, colIndex) => {
            const outline = outlineOf(row.key, col);
            if (!outline) return null;
            return (
              <rect
                key={`outline-${row.key}-${col}`}
                x={LEFT + colIndex * cellWidth + 2}
                y={TOP + rowIndex * cellHeight + 2}
                width={cellWidth - 4}
                height={cellHeight - 4}
                fill="none"
                stroke={CHART.ink}
                strokeWidth={2.5}
                strokeDasharray={outline === 'dashed' ? '6 3' : undefined}
              />
            );
          }),
        )}

        <g data-export-skip>
          {rows.map((row, rowIndex) =>
            cols.map((col, colIndex) => (
              <rect
                key={`hit-${row.key}-${col}`}
                x={LEFT + colIndex * cellWidth}
                y={TOP + rowIndex * cellHeight}
                width={cellWidth}
                height={cellHeight}
                fill="transparent"
                stroke={isSame(hovered, row.key, col) ? CHART.secondary : 'none'}
                onMouseEnter={() => setHovered({ row: row.key, col })}
                onMouseLeave={() => setHovered(null)}
              />
            )),
          )}
        </g>
      </svg>
      {hovered && hoveredRow && hoveredCell !== undefined && (
        <div
          className="chart-tooltip"
          style={{
            left: LEFT + (cols.indexOf(hovered.col) + 0.5) * cellWidth,
            top: TOP + rows.indexOf(hoveredRow) * cellHeight + cellHeight / 2,
          }}
          role="status"
        >
          {renderTooltip(hoveredRow, hovered.col, hoveredCell)}
        </div>
      )}
    </>
  );
}
