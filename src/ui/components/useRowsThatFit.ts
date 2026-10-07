import { useLayoutEffect, useState } from 'react';

export function useRowsThatFit<E extends HTMLElement>(fallback: number): [(element: E | null) => void, number] {
  const [element, setElement] = useState<E | null>(null);
  const [rows, setRows] = useState(fallback);

  useLayoutEffect(() => {
    if (!element) return;
    const measure = (): void => {
      const headHeight = element.querySelector('thead')?.getBoundingClientRect().height ?? 0;
      const rowHeight = element.querySelector('tbody tr')?.getBoundingClientRect().height;
      if (!rowHeight) return;
      setRows(Math.max(1, Math.floor((element.clientHeight - headHeight) / rowHeight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, rows];
}
