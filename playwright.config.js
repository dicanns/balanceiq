import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  reporter: 'list',
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.js',
    },
  ],
  use: {
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
