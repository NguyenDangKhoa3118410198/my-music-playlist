import { expect, test } from './fixtures';

test.describe('vào phòng', () => {
  test('khách nhập tên (đăng nhập ẩn danh) rồi vào phòng', async ({ page, mock }) => {
    const backend = await mock({ signedIn: false, role: 'listener', member: false, songs: [{ title: 'Nơi này có anh' }] });
    await page.goto('/join/k7q2mx');

    await expect(page.getByRole('heading', { name: 'Nghe nhạc cùng nhau' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vào phòng' })).toBeDisabled(); // chưa nhập tên
    await page.getByRole('textbox', { name: 'Tên hiển thị' }).fill('Lan');
    await page.getByRole('button', { name: 'Vào phòng' }).click();

    await expect(page).toHaveURL(/\/room\/K7Q2MX$/);
    await expect(page.getByRole('heading', { name: 'Chill cuối tuần' })).toBeVisible();
    expect(backend.rpcCalls.some((c) => c.fn === 'join_room')).toBe(true);
  });

  test('mã phòng sai: báo lỗi và có đường về trang chủ', async ({ page, mock }) => {
    await mock({ code: 'ABCDEF' });
    await page.goto('/join/ZZZZZZ');

    await expect(page.getByText('Không tìm thấy phòng hoặc phòng đã đóng.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Về trang chủ' })).toBeVisible();
  });

  test('chưa đăng nhập mà mở thẳng /room/... thì chuyển sang trang vào phòng', async ({ page, mock }) => {
    await mock({ signedIn: false });
    await page.goto('/room/K7Q2MX');
    await expect(page).toHaveURL(/\/join\/K7Q2MX$/);
  });

  test('đã đăng nhập nhưng chưa là thành viên: tự vào phòng qua link', async ({ page, mock }) => {
    await mock({ role: 'listener', member: false });
    await page.goto('/room/K7Q2MX'); // RLS ẩn phòng -> chuyển qua /join -> join_room -> vào

    await expect(page).toHaveURL(/\/room\/K7Q2MX$/);
    await expect(page.getByRole('heading', { name: 'Chill cuối tuần' })).toBeVisible();
  });

  test('tạo phòng từ trang chủ rồi vào thẳng phòng', async ({ page, mock }) => {
    const backend = await mock({});
    await page.goto('/');
    await page.locator('.topbar').getByRole('button', { name: 'Phòng nghe chung' }).click();
    await page.getByRole('textbox', { name: 'Tên phòng' }).fill('Karaoke tối nay');
    await page.getByRole('combobox', { name: 'Ai được điều khiển' }).selectOption('everyone');
    await page.getByRole('button', { name: 'Tạo phòng', exact: true }).last().click();

    await expect(page).toHaveURL(/\/room\/K7Q2MX$/);
    expect(backend.rpcCalls.find((c) => c.fn === 'create_room')!.body).toMatchObject({
      p_name: 'Karaoke tối nay',
      p_control_mode: 'everyone',
    });
  });

  for (const badCode of ['11', 'ABCDE', 'ABCDEFG', 'K7Q2M0', 'K7Q2MI', 'abc-12']) {
    test(`mã sai định dạng "${badCode}": báo ngay, không bắt nhập tên`, async ({ page, mock }) => {
      const backend = await mock({ signedIn: false });
      const signups: string[] = [];
      page.on('request', (req) => req.url().includes('/auth/v1/signup') && signups.push(req.url()));

      await page.goto(`/join/${badCode}`);

      await expect(page.getByRole('heading', { name: 'Mã phòng không hợp lệ' })).toBeVisible();
      await expect(page.getByText('Mã phòng gồm 6 ký tự')).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Tên hiển thị' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Về trang chủ' })).toBeVisible();
      expect(signups, 'không được đăng nhập ẩn danh vô ích').toHaveLength(0);
      expect(backend.rpcCalls.filter((c) => c.fn === 'join_room')).toHaveLength(0);

      await page.getByRole('link', { name: 'Về trang chủ' }).click();
      await expect(page).toHaveURL(/\/$/);
    });
  }

  test('đã đăng nhập mà mở /room/<mã sai> cũng ra trang báo mã không hợp lệ', async ({ page, mock }) => {
    await mock({});
    await page.goto('/room/11');
    await expect(page).toHaveURL(/\/join\/11$/);
    await expect(page.getByRole('heading', { name: 'Mã phòng không hợp lệ' })).toBeVisible();
  });

  test('mã đúng định dạng (chữ thường) vẫn được nhận', async ({ page, mock }) => {
    await mock({ signedIn: false, role: 'listener', member: false });
    await page.goto('/join/k7q2mx');
    await expect(page.getByRole('heading', { name: 'Nghe nhạc cùng nhau' })).toBeVisible();
    await expect(page.getByText('K7Q2MX', { exact: true })).toBeVisible();
  });

  test('hộp thoại "Vào bằng mã": chỉ cho gửi khi mã đủ 6 ký tự hợp lệ', async ({ page, mock }) => {
    await mock({});
    await page.goto('/');
    await page.locator('.topbar').getByRole('button', { name: 'Phòng nghe chung' }).click();
    await page.getByRole('tab', { name: 'Vào bằng mã' }).click();

    const input = page.getByRole('textbox', { name: /Mã phòng/ });
    const submit = page.getByRole('button', { name: 'Vào phòng' });
    await expect(page.getByText('Mã gồm 6 ký tự chữ và số')).toBeVisible();
    await expect(submit).toBeDisabled();
    await input.fill('K7Q2M');
    await expect(submit).toBeDisabled();
    await input.fill('K7Q2M0'); // có số 0, không nằm trong bảng ký tự của mã phòng
    await expect(submit).toBeDisabled();
    await input.fill('k7q2mx');
    await expect(submit).toBeEnabled();
  });
});
