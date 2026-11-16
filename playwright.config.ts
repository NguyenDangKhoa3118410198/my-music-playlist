import { defineConfig, devices } from '@playwright/test';

const PORT = 5188; // khác 5173 để không đụng server dev của bạn

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome', // dùng Google Chrome có sẵn, không tải trình duyệt
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --open false`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    // Biến môi trường của shell ưu tiên hơn .env, nên test luôn chạy với backend giả.
    env: { VITE_SUPABASE_URL: 'https://mock.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_publishable_mock' },
  },
});
