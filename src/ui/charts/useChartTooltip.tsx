import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';

interface TooltipState {
  readonly x: number;
  readonly y: number;
  readonly content: ReactNode;
}

interface ChartTooltip {
  show(event: MouseEvent<Element>, content: ReactNode): void;
  hide(): void;
  readonly element: ReactNode;
}

export function useChartTooltip(): ChartTooltip {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const show = useCallback((event: MouseEvent<Element>, content: ReactNode) => {
    const container = event.currentTarget.closest('.chart');
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    setTooltip({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, content });
  }, []);

  const hide = useCallback(() => setTooltip(null), []);

  const element = tooltip ? (
    <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="status">
      {tooltip.content}
    </div>
  ) : null;

  return { show, hide, element };
}
