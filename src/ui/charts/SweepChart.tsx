import { useState, type MouseEvent, type ReactNode, type Ref } from 'react';
import type { ElementSize } from '../useElementSize';
import { ChartFrame } from './ChartFrame';
import { CHART } from './chartTheme';
import { logScale, niceDomain, spreadLabels } from './scales';

export interface SweepPoint {
  readonly x: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface SweepSeries<P extends SweepPoint> {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly points: readonly P[];
}

export interface SweepMark {
  readonly series: string;
  readonly x: number;
  readonly label: string;
  readonly dashed: boolean;
}

interface SweepChartProps<P extends SweepPoint> {
  readonly title: string;
  readonly xTitle: string;
  /** Що розрізняє лінії; null, якщо лінія одна і легенда не потрібна */
  readonly legendTitle: string | null;
  /** Значення x, на яких стоять поділки; вісь логарифмічна */
  readonly xs: readonly number[];
  readonly series: readonly SweepSeries<P>[];
  /** Підпис поділки осі y; step допомагає вибрати точність, з якою сусідні підписи різні */
  readonly formatY: (value: number, step: number) => string;
  readonly yLimit?: { readonly min?: number; readonly max?: number };
  readonly marks?: readonly SweepMark[];
  /** Лінія, для якої показано смугу від найгіршого до найкращого запуску, поки курсор не над графіком */
  readonly focus: string | null;
  readonly renderTooltip: (series: SweepSeries<P>, point: P) => ReactNode;
  readonly svgRef?: Ref<SVGSVGElement>;
}

const LEFT = 64;
const TOP_PLAIN = 48;
const TOP_WITH_LEGEND = 76;
const RIGHT_PLAIN = 32;
const RIGHT_WITH_LABELS = 104;
const BOTTOM_MARGIN = 52;
const MIN_PLOT_SIZE = 40;
const Y_TICK_SPACING = 56;
/** Прямі підписи на кінцях ліній лише для невеликої кількості ліній; більше їх читають за легендою */
const MAX_DIRECT_LABELS = 4;
const LABEL_GAP = 15;

export function SweepChart<P extends SweepPoint>(props: SweepChartProps<P>) {
  return <ChartFrame>{(size) => <SweepPlot {...props} size={size} />}</ChartFrame>;
}

interface Hovered {
  readonly series: string;
  readonly x: number;
}

function SweepPlot<P extends SweepPoint>({
  title,
  xTitle,
  legendTitle,
  xs,
  series,
  formatY,
  yLimit,
  marks = [],
  focus,
  renderTooltip,
  svgRef,
  size,
}: SweepChartProps<P> & { readonly size: ElementSize }) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const { width, height } = size;
  const hasLegend = legendTitle !== null && series.length > 1;
  const directLabels = series.length > 1 && series.length <= MAX_DIRECT_LABELS;
  const top = hasLegend ? TOP_WITH_LEGEND : TOP_PLAIN;
  const right = Math.max(LEFT + MIN_PLOT_SIZE, width - (directLabels ? RIGHT_WITH_LABELS : RIGHT_PLAIN));
  const base = Math.max(top + MIN_PLOT_SIZE, height - BOTTOM_MARGIN);

  const all = series.flatMap((line) => line.points);
  const low = Math.min(...all.map((point) => point.min));
  const high = Math.max(...all.map((point) => point.max));
  const padding = (high - low) * 0.06 || 0.01;
  const domain = niceDomain(
    low - padding,
    high + padding,
    Math.max(2, Math.round((base - top) / Y_TICK_SPACING)),
    yLimit,
  );
  const toY = (value: number): number => base - ((value - domain.min) / (domain.max - domain.min || 1)) * (base - top);

  // Поля по краях осі x, щоб крайні точки не лягали на осі
  const firstX = xs[0] ?? 1;
  const lastX = xs.at(-1) ?? firstX * 10;
  const ratio = Math.pow(lastX / firstX, 0.04);
  const toX = logScale(firstX / ratio, lastX * ratio, LEFT, right);

  const active = hovered?.series ?? focus;
  const pathOf = (points: readonly P[], pick: (point: P) => number): string =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'}${toX(point.x)},${toY(pick(point))}`).join(' ');

  const endings = series.map((line) => line.points.at(-1));
  const labelYs = directLabels
    ? spreadLabels(
        endings.map((point) => (point ? toY(point.mean) : base)),
        LABEL_GAP,
        top,
        base,
      )
    : [];

  const handleMove = (event: MouseEvent<SVGRectElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const mouseX = LEFT + (event.clientX - bounds.left);
    const mouseY = top + (event.clientY - bounds.top);
    let best: Hovered | null = null;
    let bestDistance = Infinity;
    for (const line of series) {
      for (const point of line.points) {
        const distance = Math.hypot(toX(point.x) - mouseX, toY(point.mean) - mouseY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { series: line.key, x: point.x };
        }
      }
    }
    setHovered(best);
  };

  const hoveredLine = hovered ? series.find((line) => line.key === hovered.series) : undefined;
  const hoveredPoint = hoveredLine?.points.find((point) => point.x === hovered?.x);

  // Ширину підпису оцінюємо за кількістю символів: точне вимірювання тексту в SVG потребувало б ще одного рендеру
  const legendItems: { line: SweepSeries<P>; x: number }[] = [];
  let legendCursor = (legendTitle?.length ?? 0) * 7 + 18;
  for (const line of series) {
    legendItems.push({ line, x: legendCursor });
    legendCursor += line.label.length * 7 + 44;
  }

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

        {hasLegend && (
          <g fontSize={12}>
            <text x={0} y={52} fill={CHART.secondary}>
              {legendTitle}:
            </text>
            {legendItems.map(({ line, x }) => (
              <g key={line.key}>
                <line x1={x} x2={x + 20} y1={48} y2={48} stroke={line.color} strokeWidth={2} />
                <circle cx={x + 10} cy={48} r={4} fill={line.color} stroke={CHART.surface} strokeWidth={2} />
                <text x={x + 26} y={52} fill={CHART.ink}>
                  {line.label}
                </text>
              </g>
            ))}
          </g>
        )}

        {domain.ticks.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={right} y1={toY(tick)} y2={toY(tick)} stroke={CHART.grid} />
            <text x={LEFT - 8} y={toY(tick) + 4} fontSize={12} textAnchor="end" fill={CHART.muted}>
              {formatY(tick, domain.step)}
            </text>
          </g>
        ))}
        <line x1={LEFT} x2={right} y1={base} y2={base} stroke={CHART.axis} />
        {xs.map((x) => (
          <g key={x}>
            <line x1={toX(x)} x2={toX(x)} y1={base} y2={base + 5} stroke={CHART.axis} />
            <text x={toX(x)} y={base + 19} fontSize={12} textAnchor="middle" fill={CHART.muted}>
              {x}
            </text>
          </g>
        ))}
        <text x={(LEFT + right) / 2} y={height - 10} fontSize={12} textAnchor="middle" fill={CHART.muted}>
          {xTitle} (логарифмічна шкала)
        </text>

        {series.map((line) => {
          if (line.key !== active || line.points.length === 0) return null;
          const band = `${pathOf(line.points, (point) => point.max)} ${[...line.points]
            .reverse()
            .map((point) => `L${toX(point.x)},${toY(point.min)}`)
            .join(' ')} Z`;
          return <path key={`band-${line.key}`} d={band} fill={line.color} fillOpacity={0.16} stroke="none" />;
        })}

        {series.map((line, index) => {
          const dimmed = hovered !== null && line.key !== hovered.series;
          const ending = endings[index];
          return (
            <g key={line.key} opacity={dimmed ? 0.3 : 1}>
              <path
                d={pathOf(line.points, (point) => point.mean)}
                fill="none"
                stroke={line.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {line.points.map((point) => (
                <circle
                  key={point.x}
                  cx={toX(point.x)}
                  cy={toY(point.mean)}
                  r={4}
                  fill={line.color}
                  stroke={CHART.surface}
                  strokeWidth={2}
                />
              ))}
              {directLabels && ending && (
                <text x={toX(ending.x) + 12} y={(labelYs[index] ?? base) + 4} fontSize={12} fill={CHART.ink}>
                  {line.label}
                </text>
              )}
            </g>
          );
        })}

        {marks.map((mark) => {
          const point = series.find((line) => line.key === mark.series)?.points.find((p) => p.x === mark.x);
          if (!point) return null;
          const cx = toX(point.x);
          const cy = toY(point.mean);
          const above = !mark.dashed;
          return (
            <g key={`${mark.series}-${mark.x}-${mark.label}`}>
              <circle
                cx={cx}
                cy={cy}
                r={9}
                fill="none"
                stroke={CHART.ink}
                strokeWidth={1.5}
                strokeDasharray={mark.dashed ? '3 2' : undefined}
              />
              <text
                x={cx}
                y={above ? cy - 15 : cy + 25}
                fontSize={12}
                textAnchor="middle"
                fill={CHART.ink}
                stroke={CHART.surface}
                strokeWidth={4}
                paintOrder="stroke"
              >
                {mark.label}
              </text>
            </g>
          );
        })}

        {hoveredPoint && (
          <circle
            data-export-skip
            cx={toX(hoveredPoint.x)}
            cy={toY(hoveredPoint.mean)}
            r={6}
            fill={hoveredLine?.color}
            stroke={CHART.surface}
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
        <rect
          data-export-skip
          x={LEFT}
          y={top}
          width={right - LEFT}
          height={base - top}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHovered(null)}
        />
      </svg>
      {hoveredLine && hoveredPoint && (
        <div className="chart-tooltip" style={{ left: toX(hoveredPoint.x), top: toY(hoveredPoint.mean) }} role="status">
          {renderTooltip(hoveredLine, hoveredPoint)}
        </div>
      )}
    </>
  );
}
