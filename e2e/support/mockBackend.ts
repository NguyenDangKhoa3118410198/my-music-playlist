import type { Page, Request, Route, WebSocketRoute } from '@playwright/test';
import { YOUTUBE_STUB } from './youtubeStub';

// Backend giả cho test: mô phỏng đủ các bảng và hàm SQL của phòng (xem supabase/rooms.sql)
// để kiểm tra giao diện và đồng bộ mà không cần đăng nhập vào Supabase thật.

export const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
export const GUEST = 'bbbbbbbb-0000-4000-8000-000000000002';
export const STORAGE_KEY = 'sb-mock-auth-token';
const ORIGIN = 'https://mock.supabase.co';

type Role = 'host' | 'dj' | 'listener';

type QueueItem = {
  id: string;
  room_id: string;
  video_id: string;
  youtube_url: string;
  title: string;
  thumbnail: string | null;
  added_by: string;
  position: number;
  status: 'queued' | 'playing' | 'played' | 'skipped';
  created_at: string;
  finished_at?: string | null;
  end_reason?: string | null;
};

type Member = { room_id: string; user_id: string; role: Role; joined_at: string };

export type LibrarySong = { title: string; artist?: string; tags?: string[]; favorite?: boolean; youtube?: boolean };
export type LibraryPlaylist = {
  name: string;
  description?: string;
  role?: 'owner' | 'editor' | 'viewer';
  songs: LibrarySong[];
};

export type MockOptions = {
  /** Playlist và bài hát của người dùng (trang chủ). */
  library?: LibraryPlaylist[];
  /** Vai trò của người đang đăng nhập trong phòng. */
  role?: Role;
  signedIn?: boolean;
  code?: string;
  roomName?: string;
  controlMode?: 'host_only' | 'everyone';
  displayName?: string;
  /** Bài có sẵn trong hàng đợi; bài đầu tiên sẽ là bài đang phát. */
  songs?: { title: string; addedBy?: string }[];
  startPaused?: boolean;
  /** false: người dùng chưa là thành viên phòng (phải qua join_room). */
  member?: boolean;
  /** Độ trễ (ms) của mọi yêu cầu REST/RPC, để kiểm tra trạng thái chờ. */
  latencyMs?: number;
  /** false: đóng kết nối Realtime ngay (để thử cơ chế tải lại định kỳ). */
  realtime?: boolean;
  /** Lịch sử có sẵn (mới nhất trước). */
  history?: { title: string; reason?: 'ended' | 'skip' | 'unplayable'; addedBy?: string; minutesAgo?: number }[];
  /** Server "tự tạm dừng" phòng bỏ hoang khi client gọi room_settle: đặt vị trí này và chuyển sang paused. */
  staleRoomPausesAt?: number;
  /** Các RPC trả lỗi (để test hoàn lại sau cập nhật lạc quan). */
  failRpc?: string[];
  /** Phòng đã đóng từ đầu. */
  closed?: boolean;
  /** Người dùng là khách ẩn danh (không có playlist). */
  anonymous?: boolean;
  /** Các phòng KHÁC mà người dùng là thành viên (cho mục "Phòng gần đây" ở trang chủ). */
  recentRooms?: { name: string; code: string; status?: 'playing' | 'paused' | 'idle'; members?: number; minutesAgo?: number }[];
};

const ROOM_ID = 'cccccccc-0000-4000-8000-0000000000aa';

let counter = 0;
const uid = () => `dddddddd-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

function fakeJwt(userId: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: userId, role: 'authenticated', aud: 'authenticated', exp })}.sig`;
}

export function fakeSession(userId: string, name: string, anonymous = false) {
  return {
    access_token: fakeJwt(userId),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'mock-refresh',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: anonymous ? '' : 'host@example.com',
      is_anonymous: anonymous,
      app_metadata: {},
      user_metadata: { display_name: name },
      created_at: new Date().toISOString(),
    },
  };
}

/** Giải mã khung nhị phân "userBroadcastPush" của realtime-js (xem lib/serializer.js của thư viện). */
function decodeBroadcastPush(buf: Buffer): [string | null, string | null, string, string, Record<string, any>] | null {
  if (buf[0] !== 3) return null;
  let offset = 7;
  const take = (length: number) => {
    const text = buf.subarray(offset, offset + length).toString('utf8');
    offset += length;
    return text;
  };
  const joinRef = take(buf[1]);
  const ref = take(buf[2]);
  const topic = take(buf[3]);
  const event = take(buf[4]);
  take(buf[5]); // metadata
  const payload = JSON.parse(buf.subarray(offset).toString('utf8'));
  return [joinRef || null, ref || null, topic, 'broadcast', { type: 'broadcast', event, payload }];
}

export class MockBackend {
  opts: Required<Omit<MockOptions, 'songs' | 'library'>> & {
    songs: NonNullable<MockOptions['songs']>;
    library: LibraryPlaylist[];
  };
  playlists: Record<string, unknown>[] = [];
  librarySongs: Record<string, unknown>[] = [];
  /** Mọi yêu cầu ghi (POST/PATCH/DELETE) vào bảng REST, để test kiểm tra. */
  writes: { method: string; table: string; query: string; body: unknown }[] = [];
  room: Record<string, unknown>;
  state: Record<string, unknown>;
  queue: QueueItem[] = [];
  members: Member[] = [];
  names = new Map<string, string>([
    [ME, 'Khoa'],
    [GUEST, 'Lan'],
  ]);
  rpcCalls: { fn: string; body: Record<string, unknown> }[] = [];
  // Tin Realtime Broadcast mà trình duyệt đã gửi (ví dụ emoji), để test kiểm tra.
  broadcasts: { event: string; payload: unknown }[] = [];
  // Mọi yêu cầu đọc bảng (GET/HEAD), để test đếm số lần tải lại.
  restLog: { method: string; table: string; query: string }[] = [];
  private sockets: { ws: WebSocketRoute; topic: string; filters: { id: number; table: string }[] }[] = [];
  private meId = ME;
  private signedIn: boolean;

  constructor(opts: MockOptions = {}) {
    this.opts = {
      role: 'host',
      signedIn: true,
      code: 'K7Q2MX',
      roomName: 'Chill cuối tuần',
      controlMode: 'host_only',
      displayName: 'Khoa',
      songs: [],
      library: [],
      startPaused: false,
      member: true,
      latencyMs: 0,
      realtime: true,
      history: [],
      staleRoomPausesAt: -1,
      closed: false,
      anonymous: false,
      recentRooms: [],
      failRpc: [],
      ...opts,
    };
    this.signedIn = this.opts.signedIn;
    this.names.set(ME, this.opts.displayName);

    const now = new Date().toISOString();
    this.room = {
      id: ROOM_ID,
      code: this.opts.code,
      name: this.opts.roomName,
      owner_id: this.opts.role === 'host' ? ME : GUEST,
      control_mode: this.opts.controlMode,
      max_queue_per_user: 5,
      created_at: now,
      closed_at: null,
    };
    const other: Member = {
      room_id: ROOM_ID,
      user_id: GUEST,
      role: this.opts.role === 'host' ? 'listener' : 'host',
      joined_at: now,
    };
    const me: Member = { room_id: ROOM_ID, user_id: ME, role: this.opts.role, joined_at: now };
    this.members = this.opts.member ? [other, me] : [other];

    this.state = {
      room_id: ROOM_ID,
      current_queue_id: null,
      status: 'idle',
      anchor_pos: 0,
      anchor_at: now,
      version: 0,
      updated_by: null,
      updated_at: now,
    };
    this.opts.songs.forEach((song) => this.addSong(song.title, song.addedBy ?? ME));
    this.seedLibrary();
    this.seedHistory();
    if (this.opts.closed) this.room.closed_at = new Date().toISOString();
  }

  private seedHistory() {
    this.opts.history.forEach((entry, index) => {
      const videoId = `hist${index}`.padEnd(11, 'h');
      const finished = new Date(Date.now() - (entry.minutesAgo ?? index + 1) * 60_000).toISOString();
      const reason = entry.reason ?? 'ended';
      this.queue.push({
        id: `99999999-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        room_id: ROOM_ID,
        video_id: videoId,
        youtube_url: `https://youtu.be/${videoId}`,
        title: entry.title,
        thumbnail: null,
        added_by: entry.addedBy ?? ME,
        position: -100 + index,
        status: reason === 'ended' ? 'played' : 'skipped',
        created_at: finished,
        finished_at: finished,
        end_reason: reason,
      });
    });
  }

  private seedLibrary() {
    let tick = 0;
    this.opts.library.forEach((entry, pIndex) => {
      const id = `eeeeeeee-0000-4000-8000-${String(pIndex + 1).padStart(12, '0')}`;
      this.playlists.push({
        id,
        owner_id: ME,
        name: entry.name,
        description: entry.description ?? null,
        created_at: new Date(2026, 0, 1 + pIndex).toISOString(),
        updated_at: new Date(2026, 0, 1 + pIndex).toISOString(),
        role: entry.role ?? 'owner',
      });
      entry.songs.forEach((song, sIndex) => {
        const videoId = `v${pIndex}${sIndex}`.padEnd(11, 'q');
        this.librarySongs.push({
          id: `ffffffff-0000-4000-8000-${String(pIndex * 100 + sIndex + 1).padStart(12, '0')}`,
          playlist_id: id,
          title: song.title,
          artist: song.artist ?? null,
          youtube_url: song.youtube === false ? null : `https://youtu.be/${videoId}`,
          key: null,
          tags: song.tags ?? [],
          note: null,
          favorite: song.favorite ?? false,
          created_by: ME,
          created_at: new Date(2026, 1, 1, 0, 0, tick++).toISOString(),
          updated_at: new Date(2026, 1, 1, 0, 0, tick).toISOString(),
        });
      });
    });
  }

  get ready() {
    return Boolean(this.signedIn);
  }

  private addSong(title: string, addedBy: string) {
    const id = uid();
    const videoId = `vid${this.queue.length + 1}`.padEnd(11, 'x');
    this.queue.push({
      id,
      room_id: ROOM_ID,
      video_id: videoId,
      youtube_url: `https://youtu.be/${videoId}`,
      title,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      added_by: addedBy,
      position: this.queue.length + 1,
      status: 'queued',
      created_at: new Date().toISOString(),
    });
    if (this.state.status === 'idle') this.start(id);
  }

  private start(queueId: string) {
    this.queue.forEach((q) => {
      if (q.id === queueId) q.status = 'playing';
    });
    Object.assign(this.state, {
      current_queue_id: queueId,
      status: this.opts.startPaused ? 'paused' : 'playing',
      anchor_pos: 0,
      anchor_at: new Date().toISOString(),
      version: (this.state.version as number) + 1,
    });
  }

  private advance(finished: 'played' | 'skipped', reason = 'ended') {
    const cur = this.queue.find((q) => q.id === this.state.current_queue_id);
    if (cur) Object.assign(cur, { status: finished, finished_at: new Date().toISOString(), end_reason: reason });
    const next = this.queue.filter((q) => q.status === 'queued').sort((a, b) => a.position - b.position)[0];
    if (next) this.start(next.id);
    else
      Object.assign(this.state, {
        current_queue_id: null,
        status: 'idle',
        anchor_pos: 0,
        anchor_at: new Date().toISOString(),
        version: (this.state.version as number) + 1,
      });
  }

  private myRole(): Role | undefined {
    return this.members.find((m) => m.user_id === this.meId)?.role;
  }

  private canControl() {
    const role = this.myRole();
    return role === 'host' || role === 'dj' || (role !== undefined && this.room.control_mode === 'everyone');
  }

  /** Mô phỏng các hàm RPC trong supabase/rooms.sql. */
  private rpc(fn: string, body: Record<string, unknown>): { data: unknown } | { error: string } {
    const denied = { error: 'Bạn không có quyền điều khiển phòng này.' };
    const touch = () => Object.assign(this.state, { version: (this.state.version as number) + 1 });

    switch (fn) {
      case 'server_time':
        return { data: new Date().toISOString() };
      case 'join_room': {
        if (String(body.p_code).toUpperCase() !== this.room.code) return { error: 'Không tìm thấy phòng hoặc phòng đã đóng.' };
        if (!this.members.some((m) => m.user_id === this.meId)) {
          this.members.push({ room_id: ROOM_ID, user_id: this.meId, role: 'listener', joined_at: new Date().toISOString() });
        }
        return { data: ROOM_ID };
      }
      case 'create_room': {
        this.room.name = body.p_name;
        this.room.control_mode = body.p_control_mode;
        this.room.owner_id = this.meId;
        this.members = [{ room_id: ROOM_ID, user_id: this.meId, role: 'host', joined_at: new Date().toISOString() }];
        return { data: this.room };
      }
      case 'room_add': {
        if (!this.myRole()) return { error: 'Bạn không ở trong phòng này.' };
        const mine = this.queue.filter((q) => q.added_by === this.meId && q.status === 'queued').length;
        if (mine >= (this.room.max_queue_per_user as number)) return { error: `Bạn đã có ${mine} bài đang chờ (giới hạn ${this.room.max_queue_per_user}).` };
        this.addSong(String(body.p_title), this.meId);
        const item = this.queue[this.queue.length - 1];
        item.video_id = String(body.p_video_id);
        item.youtube_url = String(body.p_url);
        item.thumbnail = (body.p_thumbnail as string | null) ?? null;
        return { data: item };
      }
      case 'room_play': {
        if (!this.canControl()) return denied;
        if (this.state.current_queue_id) {
          Object.assign(this.state, { status: 'playing', anchor_pos: body.p_pos ?? this.state.anchor_pos, anchor_at: new Date().toISOString() });
          touch();
        }
        return { data: this.state };
      }
      case 'room_pause': {
        if (!this.canControl()) return denied;
        if (this.state.current_queue_id) {
          Object.assign(this.state, { status: 'paused', anchor_pos: body.p_pos, anchor_at: new Date().toISOString() });
          touch();
        }
        return { data: this.state };
      }
      case 'room_seek': {
        if (!this.canControl()) return denied;
        if (this.state.current_queue_id) {
          Object.assign(this.state, { anchor_pos: body.p_pos, anchor_at: new Date().toISOString() });
          touch();
        }
        return { data: this.state };
      }
      case 'room_next': {
        const reason = String(body.p_reason);
        if (reason === 'skip' && !this.canControl()) return denied;
        if (this.state.current_queue_id === body.p_expected) this.advance(reason === 'ended' ? 'played' : 'skipped', reason);
        return { data: this.state };
      }
      case 'room_remove': {
        const item = this.queue.find((q) => q.id === body.p_queue);
        if (!item) return { data: null };
        if (!(this.canControl() || item.added_by === this.meId)) return { error: 'Bạn không có quyền xoá bài này.' };
        if (this.state.current_queue_id === item.id) this.advance('skipped', 'removed');
        this.queue = this.queue.filter((q) => q.id !== item.id);
        return { data: null };
      }
      case 'room_reorder': {
        if (!this.canControl()) return denied;
        const item = this.queue.find((q) => q.id === body.p_queue && q.status === 'queued');
        if (item) item.position = body.p_position as number;
        return { data: null };
      }
      case 'room_settle': {
        // Mô phỏng server: phòng bỏ hoang thì tạm dừng tại vị trí đã lưu.
        if (this.opts.staleRoomPausesAt >= 0 && this.state.status === 'playing') {
          Object.assign(this.state, { status: 'paused', anchor_pos: this.opts.staleRoomPausesAt, anchor_at: new Date().toISOString() });
          touch();
        }
        return { data: this.state };
      }
      case 'room_ping':
        return { data: null };
      case 'room_add_many': {
        if (!this.myRole()) return { error: 'Bạn không ở trong phòng này.' };
        if (this.room.closed_at) return { error: 'Phòng đã đóng.' };
        const items = body.p_items as { video_id?: string; title?: string }[];
        if (!Array.isArray(items)) return { error: 'Danh sách bài không hợp lệ.' };
        if (items.length > 100) return { error: 'Mỗi lần chỉ thêm tối đa 100 bài.' };
        const unlimited = this.myRole() === 'host' || this.myRole() === 'dj';
        const limit = this.room.max_queue_per_user as number;
        let pending = this.queue.filter((q) => q.added_by === this.meId && q.status === 'queued').length;
        const result = { added: 0, skipped_limit: 0, skipped_duplicate: 0, skipped_invalid: 0 };
        for (const entry of items) {
          const vid = entry.video_id ?? '';
          if (!/^[A-Za-z0-9_-]{6,20}$/.test(vid) || !(entry.title ?? '').trim()) { result.skipped_invalid += 1; continue; }
          if (this.queue.some((q) => q.video_id === vid && (q.status === 'queued' || q.status === 'playing'))) { result.skipped_duplicate += 1; continue; }
          if (!unlimited && pending >= limit) { result.skipped_limit += 1; continue; }
          this.addSong(String(entry.title), this.meId);
          const item = this.queue[this.queue.length - 1];
          item.video_id = vid;
          item.youtube_url = `https://youtu.be/${vid}`;
          item.thumbnail = null;
          result.added += 1;
          pending += 1;
        }
        return { data: result };
      }
      case 'room_leave': {
        const mine = this.myRole();
        if (!mine) return { data: null };
        const others = this.members.filter((m) => m.user_id !== this.meId);
        if (mine === 'host') {
          if (!others.length) this.room.closed_at = new Date().toISOString();
          else others.sort((a) => (a.role === 'dj' ? -1 : 1))[0].role = 'host';
        }
        this.members = others;
        return { data: null };
      }
      case 'room_close': {
        if (this.myRole() !== 'host') return { error: 'Chỉ host mới đóng được phòng.' };
        this.room.closed_at = new Date().toISOString();
        Object.assign(this.state, { status: 'idle', current_queue_id: null });
        touch();
        return { data: null };
      }
      case 'room_set_role': {
        if (this.myRole() !== 'host') return { error: 'Chỉ host mới đổi được vai trò.' };
        const member = this.members.find((m) => m.user_id === body.p_user);
        if (member) member.role = body.p_role as Role;
        return { data: null };
      }
      default:
        return { error: `RPC chưa được mô phỏng: ${fn}` };
    }
  }

  private broadcast() {
    const send = (table: string, record: unknown) => {
      for (const sub of this.sockets) {
        const filter = sub.filters.find((f) => f.table === table);
        if (!filter) continue;
        sub.ws.send(
          JSON.stringify([
            null,
            null,
            sub.topic,
            'postgres_changes',
            {
              ids: [filter.id],
              data: { schema: 'public', table, commit_timestamp: new Date().toISOString(), type: 'UPDATE', columns: [], record, old_record: {}, errors: null },
            },
          ]),
        );
      }
    };
    send('room_state', this.state);
    send('room_queue', {});
    send('room_members', {});
    send('rooms', this.room);
  }

  /** Giả lập một người khác điều khiển phòng (đẩy qua Realtime tới trình duyệt). */
  remote(change: (b: MockBackend) => void) {
    change(this);
    this.broadcast();
  }

  remotePause(position: number) {
    this.remote((b) => {
      Object.assign(b.state, { status: 'paused', anchor_pos: position, anchor_at: new Date().toISOString(), version: (b.state.version as number) + 1 });
    });
  }

  /** Chủ phòng (người khác) đóng phòng: đẩy sự kiện Realtime tới trình duyệt. */
  remoteClose() {
    this.remote((b) => {
      b.room.closed_at = new Date().toISOString();
      Object.assign(b.state, { status: 'idle', current_queue_id: null, version: (b.state.version as number) + 1 });
    });
  }

  /** Một người khác thả emoji: đẩy tin broadcast tới trình duyệt. */
  remoteReaction(emoji: string) {
    for (const sub of this.sockets) {
      sub.ws.send(JSON.stringify([null, null, sub.topic, 'broadcast', { type: 'broadcast', event: 'reaction', payload: { emoji } }]));
    }
  }

  remoteAddSong(title: string, addedBy = GUEST) {
    this.remote((b) => b.addSong(title, addedBy));
  }

  async install(page: Page) {
    // Session giả trong localStorage (supabase-js đọc ra như đã đăng nhập).
    if (this.signedIn) {
      const session = fakeSession(ME, this.opts.displayName, this.opts.anonymous);
      await page.addInitScript(
        ([key, value]) => {
          if (!localStorage.getItem(key)) localStorage.setItem(key, value);
        },
        [STORAGE_KEY, JSON.stringify(session)],
      );
    }

    await page.route('https://www.youtube.com/iframe_api', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: YOUTUBE_STUB }),
    );
    await page.route('https://www.youtube.com/oembed**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ title: 'Bài hát thử nghiệm', author_name: 'Ca sĩ thử' }),
      }),
    );
    await page.route('https://img.youtube.com/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><rect width="480" height="360" fill="url(#g)"/></svg>',
      }),
    );

    await page.route(`${ORIGIN}/**`, (route) => this.handle(route));

    await page.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
      if (!this.opts.realtime) {
        void ws.close();
        return;
      }
      ws.onMessage((raw) => {
        // realtime-js gửi tin broadcast của người dùng dạng nhị phân; các tin còn lại là JSON.
        const frame =
          typeof raw === 'string'
            ? (JSON.parse(raw) as [string | null, string | null, string, string, Record<string, any>])
            : decodeBroadcastPush(raw);
        if (!frame) return;
        const [joinRef, ref, topic, event, payload] = frame;
        if (event === 'phx_join') {
          const filters = ((payload.config?.postgres_changes ?? []) as { table: string }[]).map((f, i) => ({ id: i + 1, ...f }));
          this.sockets.push({ ws, topic, filters });
          ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: filters } }]));
          const online: Record<string, unknown> = {};
          this.members.forEach((m) => (online[m.user_id] = { metas: [{ phx_ref: m.user_id }] }));
          ws.send(JSON.stringify([joinRef, null, topic, 'presence_state', online]));
        } else if (event === 'broadcast') {
          // Mô phỏng broadcast.self = true: server đẩy lại đúng tin đó cho người gửi.
          const message = payload as { event: string; payload: unknown };
          this.broadcasts.push({ event: message.event, payload: message.payload });
          ws.send(JSON.stringify([null, null, topic, 'broadcast', payload]));
          if (ref) ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
        } else if (event === 'heartbeat') {
          ws.send(JSON.stringify([null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }]));
        } else if (ref) {
          ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
        }
      });
    });
  }

  private cors(req: Request) {
    return {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': '*',
      'access-control-allow-headers': req.headers()['access-control-request-headers'] ?? '*',
      'access-control-expose-headers': '*',
    };
  }

  private async handle(route: Route) {
    const req = route.request();
    const cors = this.cors(req);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

    const url = new URL(req.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const rows = (list: unknown[]) => (wantsObject ? (list[0] ? json(list[0]) : json({ message: 'no rows' }, 406)) : json(list));
    const path = url.pathname;

    // --- Auth ---
    if (path === '/auth/v1/signup') {
      const data = req.postDataJSON() as { data?: { display_name?: string } };
      const name = data?.data?.display_name || 'Khách';
      this.meId = ME;
      this.names.set(ME, name);
      this.signedIn = true;
      return json(fakeSession(ME, name, true));
    }
    if (path === '/auth/v1/user') {
      return this.signedIn ? json(fakeSession(this.meId, this.names.get(this.meId) ?? '').user) : json({ message: 'no session' }, 401);
    }
    if (path.startsWith('/auth/v1/token')) return json(fakeSession(this.meId, this.names.get(this.meId) ?? ''));
    if (path.startsWith('/auth/v1/')) return json({});

    if (this.opts.latencyMs && path.startsWith('/rest/v1/')) {
      await new Promise((resolve) => setTimeout(resolve, this.opts.latencyMs));
    }

    // --- RPC ---
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop()!;
      const body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
      this.rpcCalls.push({ fn, body });
      const result = this.opts.failRpc.includes(fn) ? { error: 'Lỗi máy chủ (giả lập).' } : this.rpc(fn, body);
      if ('error' in result) return json({ code: 'P0001', message: result.error, details: null, hint: null }, 400);
      if (fn !== 'server_time') this.broadcast();
      return json(result.data);
    }

    // --- Bảng ---
    const table = path.replace('/rest/v1/', '');
    const method = req.method();
    const idFilter = (url.searchParams.get('id') ?? '').replace('eq.', '');

    if (method !== 'GET' && method !== 'HEAD') {
      const body = req.postDataJSON() as Record<string, unknown> | Record<string, unknown>[] | null;
      this.writes.push({ method, table, query: url.search, body });
      const now = new Date().toISOString();
      const withId = (row: Record<string, unknown>) => ({ id: uid(), created_at: now, updated_at: now, ...row });

      if (table === 'playlists' && method === 'POST') {
        const created = { ...withId(body as Record<string, unknown>), role: 'owner' };
        this.playlists.push(created);
        return rows([created]);
      }
      if (table === 'songs' && method === 'POST') {
        const created = (Array.isArray(body) ? body : [body!]).map((row) => withId({ favorite: false, tags: [], ...row }));
        this.librarySongs.unshift(...created);
        return rows(created);
      }
      if (table === 'songs' && method === 'PATCH') {
        const song = this.librarySongs.find((s) => s.id === idFilter);
        if (song) Object.assign(song, body, { updated_at: now });
        return rows(song ? [song] : []);
      }
      if (table === 'songs' && method === 'DELETE') {
        this.librarySongs = this.librarySongs.filter((s) => s.id !== idFilter);
        return route.fulfill({ status: 204, headers: cors });
      }
      if (table === 'playlists' && method === 'DELETE') {
        this.playlists = this.playlists.filter((p) => p.id !== idFilter);
        this.librarySongs = this.librarySongs.filter((s) => s.playlist_id !== idFilter);
        return route.fulfill({ status: 204, headers: cors });
      }
      if (table === 'playlist_invites' && method === 'POST') {
        return rows([{ token: (body as Record<string, unknown>).token }]);
      }
      return rows([]);
    }

    this.restLog.push({ method, table, query: url.search });

    switch (table) {
      case 'rooms': {
        const codeParam = url.searchParams.get('code');
        const isMember = this.members.some((m) => m.user_id === this.meId);
        if (codeParam === null) {
          // Danh sách "Phòng gần đây": phòng chính (nếu còn mở) + các phòng khác trong cấu hình, kèm trạng thái và số thành viên.
          const now = Date.now();
          const list = this.opts.recentRooms.map((r, i) => ({
            id: `rrrrrrrr-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
            code: r.code,
            name: r.name,
            room_state: { status: r.status ?? 'idle', updated_at: new Date(now - (r.minutesAgo ?? 10) * 60_000).toISOString() },
            room_members: [{ count: r.members ?? 1 }],
          }));
          if (isMember && !this.room.closed_at) {
            list.push({
              id: ROOM_ID,
              code: String(this.room.code),
              name: String(this.room.name),
              room_state: { status: this.state.status as 'playing' | 'paused' | 'idle', updated_at: String(this.state.updated_at) },
              room_members: [{ count: this.members.length }],
            });
          }
          return rows(list);
        }
        const code = codeParam.replace('eq.', '').toUpperCase();
        return rows(code === this.room.code && isMember ? [this.room] : []);
      }
      case 'room_state':
        return rows([this.state]);
      case 'room_queue': {
        if ((url.searchParams.get('status') ?? '').includes('played')) {
          // Lịch sử: bài đã phát/bỏ qua, mới nhất trước.
          const history = this.queue
            .filter((q) => q.status === 'played' || q.status === 'skipped')
            .sort((a, b) => String(b.finished_at).localeCompare(String(a.finished_at)));
          // Yêu cầu đếm (HEAD): chỉ trả content-range, không có thân phản hồi.
          if (method === 'HEAD') {
            return route.fulfill({ status: 200, headers: { ...cors, 'content-range': `*/${history.length}` } });
          }
          return rows(history);
        }
        return rows(this.queue.filter((q) => q.status === 'queued' || q.status === 'playing').sort((a, b) => a.position - b.position));
      }
      case 'room_members':
        return rows(this.members);
      case 'profiles':
        return rows([...this.names.entries()].map(([id, display_name]) => ({ id, display_name })));
      case 'playlists':
        return rows(this.playlists.map(({ role: _role, ...playlist }) => playlist));
      case 'playlist_members':
        return rows(this.playlists.map((p) => ({ playlist_id: p.id, role: p.role })));
      case 'songs':
        return rows(this.librarySongs);
      default:
        return json([]);
    }
  }
}
