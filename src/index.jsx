import { init } from '@sentry/electron/renderer';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

init({
  dsn: 'https://e2c8c35467e699c99b0cbf2e87dd25c3@o4511028896071680.ingest.us.sentry.io/4511028913438720',
});

const root = createRoot(document.getElementById('root'));
root.render(<App />);
