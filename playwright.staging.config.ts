import {defineConfig,devices} from '@playwright/test';

const baseURL=process.env.STAGING_WEB_URL;
if(!baseURL)throw new Error('STAGING_WEB_URL is required for live staging E2E.');

export default defineConfig({
  testDir:'./tests/staging',
  timeout:8*60_000,
  expect:{timeout:120_000},
  retries:0,
  reporter:'github',
  use:{
    baseURL,
    trace:'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions:{args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']},
  },
});
