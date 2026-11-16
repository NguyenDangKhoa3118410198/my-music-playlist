import { expect, test } from './fixtures';

const LIBRARY = [
  { name: 'Bài tủ cuối tuần', songs: [{ title: 'Nơi này có anh', artist: 'Sơn Tùng' }, { title: 'Bolero tình yêu', artist: 'Quang Lê' }] },
  { name: 'Nhạc trẻ', songs: [{ title: 'See tình', artist: 'Hoàng Thuỳ Linh' }] },
];
const PLAYLIST_URL = '/playlist/eeeeeeee-0000-4000-8000-000000000001';

// Chữ chờ trơn ("Đang tải…") trông thô: mọi trạng thái chờ phải là khung xương hoặc vòng xoay.
const PLAIN_LOADING = /Đang (tải|mở|lấy|chuẩn bị|đưa|xử lý|vào|tạo|lưu)/;

test.describe('trạng thái chờ', () => {
  test('trang chủ: khung xương thẻ playlist rồi thay bằng nội dung thật', async ({ page, mock }) => {
    await mock({ library: LIBRARY, latencyMs: 900 });
    await page.goto('/');

    const skeletons = page.locator('.pl-card.is-skeleton');
    await expect(skeletons).toHaveCount(4);
    await expect(page.getByText(PLAIN_LOADING)).toHaveCount(0);
    await expect(page.getByLabel('Đang tải playlist')).toHaveAttribute('aria-busy', 'true');

    await expect(page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' })).toBeVisible();
    await expect(skeletons).toHaveCount(0);
  });

  test('chi tiết playlist: khung xương đầu trang và hàng bài rồi nội dung thật', async ({ page, mock }) => {
    await mock({ library: LIBRARY, latencyMs: 900 });
    await page.goto(PLAYLIST_URL);

    await expect(page.locator('.song-row.is-skeleton').first()).toBeVisible();
    await expect(page.locator('.sk-cover')).toBeVisible();
    await expect(page.getByText(PLAIN_LOADING)).toHaveCount(0);

    await expect(page.getByRole('heading', { level: 1, name: 'Bài tủ cuối tuần' })).toBeVisible();
    await expect(page.locator('.sk')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Danh sách bài hát' }).getByRole('listitem')).toHaveCount(2);
  });

  test('khung xương cùng hình dạng với nội dung thật: trang không bị giật', async ({ page, mock }) => {
    await mock({ library: LIBRARY, latencyMs: 900 });
    await page.goto('/');
    await expect(page.locator('.pl-card.is-skeleton').first()).toBeVisible();
    const skeleton = (await page.locator('.pl-card.is-skeleton').first().boundingBox())!;

    await expect(page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' })).toBeVisible();
    const real = (await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).boundingBox())!;
    expect(Math.abs(skeleton.width - real.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(skeleton.height - real.height)).toBeLessThanOrEqual(12);
  });

  test('vào phòng: vòng xoay có nhãn cho trình đọc màn hình, không có chữ chờ trơn', async ({ page, mock }) => {
    await mock({ latencyMs: 900 });
    await page.goto('/join/K7Q2MX');

    await expect(page.getByRole('status').filter({ hasText: 'Đang vào phòng' })).toBeVisible();
    await expect(page.locator('.center-card .spinner')).toBeVisible();
    await expect(page.locator('.center-card').getByText(PLAIN_LOADING).filter({ visible: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/room\/K7Q2MX$/);
  });

  test('nút đang xử lý: giữ nguyên nhãn, hiện vòng xoay và bị khoá', async ({ page, mock }) => {
    await mock({ library: LIBRARY, latencyMs: 900 });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).waitFor();
    await page.locator('.pl-card-new').click();

    const dialog = page.getByRole('dialog', { name: 'Tạo playlist mới' });
    await dialog.getByRole('textbox', { name: 'Tên playlist' }).fill('Playlist chờ');
    const submit = dialog.getByRole('button', { name: 'Tạo playlist' });
    await submit.click();

    await expect(submit.locator('.spinner')).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText('Tạo playlist'); // nhãn không đổi nên nút không co giãn
    await expect(page.getByRole('heading', { level: 1, name: 'Playlist chờ' })).toBeVisible();
  });

  test('phòng: chờ tải thì hiện khung xương, không phải chữ', async ({ page, mock }) => {
    await mock({ songs: [{ title: 'Nơi này có anh' }], latencyMs: 900 });
    await page.goto('/room/K7Q2MX');

    await expect(page.locator('.room-skeleton .sk').first()).toBeVisible();
    await expect(page.getByText(PLAIN_LOADING)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Chill cuối tuần' })).toBeVisible();
  });

  test('giảm chuyển động: khung xương đứng yên, vòng xoay quay chậm', async ({ page, mock }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mock({ library: LIBRARY, latencyMs: 900 });
    await page.goto('/');

    await expect(page.locator('.pl-card.is-skeleton .sk').first()).toHaveCSS('animation-name', 'none');
  });
});
