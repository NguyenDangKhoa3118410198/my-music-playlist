import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const SONGS = [{ title: 'Đang phát' }, { title: 'Bài B' }, { title: 'Bài C' }, { title: 'Bài D' }];

const joinRoom = async (page: Page) => {
  await page.goto('/room/K7Q2MX');
  await page.getByRole('button', { name: /tham gia nghe/i }).click();
};
const titles = (page: Page) =>
  page.getByRole('list', { name: 'Hàng đợi' }).locator('.room-item-text strong').allTextContents();
const grip = (page: Page, title: string) => page.getByRole('button', { name: `Kéo để đổi chỗ “${title}”` });
const rowOf = (page: Page, title: string) =>
  page.getByRole('list', { name: 'Hàng đợi' }).getByRole('listitem').filter({ hasText: title });

// Nắm tay cầm của một bài, kéo tới giữa dòng của bài khác rồi thả (hoặc dừng lại giữa chừng nếu release = false).
async function dragTo(page: Page, from: string, to: string, release = true) {
  const start = (await grip(page, from).boundingBox())!;
  const end = (await rowOf(page, to).boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, end.y + end.height / 2, { steps: 10 });
  if (release) await page.mouse.up();
}

const sortMenu = (page: Page, title: string) => page.getByRole('button', { name: `Sắp xếp “${title}”` });

test.describe('thứ tự hàng đợi', () => {
  test('chủ phòng: "Phát tiếp theo" đưa bài lên ngay sau bài đang phát', async ({ page, mock }) => {
    const backend = await mock({ songs: SONGS });
    await joinRoom(page);
    await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài B', 'Bài C', 'Bài D']);

    await sortMenu(page, 'Bài D').click();
    await page.getByRole('menuitem', { name: 'Phát tiếp theo' }).click();

    await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài D', 'Bài B', 'Bài C']);
    expect(backend.rpcCalls.filter((c) => c.fn === 'room_reorder')).toHaveLength(1);
  });

  test('đưa lên / xuống một bậc, và chỉ hiện thao tác có tác dụng', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);
    await expect.poll(() => titles(page)).toHaveLength(4);

    await sortMenu(page, 'Bài C').click();
    await page.getByRole('menuitem', { name: 'Đưa lên' }).click();
    await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài C', 'Bài B', 'Bài D']);

    await sortMenu(page, 'Bài B').click();
    await page.getByRole('menuitem', { name: 'Đưa xuống' }).click();
    await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài C', 'Bài D', 'Bài B']);

    // Bài kế tiếp: không có "Phát tiếp theo" / "Đưa lên". Bài cuối: không có "Đưa xuống".
    await sortMenu(page, 'Bài C').click();
    await expect(page.getByRole('menuitem', { name: 'Đưa xuống' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Đưa lên' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Phát tiếp theo' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await sortMenu(page, 'Bài B').click();
    await expect(page.getByRole('menuitem', { name: 'Đưa xuống' })).toHaveCount(0);
  });

  test('bài đã đổi chỗ thì phát đúng theo thứ tự mới', async ({ page, mock }) => {
    await mock({ songs: SONGS });
    await joinRoom(page);
    await sortMenu(page, 'Bài D').click();
    await page.getByRole('menuitem', { name: 'Phát tiếp theo' }).click();
    await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài D', 'Bài B', 'Bài C']);

    await page.getByRole('button', { name: 'Bài tiếp theo' }).click();
    await expect(page.locator('.room-now-text strong')).toHaveText('Bài D');
  });

  test('người nghe không có menu sắp xếp', async ({ page, mock }) => {
    await mock({ role: 'listener', songs: SONGS });
    await joinRoom(page);
    await expect.poll(() => titles(page)).toHaveLength(4);
    await expect(page.getByRole('button', { name: /^Sắp xếp/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Kéo để đổi chỗ/ })).toHaveCount(0);
  });

  test.describe('kéo thả', () => {
    // Cho màn hình cao để mọi dòng đều nằm trong tầm nhìn (trên điện thoại hàng đợi nằm dưới phần video dính trên cùng);
    // việc tự cuộn khi kéo được kiểm riêng ở test cuối.
    test.beforeEach(async ({ page }) => {
      const { width } = page.viewportSize()!;
      await page.setViewportSize({ width, height: 1500 });
    });

    test('kéo bài lên: thả vào chỗ nào thì bài nằm ở đó', async ({ page, mock }) => {
      const backend = await mock({ songs: SONGS });
      await joinRoom(page);
      await expect.poll(() => titles(page)).toHaveLength(4);

      await dragTo(page, 'Bài D', 'Bài B');
      await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài D', 'Bài B', 'Bài C']);
      expect(backend.rpcCalls.filter((c) => c.fn === 'room_reorder')).toHaveLength(1);
    });

    test('kéo bài xuống', async ({ page, mock }) => {
      await mock({ songs: SONGS });
      await joinRoom(page);
      await expect.poll(() => titles(page)).toHaveLength(4);

      await dragTo(page, 'Bài B', 'Bài D');
      await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài C', 'Bài D', 'Bài B']);
    });

    test('đang kéo thì có vạch báo chỗ sẽ thả; thả xong thì hết vạch', async ({ page, mock }) => {
      await mock({ songs: SONGS });
      await joinRoom(page);
      await expect.poll(() => titles(page)).toHaveLength(4);

      await dragTo(page, 'Bài D', 'Bài B', false);
      await expect(page.locator('.room-item.is-dragging')).toHaveCount(1);
      await expect(rowOf(page, 'Bài B')).toHaveClass(/drop-above/);
      await page.mouse.up();
      await expect(page.locator('.room-item.is-dragging, .room-item.drop-above, .room-item.drop-below')).toHaveCount(0);
    });

    test('kéo lên trên bài đang phát thì chỉ lên được tới vị trí kế tiếp', async ({ page, mock }) => {
      await mock({ songs: SONGS });
      await joinRoom(page);
      await expect.poll(() => titles(page)).toHaveLength(4);

      await dragTo(page, 'Bài D', 'Đang phát');
      await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài D', 'Bài B', 'Bài C']);
    });

    test('bấm vào tay cầm mà không kéo thì không đổi gì và không gọi máy chủ', async ({ page, mock }) => {
      const backend = await mock({ songs: SONGS });
      await joinRoom(page);
      await expect.poll(() => titles(page)).toHaveLength(4);

      await grip(page, 'Bài C').click();
      await page.waitForTimeout(300);
      expect(await titles(page)).toEqual(['Đang phát', 'Bài B', 'Bài C', 'Bài D']);
      expect(backend.rpcCalls.filter((c) => c.fn === 'room_reorder')).toHaveLength(0);
    });

    test('bàn phím: mũi tên lên/xuống ở tay cầm', async ({ page, mock }) => {
      await mock({ songs: SONGS });
      await joinRoom(page);
      await expect.poll(() => titles(page)).toHaveLength(4);

      await grip(page, 'Bài C').focus();
      await page.keyboard.press('ArrowUp');
      await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài C', 'Bài B', 'Bài D']);
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => titles(page)).toEqual(['Đang phát', 'Bài B', 'Bài C', 'Bài D']);
    });

    test('bài đang phát không có tay cầm; người nghe không có tay cầm nào', async ({ page, mock }) => {
      await mock({ songs: SONGS });
      await joinRoom(page);
      await expect.poll(() => titles(page)).toHaveLength(4);
      await expect(grip(page, 'Đang phát')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Kéo để đổi chỗ/ })).toHaveCount(3);
    });
  });

  test('kéo sát mép thì tự cuộn, tới được bài ở xa', async ({ page, mock }) => {
    const songs = Array.from({ length: 14 }, (_, i) => ({ title: `Bài ${String(i).padStart(2, '0')}` }));
    const backend = await mock({ songs });
    await joinRoom(page);
    await expect.poll(() => titles(page)).toHaveLength(14);

    // Nắm bài cuối (phải cuộn xuống mới thấy), rồi kéo sát mép trên vùng nhìn thấy và giữ yên ở đó.
    await grip(page, 'Bài 13').scrollIntoViewIfNeeded();
    const start = (await grip(page, 'Bài 13').boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    const topEdge = await page.evaluate(() => {
      const stage = document.querySelector('.room-stage');
      const sticky = stage && getComputedStyle(stage).position === 'sticky';
      const panel = document.querySelector('.room-panel')!.getBoundingClientRect();
      return Math.max(panel.top, sticky ? stage!.getBoundingClientRect().bottom : 0);
    });
    await page.mouse.move(start.x + start.width / 2, topEdge + 12, { steps: 8 });

    // Tự cuộn lên cho tới khi bài "Bài 02" lọt vào vùng nhìn thấy, rồi thả vào đó.
    await expect
      .poll(async () => (await rowOf(page, 'Bài 02').boundingBox())?.y ?? -9999, { timeout: 15_000 })
      .toBeGreaterThan(topEdge + 60);
    const target = (await rowOf(page, 'Bài 02').boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, target.y + target.height / 2, { steps: 6 });
    await page.mouse.up();

    await expect.poll(async () => (await titles(page)).slice(0, 4)).toEqual(['Bài 00', 'Bài 01', 'Bài 13', 'Bài 02']);
    expect(backend.rpcCalls.filter((c) => c.fn === 'room_reorder')).toHaveLength(1);
  });
});
