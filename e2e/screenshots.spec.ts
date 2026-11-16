// Chụp ảnh các màn hình chính để xem bằng mắt. Chạy: SHOT_DIR=e2e/.results/before npm run e2e -- e2e/screenshots.spec.ts
import { test } from './fixtures';

const DIR = process.env.SHOT_DIR ?? 'e2e/.results/shots';
const LIBRARY = [
  {
    name: 'Bài tủ cuối tuần',
    description: 'Hát với hội bạn thân',
    songs: [
      { title: 'Nơi này có anh', artist: 'Sơn Tùng M-TP', tags: ['pop'], favorite: true },
      { title: 'Em của ngày hôm qua', artist: 'Sơn Tùng M-TP', tags: ['pop'] },
      { title: 'Bolero tình yêu', artist: 'Quang Lê', tags: ['bolero'], favorite: true },
      { title: 'Bài chưa có link', artist: 'Ẩn danh', youtube: false },
    ],
  },
  { name: 'Nhạc trẻ', songs: [{ title: 'See tình', artist: 'Hoàng Thuỳ Linh' }, { title: 'Chúng ta của hiện tại', artist: 'Sơn Tùng M-TP' }] },
  { name: 'Playlist của bạn bè', role: 'viewer' as const, songs: [{ title: 'Bài của bạn bè', artist: 'Ai đó' }] },
];
const LONG = 'FULL VERSION | Vợ Hóa Điên Hủy Diệt Thế Giới Suốt 10 Năm, Hệ Thống Hết Cách Đành Hồi Sinh Tôi';

test.describe('ảnh màn hình', () => {
  test('phòng đang phát', async ({ page, mock }, info) => {
    await mock({ songs: [{ title: LONG }, { title: 'Nơi này có anh', addedBy: 'bbbbbbbb-0000-4000-8000-000000000002' }, { title: 'Em của ngày hôm qua' }] });
    await page.goto('/room/K7Q2MX');
    await page.getByRole('button', { name: /tham gia nghe/i }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${DIR}/room-playing-${info.project.name}.png`, fullPage: true });
  });

  test('phòng chưa tham gia', async ({ page, mock }, info) => {
    await mock({ songs: [{ title: 'Nơi này có anh' }] });
    await page.goto('/room/K7Q2MX');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/room-gate-${info.project.name}.png`, fullPage: true });
  });

  test('phòng trống', async ({ page, mock }, info) => {
    await mock({});
    await page.goto('/room/K7Q2MX');
    await page.getByRole('button', { name: /tham gia nghe/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/room-empty-${info.project.name}.png`, fullPage: true });
  });

  test('người nghe (không có quyền)', async ({ page, mock }, info) => {
    await mock({ role: 'listener', songs: [{ title: 'Nơi này có anh' }, { title: 'Bài thứ hai' }] });
    await page.goto('/room/K7Q2MX');
    await page.getByRole('button', { name: /tham gia nghe/i }).click();
    await page.getByRole('tab', { name: /mọi người/i }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/room-listener-members-${info.project.name}.png`, fullPage: true });
  });

  test('trang vào phòng (khách)', async ({ page, mock }, info) => {
    await mock({ signedIn: false });
    await page.goto('/join/K7Q2MX');
    await page.screenshot({ path: `${DIR}/join-${info.project.name}.png`, fullPage: true });
  });

  test('hộp thoại tạo phòng', async ({ page, mock }, info) => {
    await mock({});
    await page.goto('/');
    await page.locator('.topbar').getByRole('button', { name: 'Phòng nghe chung' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/launcher-${info.project.name}.png`, fullPage: true });
  });

  test('trang chủ', async ({ page, mock }, info) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${DIR}/home-${info.project.name}.png`, fullPage: true });
  });

  test('chi tiết playlist (đang phát)', async ({ page, mock }, info) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();
    await page.getByRole('button', { name: 'Phát tất cả' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/playlist-${info.project.name}.png`, fullPage: true });
  });

  test('menu và hộp thoại chia sẻ', async ({ page, mock }, info) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();
    await page.getByRole('button', { name: 'Thao tác với Nơi này có anh' }).click();
    await page.screenshot({ path: `${DIR}/song-menu-${info.project.name}.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Chia sẻ playlist' }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${DIR}/share-${info.project.name}.png` });
  });

  test('form thêm bài hát', async ({ page, mock }, info) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();
    await page.getByRole('button', { name: 'Thêm bài', exact: true }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${DIR}/song-form-${info.project.name}.png` });
  });

  test('yêu thích và tìm kiếm', async ({ page, mock }, info) => {
    await mock({ library: LIBRARY });
    await page.goto('/favorites');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${DIR}/favorites-${info.project.name}.png`, fullPage: true });
    await page.getByRole('searchbox').fill('sơn tùng');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${DIR}/search-${info.project.name}.png`, fullPage: true });
  });

  test('đăng nhập', async ({ page, mock }, info) => {
    await mock({ signedIn: false });
    await page.goto('/');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/login-${info.project.name}.png`, fullPage: true });
  });
});
