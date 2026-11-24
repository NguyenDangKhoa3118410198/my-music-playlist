import type { RoomMember } from '../types';

// Map user_id -> tên hiển thị, để tra người thêm bài nhanh.
export function membersById(members: RoomMember[]): Map<string, string> {
  return new Map(members.map((member) => [member.user_id, member.display_name]));
}

// Nhãn người thêm bài: "bạn" nếu là mình, tên nếu biết, còn lại là "Khách".
export function addedByLabel(addedBy: string, userId: string, nameById: Map<string, string>): string {
  return addedBy === userId ? 'bạn' : nameById.get(addedBy) || 'Khách';
}
