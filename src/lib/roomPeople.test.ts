// Chạy: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addedByLabel, membersById } from './roomPeople.ts';

const members = [
  { user_id: 'me', display_name: 'Tôi' },
  { user_id: 'an', display_name: 'An' },
  { user_id: 'blank', display_name: '' },
] as Parameters<typeof membersById>[0];

const nameById = membersById(members);

test('membersById: map user_id sang tên hiển thị', () => {
  assert.equal(nameById.get('an'), 'An');
  assert.equal(nameById.size, 3);
});

test('addedByLabel: bài của mình là "bạn"', () => {
  assert.equal(addedByLabel('me', 'me', nameById), 'bạn');
});

test('addedByLabel: người khác thì hiện tên', () => {
  assert.equal(addedByLabel('an', 'me', nameById), 'An');
});

test('addedByLabel: không biết tên hoặc tên rỗng thì là "Khách"', () => {
  assert.equal(addedByLabel('ghost', 'me', nameById), 'Khách');
  assert.equal(addedByLabel('blank', 'me', nameById), 'Khách');
});
