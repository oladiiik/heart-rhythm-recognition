import { useState, type ReactNode } from 'react';
import { StatusBar } from './StatusBar';
import { DataTab } from './tabs/DataTab';
import { RecognizeTab } from './tabs/RecognizeTab';
import { TrainTab } from './tabs/TrainTab';
import { WatchTab } from './tabs/WatchTab';

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
  const [active, setActive] = useState<TabId>('data');

  return (
    <div className="app">
      <header className="app-header">
        <h1>Розпізнавання ритмів серця</h1>
        <nav className="tabs" role="tablist" aria-label="Кроки роботи">
          {TABS.map((tab) => (
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
              {tab.label}
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
