import { positionBetween } from './syncMath.ts';

export type QueueMove = 'next' | 'up' | 'down';

type Positioned = { id: string; position: number };

// Vị trí mới để đổi chỗ một bài trong hàng đợi, hoặc null nếu không có gì để đổi.
//  - next: ngay sau bài đang phát (tức bài kế tiếp)
//  - up / down: nhích một bậc, nhưng không vượt lên trên bài đang phát
export function movePosition(items: Positioned[], id: string, currentId: string | null, move: QueueMove): number | null {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const from = sorted.findIndex((item) => item.id === id);
  if (from < 0 || id === currentId) return null;

  const rest = sorted.filter((item) => item.id !== id);
  const floor = rest.findIndex((item) => item.id === currentId) + 1; // chỗ thấp nhất được chèn vào
  const target = move === 'next' ? floor : move === 'up' ? Math.max(floor, from - 1) : Math.min(rest.length, from + 1);
  if (target === from) return null;

  return positionBetween(rest[target - 1]?.position ?? null, rest[target]?.position ?? null);
}
