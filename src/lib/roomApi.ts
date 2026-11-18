import { supabase } from './supabase';
import type {
  AddManyResult,
  RecentRoom,
  Room,
  RoomControlMode,
  RoomMember,
  RoomQueueItem,
  RoomRole,
  RoomState,
} from '../types';

export async function createRoom(name: string, controlMode: RoomControlMode) {
  const { data, error } = await supabase.rpc('create_room', {
    p_name: name,
    p_control_mode: controlMode,
  });
  if (error) throw error;
  return data as Room;
}

export async function joinRoom(code: string) {
  const { data, error } = await supabase.rpc('join_room', { p_code: code });
  if (error) throw error;
  return data as string;
}

// Trả null nếu phòng không tồn tại hoặc chưa là thành viên (RLS ẩn phòng).
export async function getRoomByCode(code: string) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return (data as Room | null) ?? null;
}

export async function getRoomState(roomId: string) {
  const { data, error } = await supabase
    .from('room_state')
    .select('*')
    .eq('room_id', roomId)
    .single();
  if (error) throw error;
  return data as RoomState;
}

export async function getRoomQueue(roomId: string) {
  const { data, error } = await supabase
    .from('room_queue')
    .select('*')
    .eq('room_id', roomId)
    .in('status', ['queued', 'playing'])
    .order('position', { ascending: true });
  if (error) throw error;
  return (data || []) as RoomQueueItem[];
}

// room_members trỏ tới auth.users nên không join được profiles; lấy tên bằng truy vấn thứ hai.
export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from('room_members')
    .select('room_id, user_id, role, joined_at')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });
  if (error) throw error;

  const members = data || [];
  if (!members.length) return [];

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in(
      'id',
      members.map((member) => member.user_id),
    );
  if (profileError) throw profileError;

  const nameById = new Map((profiles || []).map((p) => [p.id as string, (p.display_name as string) || '']));
  return members.map((member) => ({
    ...member,
    role: member.role as RoomRole,
    display_name: nameById.get(member.user_id) || 'Khách',
  }));
}

// Lịch sử: bài đã phát hoặc bị bỏ qua (server giữ tối đa 100 bài mỗi phòng), mới nhất trước.
export async function getRoomHistory(roomId: string, limit = 50) {
  const { data, error } = await supabase
    .from('room_queue')
    .select('*')
    .eq('room_id', roomId)
    .in('status', ['played', 'skipped'])
    .order('finished_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as RoomQueueItem[];
}

// Chỉ đếm số bài đã phát/bỏ qua (yêu cầu HEAD, không có thân phản hồi): để hiện số trên nhãn tab mà không phải tải cả danh sách.
export async function getRoomHistoryCount(roomId: string) {
  const { count, error } = await supabase
    .from('room_queue')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .in('status', ['played', 'skipped']);
  if (error) throw error;
  return count ?? 0;
}

export type BulkVideo = { videoId: string; title: string; thumbnail: string | null };

// Thêm nhiều bài (từ playlist). Server nhận tối đa 100 bài mỗi lần nên tách lô và cộng dồn kết quả.
export async function addManyToQueue(roomId: string, videos: BulkVideo[]): Promise<AddManyResult> {
  const total: AddManyResult = { added: 0, skipped_limit: 0, skipped_duplicate: 0, skipped_invalid: 0 };

  for (let i = 0; i < videos.length; i += 100) {
    const chunk = videos.slice(i, i + 100).map((video) => ({
      video_id: video.videoId,
      title: video.title,
      thumbnail: video.thumbnail,
    }));
    const { data, error } = await supabase.rpc('room_add_many', { p_room: roomId, p_items: chunk });
    if (error) throw error;
    const part = data as AddManyResult;
    total.added += part.added;
    total.skipped_limit += part.skipped_limit;
    total.skipped_duplicate += part.skipped_duplicate;
    total.skipped_invalid += part.skipped_invalid;
  }
  return total;
}

// Câu thông báo sau khi thêm hàng loạt, nói rõ cả phần bị bỏ qua và lý do.
export function describeAddMany(result: AddManyResult) {
  const parts: string[] = [];
  if (result.skipped_duplicate) parts.push(`${result.skipped_duplicate} bài đã có trong hàng đợi`);
  if (result.skipped_limit) parts.push(`${result.skipped_limit} bài vượt giới hạn số bài chờ`);
  if (result.skipped_invalid) parts.push(`${result.skipped_invalid} bài không hợp lệ`);
  const head = result.added ? `Đã thêm ${result.added} bài vào hàng đợi` : 'Không thêm được bài nào';
  return parts.length ? `${head}. Bỏ qua: ${parts.join(', ')}.` : `${head}.`;
}

export async function leaveRoom(roomId: string) {
  const { error } = await supabase.rpc('room_leave', { p_room: roomId });
  if (error) throw error;
}

export async function closeRoom(roomId: string) {
  const { error } = await supabase.rpc('room_close', { p_room: roomId });
  if (error) throw error;
}

// Nhịp tim: cho server biết còn người đang nghe (xem rooms.sql, _room_settle).
export async function pingRoom(roomId: string) {
  const { error } = await supabase.rpc('room_ping', { p_room: roomId });
  if (error) throw error;
}

// Gọi NGAY KHI vào phòng và TRƯỚC lần ping đầu: nếu phòng đang "phát" mà lâu không ai nghe thì server tạm dừng lại.
export async function settleRoom(roomId: string) {
  const { data, error } = await supabase.rpc('room_settle', { p_room: roomId });
  if (error) throw error;
  return data as RoomState;
}

// Các phòng còn mở mà người dùng là thành viên (RLS tự lọc), hoạt động gần nhất trước.
export async function getRecentRooms(limit = 6): Promise<RecentRoom[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, code, name, room_state(status, updated_at), room_members(count)')
    .is('closed_at', null)
    .limit(40);
  if (error) throw error;

  type Row = {
    id: string;
    code: string;
    name: string;
    room_state: { status: RecentRoom['status']; updated_at: string } | { status: RecentRoom['status']; updated_at: string }[] | null;
    room_members: { count: number }[] | null;
  };

  return ((data || []) as unknown as Row[])
    .map((row) => {
      const state = Array.isArray(row.room_state) ? row.room_state[0] : row.room_state;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        status: state?.status ?? 'idle',
        updatedAt: state?.updated_at ?? '',
        memberCount: row.room_members?.[0]?.count ?? 0,
      } satisfies RecentRoom;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export async function addToQueue(
  roomId: string,
  video: { videoId: string; url: string; title: string; thumbnail: string | null },
) {
  const { data, error } = await supabase.rpc('room_add', {
    p_room: roomId,
    p_video_id: video.videoId,
    p_url: video.url,
    p_title: video.title,
    p_thumbnail: video.thumbnail,
  });
  if (error) throw error;
  return data as RoomQueueItem;
}

export async function playRoom(roomId: string, position: number, expectedVersion?: number) {
  const { data, error } = await supabase.rpc('room_play', {
    p_room: roomId,
    p_pos: position,
    p_expected_version: expectedVersion ?? null,
  });
  if (error) throw error;
  return data as RoomState;
}

export async function pauseRoom(roomId: string, position: number, expectedVersion?: number) {
  const { data, error } = await supabase.rpc('room_pause', {
    p_room: roomId,
    p_pos: position,
    p_expected_version: expectedVersion ?? null,
  });
  if (error) throw error;
  return data as RoomState;
}

export async function seekRoom(roomId: string, position: number, expectedVersion?: number) {
  const { data, error } = await supabase.rpc('room_seek', {
    p_room: roomId,
    p_pos: position,
    p_expected_version: expectedVersion ?? null,
  });
  if (error) throw error;
  return data as RoomState;
}

export async function nextInRoom(
  roomId: string,
  expectedQueueId: string,
  reason: 'ended' | 'unplayable' | 'skip',
) {
  const { data, error } = await supabase.rpc('room_next', {
    p_room: roomId,
    p_expected: expectedQueueId,
    p_reason: reason,
  });
  if (error) throw error;
  return data as RoomState;
}

export async function removeFromQueue(roomId: string, queueId: string) {
  const { error } = await supabase.rpc('room_remove', { p_room: roomId, p_queue: queueId });
  if (error) throw error;
}

// position do client tính (xem lib/queueOrder.ts); server chỉ cho chủ phòng/DJ đổi và chỉ với bài đang chờ.
export async function reorderQueue(roomId: string, queueId: string, position: number) {
  const { error } = await supabase.rpc('room_reorder', { p_room: roomId, p_queue: queueId, p_position: position });
  if (error) throw error;
}

export async function setMemberRole(roomId: string, userId: string, role: Exclude<RoomRole, 'host'>) {
  const { error } = await supabase.rpc('room_set_role', {
    p_room: roomId,
    p_user: userId,
    p_role: role,
  });
  if (error) throw error;
}

export function isVersionConflict(error: unknown) {
  return error instanceof Error && error.message.includes('version_conflict');
}

export function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Có lỗi xảy ra.';
}

// Mã phòng do SQL sinh ra: 6 ký tự, bỏ I, O, 0, 1 cho dễ đọc (xem gen_room_code trong rooms.sql).
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase();
}

export function isValidRoomCode(code: string) {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(code));
}

export function buildRoomUrl(code: string) {
  return `${window.location.origin}/join/${code}`;
}
