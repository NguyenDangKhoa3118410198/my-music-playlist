import { expect, test } from './fixtures';

test('trang phòng tải được với backend giả và hiện bài đang phát', async ({ page, mock }) => {
  await mock({ songs: [{ title: 'Nơi này có anh' }, { title: 'Em của ngày hôm qua' }] });
  await page.goto('/room/K7Q2MX');

  await expect(page.getByRole('heading', { name: 'Chill cuối tuần' })).toBeVisible();
  await expect(page.getByText('Nơi này có anh').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /tham gia nghe/i })).toBeEnabled();
});
