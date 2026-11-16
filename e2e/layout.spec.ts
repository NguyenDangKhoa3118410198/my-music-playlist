import { expect, test } from './fixtures';

const LONG = 'FULL VERSION | Vợ Hóa Điên Hủy Diệt Thế Giới Suốt 10 Năm, Hệ Thống Hết Cách Đành Hồi Sinh Tôi';
const SONGS = [{ title: LONG }, { title: 'Nơi này có anh' }, { title: 'Em của ngày hôm qua' }, { title: 'Bài thứ tư' }, { title: 'Bài thứ năm' }];

const luminance = (rgb: string) => {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

test.describe('bố cục và giao diện', () => {
  test('trang phòng và trang vào phòng không bị tràn ngang', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    for (const path of ['/room/K7Q2MX', '/join/K7Q2MX']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('máy tính: video và danh sách nằm cạnh nhau', async ({ page, mock }, info) => {
    test.skip(info.project.name !== 'desktop');
    await mock({ songs: SONGS });
    await page.goto('/room/K7Q2MX');

    const video = (await page.locator('.room-video').boundingBox())!;
    const side = (await page.locator('.room-side').boundingBox())!;
    expect(video.x + video.width).toBeLessThanOrEqual(side.x);
    expect(Math.abs(video.y - side.y)).toBeLessThan(10);
  });

  test('điện thoại: video dính ở trên khi cuộn, thanh thêm link dính ở đáy', async ({ page, mock }, info) => {
    test.skip(info.project.name !== 'mobile');
    await mock({ songs: SONGS });
    await page.goto('/room/K7Q2MX');
    await page.getByRole('button', { name: /tham gia nghe/i }).click();

    const viewport = page.viewportSize()!;
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(200);

    const video = (await page.locator('.room-video').boundingBox())!;
    expect(video.y).toBeGreaterThanOrEqual(-1);
    expect(video.y).toBeLessThan(60); // vẫn thấy video dù đã cuộn

    const add = (await page.locator('.room-add').boundingBox())!;
    expect(add.y + add.height).toBeGreaterThan(viewport.height - 4);
    expect(add.y + add.height).toBeLessThanOrEqual(viewport.height + 1);
  });

  test('nút chạm đủ lớn (>= 44px) và có tên cho trình đọc màn hình', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await page.goto('/room/K7Q2MX');
    await page.getByRole('button', { name: /tham gia nghe/i }).click();

    for (const name of ['Tạm dừng', 'Bài tiếp theo', 'Về trang chủ', 'Thêm vào hàng đợi']) {
      const box = (await page.getByRole('button', { name, exact: true }).first().boundingBox())!;
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
  });

  test('tiêu đề bài dài bị cắt gọn, không đẩy vỡ bố cục', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await page.goto('/room/K7Q2MX');

    const rows = page.locator('.room-item');
    for (let i = 0; i < (await rows.count()); i += 1) {
      const row = (await rows.nth(i).boundingBox())!;
      const panel = (await page.locator('.room-panel').boundingBox())!;
      expect(row.x + row.width).toBeLessThanOrEqual(panel.x + panel.width + 1);
      expect(row.height).toBeLessThan(90);
    }
  });

  test('ảnh bìa bài đang phát được dùng làm nền và ảnh nhỏ', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await page.goto('/room/K7Q2MX');

    await expect(page.locator('.room-thumb').first()).toHaveAttribute('src', /img\.youtube\.com\/vi\/vid1xxxxxxx\//);
    await expect(page.locator('.room-ambient')).toHaveCSS('background-image', /img\.youtube\.com/);
  });

  test('quy tắc theme tối: popup của select đọc được (nền tối, chữ sáng)', async ({ page, mock }) => {
    await mock({});
    await page.goto('/');
    await page.locator('.topbar').getByRole('button', { name: 'Phòng nghe chung' }).click();

    const colors = await page.getByRole('combobox', { name: 'Ai được điều khiển' }).evaluate((select) => {
      const option = select.querySelector('option')!;
      const style = getComputedStyle(option);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(luminance(colors.background)).toBeLessThan(0.3);
    expect(luminance(colors.color)).toBeGreaterThan(0.7);
  });

  test('giảm chuyển động: tắt hiệu ứng khi người dùng yêu cầu', async ({ page, mock }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mock({ songs: SONGS });
    await page.goto('/room/K7Q2MX');
    await page.getByRole('button', { name: /tham gia nghe/i }).click();

    await expect(page.locator('.eq i').first()).toHaveCSS('animation-name', 'none');
  });
});
