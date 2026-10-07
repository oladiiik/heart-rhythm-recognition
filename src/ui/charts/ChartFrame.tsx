import type { ReactNode } from 'react';
import { useElementSize, type ElementSize } from '../useElementSize';

interface ChartFrameProps {
  readonly children: (size: ElementSize) => ReactNode;
}

export function ChartFrame({ children }: ChartFrameProps) {
  const [frame, size] = useElementSize<HTMLDivElement>();
  return (
    <div className="chart" ref={frame}>
      {size && size.width > 0 && size.height > 0 && children(size)}
    </div>
  );
}
