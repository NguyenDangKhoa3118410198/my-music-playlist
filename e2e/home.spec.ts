import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

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
  { name: 'Nhạc trẻ', songs: [{ title: 'See tình', artist: 'Hoàng Thuỳ Linh' }] },
  { name: 'Playlist của bạn bè', role: 'viewer' as const, songs: [{ title: 'Bài của bạn bè', artist: 'Ai đó' }] },
];

const filterChips = (page: Page) => page.getByRole('group', { name: 'Lọc bài hát' });

const openPlaylist = async (page: Page, name: string) => {
  await page.getByRole('button', { name: new RegExp(name) }).filter({ hasText: /bài hát/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
};

test.describe('trang chủ và playlist', () => {
  test('khám phá: banner phòng, playlist có bìa, hàng bài mới; không còn giao diện kiểu quản trị', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /Nghe nhạc cùng nhau/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tạo phòng nghe chung' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Playlist của bạn' })).toBeVisible();
    await expect(page.locator('.pl-card')).toHaveCount(4); // 3 playlist + thẻ "Tạo playlist"
    await expect(page.getByRole('heading', { name: 'Mới thêm' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bài yêu thích' })).toBeVisible();

    // Lỗi cũ: thẻ thống kê, mục "Dữ liệu"/Export/Xoá playlist phơi ngay ở trang chủ.
    for (const text of ['Dữ liệu', 'Export', 'Xóa playlist', 'Xoá playlist', 'Thiếu link', 'Topics']) {
      await expect(page.getByText(text, { exact: true }), text).toHaveCount(0);
    }
  });

  test('banner mở hộp thoại tạo phòng / vào bằng mã đúng tab', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');

    await page.getByRole('button', { name: 'Vào bằng mã' }).click();
    await expect(page.getByRole('dialog', { name: 'Phòng nghe chung' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Vào bằng mã' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('textbox', { name: 'Mã phòng' }).fill('k7q2mx');
    await page.getByRole('button', { name: 'Vào phòng' }).click();
    await expect(page).toHaveURL(/\/room\/K7Q2MX$/); // /join/... tự chuyển thẳng vào phòng vì đã đăng nhập
  });

  test('mở playlist: đầu trang, nút hành động, chip lọc có số đếm', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();
    const chips = filterChips(page);

    await expect(page).toHaveURL(/\/playlist\/.+/);
    await expect(page.getByRole('heading', { level: 1, name: 'Bài tủ cuối tuần' })).toBeVisible();
    await expect(page.getByText('Hát với hội bạn thân')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Phát tất cả' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Thêm bài' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chia sẻ playlist' })).toBeVisible();

    await expect(chips.getByRole('button', { name: /^Tất cả/ })).toContainText('4');
    await expect(chips.getByRole('button', { name: /^Yêu thích/ })).toContainText('2');
    await expect(chips.getByRole('button', { name: /^Thiếu link/ })).toContainText('1');
  });

  test('chip lọc: yêu thích, thiếu link, thẻ #bolero', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();
    const chips = filterChips(page);
    const rows = page.getByRole('list', { name: 'Danh sách bài hát' }).getByRole('listitem');

    await expect(rows).toHaveCount(4);
    await chips.getByRole('button', { name: /^Yêu thích/ }).click();
    await expect(rows).toHaveCount(2);
    await chips.getByRole('button', { name: /^Thiếu link/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Bài chưa có link');
    await chips.getByRole('button', { name: /#bolero/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Bolero tình yêu');
  });

  test('phát tất cả: thanh phát hiện bài đầu và chuyển bài tiếp', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();
    await page.getByRole('button', { name: 'Phát tất cả' }).click();

    const player = page.locator('.player-bar');
    const first = (await player.locator('.player-track p').textContent())!;
    expect(first).toBeTruthy();
    await player.getByRole('button', { name: 'Bài tiếp theo' }).click();
    await expect(player.locator('.player-track p')).not.toHaveText(first);
  });

  test('trái tim yêu thích gửi cập nhật và đổi trạng thái ngay', async ({ page, mock }) => {
    const backend = await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();

    const heart = page.getByRole('button', { name: 'Yêu thích Em của ngày hôm qua' });
    await expect(heart).toHaveAttribute('aria-pressed', 'false');
    await heart.click();
    await expect(page.getByRole('button', { name: 'Bỏ yêu thích Em của ngày hôm qua' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => backend.writes.filter((w) => w.method === 'PATCH' && w.table === 'songs').length).toBe(1);
    expect(backend.writes.find((w) => w.method === 'PATCH')!.body).toMatchObject({ favorite: true });
  });

  test('thêm bài hát bằng hộp thoại', async ({ page, mock }) => {
    const backend = await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();

    await page.getByRole('button', { name: 'Thêm bài', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Thêm bài hát' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Tên bài hát' }).fill('Bài mới thêm');
    await dialog.getByRole('textbox', { name: 'Ca sĩ' }).fill('Ca sĩ mới');
    await dialog.getByRole('button', { name: 'Lưu' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Danh sách bài hát' }).getByText('Bài mới thêm')).toBeVisible();
    expect(backend.writes.find((w) => w.method === 'POST' && w.table === 'songs')!.body).toMatchObject({ title: 'Bài mới thêm', artist: 'Ca sĩ mới' });
  });

  test('menu ba chấm của bài: sửa và xoá; Esc đóng menu', async ({ page, mock }) => {
    const backend = await mock({ library: LIBRARY });
    page.on('dialog', (d) => void d.accept());
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();

    await page.getByRole('button', { name: 'Thao tác với Bolero tình yêu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Sửa bài hát' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    await page.getByRole('button', { name: 'Thao tác với Bolero tình yêu' }).click();
    await page.getByRole('menuitem', { name: 'Xoá bài hát' }).click();
    await expect(page.getByText('Bolero tình yêu')).toHaveCount(0);
    expect(backend.writes.some((w) => w.method === 'DELETE' && w.table === 'songs')).toBe(true);
  });

  test('chia sẻ: tạo link mời hiện ô sao chép', async ({ page, mock }) => {
    const backend = await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();

    await page.getByRole('button', { name: 'Chia sẻ playlist' }).click();
    const dialog = page.getByRole('dialog', { name: 'Chia sẻ playlist' });
    await dialog.getByRole('button', { name: 'Được sửa' }).click();
    await dialog.getByRole('button', { name: 'Tạo link mời' }).click();

    await expect(dialog.getByRole('textbox', { name: 'Link mời' })).toHaveValue(/invite=/);
    expect(backend.writes.find((w) => w.table === 'playlist_invites')!.body).toMatchObject({ role: 'editor' });
  });

  test('tạo playlist rồi vào thẳng trang playlist đó', async ({ page, mock }) => {
    const backend = await mock({ library: LIBRARY });
    await page.goto('/');

    await page.locator('.pl-card-new').click();
    const dialog = page.getByRole('dialog', { name: 'Tạo playlist mới' });
    await expect(dialog.getByRole('button', { name: 'Tạo playlist' })).toBeDisabled();
    await dialog.getByRole('textbox', { name: 'Tên playlist' }).fill('Playlist mới tinh');
    await dialog.getByRole('button', { name: 'Tạo playlist' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Playlist mới tinh' })).toBeVisible();
    await expect(page.getByText('Playlist này chưa có bài hát')).toBeVisible();
    expect(backend.writes.find((w) => w.table === 'playlists' && w.method === 'POST')!.body).toMatchObject({ name: 'Playlist mới tinh' });
  });

  test('xoá playlist: menu tuỳ chọn, hỏi xác nhận, về thư viện', async ({ page, mock }) => {
    const backend = await mock({ library: LIBRARY });
    page.on('dialog', (d) => void d.accept());
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Nhạc trẻ' }).click();

    await page.getByRole('button', { name: 'Thêm tuỳ chọn' }).click();
    await page.getByRole('menuitem', { name: 'Xoá playlist' }).click();

    await expect(page).toHaveURL(/\/library$/);
    await expect(page.locator('.pl-card', { hasText: 'Nhạc trẻ' })).toHaveCount(0);
    expect(backend.writes.some((w) => w.method === 'DELETE' && w.table === 'playlists')).toBe(true);
  });

  test('playlist chỉ xem: không có nút sửa, thêm, xoá, chia sẻ; tim bị khoá', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Playlist của bạn bè' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Playlist của bạn bè' })).toBeVisible();
    await expect(page.getByText('Chỉ xem')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thêm bài', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Chia sẻ playlist' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Yêu thích Bài của bạn bè/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Thêm tuỳ chọn' }).click();
    await expect(page.getByRole('menuitem', { name: 'Xoá playlist' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Xuất ra file JSON' })).toBeVisible();
  });

  test('tìm kiếm toàn cục: kết quả bài và playlist; không thấy thì báo', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');

    await page.getByRole('searchbox', { name: /Tìm bài hát hoặc playlist/ }).fill('bolero');
    await expect(page.getByRole('heading', { name: 'Bài hát' })).toBeVisible();
    await expect(page.getByText('Bolero tình yêu')).toBeVisible();

    await page.getByRole('searchbox').fill('Nhạc trẻ');
    await expect(page.getByRole('heading', { name: 'Playlist', exact: true })).toBeVisible();

    await page.getByRole('searchbox').fill('zzzzkhongco');
    await expect(page.getByText(/Không thấy kết quả/)).toBeVisible();

    await page.getByRole('button', { name: 'Xoá tìm kiếm' }).click();
    await expect(page.getByRole('heading', { name: 'Playlist của bạn' })).toBeVisible();
  });

  test('thư viện và yêu thích', async ({ page, mock }, info) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    const nav = info.project.name === 'mobile' ? page.locator('.tabbar') : page.locator('.sidebar');

    await nav.getByRole('button', { name: 'Thư viện' }).click();
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.locator('.pl-card')).toHaveCount(4);

    await nav.getByRole('button', { name: 'Yêu thích' }).click();
    await expect(page).toHaveURL(/\/favorites$/);
    const rows = page.getByRole('listitem').filter({ has: page.locator('.song-text') });
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Bài tủ cuối tuần'); // tên playlist ở dòng phụ
  });

  test('điều hướng: máy tính có thanh bên, điện thoại có thanh tab', async ({ page, mock }, info) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    const desktop = info.project.name === 'desktop';

    await expect(page.locator('.sidebar')).toBeVisible({ visible: desktop });
    await expect(page.locator('.tabbar')).toBeVisible({ visible: !desktop });
  });

  test('hộp thoại: Esc đóng và trả tiêu điểm về nút mở', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');

    const trigger = page.locator('.topbar').getByRole('button', { name: 'Phòng nghe chung' });
    await trigger.focus();
    await trigger.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('không tràn ngang ở mọi màn hình chính', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();
    const detailUrl = new URL(page.url()).pathname;

    for (const path of ['/', '/library', '/favorites', detailUrl]) {
      await page.goto(path);
      await expect(page.locator('.main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('thanh phát không đè lên thanh tab (điện thoại)', async ({ page, mock }, info) => {
    test.skip(info.project.name !== 'mobile');
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.song-tile').first().click();

    const player = (await page.locator('.player-bar').boundingBox())!;
    const tabbar = (await page.locator('.tabbar').boundingBox())!;
    expect(player.y + player.height).toBeLessThanOrEqual(tabbar.y + 1);
  });

  test('đồng bộ nút: mọi nút chính cùng một kiểu (viên thuốc / tròn)', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Bài tủ cuối tuần' }).click();
    // Đợi trang playlist vẽ xong (đủ hàng bài) rồi mới đo, nếu không số nút đo được thay đổi theo tốc độ vẽ.
    await expect(page.getByRole('list', { name: 'Danh sách bài hát' }).getByRole('listitem')).toHaveCount(4);

    const radii = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.btn, .icon-btn')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ cls: el.className, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius), h: el.getBoundingClientRect().height })),
    );
    expect(radii.length).toBeGreaterThan(5);
    for (const { cls, radius, h } of radii) {
      expect(radius, cls).toBeGreaterThanOrEqual(h / 2 - 1); // luôn bo tròn hết cỡ
      expect(h, cls).toBeGreaterThanOrEqual(36);
    }
  });

  test('hộp thoại nằm trên cùng: thanh phát và thanh tab không đè lên nút bấm', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.song-tile').first().click(); // bật thanh phát

    await page.locator('.topbar').getByRole('button', { name: 'Phòng nghe chung' }).click();
    const dialog = page.getByRole('dialog', { name: 'Phòng nghe chung' });
    await page.getByRole('textbox', { name: 'Tên phòng' }).fill('Thử che khuất');

    // Lỗi cũ: hộp thoại bị nhốt trong stacking context của thanh trên nên bị thanh phát/tab che.
    for (const target of [dialog.getByRole('button', { name: 'Tạo phòng', exact: true }), dialog.getByRole('button', { name: 'Đóng' })]) {
      await expect(target).toBeVisible();
      const topmostInsideDialog = await target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return Boolean(hit && el.closest('.dialog')?.contains(hit));
      });
      expect(topmostInsideDialog).toBe(true);
    }
  });

  test('thanh phát chỉ hiện khi có bài đang phát', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');

    await expect(page.locator('.player-bar')).toBeHidden(); // lỗi cũ: thanh "Chọn một bài để phát" luôn chiếm chỗ
    await page.locator('.song-tile').first().click();
    await expect(page.locator('.player-bar')).toBeVisible();
    await page.locator('.player-bar').getByRole('button', { name: 'Đóng player' }).click();
    await expect(page.locator('.player-bar')).toBeHidden();
  });

  test('hàng bài mới: các thẻ đều nhau, tên dài bị cắt gọn không tràn sang thẻ bên cạnh', async ({ page, mock }) => {
    await mock({ library: [{ name: 'Dài', songs: [{ title: 'Một cái tên bài hát rất rất rất dài để thử việc bị cắt gọn', artist: 'Ca sĩ có tên cũng khá là dài dòng' }, { title: 'Ngắn' }, { title: 'Vừa vừa thôi' }] }] });
    await page.goto('/');

    const tiles = page.locator('.song-tile');
    await expect(tiles).toHaveCount(3);
    const widths = await tiles.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    expect(new Set(widths).size, `độ rộng các thẻ: ${widths}`).toBe(1);

    const boxes = await tiles.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right })));
    for (let i = 1; i < boxes.length; i += 1) expect(boxes[i].l).toBeGreaterThanOrEqual(boxes[i - 1].r);
  });

  test('thanh phát: nội dung không dính sát mép dưới và nằm gọn trong thanh', async ({ page, mock }) => {
    await mock({ library: LIBRARY });
    await page.goto('/');
    await page.locator('.song-tile').first().click();
    await expect(page.locator('.player-bar')).toBeVisible();

    const gaps = await page.evaluate(() => {
      const bar = document.querySelector('.player-bar')!.getBoundingClientRect();
      const parts = [...document.querySelectorAll<HTMLElement>('.player-bar > *')].filter((el) => el.offsetParent !== null && !el.classList.contains('audio-embed'));
      const items = parts.flatMap((el) => [el, ...el.querySelectorAll<HTMLElement>('button, a, input, p, span')]).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).position !== 'absolute';
      });
      return {
        barBottom: bar.bottom,
        viewport: window.innerHeight,
        minBottomGap: Math.min(...items.map((el) => bar.bottom - el.getBoundingClientRect().bottom)),
        minTopGap: Math.min(...items.map((el) => el.getBoundingClientRect().top - bar.top)),
      };
    });
    expect(gaps.barBottom).toBeLessThanOrEqual(gaps.viewport + 1);
    expect(gaps.minBottomGap, 'khoảng cách tới mép dưới của thanh').toBeGreaterThanOrEqual(8);
    expect(gaps.minTopGap, 'khoảng cách tới mép trên của thanh').toBeGreaterThanOrEqual(6);
  });

  test('bài thêm sau khi đã bấm phát vẫn vào vòng phát (bài tiếp và ngẫu nhiên)', async ({ page, mock }, info) => {
    await mock({ library: [{ name: 'Hai bài', songs: [{ title: 'Bài cũ một' }, { title: 'Bài cũ hai' }] }] });
    await page.goto('/');
    await page.locator('.pl-card', { hasText: 'Hai bài' }).click();
    await page.getByRole('button', { name: 'Phát tất cả' }).click();
    const title = page.locator('.player-bar .player-track p');
    await expect(title).toBeVisible();

    // Thêm bài thứ ba SAU khi đã bắt đầu phát (có link YouTube nên phát được).
    await page.getByRole('button', { name: 'Thêm bài', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Thêm bài hát' });
    // Điền tên trước rồi mới dán link: form chỉ tự lấy tên từ YouTube khi ô tên còn trống, nên kết quả không
    // phụ thuộc việc phản hồi từ YouTube đến sớm hay muộn (nếu đảo thứ tự, tên có thể bị chen/dính vào nhau).
    await dialog.getByRole('textbox', { name: 'Tên bài hát' }).fill('Bài mới thứ ba');
    await dialog.getByRole('textbox', { name: 'Link YouTube' }).fill('https://youtu.be/dQw4w9WgXcQ');
    await dialog.getByRole('button', { name: 'Lưu' }).click();
    await expect(dialog).toHaveCount(0);

    // Khi bật ngẫu nhiên, nút đổi tên thành "Bài ngẫu nhiên tiếp theo".
    const next = page.locator('.player-bar').getByRole('button', { name: /Bài (ngẫu nhiên )?tiếp theo/ });
    const seen = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const before = (await title.textContent())!;
      await next.click();
      await expect(title).not.toHaveText(before); // đợi thanh phát đổi bài rồi mới ghi nhận, tránh đọc nhầm bài cũ
      seen.add((await title.textContent())!);
    }
    expect([...seen].sort(), 'bấm bài tiếp phải đi qua cả 3 bài').toEqual(['Bài cũ hai', 'Bài cũ một', 'Bài mới thứ ba']);

    // Thanh phát gọn trên điện thoại không có nút bật ngẫu nhiên nên phần này chỉ chạy ở máy tính.
    if (info.project.name === 'mobile') return;

    // Ngẫu nhiên: cố định Math.random để kết quả lặp lại được, và vẫn phải chạm tới bài mới.
    await page.evaluate(() => {
      let n = 0;
      Math.random = () => ((n++ % 7) + 0.5) / 7;
    });
    await page.locator('.player-bar').getByRole('button', { name: 'Phát ngẫu nhiên' }).click();
    const shuffled = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const before = (await title.textContent())!;
      await next.click();
      await expect(title).not.toHaveText(before); // ngẫu nhiên luôn chọn bài khác bài hiện tại
      shuffled.add((await title.textContent())!);
    }
    expect(shuffled.has('Bài mới thứ ba'), `ngẫu nhiên đã phát: ${[...shuffled]}`).toBe(true);
    expect(shuffled.size).toBe(3);
  });
});
