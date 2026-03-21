import { init } from '@sentry/electron/renderer';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
});

const root = createRoot(document.getElementById('root'));
root.render(<App />);
