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

  private advance(finished: 'played' | 'skipped') {
    const cur = this.queue.find((q) => q.id === this.state.current_queue_id);
    if (cur) cur.status = finished;
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
        if (this.state.current_queue_id === body.p_expected) this.advance(reason === 'ended' ? 'played' : 'skipped');
        return { data: this.state };
      }
      case 'room_remove': {
        const item = this.queue.find((q) => q.id === body.p_queue);
        if (!item) return { data: null };
        if (!(this.canControl() || item.added_by === this.meId)) return { error: 'Bạn không có quyền xoá bài này.' };
        if (this.state.current_queue_id === item.id) this.advance('skipped');
        this.queue = this.queue.filter((q) => q.id !== item.id);
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

  remoteAddSong(title: string, addedBy = GUEST) {
    this.remote((b) => b.addSong(title, addedBy));
  }

  async install(page: Page) {
    // Session giả trong localStorage (supabase-js đọc ra như đã đăng nhập).
    if (this.signedIn) {
      const session = fakeSession(ME, this.opts.displayName);
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
      ws.onMessage((raw) => {
        const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw)) as [string | null, string | null, string, string, Record<string, any>];
        if (event === 'phx_join') {
          const filters = ((payload.config?.postgres_changes ?? []) as { table: string }[]).map((f, i) => ({ id: i + 1, ...f }));
          this.sockets.push({ ws, topic, filters });
          ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: filters } }]));
          const online: Record<string, unknown> = {};
          this.members.forEach((m) => (online[m.user_id] = { metas: [{ phx_ref: m.user_id }] }));
          ws.send(JSON.stringify([joinRef, null, topic, 'presence_state', online]));
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
      const result = this.rpc(fn, body);
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

    switch (table) {
      case 'rooms': {
        const code = (url.searchParams.get('code') ?? '').replace('eq.', '').toUpperCase();
        const isMember = this.members.some((m) => m.user_id === this.meId);
        return rows(code === this.room.code && isMember ? [this.room] : []);
      }
      case 'room_state':
        return rows([this.state]);
      case 'room_queue':
        return rows(this.queue.filter((q) => q.status === 'queued' || q.status === 'playing').sort((a, b) => a.position - b.position));
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
