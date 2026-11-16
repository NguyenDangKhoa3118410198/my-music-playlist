import type { Page } from '@playwright/test';
import { expect, test, ytCount, ytLast } from './fixtures';

const SONGS = [{ title: 'Nơi này có anh' }, { title: 'Em của ngày hôm qua' }, { title: 'Bài thứ ba' }];

const joinRoom = async (page: Page) => {
  await page.goto('/room/K7Q2MX');
  await page.getByRole('button', { name: /tham gia nghe/i }).click();
};

const playerState = (page: Page) =>
  page.evaluate(() => (window as unknown as { __yt: { players: { state: number }[] } }).__yt.players[0]?.state);

test.describe('phòng nghe chung', () => {
  test('cổng tham gia: chưa vào thì chưa phát, bấm vào mới phát đúng bài', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await page.goto('/room/K7Q2MX');

    await expect(page.getByRole('heading', { name: 'Chill cuối tuần' })).toBeVisible();
    await expect(page.getByRole('button', { name: /tham gia nghe/i })).toBeEnabled();
    expect(await ytCount(page, 'loadVideoById')).toBe(0); // trình duyệt chặn autoplay: chưa được phát

    await page.getByRole('button', { name: /tham gia nghe/i }).click();
    await expect.poll(() => ytCount(page, 'loadVideoById')).toBe(1);
    const call = await ytLast(page, 'loadVideoById');
    expect((call!.args[0] as { videoId: string }).videoId).toBe('vid1xxxxxxx');
  });

  test('bấm vào video để dừng: dừng thật và KHÔNG tự chạy lại', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);
    await expect.poll(() => playerState(page)).toBe(1);

    await page.getByRole('button', { name: 'Bấm vào video để tạm dừng' }).click();

    await expect(page.getByRole('button', { name: 'Phát', exact: true })).toBeVisible();
    expect(backend.rpcCalls.filter((c) => c.fn === 'room_pause')).toHaveLength(1);
    await expect.poll(() => playerState(page)).toBe(2);

    // Lỗi cũ: vòng sửa lệch bật player chạy lại ngay sau khi dừng.
    const playsAfterPause = await ytCount(page, 'playVideo');
    await page.waitForTimeout(3000);
    expect(await ytCount(page, 'playVideo')).toBe(playsAfterPause);
    expect(await playerState(page)).toBe(2);
  });

  test('nút phát/dừng chính hoạt động hai chiều', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);

    await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Phát', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Phát', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
    expect(backend.rpcCalls.filter((c) => c.fn === 'room_play')).toHaveLength(1);
    await expect.poll(() => playerState(page)).toBe(1);
  });

  test('tua: mỗi lần bấm chỉ gửi một lệnh và thanh không giật ngược', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);

    const slider = page.getByRole('slider', { name: 'Tua bài hát' });
    await expect(page.getByText('3:35')).toBeVisible(); // đã biết độ dài bài
    const box = (await slider.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);

    await expect.poll(() => backend.rpcCalls.filter((c) => c.fn === 'room_seek').length).toBe(1);
    const target = backend.rpcCalls.find((c) => c.fn === 'room_seek')!.body.p_pos as number;
    expect(target).toBeGreaterThan(95);
    expect(target).toBeLessThan(120);

    // Lỗi cũ: thanh nhảy về vị trí cũ rồi mới nhảy tới. Lấy mẫu liên tục, không được thấy giá trị nhỏ.
    for (let i = 0; i < 8; i += 1) {
      const value = Number(await slider.inputValue());
      expect(Math.abs(value - target)).toBeLessThan(8);
      await page.waitForTimeout(200);
    }
    expect(backend.rpcCalls.filter((c) => c.fn === 'room_seek')).toHaveLength(1);
    const seekCall = await ytLast(page, 'seekTo');
    expect(Math.abs((seekCall!.args[0] as number) - target)).toBeLessThan(8);
  });

  test('bài tiếp: chuyển bài và tải đúng video', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);

    await page.getByRole('button', { name: 'Bài tiếp theo' }).click();

    await expect(page.locator('.room-now-text strong')).toHaveText('Em của ngày hôm qua');
    expect(backend.rpcCalls.find((c) => c.fn === 'room_next')!.body.p_reason).toBe('skip');
    await expect.poll(() => ytCount(page, 'loadVideoById')).toBe(2);
  });

  test('hết bài tự chuyển; video lỗi thì báo và bỏ qua', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);

    await page.evaluate(() => (window as unknown as { __yt: { fireEnded: () => void } }).__yt.fireEnded());
    await expect(page.locator('.room-now-text strong')).toHaveText('Em của ngày hôm qua');
    expect(backend.rpcCalls.find((c) => c.fn === 'room_next')!.body.p_reason).toBe('ended');

    await page.evaluate(() => (window as unknown as { __yt: { fireError: (c: number) => void } }).__yt.fireError(101));
    await expect(page.getByRole('status')).toContainText('không cho phép nhúng');
    await expect(page.locator('.room-now-text strong')).toHaveText('Bài thứ ba');
    expect(backend.rpcCalls.filter((c) => c.fn === 'room_next').at(-1)!.body.p_reason).toBe('unplayable');
  });

  test('thêm bài bằng link YouTube: xem trước, thêm, và báo lỗi link sai', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);

    const input = page.getByRole('textbox', { name: 'Link YouTube' });
    await input.fill('không phải link');
    await page.getByRole('button', { name: 'Thêm vào hàng đợi' }).click();
    await expect(page.getByText('Hãy dán link YouTube hợp lệ.')).toBeVisible();

    await input.fill('https://youtu.be/dQw4w9WgXcQ');
    await expect(page.locator('.room-add-preview')).toContainText('Bài hát thử nghiệm');
    await page.getByRole('button', { name: 'Thêm vào hàng đợi' }).click();

    await expect(page.getByRole('list', { name: 'Hàng đợi' }).getByText('Bài hát thử nghiệm')).toBeVisible();
    expect(backend.rpcCalls.find((c) => c.fn === 'room_add')!.body.p_video_id).toBe('dQw4w9WgXcQ');
    await expect(input).toHaveValue('');
  });

  test('xoá bài khỏi hàng đợi', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);

    await page.getByRole('button', { name: /Xoá Bài thứ ba/ }).click();
    await expect(page.getByRole('list', { name: 'Hàng đợi' }).getByText('Bài thứ ba')).toHaveCount(0);
  });

  test('người nghe: không có nút điều khiển, bấm video không gửi lệnh', async ({ page, mock }) => {
    const backend = await mock({ role: 'listener', songs: SONGS });
    await joinRoom(page);

    await expect(page.getByText('Bạn đang nghe cùng mọi người')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Bài tiếp theo' })).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Tua bài hát' })).toBeDisabled();

    await page.getByRole('button', { name: /vào video/ }).click();
    await expect(page.getByRole('status')).toContainText('Chỉ chủ phòng và DJ');
    expect(backend.rpcCalls.filter((c) => c.fn === 'room_pause')).toHaveLength(0);
  });

  test('realtime: người khác dừng và thêm bài thì máy này theo kịp', async ({ page, mock }) => {
    const backend = await mock({ role: 'listener', songs: SONGS });
    await joinRoom(page);
    await expect.poll(() => playerState(page)).toBe(1);

    backend.remotePause(42);
    await expect.poll(() => playerState(page)).toBe(2);
    await expect(page.getByText(/Tạm dừng · /)).toBeVisible();

    backend.remoteAddSong('Bài mới từ Lan');
    await expect(page.getByRole('list', { name: 'Hàng đợi' }).getByText('Bài mới từ Lan')).toBeVisible();
  });

  test('chủ phòng đặt DJ cho người nghe', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);

    await page.getByRole('tab', { name: /mọi người/i }).click();
    await page.getByRole('button', { name: 'Làm DJ' }).click();
    await expect.poll(() => backend.rpcCalls.find((c) => c.fn === 'room_set_role')?.body.p_role).toBe('dj');
  });

  test('phòng trống: báo chưa có bài, thêm bài đầu tiên thì tự phát', async ({ page, mock }) => {
    await mock({});
    await joinRoom(page);

    await expect(page.getByText('Chưa có bài nào')).toBeVisible();
    await page.getByRole('textbox', { name: 'Link YouTube' }).fill('https://youtu.be/dQw4w9WgXcQ');
    await page.getByRole('button', { name: 'Thêm vào hàng đợi' }).click();

    await expect.poll(() => ytCount(page, 'loadVideoById')).toBe(1);
    await expect(page.locator('.room-now-text strong')).toHaveText('Bài hát thử nghiệm');
  });
});
