// Cảm xúc thả trong phòng: gửi qua Realtime Broadcast (không lưu vào database, không tốn dung lượng).
export const REACTIONS = [
  { emoji: '👏', label: 'Vỗ tay' },
  { emoji: '❤️', label: 'Yêu thích' },
  { emoji: '🔥', label: 'Cháy quá' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '🎤', label: 'Hát hay' },
] as const;

// Chỉ nhận đúng các emoji trong danh sách: tin broadcast do máy khác gửi nên không được tin nội dung bất kỳ.
export const isReaction = (value: unknown): value is string => REACTIONS.some((reaction) => reaction.emoji === value);

// Giãn cách tối thiểu giữa hai lần gửi của một máy: giữ số tin Realtime trong hạn mức gói Free.
export const REACTION_THROTTLE_MS = 300;
export const REACTION_LIFETIME_MS = 2600;
export const MAX_FLOATING_REACTIONS = 30;

export type FloatingReaction = { id: number; emoji: string; left: number };
