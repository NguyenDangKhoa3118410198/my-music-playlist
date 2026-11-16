import { supabase } from './supabase';
import type {
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

export function buildRoomUrl(code: string) {
  return `${window.location.origin}/join/${code}`;
}
