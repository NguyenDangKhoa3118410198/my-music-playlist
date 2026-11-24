import { expect, test, joinRoom } from './fixtures';
import type { MockBackend } from './support/mockBackend';

// Gói Free của Supabase giới hạn băng thông (5 GB/tháng), nên phòng không được tải lại dày khi không cần.
const SONGS = [{ title: 'Nơi này có anh' }, { title: 'Em của ngày hôm qua' }, { title: 'Bài thứ ba' }];

const stateReads = (backend: MockBackend) => backend.restLog.filter((r) => r.table === 'room_state').length;
const historyReads = (backend: MockBackend, method: 'GET' | 'HEAD') =>
  backend.restLog.filter((r) => r.table === 'room_queue' && r.method === method && r.query.includes('played')).length;

test.describe('tiết kiệm băng thông', () => {
  test('Realtime ổn: tải lại định kỳ thưa (~90 giây), không phải 15 giây', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await page.clock.install();
    await joinRoom(page);
    await expect(page.getByText('Đang kết nối lại')).toHaveCount(0);
    await page.waitForTimeout(300);
    const before = stateReads(backend);

    await page.clock.runFor(60_000); // 4 nhịp 15 giây: trước đây là 4 lần tải lại
    await page.waitForTimeout(300);
    expect(stateReads(backend)).toBe(before);

    await page.clock.runFor(31_000); // chạm mốc 90 giây: đúng một lần tải bảo hiểm
    await expect.poll(() => stateReads(backend)).toBe(before + 1);
  });

  test('Realtime rớt: vẫn tải lại dày mỗi 15 giây', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS, realtime: false });
    await page.clock.install();
    await joinRoom(page);
    await expect(page.getByText('Đang kết nối lại')).toBeVisible();
    await page.waitForTimeout(300);
    const before = stateReads(backend);

    await page.clock.fastForward(16_000);
    await expect.poll(() => stateReads(backend)).toBe(before + 1);
    await page.clock.fastForward(15_000);
    await expect.poll(() => stateReads(backend)).toBe(before + 2);
  });

  test('danh sách lịch sử chỉ tải khi mở tab "Đã phát"; nhãn tab chỉ dùng yêu cầu đếm', async ({ page, mock }) => {
    const backend = await mock({
      songs: [{ title: 'Đang phát' }],
      history: [{ title: 'Bài cũ 1', minutesAgo: 5 }, { title: 'Bài cũ 2', minutesAgo: 9 }],
    });
    await joinRoom(page);

    const tab = page.getByRole('tab', { name: /Đã phát/ });
    await expect(tab).toContainText('(2)'); // số đếm đúng mà chưa cần tải danh sách
    expect(historyReads(backend, 'HEAD')).toBeGreaterThan(0);
    expect(historyReads(backend, 'GET')).toBe(0);

    await tab.click();
    await expect(page.getByRole('list', { name: 'Đã phát' }).getByRole('listitem')).toHaveCount(2);
    expect(historyReads(backend, 'GET')).toBeGreaterThan(0);
  });

  test('tab đóng mà bài phát xong: số đếm tăng, danh sách vẫn không bị tải', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);
    await expect(page.getByRole('tab', { name: /Đã phát/ })).toContainText('(0)');

    await page.evaluate(() => (window as unknown as { __yt: { fireEnded: () => void } }).__yt.fireEnded());
    await expect(page.getByRole('tab', { name: /Đã phát/ })).toContainText('(1)');
    expect(historyReads(backend, 'GET')).toBe(0);
  });

  test('đang mở tab "Đã phát": bài mới phát xong hiện ngay trong danh sách', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);
    await page.getByRole('tab', { name: /Đã phát/ }).click();

    await page.evaluate(() => (window as unknown as { __yt: { fireEnded: () => void } }).__yt.fireEnded());
    const rows = page.getByRole('list', { name: 'Đã phát' }).getByRole('listitem');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Nơi này có anh');
  });
});
