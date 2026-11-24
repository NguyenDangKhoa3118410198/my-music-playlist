import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Máy chủ chậm (1,5 giây mỗi yêu cầu): thao tác hàng đợi của chính mình vẫn phải hiện ngay, không giật ngược.
const SONGS = [{ title: 'Đang phát' }, { title: 'Bài B' }, { title: 'Bài C' }, { title: 'Bài D' }];
const LATENCY = 1500;

const titles = (page: Page) =>
  page.getByRole('list', { name: 'Hàng đợi' }).locator('.room-item-text strong').allTextContents();

async function joinSlowRoom(page: Page) {
  await page.goto('/room/K7Q2MX');
  await page.getByRole('button', { name: /tham gia nghe/i }).click({ timeout: 15_000 });
  await expect.poll(() => titles(page), { timeout: 15_000 }).toHaveLength(4);
  // Chờ các lần tải ban đầu (cũng chậm) xong hết, để chúng không lẫn vào phần đo bên dưới.
  await page.waitForTimeout(LATENCY * 2);
}

// Ghi lại thứ tự danh sách mỗi 100 ms trong một khoảng, để bắt cả lúc danh sách nhảy về chỗ cũ rồi mới đúng.
async function sampleTitles(page: Page, ms: number) {
  return page.evaluate(
    (duration) =>
      new Promise<string[][]>((resolve) => {
        const samples: string[][] = [];
        const read = () =>
          samples.push([...document.querySelectorAll('[aria-label="Hàng đợi"] .room-item-text strong')].map((el) => el.textContent ?? ''));
        const timer = setInterval(read, 100);
        setTimeout(() => {
          clearInterval(timer);
          resolve(samples);
        }, duration);
      }),
    ms,
  );
}

test.describe('hàng đợi phản hồi ngay khi máy chủ chậm', () => {
  test.setTimeout(45_000);

  test('xoá bài: biến mất ngay và không hiện lại', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS, latencyMs: LATENCY });
    await joinSlowRoom(page);

    await page.getByRole('button', { name: 'Xoá Bài C khỏi hàng đợi' }).click();
    await expect.poll(() => titles(page), { timeout: 400 }).toEqual(['Đang phát', 'Bài B', 'Bài D']);

    const samples = await sampleTitles(page, LATENCY * 2.5);
    expect(samples.filter((s) => s.includes('Bài C'))).toEqual([]);
    await expect.poll(() => backend.rpcCalls.filter((c) => c.fn === 'room_remove').length).toBe(1);
  });

  test('đổi thứ tự: nằm đúng chỗ mới ngay, không giật về chỗ cũ', async ({ page, mock }) => {
    await mock({ songs: SONGS, latencyMs: LATENCY });
    await joinSlowRoom(page);

    await page.getByRole('button', { name: 'Sắp xếp “Bài D”' }).click();
    await page.getByRole('menuitem', { name: 'Phát tiếp theo' }).click();
    await expect.poll(() => titles(page), { timeout: 400 }).toEqual(['Đang phát', 'Bài D', 'Bài B', 'Bài C']);

    const samples = await sampleTitles(page, LATENCY * 2.5);
    expect(samples.filter((s) => s.join() !== 'Đang phát,Bài D,Bài B,Bài C')).toEqual([]);
  });

  test('đang có lần tải hàng đợi chậm thì xoá: kết quả cũ về muộn không làm bài hiện lại', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS, latencyMs: LATENCY });
    await joinSlowRoom(page);

    backend.remoteAddSong('Bài từ máy khác'); // sự kiện Realtime → trình duyệt bắt đầu tải lại hàng đợi (mất 1,5 giây)
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Xoá Bài C khỏi hàng đợi' }).click();

    const samples = await sampleTitles(page, LATENCY * 3);
    expect(samples.filter((s) => s.includes('Bài C'))).toEqual([]);
    await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài B', 'Bài D', 'Bài từ máy khác']);
  });

  test('máy chủ báo lỗi: danh sách hoàn về như cũ và báo cho người dùng', async ({ page, mock }) => {
    await mock({ songs: SONGS, latencyMs: 300, failRpc: ['room_remove', 'room_reorder'] });
    await joinSlowRoom(page);

    await page.getByRole('button', { name: 'Xoá Bài C khỏi hàng đợi' }).click();
    await expect.poll(() => titles(page), { timeout: 400 }).not.toContain('Bài C'); // gỡ ngay
    await expect.poll(() => titles(page), { timeout: 5000 }).toEqual(['Đang phát', 'Bài B', 'Bài C', 'Bài D']); // rồi hoàn lại
    await expect(page.locator('.room-toast')).toContainText('Lỗi máy chủ');

    await page.getByRole('button', { name: 'Sắp xếp “Bài D”' }).click();
    await page.getByRole('menuitem', { name: 'Phát tiếp theo' }).click();
    await expect.poll(() => titles(page), { timeout: 5000 }).toEqual(['Đang phát', 'Bài B', 'Bài C', 'Bài D']);
  });
});
