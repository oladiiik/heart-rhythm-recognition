import type { BenchmarkEnvironment } from '../../benchmark/environment';
import { formatNumber } from '../../format';
import type { InfoRow } from '../components/InfoPopover';

export function environmentRows(environment: BenchmarkEnvironment): InfoRow[] {
  return [
    { label: 'Браузер', value: environment.browser },
    { label: 'Операційна система', value: environment.os },
    { label: 'Логічних ядер', value: environment.logicalCores ?? 'невідомо' },
    {
      label: "Пам'ять",
      value:
        environment.memoryGb === null
          ? 'невідомо'
          : `щонайменше ${formatNumber(environment.memoryGb, 0)} ГБ (браузер не повідомляє більше 8)`,
    },
  ];
}
