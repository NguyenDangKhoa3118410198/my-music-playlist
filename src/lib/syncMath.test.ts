// Chạy: npm test  (dùng node:test có sẵn, không cần thêm thư viện)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  estimateClockOffset,
  expectedPosition,
  needsSeek,
  parseServerTimestamp,
  positionBetween,
} from './syncMath.ts';

test('đang phát: vị trí tăng theo thời gian server', () => {
  const anchor = { status: 'playing' as const, anchorPos: 10, anchorAtMs: 1_000_000 };
  assert.equal(expectedPosition(anchor, 1_000_000), 10);
  assert.equal(expectedPosition(anchor, 1_005_500), 15.5);
});

test('tạm dừng: vị trí đứng yên dù thời gian trôi', () => {
  const anchor = { status: 'paused' as const, anchorPos: 42, anchorAtMs: 1_000_000 };
  assert.equal(expectedPosition(anchor, 9_999_999), 42);
});

test('người vào muộn tính đúng vị trí', () => {
  const anchor = { status: 'playing' as const, anchorPos: 0, anchorAtMs: 1_000_000 };
  assert.equal(expectedPosition(anchor, 1_000_000 + 95_000), 95);
});

test('giờ server đi lùi nhẹ không cho ra vị trí âm', () => {
  const anchor = { status: 'playing' as const, anchorPos: 0, anchorAtMs: 1_000_500 };
  assert.equal(expectedPosition(anchor, 1_000_000), 0);
});

test('needsSeek: chỉ seek khi lệch quá ngưỡng', () => {
  assert.equal(needsSeek(10, 11.9), false);
  assert.equal(needsSeek(10, 12.1), true);
  assert.equal(needsSeek(12.1, 10), true);
  assert.equal(needsSeek(10, 10.6, 0.5), true);
});

test('estimateClockOffset: chọn mẫu có RTT nhỏ nhất', () => {
  // Máy chậm hơn server 5000ms. Mẫu tốt: RTT 40ms; mẫu xấu: RTT 800ms với giờ bị méo.
  const good = { sentAtMs: 100_000, receivedAtMs: 100_040, serverMs: 105_020 };
  const bad = { sentAtMs: 200_000, receivedAtMs: 200_800, serverMs: 205_000 };
  assert.equal(estimateClockOffset([bad, good]), 5000);
});

test('estimateClockOffset: không có mẫu thì offset 0', () => {
  assert.equal(estimateClockOffset([]), 0);
});

test('estimateClockOffset: bỏ mẫu không hợp lệ', () => {
  const broken = { sentAtMs: 200, receivedAtMs: 100, serverMs: 1 };
  assert.equal(estimateClockOffset([broken]), 0);
});

test('positionBetween', () => {
  assert.equal(positionBetween(1, 3), 2);
  assert.equal(positionBetween(5, null), 6);
  assert.equal(positionBetween(null, 5), 4);
  assert.equal(positionBetween(null, null), 1);
});

test('parseServerTimestamp: mọi định dạng đều ra cùng một thời điểm UTC', () => {
  const expected = Date.UTC(2026, 10, 16, 10, 0, 0, 500);
  assert.equal(parseServerTimestamp('2026-11-16T10:00:00.500Z'), expected);
  assert.equal(parseServerTimestamp('2026-11-16T10:00:00.500+00:00'), expected);
  assert.equal(parseServerTimestamp('2026-11-16 10:00:00.5+00'), expected);
  assert.equal(parseServerTimestamp('2026-11-16T10:00:00.500'), expected); // thiếu múi giờ -> coi là UTC
});

test('parseServerTimestamp: múi giờ khác UTC được quy đổi đúng', () => {
  assert.equal(
    parseServerTimestamp('2026-11-16T17:00:00+07:00'),
    Date.UTC(2026, 10, 16, 10, 0, 0),
  );
});
