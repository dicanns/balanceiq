const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  reporter: 'list',
  workers: 1,
  fullyParallel: false,
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
