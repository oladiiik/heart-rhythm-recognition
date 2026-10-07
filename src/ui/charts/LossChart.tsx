import { useState, type MouseEvent, type Ref } from 'react';
import type { EpochStatus } from '../../ml/model';
import { CHART, niceTicks } from './chartTheme';
import { formatNumber } from '../../format';

interface LossChartProps {
  readonly history: readonly EpochStatus[];
  readonly maxEpoch: number;
  readonly svgRef?: Ref<SVGSVGElement>;
}

const WIDTH = 960;
const HEIGHT = 300;
const LEFT = 60;
const RIGHT = 890;
const TOP = 44;
const BASE = 250;

export function LossChart({ history, maxEpoch, svgRef }: LossChartProps) {
  const [hovered, setHovered] = useState<EpochStatus | null>(null);

  const maxError = Math.max(...history.map((point) => point.error), 0.01);
  const yTicks = niceTicks(0, maxError, 4);
  const yMax = Math.max(maxError, yTicks.at(-1) ?? maxError);
  const epochToX = (epoch: number): number => LEFT + (epoch / Math.max(1, maxEpoch)) * (RIGHT - LEFT);
  const errorToY = (error: number): number => BASE - (error / yMax) * (BASE - TOP);

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
    <div className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Графік похибки навчання за епохами"
        fontFamily={CHART.font}
      >
        <rect width={WIDTH} height={HEIGHT} fill={CHART.surface} />
        <text x={16} y={24} fontSize={14} fontWeight={600} fill={CHART.ink}>
          Похибка навчання за епохами
        </text>

        {yTicks.map((error) => (
          <g key={error}>
            <line x1={LEFT} x2={RIGHT} y1={errorToY(error)} y2={errorToY(error)} stroke={CHART.grid} />
            <text x={LEFT - 8} y={errorToY(error) + 4} fontSize={11} textAnchor="end" fill={CHART.muted}>
              {formatNumber(error, yMax < 0.1 ? 3 : 2)}
            </text>
          </g>
        ))}
        <line x1={LEFT} x2={RIGHT} y1={BASE} y2={BASE} stroke={CHART.axis} />
        {niceTicks(0, maxEpoch, 6).map((epoch) => (
          <g key={epoch}>
            <line x1={epochToX(epoch)} x2={epochToX(epoch)} y1={BASE} y2={BASE + 5} stroke={CHART.axis} />
            <text x={epochToX(epoch)} y={BASE + 19} fontSize={11} textAnchor="middle" fill={CHART.muted}>
              {epoch}
            </text>
          </g>
        ))}
        <text x={(LEFT + RIGHT) / 2} y={HEIGHT - 10} fontSize={11} textAnchor="middle" fill={CHART.muted}>
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
            <text x={epochToX(last.epoch) + 10} y={errorToY(last.error) - 8} fontSize={12} fill={CHART.ink}>
              {formatNumber(last.error, 4)}
            </text>
          </g>
        )}

        {hovered && (
          <g data-export-skip pointerEvents="none">
            <line x1={epochToX(hovered.epoch)} x2={epochToX(hovered.epoch)} y1={TOP} y2={BASE} stroke={CHART.axis} />
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
          width={RIGHT - LEFT}
          height={BASE - TOP}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHovered(null)}
        />
      </svg>
      {hovered && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(epochToX(hovered.epoch) / WIDTH) * 100}%`,
            top: `${(errorToY(hovered.error) / HEIGHT) * 100}%`,
          }}
          role="status"
        >
          <strong>Епоха {hovered.epoch}</strong>
          <span>похибка {formatNumber(hovered.error, 5)}</span>
        </div>
      )}
    </div>
  );
}
