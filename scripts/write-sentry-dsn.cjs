// Run at build time, after vite build and before electron-builder: the packaged
// app has no environment, so the DSN it reports to is written into dist/.
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
fs.mkdirSync(dist, { recursive: true });
const dsn = process.env.VITE_SENTRY_DSN || process.env.SENTRY_DSN || '';
fs.writeFileSync(path.join(dist, 'sentry.json'), JSON.stringify({ dsn }));
console.log(dsn ? '[sentry] dsn written to dist/sentry.json' : '[sentry] no DSN in the environment; dist/sentry.json is empty');
