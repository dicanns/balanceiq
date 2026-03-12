import { init } from '@sentry/electron/renderer';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

init({
  dsn: 'https://SENTRY_DSN_REMOVED',
});

const root = createRoot(document.getElementById('root'));
root.render(<App />);
