import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './state/appStore';
import { App } from './ui/App';
import './ui/theme.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
