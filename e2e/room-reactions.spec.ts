import type { Page } from '@playwright/test';
import { expect, test, joinRoom } from './fixtures';

const SONGS = [{ title: 'Đang phát' }, { title: 'Bài B' }];

const floating = (page: Page) => page.locator('.room-video .reaction-float');
const send = (page: Page, label: string) => page.getByRole('group', { name: 'Gửi cảm xúc' }).getByRole('button', { name: label });

test.describe('thả cảm xúc', () => {
  test('bấm emoji: gửi cho cả phòng và bay lên trên video của chính mình', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);

    await send(page, 'Cháy quá').click();

    await expect(floating(page)).toHaveCount(1);
    await expect(floating(page).first()).toHaveText('🔥');
    expect(backend.broadcasts).toEqual([{ event: 'reaction', payload: { emoji: '🔥' } }]);
  });

  test('emoji của người khác cũng bay lên; nội dung lạ bị bỏ qua', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);

    backend.remoteReaction('👏');
    await expect(floating(page)).toHaveText(['👏']);

    backend.remoteReaction('<img src=x onerror=alert(1)>'); // không nằm trong danh sách cho phép
    backend.remoteReaction('💩');
    await page.waitForTimeout(300);
    await expect(floating(page)).toHaveCount(1);
  });

  test('bấm dồn dập chỉ gửi một tin (giới hạn tần suất), chờ chút thì gửi tiếp', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);
    const button = send(page, 'Vỗ tay');

    await button.evaluate((el: HTMLButtonElement) => {
      for (let i = 0; i < 6; i += 1) el.click();
    });
    await expect.poll(() => backend.broadcasts.length).toBe(1);

    await page.waitForTimeout(400);
    await button.click();
    await expect.poll(() => backend.broadcasts.length).toBe(2);
  });

  test('emoji tự biến mất sau vài giây', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await page.clock.install();
    await joinRoom(page);

    backend.remoteReaction('❤️');
    await expect(floating(page)).toHaveCount(1);
    await page.clock.runFor(3000);
    await expect(floating(page)).toHaveCount(0);
  });

  test('chưa tham gia nghe thì chưa có thanh cảm xúc; mất Realtime thì nút bị khoá', async ({ page, mock }) => {
    await mock({ songs: SONGS, realtime: false });
    await page.goto('/room/K7Q2MX');
    await expect(page.getByRole('group', { name: 'Gửi cảm xúc' })).toHaveCount(0);

    await page.getByRole('button', { name: /tham gia nghe/i }).click();
    await expect(send(page, 'Vỗ tay')).toBeDisabled();
  });
});
