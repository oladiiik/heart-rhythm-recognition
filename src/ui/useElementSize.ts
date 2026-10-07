import { useLayoutEffect, useState } from 'react';

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

export function useElementSize<E extends Element>(): [(element: E | null) => void, ElementSize | null] {
  const [element, setElement] = useState<E | null>(null);
  const [size, setSize] = useState<ElementSize | null>(null);

  useLayoutEffect(() => {
    if (!element) return;
    const measure = (): void => {
      const bounds = element.getBoundingClientRect();
      const width = Math.floor(bounds.width);
      const height = Math.floor(bounds.height);
      setSize((previous) =>
        previous && previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, element ? size : null];
}
