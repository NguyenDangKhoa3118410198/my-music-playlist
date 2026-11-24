import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import type { FilterMode, PlaylistWithRole, RecentRoom, Song, SongInput } from '../types';
import { createPlaylist, deletePlaylist, getPlaylists } from '../lib/playlistApi';
import { addManyToQueue, createRoom, describeAddMany, getRecentRooms } from '../lib/roomApi';
import { songsToVideos } from '../lib/playlistToRoom';
import { createSong, deleteSong, getAllSongs, importSongs, toSongInput, updateSong } from '../lib/songApi';
import { supabase } from '../lib/supabase';
import { CreatePlaylistDialog, ShareDialog } from './app/Dialogs';
import { HomeView } from './app/HomeView';
import { FavoritesView, LibraryView, SearchResults } from './app/ListViews';
import { PlaylistDetail } from './app/PlaylistDetail';
import { Sidebar, type AppView } from './app/Sidebar';
import { TabBar } from './app/TabBar';
import { TopBar } from './app/TopBar';
import { useConfirm } from '../hooks/useConfirm';
import { PlaylistDetailSkeleton } from './ui/Skeletons';
import { PlayerBar } from './PlayerBar';
import { SongForm } from './SongForm';

type QueueSource = { playlistId: string } | { ids: string[] };

function matchesQuery(song: Song, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [song.title, song.artist, song.key, song.note, ...song.tags].filter(Boolean).join(' ').toLowerCase().includes(q);
}

// Trong playlist: bài yêu thích lên trước, rồi theo tên.
function sortForPlaylist(songs: Song[]) {
  return [...songs].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title, 'vi'));
}

export function PlaylistView({ inviteRedeemed }: { inviteRedeemed: string | null }) {
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { pathname } = useLocation();

  const playlistMatch = pathname.match(/^\/playlist\/([^/]+)/);
  const activePlaylistId = playlistMatch?.[1] ?? null;
  const view: AppView = playlistMatch
    ? 'playlist'
    : pathname.startsWith('/library')
      ? 'library'
      : pathname.startsWith('/favorites')
        ? 'favorites'
        : 'home';

  const [playlists, setPlaylists] = useState<PlaylistWithRole[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const [startingRoom, setStartingRoom] = useState(false);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  // Nguồn của hàng đợi phát. Phát cả playlist (không lọc) thì theo dõi playlist đó trực tiếp để bài mới
  // thêm / bài bị xoá có hiệu lực ngay; các nguồn khác (đã lọc, hàng bài ở trang chủ...) giữ danh sách id.
  const [queueSource, setQueueSource] = useState<QueueSource>({ ids: [] });
  const [playRequestId, setPlayRequestId] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activePlaylist = playlists.find((playlist) => playlist.id === activePlaylistId) ?? null;
  const playlistSongs = useMemo(
    () => sortForPlaylist(songs.filter((song) => song.playlist_id === activePlaylistId)),
    [songs, activePlaylistId],
  );
  const visibleSongs = useMemo(
    () =>
      playlistSongs.filter((song) => {
        const byFilter =
          filter === 'all' ||
          (filter === 'favorite' && song.favorite) ||
          (filter === 'with-youtube' && Boolean(song.youtube_url)) ||
          (filter === 'missing-youtube' && !song.youtube_url);
        return byFilter && (!tag || song.tags.includes(tag)) && matchesQuery(song, query);
      }),
    [playlistSongs, filter, tag, query],
  );
  const tagTopics = useMemo(() => {
    const counts = new Map<string, number>();
    playlistSongs.forEach((song) => song.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [playlistSongs]);
  const queue = useMemo(() => {
    const byId = new Map(songs.map((song) => [song.id, song]));
    const list =
      'playlistId' in queueSource
        ? sortForPlaylist(songs.filter((song) => song.playlist_id === queueSource.playlistId))
        : queueSource.ids.map((id) => byId.get(id)).filter((song): song is Song => Boolean(song));
    return list.filter((song) => song.youtube_url);
  }, [songs, queueSource]);
  // Không có bộ lọc/từ khoá nào: danh sách đang xem chính là cả playlist.
  const isUnfiltered = filter === 'all' && !tag && !query.trim();
  const searchMatches = useMemo(() => songs.filter((song) => matchesQuery(song, query)), [songs, query]);

  const loadAll = useCallback(async () => {
    try {
      const nextPlaylists = await getPlaylists();
      setPlaylists(nextPlaylists);
      setSongs(await getAllSongs(nextPlaylists.map((playlist) => playlist.id)));
    } catch (error) {
      setMessage(readError(error, 'Không tải được dữ liệu.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!inviteRedeemed) return;
    setMessage('Đã nhận playlist từ link mời.');
    void loadAll().then(() => navigate(`/playlist/${inviteRedeemed}`));
  }, [inviteRedeemed, loadAll, navigate]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(''), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  // Đổi màn hình thì bỏ lọc cũ.
  useEffect(() => {
    setFilter('all');
    setTag(null);
  }, [activePlaylistId]);

  // Trang chủ luôn hiện các phòng còn mở của bạn (tải lại mỗi lần quay về trang chủ).
  useEffect(() => {
    if (view !== 'home') return;
    let cancelled = false;
    void getRecentRooms()
      .then((rooms) => !cancelled && setRecentRooms(rooms))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [view]);

  const go = useCallback((path: string) => {
    setQuery('');
    navigate(path);
  }, [navigate]);

  // --- Phát nhạc ---
  function playSong(song: Song, list: Song[], livePlaylistId?: string) {
    setQueueSource(livePlaylistId ? { playlistId: livePlaylistId } : { ids: (list.length ? list : [song]).map((item) => item.id) });
    setCurrentSong(song);
    setPlayRequestId((current) => current + 1);
  }

  function step(delta: 1 | -1, shuffle = false) {
    if (!queue.length) return;
    const index = currentSong ? queue.findIndex((song) => song.id === currentSong.id) : -1;
    let next: Song;
    if (shuffle && queue.length > 1) {
      const candidates = queue.filter((song) => song.id !== currentSong?.id);
      next = candidates[Math.floor(Math.random() * candidates.length)];
    } else if (delta === 1) {
      next = queue[index >= 0 ? (index + 1) % queue.length : 0];
    } else {
      next = queue[index > 0 ? index - 1 : queue.length - 1];
    }
    setCurrentSong(next);
    setPlayRequestId((current) => current + 1);
  }

  function playAll(shuffle: boolean) {
    const playable = visibleSongs.filter((song) => song.youtube_url);
    if (!playable.length) return;
    const first = shuffle ? playable[Math.floor(Math.random() * playable.length)] : playable[0];
    playSong(first, playable, isUnfiltered ? activePlaylistId ?? undefined : undefined);
  }

  // --- Dữ liệu ---
  async function handleCreatePlaylist(name: string) {
    try {
      const playlist = await createPlaylist(name, null);
      await loadAll();
      setIsCreatorOpen(false);
      go(`/playlist/${playlist.id}`);
    } catch (error) {
      setMessage(readError(error, 'Không tạo được playlist.'));
    }
  }

  // Tạo phòng mới với cả playlist đã nạp sẵn vào hàng đợi, rồi vào phòng.
  async function handleListenTogether() {
    if (!activePlaylist) return;
    const videos = songsToVideos(playlistSongs); // cả playlist, không theo bộ lọc đang xem
    if (!videos.length) {
      setMessage('Playlist chưa có bài nào có link YouTube hợp lệ.');
      return;
    }

    setStartingRoom(true);
    try {
      const room = await createRoom(activePlaylist.name, 'host_only');
      const result = await addManyToQueue(room.id, videos);
      if (result.added < videos.length) setMessage(describeAddMany(result));
      navigate(`/room/${room.code}`);
    } catch (error) {
      setMessage(readError(error, 'Không tạo được phòng.'));
    } finally {
      setStartingRoom(false);
    }
  }

  async function handleDeletePlaylist() {
    if (!activePlaylist) return;
    const ok = await confirm({ title: 'Xoá playlist', message: `Xoá playlist “${activePlaylist.name}”?`, confirmLabel: 'Xoá', danger: true });
    if (!ok) return;
    try {
      await deletePlaylist(activePlaylist.id);
      await loadAll();
      setMessage('Đã xoá playlist.');
      go('/library');
    } catch (error) {
      setMessage(readError(error, 'Không xoá được playlist.'));
    }
  }

  async function handleSaveSong(input: SongInput) {
    if (!activePlaylist) return;
    if (editingSong) {
      const updated = await updateSong(editingSong.id, input);
      setSongs((current) => current.map((song) => (song.id === updated.id ? updated : song)));
    } else {
      const created = await createSong(activePlaylist.id, input);
      setSongs((current) => [created, ...current]);
    }
    setEditingSong(null);
    setIsFormOpen(false);
  }

  async function handleToggleFavorite(song: Song) {
    const favorite = !song.favorite;
    setSongs((current) => current.map((item) => (item.id === song.id ? { ...item, favorite } : item)));
    try {
      await updateSong(song.id, { ...toSongInput(song), favorite });
    } catch (error) {
      setSongs((current) => current.map((item) => (item.id === song.id ? { ...item, favorite: song.favorite } : item)));
      setMessage(readError(error, 'Không cập nhật được bài yêu thích.'));
    }
  }

  async function handleDeleteSong(song: Song) {
    const ok = await confirm({ title: 'Xoá bài hát', message: `Xoá bài “${song.title}”?`, confirmLabel: 'Xoá', danger: true });
    if (!ok) return;
    try {
      await deleteSong(song.id);
      setSongs((current) => current.filter((item) => item.id !== song.id));
    } catch (error) {
      setMessage(readError(error, 'Không xoá được bài hát.'));
    }
  }

  function handleExport() {
    if (!activePlaylist) return;
    const data = {
      playlist: {
        name: activePlaylist.name,
        description: activePlaylist.description,
        exportedAt: new Date().toISOString(),
      },
      songs: playlistSongs.map(({ title, artist, youtube_url, key, tags, note, favorite }) => ({
        title,
        artist,
        youtube_url,
        key,
        tags,
        note,
        favorite,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activePlaylist.name.toLowerCase().replace(/\s+/g, '-') || 'playlist'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activePlaylist) return;

    try {
      const parsed = JSON.parse(await file.text()) as { songs?: SongInput[] } | SongInput[];
      const imported = Array.isArray(parsed) ? parsed : parsed.songs || [];
      await importSongs(activePlaylist.id, imported.map(normalizeImportedSong));
      await loadAll();
      setMessage(`Đã nhập ${imported.length} bài hát.`);
    } catch (error) {
      setMessage(readError(error, 'File nhập không hợp lệ.'));
    }
  }

  const roleOf = (song: Song) => playlists.find((playlist) => playlist.id === song.playlist_id)?.role;
  const songActions = {
    currentSongId: currentSong?.id ?? null,
    canEditSong: (song: Song) => roleOf(song) === 'owner' || roleOf(song) === 'editor',
    playlistName: (song: Song) => playlists.find((playlist) => playlist.id === song.playlist_id)?.name ?? '',
    onPlay: playSong,
    onEdit: (song: Song) => {
      setEditingSong(song);
      setIsFormOpen(true);
    },
    onDelete: (song: Song) => void handleDeleteSong(song),
    onToggleFavorite: (song: Song) => void handleToggleFavorite(song),
  };

  const searching = query.trim().length > 0 && view !== 'playlist';
  const placeholder = view === 'playlist' ? 'Tìm trong playlist' : 'Tìm bài hát, ca sĩ…';

  return (
    <div className={currentSong ? 'app has-player' : 'app'}>
      <Sidebar
        view={view}
        playlists={playlists}
        songs={songs}
        activePlaylistId={activePlaylistId}
        loading={loading}
        onNavigate={go}
        onCreatePlaylist={() => setIsCreatorOpen(true)}
      />

      <main className="main">
        <TopBar query={query} onQueryChange={setQuery} placeholder={placeholder} onSignOut={() => void supabase.auth.signOut()} />

        {searching ? (
          <SearchResults
            query={query}
            playlists={playlists}
            songs={songs}
            matches={searchMatches}
            onOpenPlaylist={(id) => go(`/playlist/${id}`)}
            actions={songActions}
          />
        ) : view === 'home' ? (
          <HomeView
            playlists={playlists}
            songs={songs}
            loading={loading}
            onOpenPlaylist={(id) => go(`/playlist/${id}`)}
            onNavigate={go}
            onCreatePlaylist={() => setIsCreatorOpen(true)}
            onPlay={playSong}
            rooms={recentRooms}
            onOpenRoom={(code) => go(`/room/${code}`)}
          />
        ) : view === 'library' ? (
          <LibraryView playlists={playlists} songs={songs} onOpenPlaylist={(id) => go(`/playlist/${id}`)} onCreatePlaylist={() => setIsCreatorOpen(true)} />
        ) : view === 'favorites' ? (
          <FavoritesView songs={songs} actions={songActions} />
        ) : activePlaylist ? (
          <PlaylistDetail
            playlist={activePlaylist}
            songs={playlistSongs}
            visibleSongs={visibleSongs}
            filter={filter}
            onFilter={setFilter}
            tags={tagTopics}
            activeTag={tag}
            onTag={setTag}
            currentSongId={currentSong?.id ?? null}
            loading={loading}
            onPlayAll={() => playAll(false)}
            onShuffle={() => playAll(true)}
            onAddSong={() => {
              setEditingSong(null);
              setIsFormOpen(true);
            }}
            onShare={() => setIsShareOpen(true)}
            onListenTogether={() => void handleListenTogether()}
            listenBusy={startingRoom}
            onExport={handleExport}
            onImport={() => fileInputRef.current?.click()}
            onDeletePlaylist={() => void handleDeletePlaylist()}
            onPlay={(song) => playSong(song, visibleSongs, isUnfiltered ? activePlaylist.id : undefined)}
            onEdit={songActions.onEdit}
            onDeleteSong={songActions.onDelete}
            onToggleFavorite={songActions.onToggleFavorite}
          />
        ) : loading ? (
          <PlaylistDetailSkeleton />
        ) : (
          <div className="empty">
            <span className="empty-icon">
              <Compass size={30} />
            </span>
            <h3>Không tìm thấy playlist</h3>
            <p>Playlist này không tồn tại hoặc bạn chưa có quyền xem.</p>
            <button className="btn btn-primary" type="button" onClick={() => go('/')} style={{ marginTop: 8 }}>
              Về trang chủ
            </button>
          </div>
        )}
      </main>

      {confirmDialog}
      <input ref={fileInputRef} hidden type="file" accept="application/json" onChange={handleImport} />
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}

      {isFormOpen && activePlaylist && (
        <SongForm
          song={editingSong}
          existingSongs={songs.filter((song) => song.playlist_id === activePlaylist.id)}
          onCancel={() => {
            setEditingSong(null);
            setIsFormOpen(false);
          }}
          onSubmit={handleSaveSong}
        />
      )}
      {isFormOpen && !activePlaylist && editingSong && (
        <SongForm
          song={editingSong}
          existingSongs={songs.filter((song) => song.playlist_id === editingSong.playlist_id)}
          onCancel={() => {
            setEditingSong(null);
            setIsFormOpen(false);
          }}
          onSubmit={async (input) => {
            const updated = await updateSong(editingSong.id, input);
            setSongs((current) => current.map((song) => (song.id === updated.id ? updated : song)));
            setEditingSong(null);
            setIsFormOpen(false);
          }}
        />
      )}
      {isCreatorOpen && <CreatePlaylistDialog onCreate={handleCreatePlaylist} onClose={() => setIsCreatorOpen(false)} />}
      {isShareOpen && activePlaylist && (
        <ShareDialog playlist={activePlaylist} onClose={() => setIsShareOpen(false)} onMessage={setMessage} />
      )}

      <PlayerBar
        song={currentSong}
        playRequestId={playRequestId}
        canSkip={queue.length > 1}
        onPrevious={() => step(-1)}
        onNext={(shuffle) => step(1, shuffle)}
        onClose={() => setCurrentSong(null)}
      />
      <TabBar view={view} onNavigate={go} />
    </div>
  );
}

function readError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeImportedSong(song: SongInput): SongInput {
  return {
    title: String(song.title || '').trim(),
    artist: song.artist || '',
    youtube_url: song.youtube_url || '',
    key: song.key || '',
    tags: Array.isArray(song.tags) ? song.tags : [],
    note: song.note || '',
    favorite: Boolean(song.favorite),
  };
}
