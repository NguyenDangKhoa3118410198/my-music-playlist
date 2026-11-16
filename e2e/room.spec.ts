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

  test('xem trước link khác hẳn dòng trong hàng đợi; chỉ thêm khi bấm nút, rồi báo đã thêm', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);
    const queue = page.getByRole('list', { name: 'Hàng đợi' });
    await expect(queue.getByRole('listitem')).toHaveCount(3);

    await page.getByRole('textbox', { name: 'Link YouTube' }).fill('https://youtu.be/dQw4w9WgXcQ');
    const preview = page.getByLabel('Xem trước bài sắp thêm');

    // Lỗi cũ: khung xem trước giống hệt một dòng bài hát nên người dùng tưởng bài đã vào hàng đợi.
    await expect(preview).toContainText('chưa thêm vào hàng đợi');
    await expect(preview).toContainText('Bài hát thử nghiệm');
    await expect(queue.getByRole('listitem')).toHaveCount(3); // xem trước KHÔNG phải một dòng của hàng đợi
    await expect(queue.getByText('Bài hát thử nghiệm')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Hàng đợi \(3\)/ })).toBeVisible();
    const dashed = await preview.evaluate((el) => getComputedStyle(el).borderTopStyle);
    expect(dashed).toBe('dashed');

    await page.getByRole('button', { name: 'Thêm vào hàng đợi' }).click();
    await expect(queue.getByRole('listitem')).toHaveCount(4);
    await expect(queue.getByText('Bài hát thử nghiệm')).toBeVisible();
    await expect(page.getByRole('tab', { name: /Hàng đợi \(4\)/ })).toBeVisible();
    await expect(preview).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Đã thêm “Bài hát thử nghiệm” vào hàng đợi');
  });

  test('hiện lỗi thật của máy chủ khi thêm bài không được (ví dụ quá giới hạn)', async ({ page, mock }) => {
    await mock({ songs: [{ title: 'a' }, { title: 'b' }, { title: 'c' }, { title: 'd' }, { title: 'e' }, { title: 'f' }] });
    await joinRoom(page);

    await page.getByRole('textbox', { name: 'Link YouTube' }).fill('https://youtu.be/dQw4w9WgXcQ');
    await page.getByRole('button', { name: 'Thêm vào hàng đợi' }).click();
    await expect(page.locator('.room-add-error')).toContainText('giới hạn');
  });

  test('Realtime rớt: hàng đợi và thành viên vẫn tự đồng bộ lại sau một lúc', async ({ page, mock }) => {
    const backend = await mock({ role: 'listener', songs: SONGS, realtime: false });
    await page.clock.install();
    await page.goto('/room/K7Q2MX');
    await page.getByRole('button', { name: /tham gia nghe/i }).click();
    await expect(page.getByText('Đang kết nối lại')).toBeVisible(); // đúng là không có Realtime
    const queue = page.getByRole('list', { name: 'Hàng đợi' });
    await expect(queue.getByRole('listitem')).toHaveCount(3);

    backend.remoteAddSong('Bài từ máy khác'); // người khác thêm bài, không có sự kiện Realtime nào tới
    await page.clock.fastForward(16_000); // quá chu kỳ tải lại định kỳ (15 giây)

    await expect(queue.getByText('Bài từ máy khác')).toBeVisible();
    await expect(queue.getByRole('listitem')).toHaveCount(4);
  });

  test.describe('tắt tiếng cá nhân', () => {
    const muted = (page: Page) =>
      page.evaluate(() => (window as unknown as { __yt: { players: { muted: boolean }[] } }).__yt.players[0]?.muted);

    test('tắt rồi bật lại: player đổi theo, nút và nhãn trên video phản ánh đúng', async ({ page, mock }) => {
      await mock({ songs: SONGS });
      await joinRoom(page);
      await expect.poll(() => playerState(page)).toBe(1);

      const toggle = page.getByRole('button', { name: 'Tắt tiếng' });
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('.room-muted-chip')).toHaveCount(0);
      expect(await muted(page)).toBe(false);

      await toggle.click();
      await expect.poll(() => muted(page)).toBe(true);
      await expect(page.getByRole('button', { name: 'Bật tiếng' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.room-muted-chip')).toContainText('Đang tắt tiếng');

      await page.locator('.room-muted-chip').click(); // bấm vào nhãn trên video cũng bật lại tiếng
      await expect.poll(() => muted(page)).toBe(false);
      await expect(page.getByRole('button', { name: 'Tắt tiếng' })).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('.room-muted-chip')).toHaveCount(0);
    });

    test('chỉ riêng máy này: không gửi lệnh nào lên phòng, trạng thái phát không đổi', async ({ page, mock }) => {
      const backend = await mock({ songs: SONGS });
      await joinRoom(page);
      await expect.poll(() => playerState(page)).toBe(1);
      const before = backend.rpcCalls.length;
      const versionBefore = backend.state.version;

      await page.getByRole('button', { name: 'Tắt tiếng' }).click();
      await expect.poll(() => muted(page)).toBe(true);
      await page.waitForTimeout(500);

      expect(backend.rpcCalls.slice(before).filter((c) => c.fn.startsWith('room_')), 'không được có lệnh phòng nào').toHaveLength(0);
      expect(backend.state.version).toBe(versionBefore);
      expect(await playerState(page)).toBe(1); // vẫn đang phát, chỉ không có tiếng
    });

    test('giữ nguyên trạng thái tắt tiếng khi đổi bài và khi người khác tạm dừng/phát', async ({ page, mock }) => {
      const backend = await mock({ songs: SONGS });
      await joinRoom(page);
      await page.getByRole('button', { name: 'Tắt tiếng' }).click();
      await expect.poll(() => muted(page)).toBe(true);

      await page.getByRole('button', { name: 'Bài tiếp theo' }).click(); // đổi bài
      await expect(page.locator('.room-now-text strong')).toHaveText('Em của ngày hôm qua');
      await expect.poll(() => ytCount(page, 'loadVideoById')).toBe(2);
      expect(await muted(page), 'đổi bài không được tự bật tiếng').toBe(true);
      await expect(page.locator('.room-muted-chip')).toBeVisible();

      backend.remotePause(10); // sự kiện từ phòng
      await expect.poll(() => playerState(page)).toBe(2);
      expect(await muted(page)).toBe(true);
    });

    test('người nghe (không có quyền điều khiển) vẫn tự tắt tiếng được', async ({ page, mock }) => {
      await mock({ role: 'listener', songs: SONGS });
      await joinRoom(page);

      await page.getByRole('button', { name: 'Tắt tiếng' }).click();
      await expect.poll(() => muted(page)).toBe(true);
    });

    test('phím M bật/tắt tiếng, nhưng không bắt khi đang gõ vào ô nhập', async ({ page, mock }) => {
      await mock({ songs: SONGS });
      await joinRoom(page);

      await page.keyboard.press('m');
      await expect.poll(() => muted(page)).toBe(true);
      await page.keyboard.press('M');
      await expect.poll(() => muted(page)).toBe(false);

      const input = page.getByRole('textbox', { name: 'Link YouTube' });
      await input.focus();
      await input.pressSequentially('mmm');
      await expect(input).toHaveValue('mmm');
      expect(await muted(page), 'gõ chữ m trong ô nhập không được đổi tiếng').toBe(false);
    });

    test('tải lại trang thì trở về mặc định (có tiếng), vì chỉ là tắt tạm', async ({ page, mock }) => {
      await mock({ songs: SONGS });
      await joinRoom(page);
      await page.getByRole('button', { name: 'Tắt tiếng' }).click();
      await expect.poll(() => muted(page)).toBe(true);

      await page.reload();
      await page.getByRole('button', { name: /tham gia nghe/i }).click();
      await expect.poll(() => playerState(page)).toBe(1);
      expect(await muted(page)).toBe(false);
      await expect(page.getByRole('button', { name: 'Tắt tiếng' })).toHaveAttribute('aria-pressed', 'false');
    });

    test('nút đủ lớn để chạm (>= 44px) và không làm tràn ngang', async ({ page, mock }) => {
      await mock({ songs: SONGS });
      await joinRoom(page);

      const box = (await page.getByRole('button', { name: 'Tắt tiếng' }).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  });

  test.describe('video không cho nhúng', () => {
    const roomNext = (backend: { rpcCalls: { fn: string; body: Record<string, unknown> }[] }, reason: string) =>
      backend.rpcCalls.filter((c) => c.fn === 'room_next' && c.body.p_reason === reason).length;
    const failVideos = (page: Page, ids: string[]) =>
      page.evaluate((list) => list.forEach((id) => (window as unknown as { __yt: { failIds: Set<string> } }).__yt.failIds.add(id)), ids);
    const stale = (page: Page) =>
      page.evaluate(() => (window as unknown as { __yt: { fireStaleError: (c: number) => void } }).__yt.fireStaleError(101));

    test('một bài lỗi chỉ bỏ qua đúng bài đó, các bài sau vẫn phát', async ({ page, mock }) => {
      const backend = await mock({ songs: SONGS });
      await page.goto('/room/K7Q2MX');
      await expect(page.getByRole('button', { name: /tham gia nghe/i })).toBeEnabled(); // player giả đã nạp
      await failVideos(page, ['vid1xxxxxxx']); // bài đầu không nhúng được
      await page.getByRole('button', { name: /tham gia nghe/i }).click();

      await expect(page.locator('.room-now-text strong')).toHaveText('Em của ngày hôm qua');
      await expect(page.getByRole('status')).toContainText('Nơi này có anh'); // nói rõ bài nào bị bỏ qua
      await expect(page.getByRole('list', { name: 'Hàng đợi' }).getByRole('listitem')).toHaveCount(2);
      await expect.poll(() => playerState(page)).toBe(1);
      expect(roomNext(backend, 'unplayable')).toBe(1);
    });

    test('lỗi đến muộn của bài trước KHÔNG được làm bỏ qua bài đang phát bình thường', async ({ page, mock }) => {
      const backend = await mock({ songs: SONGS });
      await joinRoom(page);
      await page.getByRole('button', { name: 'Bài tiếp theo' }).click(); // sang bài hai (đã có 1 lệnh skip)
      await expect(page.locator('.room-now-text strong')).toHaveText('Em của ngày hôm qua');
      await expect.poll(() => playerState(page)).toBe(1);

      // Lỗi cũ: sự kiện lỗi của bài một đến sau khi bài hai đã chạy -> bài hai bị gán lỗi và bỏ qua (dây chuyền).
      await stale(page);
      await page.waitForTimeout(2200);

      await expect(page.locator('.room-now-text strong')).toHaveText('Em của ngày hôm qua');
      await expect(page.getByRole('list', { name: 'Hàng đợi' }).getByRole('listitem')).toHaveCount(2);
      expect(roomNext(backend, 'unplayable'), 'không được có lệnh bỏ qua nào do lỗi muộn').toBe(0);
    });

    test('nhiều lỗi muộn liên tiếp (nhiều máy cùng báo) cũng không xoá dây chuyền hàng đợi', async ({ page, mock }) => {
      const backend = await mock({ songs: SONGS });
      await joinRoom(page);
      for (let i = 0; i < 4; i += 1) {
        await stale(page);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(2200);

      await expect(page.getByRole('list', { name: 'Hàng đợi' }).getByRole('listitem')).toHaveCount(3);
      await expect(page.locator('.room-now-text strong')).toHaveText('Nơi này có anh');
      expect(roomNext(backend, 'unplayable')).toBe(0);
    });

    test('mọi bài đều không nhúng được: lần lượt bỏ qua từng bài rồi về trạng thái chờ', async ({ page, mock }) => {
      const backend = await mock({ songs: SONGS });
      await page.goto('/room/K7Q2MX');
      await expect(page.getByRole('button', { name: /tham gia nghe/i })).toBeEnabled();
      await failVideos(page, ['vid1xxxxxxx', 'vid2xxxxxxx', 'vid3xxxxxxx']);
      await page.getByRole('button', { name: /tham gia nghe/i }).click();

      await expect(page.locator('.room-now-text strong')).toHaveText('Chưa phát bài nào', { timeout: 15_000 });
      await expect(page.getByText('Hàng đợi đang trống')).toBeVisible();
      expect(roomNext(backend, 'unplayable')).toBe(3);
    });
  });
});
