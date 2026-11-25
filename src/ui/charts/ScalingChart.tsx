import { useState, type MouseEvent, type Ref } from 'react';
import type { PerformanceRow } from '../../benchmark/performance';
import type { LinearFit } from '../../benchmark/statistics';
import { formatDuration, formatNumber } from '../../format';
import type { ElementSize } from '../useElementSize';
import { ChartFrame } from './ChartFrame';
import { CATEGORICAL, CHART } from './chartTheme';
import { linearScale, niceDomain, spreadLabels } from './scales';

interface ScalingChartProps {
  readonly rows: readonly PerformanceRow[];
  readonly fit: LinearFit | null;
  /** Чого скільки у файлі: «значень пульсу» або «послідовностей» */
  readonly unitTitle: string;
  readonly svgRef?: Ref<SVGSVGElement>;
}

const LEFT = 72;
const TOP = 76;
const RIGHT_MARGIN = 36;
const BOTTOM_MARGIN = 52;
const MIN_PLOT_SIZE = 40;
const Y_TICK_SPACING = 56;
const X_TICK_SPACING = 110;

const RUN_COLOR = '#86b6ef';
const FIRST_RUN_COLOR = CATEGORICAL[1];
const MEDIAN_COLOR = '#184f95';

export function ScalingChart(props: ScalingChartProps) {
  return <ChartFrame>{(size) => <ScalingPlot {...props} size={size} />}</ChartFrame>;
}

/** Мільйони й тисячі коротко, щоб поділки не злипалися */
function formatCount(value: number): string {
  if (value >= 1e6) return `${formatNumber(value / 1e6, value % 1e6 === 0 ? 0 : 1)} млн`;
  if (value >= 1e3) return `${formatNumber(value / 1e3, 0)} тис.`;
  return String(value);
}

interface Hovered {
  readonly row: number;
  readonly run: number | null;
}

function ScalingPlot({ rows, fit, unitTitle, svgRef, size }: ScalingChartProps & { readonly size: ElementSize }) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const { width, height } = size;
  const right = Math.max(LEFT + MIN_PLOT_SIZE, width - RIGHT_MARGIN);
  const base = Math.max(TOP + MIN_PLOT_SIZE, height - BOTTOM_MARGIN);

  const maxUnits = Math.max(...rows.map((row) => row.units));
  const maxMs = Math.max(...rows.map((row) => row.total.max));
  const xDomain = niceDomain(0, maxUnits * 1.04, Math.max(2, Math.round((right - LEFT) / X_TICK_SPACING)));
  const yDomain = niceDomain(0, maxMs * 1.08, Math.max(2, Math.round((base - TOP) / Y_TICK_SPACING)));
  const toX = linearScale(xDomain.min, xDomain.max, LEFT, right);
  const toY = linearScale(yDomain.min, yDomain.max, base, TOP);

  const medianPath = rows
    .map((row, index) => `${index === 0 ? 'M' : 'L'}${toX(row.units)},${toY(row.total.median)}`)
    .join(' ');
  // Підписи медіан праворуч від точок: час росте разом з обсягом, тож лінія йде вгору й підписів не перетинає
  const medianLabelYs = spreadLabels(
    rows.map((row) => toY(row.total.median)),
    16,
    TOP,
    base - 8,
  );

  const handleMove = (event: MouseEvent<SVGRectElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const mouseX = LEFT + (event.clientX - bounds.left);
    const mouseY = TOP + (event.clientY - bounds.top);
    let best: Hovered | null = null;
    let bestDistance = Infinity;
    rows.forEach((row, rowIndex) => {
      const candidates: { run: number | null; y: number }[] = [
        { run: null, y: row.total.median },
        ...row.runs.map((ms, run) => ({ run, y: ms })),
      ];
      for (const candidate of candidates) {
        const distance = Math.hypot(toX(row.units) - mouseX, toY(candidate.y) - mouseY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { row: rowIndex, run: candidate.run };
        }
      }
    });
    setHovered(best);
  };

  const hoveredRow = hovered ? rows[hovered.row] : undefined;
  const hoveredMs =
    hoveredRow && hovered ? (hovered.run === null ? hoveredRow.total.median : hoveredRow.runs[hovered.run]) : undefined;

  const legend = [
    { label: 'запуск 1', color: FIRST_RUN_COLOR, kind: 'dot' as const },
    { label: 'наступні запуски', color: RUN_COLOR, kind: 'dot' as const },
    { label: 'медіана', color: MEDIAN_COLOR, kind: 'line' as const },
    ...(fit
      ? [
          {
            label: `пряма через медіани (МНК), R² = ${formatNumber(fit.r2, 4)}`,
            color: CHART.secondary,
            kind: 'dash' as const,
          },
        ]
      : []),
  ];
  let legendCursor = 0;
  const legendItems = legend.map((item) => {
    const x = legendCursor;
    legendCursor += item.label.length * 7 + 40;
    return { ...item, x };
  });

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Час обробки залежно від обсягу файла"
        fontFamily={CHART.font}
      >
        <rect width={width} height={height} fill={CHART.surface} />
        <text x={0} y={24} fontSize={14} fontWeight={600} fill={CHART.ink}>
          Час обробки залежно від обсягу файла
        </text>
        <g fontSize={12}>
          {legendItems.map((item) => (
            <g key={item.label}>
              {item.kind === 'dot' ? (
                <circle cx={item.x + 8} cy={48} r={4} fill={item.color} stroke={CHART.surface} strokeWidth={2} />
              ) : (
                <line
                  x1={item.x}
                  x2={item.x + 18}
                  y1={48}
                  y2={48}
                  stroke={item.color}
                  strokeWidth={2}
                  strokeDasharray={item.kind === 'dash' ? '5 3' : undefined}
                />
              )}
              <text x={item.x + 24} y={52} fill={CHART.ink}>
                {item.label}
              </text>
            </g>
          ))}
        </g>

        {yDomain.ticks.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={right} y1={toY(tick)} y2={toY(tick)} stroke={CHART.grid} />
            <text x={LEFT - 8} y={toY(tick) + 4} fontSize={12} textAnchor="end" fill={CHART.muted}>
              {tick === 0 ? '0' : formatDuration(tick)}
            </text>
          </g>
        ))}
        <line x1={LEFT} x2={right} y1={base} y2={base} stroke={CHART.axis} />
        {xDomain.ticks.map((tick) => (
          <g key={tick}>
            <line x1={toX(tick)} x2={toX(tick)} y1={base} y2={base + 5} stroke={CHART.axis} />
            <text x={toX(tick)} y={base + 19} fontSize={12} textAnchor="middle" fill={CHART.muted}>
              {formatCount(tick)}
            </text>
          </g>
        ))}
        <text x={(LEFT + right) / 2} y={height - 10} fontSize={12} textAnchor="middle" fill={CHART.muted}>
          {unitTitle} у файлі
        </text>

        {fit && (
          <line
            x1={toX(0)}
            x2={toX(xDomain.max)}
            y1={toY(fit.intercept)}
            y2={toY(fit.intercept + fit.slope * xDomain.max)}
            stroke={CHART.secondary}
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
        )}
        <path d={medianPath} fill="none" stroke={MEDIAN_COLOR} strokeWidth={2} strokeLinejoin="round" />
        {rows.map((row, index) => (
          <g key={row.size.key}>
            {row.runs.map((ms, run) => (
              <circle
                key={run}
                cx={toX(row.units)}
                cy={toY(ms)}
                r={4}
                fill={run === 0 ? FIRST_RUN_COLOR : RUN_COLOR}
                stroke={CHART.surface}
                strokeWidth={2}
              />
            ))}
            <circle
              cx={toX(row.units)}
              cy={toY(row.total.median)}
              r={5}
              fill={MEDIAN_COLOR}
              stroke={CHART.surface}
              strokeWidth={2}
            />
            <text
              x={toX(row.units) + 10}
              y={(medianLabelYs[index] as number) + 4}
              fontSize={12}
              fill={CHART.ink}
              stroke={CHART.surface}
              strokeWidth={4}
              paintOrder="stroke"
            >
              {row.size.label}: {formatDuration(row.total.median)}
            </text>
          </g>
        ))}

        {hoveredRow && hoveredMs !== undefined && (
          <circle
            data-export-skip
            cx={toX(hoveredRow.units)}
            cy={toY(hoveredMs)}
            r={7}
            fill="none"
            stroke={CHART.ink}
            strokeWidth={1.5}
            pointerEvents="none"
          />
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
      {hoveredRow && hovered && hoveredMs !== undefined && (
        <div className="chart-tooltip" style={{ left: toX(hoveredRow.units), top: toY(hoveredMs) }} role="status">
          <strong>
            {hoveredRow.size.label}, {hovered.run === null ? 'медіана' : `запуск ${hovered.run + 1}`}
          </strong>
          <span>{formatDuration(hoveredMs)}</span>
          <span>
            {hoveredRow.units.toLocaleString('uk-UA')} {unitTitle.toLowerCase()}
          </span>
        </div>
      )}
    </>
  );
}
