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
});
