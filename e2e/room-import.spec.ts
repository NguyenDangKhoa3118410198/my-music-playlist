import type { Page } from '@playwright/test';
import { expect, test, joinRoom } from './fixtures';

const LIB = [
  {
    name: 'Bài tủ cuối tuần',
    songs: [
      { title: 'Nơi này có anh', artist: 'Sơn Tùng' },
      { title: 'Em của ngày hôm qua', artist: 'Sơn Tùng' },
      { title: 'Bolero tình yêu' },
      { title: 'Bài chưa có link', youtube: false },
    ],
  },
  { name: 'Playlist trống link', songs: [{ title: 'Không link 1', youtube: false }, { title: 'Không link 2', youtube: false }] },
  { name: 'Nhạc trẻ', songs: Array.from({ length: 8 }, (_, i) => ({ title: `Nhạc trẻ ${i + 1}` })) },
];

const openImport = async (page: Page) => {
  await page.getByRole('button', { name: /Thêm từ playlist của bạn/ }).click();
  return page.getByRole('dialog', { name: 'Thêm từ playlist' });
};
const sentIds = (backend: { rpcCalls: { fn: string; body: Record<string, unknown> }[] }) =>
  (backend.rpcCalls.find((c) => c.fn === 'room_add_many')!.body.p_items as { video_id: string }[]).map((i) => i.video_id);

test.describe('thêm playlist vào phòng', () => {
  test('liệt kê playlist với số bài phát được; playlist không có link bị khoá', async ({ page, mock }) => {
    await mock({ library: LIB });
    await joinRoom(page);
    const dialog = await openImport(page);

    const group = dialog.getByRole('radiogroup', { name: 'Playlist của bạn' });
    await expect(group.getByRole('radio', { name: /Bài tủ cuối tuần/ })).toContainText('3 bài có thể phát'); // bỏ bài chưa có link
    await expect(group.getByRole('radio', { name: /Playlist trống link/ })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Chọn một playlist' })).toBeDisabled();
  });

  test('chọn playlist rồi thêm: gửi đúng các bài theo thứ tự, báo kết quả, hiện trong hàng đợi', async ({ page, mock }) => {
    const backend = await mock({ library: LIB });
    await joinRoom(page);
    const dialog = await openImport(page);

    await dialog.getByRole('radio', { name: /Bài tủ cuối tuần/ }).click();
    await dialog.getByRole('button', { name: 'Thêm 3 bài vào hàng đợi' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Đã thêm 3 bài vào hàng đợi.');
    const items = backend.rpcCalls.find((c) => c.fn === 'room_add_many')!.body.p_items as { video_id: string; title: string }[];
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe('Nơi này có anh - Sơn Tùng'); // ghép tên ca sĩ vào tên bài
    expect(items.map((i) => i.title)).not.toContain('Bài chưa có link');

    const queue = page.getByRole('list', { name: 'Hàng đợi' });
    await expect(queue.getByRole('listitem')).toHaveCount(3);
    await expect(page.locator('.room-now-text strong')).toHaveText('Nơi này có anh - Sơn Tùng'); // hàng đợi trống nên bài đầu tự phát
  });

  test('xáo trộn thứ tự khi bật tuỳ chọn', async ({ page, mock }) => {
    const backend = await mock({ library: LIB });
    await joinRoom(page);
    await page.evaluate(() => {
      Math.random = () => 0; // Fisher–Yates với j luôn = 0 cho kết quả cố định
    });
    const dialog = await openImport(page);

    await dialog.getByRole('radio', { name: /Nhạc trẻ/ }).click();
    await dialog.getByRole('checkbox', { name: /Xáo trộn/ }).check();
    await dialog.getByRole('button', { name: /Thêm 8 bài/ }).click();
    await expect(dialog).toHaveCount(0);

    const ids = sentIds(backend);
    expect(ids).toHaveLength(8);
    // Không xáo: v20.. v27 theo thứ tự; xáo cố định: phần tử đầu không còn là v20...
    expect(ids[0]).not.toBe('v20qqqqqqqq');
    expect(new Set(ids).size).toBe(8); // xáo không làm mất hay nhân đôi bài
  });

  test('bài đã có trong hàng đợi được bỏ qua và báo rõ', async ({ page, mock }) => {
    await mock({ library: LIB });
    await joinRoom(page);
    for (let i = 0; i < 2; i += 1) {
      const dialog = await openImport(page);
      await dialog.getByRole('radio', { name: /Bài tủ cuối tuần/ }).click();
      await dialog.getByRole('button', { name: /Thêm 3 bài/ }).click();
      await expect(dialog).toHaveCount(0);
    }
    await expect(page.getByRole('status')).toContainText('Không thêm được bài nào');
    await expect(page.getByRole('status')).toContainText('3 bài đã có trong hàng đợi');
  });

  test('người nghe bị giới hạn 5 bài chờ: thêm phần được, báo phần vượt, và có ghi chú trước khi thêm', async ({ page, mock }) => {
    await mock({ library: LIB, role: 'listener' });
    await joinRoom(page);
    const dialog = await openImport(page);

    await expect(dialog.getByText('Người nghe chỉ có tối đa 5 bài chờ cùng lúc')).toBeVisible();
    await dialog.getByRole('radio', { name: /Nhạc trẻ/ }).click();
    await dialog.getByRole('button', { name: /Thêm 8 bài/ }).click();

    await expect(page.getByRole('status')).toContainText('Đã thêm 5 bài');
    await expect(page.getByRole('status')).toContainText('3 bài vượt giới hạn');
    await expect(page.getByRole('list', { name: 'Hàng đợi' }).getByRole('listitem')).toHaveCount(5);
  });

  test('chủ phòng không bị giới hạn: thêm cả 8 bài', async ({ page, mock }) => {
    await mock({ library: LIB });
    await joinRoom(page);
    const dialog = await openImport(page);

    await expect(dialog.getByText('không bị giới hạn số bài chờ')).toBeVisible();
    await dialog.getByRole('radio', { name: /Nhạc trẻ/ }).click();
    await dialog.getByRole('button', { name: /Thêm 8 bài/ }).click();
    await expect(page.getByRole('list', { name: 'Hàng đợi' }).getByRole('listitem')).toHaveCount(8);
  });

  test('chưa có playlist: báo trống thay vì để hộp thoại rỗng', async ({ page, mock }) => {
    await mock({});
    await joinRoom(page);
    const dialog = await openImport(page);
    await expect(dialog.getByText('Bạn chưa có playlist nào')).toBeVisible();
  });

  test('khách ẩn danh (không có playlist) không thấy nút thêm từ playlist', async ({ page, mock }) => {
    await mock({ anonymous: true, role: 'listener', songs: [{ title: 'Nơi này có anh' }] });
    await joinRoom(page);
    await expect(page.getByRole('textbox', { name: 'Link YouTube' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Thêm từ playlist của bạn/ })).toHaveCount(0);
  });

  test('nút "Thêm từ playlist" không bị thanh dán link che (điện thoại: thanh này cố định ở đáy)', async ({ page, mock }) => {
    await mock({ library: LIB });
    await joinRoom(page);

    const button = page.getByRole('button', { name: /Thêm từ playlist của bạn/ });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    const topmost = await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return Boolean(hit && el.contains(hit));
    });
    expect(topmost, 'đang bị phần tử khác đè lên').toBe(true);
    expect(box.height).toBeGreaterThanOrEqual(36);
    await button.click();
    await expect(page.getByRole('dialog', { name: 'Thêm từ playlist' })).toBeVisible();
  });

  test('Esc đóng hộp thoại và không gửi gì lên phòng', async ({ page, mock }) => {
    const backend = await mock({ library: LIB });
    await joinRoom(page);
    const dialog = await openImport(page);
    await dialog.getByRole('radio', { name: /Nhạc trẻ/ }).click();
    await page.keyboard.press('Escape');

    await expect(dialog).toHaveCount(0);
    expect(backend.rpcCalls.some((c) => c.fn === 'room_add_many')).toBe(false);
  });
});

test.describe('nghe cùng bạn bè (từ trang playlist)', () => {
  test('tạo phòng đặt tên theo playlist, nạp sẵn mọi bài có link (không theo bộ lọc), rồi vào phòng', async ({ page, mock }) => {
    const backend = await mock({ library: LIB });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();
    // Bật một bộ lọc để chắc chắn phòng nhận cả playlist chứ không chỉ phần đang xem
    await page.getByRole('group', { name: 'Lọc bài hát' }).getByRole('button', { name: /^Thiếu link/ }).click();

    await page.getByRole('button', { name: 'Nghe cùng bạn bè' }).click();

    await expect(page).toHaveURL(/\/room\/K7Q2MX$/);
    const created = backend.rpcCalls.find((c) => c.fn === 'create_room')!;
    expect(created.body).toMatchObject({ p_name: 'Bài tủ cuối tuần', p_control_mode: 'host_only' });
    expect((backend.rpcCalls.find((c) => c.fn === 'room_add_many')!.body.p_items as unknown[]).length).toBe(3);
    await expect(page.getByRole('heading', { name: 'Bài tủ cuối tuần', level: 1 })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Hàng đợi' }).getByRole('listitem')).toHaveCount(3);
  });

  test('playlist không có bài nào có link thì nút bị khoá', async ({ page, mock }) => {
    await mock({ library: LIB });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Playlist trống link' }).click();
    await expect(page.getByRole('button', { name: 'Nghe cùng bạn bè' })).toBeDisabled();
  });
});
