import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const SONGS = [{ title: 'Đang phát' }, { title: 'Bài B' }, { title: 'Bài C' }, { title: 'Bài D' }];

const joinRoom = async (page: Page) => {
  await page.goto('/room/K7Q2MX');
  await page.getByRole('button', { name: /tham gia nghe/i }).click();
};
const titles = (page: Page) =>
  page.getByRole('list', { name: 'Hàng đợi' }).locator('.room-item-text strong').allTextContents();
const sortMenu = (page: Page, title: string) => page.getByRole('button', { name: `Sắp xếp “${title}”` });

test.describe('thứ tự hàng đợi', () => {
  test('chủ phòng: "Phát tiếp theo" đưa bài lên ngay sau bài đang phát', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);
    await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài B', 'Bài C', 'Bài D']);

    await sortMenu(page, 'Bài D').click();
    await page.getByRole('menuitem', { name: 'Phát tiếp theo' }).click();

    await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài D', 'Bài B', 'Bài C']);
    expect(backend.rpcCalls.filter((c) => c.fn === 'room_reorder')).toHaveLength(1);
  });

  test('đưa lên / xuống một bậc, và chỉ hiện thao tác có tác dụng', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);
    await expect.poll(() => titles(page)).toHaveLength(4);

    await sortMenu(page, 'Bài C').click();
    await page.getByRole('menuitem', { name: 'Đưa lên' }).click();
    await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài C', 'Bài B', 'Bài D']);

    await sortMenu(page, 'Bài B').click();
    await page.getByRole('menuitem', { name: 'Đưa xuống' }).click();
    await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài C', 'Bài D', 'Bài B']);

    // Bài kế tiếp: không có "Phát tiếp theo" / "Đưa lên". Bài cuối: không có "Đưa xuống".
    await sortMenu(page, 'Bài C').click();
    await expect(page.getByRole('menuitem', { name: 'Đưa xuống' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Đưa lên' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Phát tiếp theo' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await sortMenu(page, 'Bài B').click();
    await expect(page.getByRole('menuitem', { name: 'Đưa xuống' })).toHaveCount(0);
  });

  test('bài đã đổi chỗ thì phát đúng theo thứ tự mới', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);
    await sortMenu(page, 'Bài D').click();
    await page.getByRole('menuitem', { name: 'Phát tiếp theo' }).click();
    await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài D', 'Bài B', 'Bài C']);

    await page.getByRole('button', { name: 'Bài tiếp theo' }).click();
    await expect(page.locator('.room-now-text strong')).toHaveText('Bài D');
  });

  test('người nghe không có menu sắp xếp', async ({ page, mock }) => {
    await mock({ role: 'listener', songs: SONGS });
    await joinRoom(page);
    await expect.poll(() => titles(page)).toHaveLength(4);
    await expect(page.getByRole('button', { name: /^Sắp xếp/ })).toHaveCount(0);
  });
});
