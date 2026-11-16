import { test as base, expect } from '@playwright/test';
import { MockBackend, type MockOptions } from './support/mockBackend';

type Fixtures = {
  /** Cài backend giả cho trang hiện tại. Gọi `await mock(opts)` trước khi `page.goto`. */
  mock: (opts?: MockOptions) => Promise<MockBackend>;
};

export const test = base.extend<Fixtures>({
  mock: async ({ page }, use) => {
    await use(async (opts) => {
      const backend = new MockBackend(opts);
      await backend.install(page);
      return backend;
    });
  },
});

export { expect };

/** Số lần player giả đã nhận một lệnh. */
export const ytCount = (page: import('@playwright/test').Page, method: string) =>
  page.evaluate((m) => (window as unknown as { __yt: { count: (n: string) => number } }).__yt.count(m), method);

export const ytLast = (page: import('@playwright/test').Page, method: string) =>
  page.evaluate((m) => (window as unknown as { __yt: { last: (n: string) => unknown } }).__yt.last(m), method) as Promise<
    { method: string; args: unknown[] } | undefined
  >;
