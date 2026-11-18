// Chạy: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { movePosition, positionAtIndex } from './queueOrder.ts';

const items = [
  { id: 'cur', position: 1 },
  { id: 'a', position: 2 },
  { id: 'b', position: 3 },
  { id: 'c', position: 4 },
];

const order = (moved: string, position: number | null) =>
  position === null
    ? items.map((i) => i.id)
    : items
        .map((i) => (i.id === moved ? { ...i, position } : i))
        .sort((x, y) => x.position - y.position)
        .map((i) => i.id);

test('phát tiếp theo: bài cuối nhảy lên ngay sau bài đang phát', () => {
  assert.deepEqual(order('c', movePosition(items, 'c', 'cur', 'next')), ['cur', 'c', 'a', 'b']);
});

test('phát tiếp theo: bài đã là kế tiếp thì không đổi gì', () => {
  assert.equal(movePosition(items, 'a', 'cur', 'next'), null);
});

test('đưa lên / xuống một bậc', () => {
  assert.deepEqual(order('b', movePosition(items, 'b', 'cur', 'up')), ['cur', 'b', 'a', 'c']);
  assert.deepEqual(order('a', movePosition(items, 'a', 'cur', 'down')), ['cur', 'b', 'a', 'c']);
});

test('không đưa lên trên bài đang phát, không đưa xuống dưới bài cuối', () => {
  assert.equal(movePosition(items, 'a', 'cur', 'up'), null);
  assert.equal(movePosition(items, 'c', 'cur', 'down'), null);
});

test('không đổi chỗ bài đang phát hoặc bài không có trong hàng đợi', () => {
  assert.equal(movePosition(items, 'cur', 'cur', 'down'), null);
  assert.equal(movePosition(items, 'zzz', 'cur', 'next'), null);
});

test('chưa có bài đang phát: bài được đưa lên đầu hàng đợi', () => {
  const idle = items.slice(1);
  const position = movePosition(idle, 'c', null, 'next');
  assert.ok(position !== null && position < 2);
});

test('đổi nhiều lần liên tiếp vẫn giữ thứ tự đúng (vị trí lẻ)', () => {
  let list = items.map((i) => ({ ...i }));
  for (const id of ['c', 'b', 'c', 'b']) {
    const position = movePosition(list, id, 'cur', 'next');
    if (position !== null) list = list.map((i) => (i.id === id ? { ...i, position } : i));
  }
  const ids = [...list].sort((x, y) => x.position - y.position).map((i) => i.id);
  assert.deepEqual(ids, ['cur', 'b', 'c', 'a']);
});

test('kéo thả: đưa bài tới đúng chỉ số, kể cả kéo xuống', () => {
  assert.deepEqual(order('c', positionAtIndex(items, 'c', 'cur', 1)), ['cur', 'c', 'a', 'b']);
  assert.deepEqual(order('a', positionAtIndex(items, 'a', 'cur', 3)), ['cur', 'b', 'c', 'a']);
  assert.deepEqual(order('b', positionAtIndex(items, 'b', 'cur', 2)), ['cur', 'a', 'b', 'c']);
});

test('kéo thả: thả ở chỗ cũ thì không đổi, kéo lên trên bài đang phát bị kẹp lại', () => {
  assert.equal(positionAtIndex(items, 'b', 'cur', 2), null);
  assert.deepEqual(order('c', positionAtIndex(items, 'c', 'cur', 0)), ['cur', 'c', 'a', 'b']);
  assert.deepEqual(order('a', positionAtIndex(items, 'a', 'cur', 99)), ['cur', 'b', 'c', 'a']);
});
