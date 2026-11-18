import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const SONGS = [{ title: 'Đang phát' }, { title: 'Bài B' }, { title: 'Bài C' }];

const joinRoom = async (page: Page) => {
  await page.goto('/room/K7Q2MX');
  await page.getByRole('button', { name: /tham gia nghe/i }).click();
};
const openRoomMenu = (page: Page) => page.getByRole('button', { name: 'Tuỳ chọn phòng' }).click();

test.describe('mời bạn bè bằng QR', () => {
  test('menu "Mã QR mời bạn bè" hiện mã QR, mã phòng và link', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);

    await openRoomMenu(page);
    await page.getByRole('menuitem', { name: 'Mã QR mời bạn bè' }).click();

    const dialog = page.getByRole('dialog', { name: 'Mời bạn bè' });
    const qr = dialog.getByRole('img', { name: /Mã QR vào phòng K7Q2MX/ });
    await expect(qr).toBeVisible();
    await expect(dialog).toContainText('K7Q2MX');
    await expect(dialog).toContainText('/join/K7Q2MX');

    // Mã QR phải thật sự là ảnh đã vẽ xong, không phải khung chờ
    await expect
      .poll(() => qr.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(100);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test.describe('chế độ màn hình lớn', () => {
  test('bật: ẩn thanh điều khiển, hiện QR và bài tiếp theo; thoát bằng nút', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);
    await expect(page.getByRole('tab', { name: /Hàng đợi/ })).toBeVisible();

    await openRoomMenu(page);
    await page.getByRole('menuitem', { name: 'Chế độ màn hình lớn' }).click();

    await expect(page.getByRole('button', { name: 'Thoát màn hình lớn' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Hàng đợi/ })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Link YouTube' })).toHaveCount(0);
    await expect(page.getByRole('img', { name: /Mã QR vào phòng K7Q2MX/ })).toBeVisible();

    const next = page.getByRole('list', { name: 'Bài tiếp theo' }).getByRole('listitem');
    await expect(next).toHaveCount(2);
    await expect(next.nth(0)).toContainText('Bài B'); // bài đang phát không nằm trong "Tiếp theo"
    await expect(next.nth(1)).toContainText('Bài C');

    await page.getByRole('button', { name: 'Thoát màn hình lớn' }).click();
    await expect(page.getByRole('tab', { name: /Hàng đợi/ })).toBeVisible();
  });

  test('phím Esc thoát; phát nhạc không bị gián đoạn khi vào/ra', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __yt: { players: { state: number }[] } }).__yt.players.length)).toBe(1);

    await openRoomMenu(page);
    await page.getByRole('menuitem', { name: 'Chế độ màn hình lớn' }).click();
    await expect(page.getByRole('button', { name: 'Thoát màn hình lớn' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Thoát màn hình lớn' })).toHaveCount(0);

    // Vẫn chỉ một player (không bị tạo lại làm gián đoạn bài đang phát)
    expect(await page.evaluate(() => (window as unknown as { __yt: { players: unknown[] } }).__yt.players.length)).toBe(1);
  });

  test('chưa có bài tiếp theo: nhắc quét mã để thêm', async ({ page, mock }) => {
    await mock({ songs: [{ title: 'Chỉ một bài' }] });
    await joinRoom(page);
    await openRoomMenu(page);
    await page.getByRole('menuitem', { name: 'Chế độ màn hình lớn' }).click();
    await expect(page.getByText('Chưa có bài tiếp theo')).toBeVisible();
  });
});
