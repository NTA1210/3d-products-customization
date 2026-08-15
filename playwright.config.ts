import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  timeout:60_000,
  expect:{timeout:10_000},
  retries:1,
  reporter:'list',
  use:{baseURL:'http://127.0.0.1:3000',trace:'retain-on-failure',video:'off',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{
    command:'pnpm --filter @product3d/web exec next dev -H 127.0.0.1 -p 3000',
    url:'http://127.0.0.1:3000',
    reuseExistingServer:false,
    timeout:120_000,
    env:{
      NEXT_PUBLIC_E2E_MODE:'1',
      NEXT_PUBLIC_API_URL:'http://127.0.0.1:4000',
      NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'e2e-publishable-key',
    },
  },
});
