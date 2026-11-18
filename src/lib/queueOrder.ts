import { positionBetween } from './syncMath.ts';

export type QueueMove = 'next' | 'up' | 'down';

type Positioned = { id: string; position: number };

// Vị trí mới để đưa bài `id` tới chỉ số `targetIndex` của hàng đợi (tính cả bài đang phát ở đầu), hoặc null nếu
// không có gì để đổi. Chỉ số được kẹp lại: không lên trên bài đang phát, không quá cuối hàng.
export function positionAtIndex(items: Positioned[], id: string, currentId: string | null, targetIndex: number): number | null {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const from = sorted.findIndex((item) => item.id === id);
  if (from < 0 || id === currentId) return null;

  const rest = sorted.filter((item) => item.id !== id);
  const floor = rest.findIndex((item) => item.id === currentId) + 1; // chỗ thấp nhất được chèn vào
  const target = Math.min(rest.length, Math.max(floor, targetIndex));
  if (target === from) return null;

  return positionBetween(rest[target - 1]?.position ?? null, rest[target]?.position ?? null);
}

// Đổi chỗ theo lệnh trong menu/bàn phím:
//  - next: ngay sau bài đang phát (tức bài kế tiếp)
//  - up / down: nhích một bậc
export function movePosition(items: Positioned[], id: string, currentId: string | null, move: QueueMove): number | null {
  const from = [...items].sort((a, b) => a.position - b.position).findIndex((item) => item.id === id);
  if (from < 0) return null;
  const target = move === 'next' ? 0 : move === 'up' ? from - 1 : from + 1; // 'next' kẹp về ngay sau bài đang phát
  return positionAtIndex(items, id, currentId, target);
}
