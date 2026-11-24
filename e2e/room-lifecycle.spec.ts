import type { Page } from '@playwright/test';
import { expect, test, joinRoom } from './fixtures';

const SONGS = [{ title: 'Nơi này có anh' }, { title: 'Em của ngày hôm qua' }];

const openMenu = (page: Page) => page.getByRole('button', { name: 'Tuỳ chọn phòng' }).click();
const calls = (backend: { rpcCalls: { fn: string }[] }, fn: string) => backend.rpcCalls.filter((c) => c.fn === fn).length;

test.describe('vòng đời phòng', () => {
  test('vào phòng: dọn trạng thái cũ (settle) TRƯỚC rồi mới ping nhịp tim', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await page.goto('/room/K7Q2MX');
    await expect.poll(() => calls(backend, 'room_ping')).toBeGreaterThanOrEqual(1);

    const order = backend.rpcCalls.map((c) => c.fn);
    const settle = order.indexOf('room_settle');
    const ping = order.indexOf('room_ping');
    expect(settle, 'phải gọi room_settle').toBeGreaterThanOrEqual(0);
    expect(settle, 'settle phải đứng trước ping').toBeLessThan(ping);
  });

  test('phòng bỏ hoang: server tạm dừng thì máy vào sau thấy "Tạm dừng", không phát ma', async ({ page, mock }) => {
    await mock({ songs: SONGS, staleRoomPausesAt: 600 });
    await page.goto('/room/K7Q2MX');

    await expect(page.getByText(/Tạm dừng · /)).toBeVisible();
    await page.getByRole('button', { name: /tham gia nghe/i }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __yt: { players: { state: number }[] } }).__yt.players[0]?.state)).not.toBe(1);
    await expect(page.getByRole('button', { name: 'Phát', exact: true })).toBeVisible();
  });

  test('nhịp tim: ping định kỳ mỗi ~45 giây (cả khi tab ở nền)', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await page.clock.install();
    await joinRoom(page);
    await expect.poll(() => calls(backend, 'room_ping')).toBe(1);

    await page.clock.fastForward(46_000);
    await expect.poll(() => calls(backend, 'room_ping')).toBe(2);
    await page.clock.fastForward(46_000);
    await expect.poll(() => calls(backend, 'room_ping')).toBe(3);
  });

  test('rời phòng (người nghe): hỏi xác nhận rồi về trang chủ', async ({ page, mock }) => {
    const backend = await mock({ role: 'listener', songs: SONGS });
    await joinRoom(page);

    await openMenu(page);
    await expect(page.getByRole('menuitem', { name: 'Đóng phòng cho mọi người' })).toHaveCount(0); // chỉ chủ phòng mới có
    await page.getByRole('menuitem', { name: 'Rời phòng' }).click();
    const confirm = page.getByRole('dialog', { name: 'Rời phòng' });
    await expect(confirm).toContainText('Rời phòng này?');
    await confirm.getByRole('button', { name: 'Rời phòng' }).click();

    await expect(page).toHaveURL(/\/$/);
    expect(calls(backend, 'room_leave')).toBe(1);
  });

  test('chủ phòng rời: cảnh báo sẽ chuyển quyền; huỷ xác nhận thì không làm gì', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);

    await openMenu(page);
    await page.getByRole('menuitem', { name: 'Rời phòng' }).click();
    const confirm = page.getByRole('dialog', { name: 'Rời phòng' });
    await expect(confirm).toContainText('chuyển quyền chủ phòng');
    await confirm.getByRole('button', { name: 'Huỷ' }).click();

    await expect(confirm).toHaveCount(0);
    expect(calls(backend, 'room_leave')).toBe(0);
    await expect(page).toHaveURL(/\/room\/K7Q2MX$/);
  });

  test('đóng phòng cho mọi người: chỉ chủ phòng thấy, có xác nhận, rồi về trang chủ', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);

    await openMenu(page);
    await page.getByRole('menuitem', { name: 'Đóng phòng cho mọi người' }).click();
    const confirm = page.getByRole('dialog', { name: 'Đóng phòng' });
    await expect(confirm).toContainText('Không ai vào lại được nữa');
    await confirm.getByRole('button', { name: 'Đóng phòng' }).click();

    await expect(page).toHaveURL(/\/$/);
    expect(calls(backend, 'room_close')).toBe(1);
  });

  test('chủ phòng khác đóng phòng: mọi người đang nghe thấy màn hình "Phòng đã đóng" ngay (Realtime)', async ({ page, mock }) => {
    const backend = await mock({ role: 'listener', songs: SONGS });
    await joinRoom(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __yt: { players: { state: number }[] } }).__yt.players[0]?.state)).toBe(1);

    backend.remoteClose();

    await expect(page.getByRole('heading', { name: 'Phòng đã đóng' })).toBeVisible();
    await expect(page.getByText('không thể vào lại nữa')).toBeVisible();
    await page.getByRole('button', { name: 'Về trang chủ' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('mở lại link của phòng đã đóng: thành viên thấy màn hình "Phòng đã đóng", không phải lỗi mã sai', async ({ page, mock }) => {
    await mock({ closed: true, songs: SONGS });
    await page.goto('/room/K7Q2MX');
    await expect(page).toHaveURL(/\/room\/K7Q2MX$/);
    await expect(page.getByRole('heading', { name: 'Phòng đã đóng' })).toBeVisible();
  });

  test('phòng đóng thì dừng ping nhịp tim', async ({ page, mock }) => {
    const backend = await mock({ closed: true, songs: SONGS });
    await page.clock.install();
    await page.goto('/room/K7Q2MX');
    await expect(page.getByRole('heading', { name: 'Phòng đã đóng' })).toBeVisible();
    await page.clock.fastForward(100_000);
    expect(calls(backend, 'room_ping')).toBe(0);
  });
});

test.describe('phòng gần đây (trang chủ)', () => {
  const ROOMS = [
    { name: 'Karaoke tối thứ 7', code: 'SAT777', status: 'playing' as const, members: 4, minutesAgo: 3 },
    { name: 'Phòng cũ hơn', code: 'OLD222', status: 'idle' as const, members: 1, minutesAgo: 600 },
    { name: 'Đang tạm dừng', code: 'PAU333', status: 'paused' as const, members: 2, minutesAgo: 60 },
  ];

  test('liệt kê các phòng đang mở, phòng hoạt động gần nhất lên đầu, kèm trạng thái và số người', async ({ page, mock }) => {
    await mock({ recentRooms: ROOMS, library: [{ name: 'A', songs: [{ title: 'x' }] }] });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Phòng gần đây' })).toBeVisible();
    const cards = page.locator('.room-card');
    await expect(cards.nth(0)).toContainText('Chill cuối tuần'); // phòng chính: vừa hoạt động
    const names = await cards.locator('strong').allTextContents();
    expect(names.indexOf('Karaoke tối thứ 7')).toBeLessThan(names.indexOf('Đang tạm dừng'));
    expect(names.indexOf('Đang tạm dừng')).toBeLessThan(names.indexOf('Phòng cũ hơn'));

    const sat = page.getByRole('button', { name: 'Vào lại phòng Karaoke tối thứ 7' });
    await expect(sat).toContainText('Đang phát · 4 người');
    await expect(sat.getByLabel('Mã SAT777')).toHaveText('SAT777'); // mã nằm riêng một nhãn, không bị cắt cùng tên
    await expect(page.getByRole('button', { name: 'Vào lại phòng Đang tạm dừng' })).toContainText('Tạm dừng');
    await expect(page.getByRole('button', { name: 'Vào lại phòng Phòng cũ hơn' })).toContainText('Đang chờ bài');
  });

  test('bấm vào một phòng thì vào lại đúng phòng đó', async ({ page, mock }) => {
    await mock({ recentRooms: ROOMS });
    await page.goto('/');
    await page.getByRole('button', { name: 'Vào lại phòng Karaoke tối thứ 7' }).click();
    await expect(page).toHaveURL(/\/room\/SAT777$/);
  });

  test('phòng đã đóng không còn trong danh sách', async ({ page, mock }) => {
    await mock({ closed: true });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Nghe nhạc cùng nhau, mỗi người một link YouTube' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Phòng gần đây' })).toHaveCount(0);
  });

  test('không tràn ngang với nhiều phòng và tên dài', async ({ page, mock }) => {
    await mock({ recentRooms: [{ name: 'Một cái tên phòng rất rất rất dài để thử việc bị cắt gọn không vỡ bố cục', code: 'LONG11', members: 12 }, ...ROOMS] });
    await page.goto('/');
    await expect(page.locator('.room-card').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
