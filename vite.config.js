import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One Content-Security-Policy per mode. Production allows no inline script at
// all: the bundle is module files, and the modulepreload polyfill Vite would
// otherwise inline is switched off (Chromium in Electron supports modulepreload
// natively). Development keeps inline script for React Fast Refresh and lets
// the dev server's websocket through. Everything else is the same list.
const CONNECT = [
  "'self'",
  'https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com',
  'https://*.supabase.co', 'wss://*.supabase.co',
  'https://connect.squareup.com', 'https://connect.squareupsandbox.com',
  'https://api.clover.com', 'https://sandbox.dev.clover.com',
  'https://*.myshopify.com',
  'data:', 'blob:',
];
export function csp(mode) {
  const dev = mode === 'development';
  return [
    "default-src 'self'",
    dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com https://api.fontshare.com",
    "img-src 'self' data: blob:",
    `connect-src ${CONNECT.join(' ')}${dev ? ' ws://localhost:5173 http://localhost:5173' : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

const cspPlugin = () => ({
  name: 'biq-csp',
  transformIndexHtml: {
    order: 'pre',
    handler(html, ctx) {
      const mode = ctx.server ? 'development' : 'production';
      return html.replace(
        /<meta http-equiv="Content-Security-Policy"[^>]*>/,
        `<meta http-equiv="Content-Security-Policy" content="${csp(mode)}">`
      );
    },
  },
});

export default defineConfig({
  plugins: [react(), cspPlugin()],
  root: 'src',
  base: './',
  envDir: '../',  // load .env from project root (not src/)
  server: {
    port: 5173,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
  },
}); 
