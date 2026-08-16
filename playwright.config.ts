import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/e2e',
  timeout:90_000,
  expect:{timeout:15_000},
  fullyParallel:false,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?'github':'list',
  use:{
    baseURL:'http://127.0.0.1:3000',
    trace:'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions:{args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']},
  },
  webServer:{
    command:'pnpm --filter @product3d/web dev --hostname 127.0.0.1',
    url:'http://127.0.0.1:3000',
    reuseExistingServer:!process.env.CI,
    timeout:120_000,
    env:{
      ...process.env,
      NEXT_PUBLIC_API_URL:'http://127.0.0.1:4000',
      NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'e2e-publishable-key',
    },
  },
});
