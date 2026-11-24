import type { Page } from '@playwright/test';
import { expect, test, joinRoom } from './fixtures';

const SONGS = [{ title: 'Nơi này có anh' }, { title: 'Em của ngày hôm qua' }, { title: 'Bài thứ ba' }];

const historyTab = (page: Page) => page.getByRole('tab', { name: /Đã phát/ });
const historyList = (page: Page) => page.getByRole('list', { name: 'Đã phát' });
const fire = (page: Page, fn: 'fireEnded' | 'fireError') =>
  page.evaluate((name) => (window as unknown as { __yt: Record<string, (c?: number) => void> }).__yt[name](101), fn);

test.describe('lịch sử đã phát', () => {
  test('chưa phát bài nào: tab trống có hướng dẫn', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);

    await expect(historyTab(page)).toContainText('(0)');
    await historyTab(page).click();
    await expect(page.getByText('Chưa có bài nào được phát')).toBeVisible();
  });

  test('bài phát xong, bị bỏ qua, hoặc lỗi đều vào lịch sử với lý do đúng (mới nhất trước)', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);

    await fire(page, 'fireEnded'); // bài 1 hết tự nhiên
    await expect(page.locator('.room-now-text strong')).toHaveText('Em của ngày hôm qua');
    await page.getByRole('button', { name: 'Bài tiếp theo' }).click(); // bài 2 bị bỏ qua bằng tay
    await expect(page.locator('.room-now-text strong')).toHaveText('Bài thứ ba');
    await fire(page, 'fireError'); // bài 3 không nhúng được
    await expect(page.locator('.room-now-text strong')).toHaveText('Chưa phát bài nào', { timeout: 10_000 });

    await expect(historyTab(page)).toContainText('(3)');
    await historyTab(page).click();
    const rows = historyList(page).getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Bài thứ ba'); // mới nhất ở trên cùng
    await expect(rows.nth(0)).toContainText('Không phát được');
    await expect(rows.nth(1)).toContainText('Em của ngày hôm qua');
    await expect(rows.nth(1)).toContainText('Bị bỏ qua');
    await expect(rows.nth(2)).toContainText('Nơi này có anh');
    await expect(rows.nth(2)).toContainText('Đã phát');
    await expect(rows.nth(2)).toContainText('bạn thêm');

    // Bài bị bỏ qua/lỗi được tô màu cảnh báo để phân biệt với bài phát bình thường
    await expect(rows.nth(0).locator('small.is-warn')).toHaveCount(1);
    await expect(rows.nth(2).locator('small.is-warn')).toHaveCount(0);
  });

  test('lịch sử có sẵn hiện đúng thứ tự, giờ và người thêm', async ({ page, mock }) => {
    await mock({
      songs: [{ title: 'Đang phát' }],
      history: [
        { title: 'Bài mới nhất', minutesAgo: 2 },
        { title: 'Bài cũ hơn', minutesAgo: 30, addedBy: 'bbbbbbbb-0000-4000-8000-000000000002' },
      ],
    });
    await joinRoom(page);
    await historyTab(page).click();

    const rows = historyList(page).getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Bài mới nhất');
    await expect(rows.nth(1)).toContainText('Bài cũ hơn');
    await expect(rows.nth(1)).toContainText('Lan thêm'); // tên người thêm lấy từ danh sách thành viên
    await expect(rows.nth(0)).toContainText(/\d{1,2}:\d{2}/); // có giờ phát
  });

  test('"Thêm lại" đưa bài đã phát vào cuối hàng đợi, lịch sử vẫn giữ', async ({ page, mock }) => {
    const backend = await mock({ songs: [{ title: 'Đang phát' }], history: [{ title: 'Bài muốn nghe lại' }] });
    await joinRoom(page);
    await historyTab(page).click();

    await page.getByRole('button', { name: /Thêm lại Bài muốn nghe lại/ }).click();
    await expect(page.getByRole('status')).toContainText('Đã thêm lại “Bài muốn nghe lại”');

    const add = backend.rpcCalls.find((c) => c.fn === 'room_add')!;
    expect(add.body.p_title).toBe('Bài muốn nghe lại');
    expect(String(add.body.p_video_id)).toMatch(/^hist0/);

    await page.getByRole('tab', { name: /Hàng đợi/ }).click();
    await expect(page.getByRole('list', { name: 'Hàng đợi' }).getByText('Bài muốn nghe lại')).toBeVisible();
    await historyTab(page).click();
    await expect(historyList(page).getByText('Bài muốn nghe lại')).toBeVisible(); // vẫn còn trong lịch sử
  });

  test('hiện đủ ba tab và không tràn ngang trên điện thoại', async ({ page, mock }) => {
    await mock({ songs: SONGS, history: [{ title: 'Một bài rất rất rất dài để thử việc bị cắt gọn trong tab lịch sử' }] });
    await joinRoom(page);

    for (const name of [/Hàng đợi/, /Đã phát/, /Mọi người/]) await expect(page.getByRole('tab', { name })).toBeVisible();
    await historyTab(page).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const tabs = await page.getByRole('tablist').boundingBox();
    const panel = await page.locator('.room-panel').boundingBox();
    expect(Math.abs(tabs!.width - panel!.width)).toBeLessThan(4);
  });
});
