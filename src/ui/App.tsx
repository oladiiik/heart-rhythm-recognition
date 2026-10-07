import { useState, type ReactNode } from 'react';
import { useApp } from '../state/appStore';
import { StatusBar } from './StatusBar';
import { DataTab } from './tabs/DataTab';
import { RecognizeTab } from './tabs/RecognizeTab';
import { TrainTab } from './tabs/TrainTab';
import { WatchTab } from './tabs/WatchTab';
import { formatPercent } from '../format';

const TABS = [
  { id: 'data', label: 'Дані' },
  { id: 'train', label: 'Навчання' },
  { id: 'recognize', label: 'Розпізнавання' },
  { id: 'watch', label: 'Годинник' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const PANELS: Record<TabId, ReactNode> = {
  data: <DataTab />,
  train: <TrainTab />,
  recognize: <RecognizeTab />,
  watch: <WatchTab />,
};

export function App() {
  const { dataset, model, recognitions, isTraining } = useApp();
  const [active, setActive] = useState<TabId>('data');

  const badges: Record<TabId, string | null> = {
    data: dataset ? `${dataset.sequences.length} послідовностей` : null,
    train: isTraining
      ? 'триває…'
      : model?.snapshot.summary.metrics
        ? `точність ${formatPercent(model.snapshot.summary.metrics.accuracy)}`
        : model
          ? 'модель із файла'
          : null,
    recognize: recognitions.length > 0 ? `розпізнано: ${recognitions.length}` : null,
    watch: null,
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Розпізнавання ритмів серця</h1>
          <p>
            Нейронна мережа вчиться відрізняти нормальний ритм, тахікардію та брадикардію за послідовностями з чотирьох
            значень пульсу. Навчальний застосунок, не медичний прилад.
          </p>
        </div>
        <nav className="tabs" role="tablist" aria-label="Кроки роботи">
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active === tab.id}
              aria-controls={`panel-${tab.id}`}
              className={active === tab.id ? 'tab tab-active' : 'tab'}
              onClick={() => setActive(tab.id)}
            >
              <span className="tab-step">{index + 1}</span>
              <span className="tab-label">{tab.label}</span>
              {badges[tab.id] && <span className="tab-badge">{badges[tab.id]}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {/* Усі вкладки лишаються змонтованими: введені значення та з'єднання з годинником не губляться */}
        {TABS.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            hidden={active !== tab.id}
          >
            {PANELS[tab.id]}
          </div>
        ))}
      </main>

      <StatusBar />
    </div>
  );
}
