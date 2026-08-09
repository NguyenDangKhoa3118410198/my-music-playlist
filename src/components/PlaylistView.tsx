import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Heart,
  Link2,
  ListMusic,
  LogOut,
  Mic2,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { FilterMode, MemberRole, PlaylistWithRole, Song, SongInput } from '../types';
import { createInvite, buildInviteUrl } from '../lib/inviteApi';
import { createPlaylist, deletePlaylist, getPlaylists } from '../lib/playlistApi';
import { createSong, deleteSong, getSongs, importSongs, updateSong } from '../lib/songApi';
import { supabase } from '../lib/supabase';
import { PlayerBar } from './PlayerBar';
import { SearchAndFilters } from './SearchAndFilters';
import { SongForm } from './SongForm';
import { SongList } from './SongList';

export function PlaylistView({ inviteRedeemed }: { inviteRedeemed: string | null }) {
  const [playlists, setPlaylists] = useState<PlaylistWithRole[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [isPlaylistCreatorOpen, setIsPlaylistCreatorOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<Exclude<MemberRole, 'owner'>>('viewer');
  const [inviteUrl, setInviteUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [songsLoading, setSongsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [playRequestId, setPlayRequestId] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activePlaylist = playlists.find((playlist) => playlist.id === activePlaylistId) || null;
  const canEdit = activePlaylist?.role === 'owner' || activePlaylist?.role === 'editor';
  const isOwner = activePlaylist?.role === 'owner';
  const trimmedPlaylistName = playlistName.trim();
  const favoriteCount = songs.filter((song) => song.favorite).length;
  const playableCount = songs.filter((song) => song.youtube_url).length;
  const tagTopics = useMemo(() => {
    const counts = new Map<string, number>();

    songs.forEach((song) => {
      song.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });

    return Array.from(counts.entries())
      .sort((first, second) => second[1] - first[1])
      .slice(0, 6);
  }, [songs]);

  useEffect(() => {
    void loadPlaylists();
  }, []);

  useEffect(() => {
    if (inviteRedeemed) {
      setMessage('Đã nhận playlist từ link mời.');
      void loadPlaylists(inviteRedeemed);
    }
  }, [inviteRedeemed]);

  useEffect(() => {
    if (!activePlaylistId) {
      setSongs([]);
      return;
    }
    void loadSongs(activePlaylistId);
  }, [activePlaylistId]);

  useEffect(() => {
    if (!message) return;

    const timer = window.setTimeout(() => {
      setMessage('');
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [message]);

  const filteredSongs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return songs.filter((song) => {
      const matchesQuery =
        !normalizedQuery ||
        [song.title, song.artist, song.key, song.note, ...song.tags]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'favorite' && song.favorite) ||
        (filter === 'with-youtube' && Boolean(song.youtube_url)) ||
        (filter === 'missing-youtube' && !song.youtube_url);

      return matchesQuery && matchesFilter;
    });
  }, [filter, query, songs]);
  const playableQueue = useMemo(
    () => filteredSongs.filter((song) => song.youtube_url),
    [filteredSongs],
  );

  async function loadPlaylists(preferredPlaylistId?: string) {
    setLoading(true);
    if (!preferredPlaylistId) setMessage('');
    try {
      const nextPlaylists = await getPlaylists();
      setPlaylists(nextPlaylists);
      setActivePlaylistId((current) => {
        if (
          preferredPlaylistId &&
          nextPlaylists.some((playlist) => playlist.id === preferredPlaylistId)
        ) {
          return preferredPlaylistId;
        }
        if (current && nextPlaylists.some((playlist) => playlist.id === current)) return current;
        return nextPlaylists[0]?.id || null;
      });
    } catch (error) {
      setMessage(readError(error, 'Không tải được playlist.'));
    } finally {
      setLoading(false);
    }
  }

  async function loadSongs(playlistId: string) {
    setSongsLoading(true);
    try {
      setSongs(await getSongs(playlistId));
    } catch (error) {
      setMessage(readError(error, 'Không tải được bài hát.'));
    } finally {
      setSongsLoading(false);
    }
  }

  async function handleCreatePlaylist(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    if (!trimmedPlaylistName) return;

    try {
      const playlist = await createPlaylist(trimmedPlaylistName, playlistDescription || null);
      await loadPlaylists();
      setActivePlaylistId(playlist.id);
      setPlaylistName('');
      setPlaylistDescription('');
      setIsPlaylistCreatorOpen(false);
    } catch (error) {
      setMessage(readError(error, 'Không tạo được playlist.'));
    }
  }

  function handleCancelCreatePlaylist() {
    setIsPlaylistCreatorOpen(false);
    setPlaylistName('');
    setPlaylistDescription('');
  }

  async function handleDeletePlaylist() {
    if (!activePlaylist || !window.confirm(`Xóa playlist “${activePlaylist.name}”?`)) return;
    try {
      await deletePlaylist(activePlaylist.id);
      await loadPlaylists();
      setMessage('Đã xóa playlist.');
    } catch (error) {
      setMessage(readError(error, 'Không xóa được playlist.'));
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

  function handlePlaySong(song: Song) {
    setCurrentSong(song);
    setPlayRequestId((current) => current + 1);
  }

  function handleNextSong(shuffle = false) {
    if (!playableQueue.length) return;

    if (shuffle && playableQueue.length > 1) {
      const candidates = playableQueue.filter((song) => song.id !== currentSong?.id);
      handlePlaySong(candidates[Math.floor(Math.random() * candidates.length)]);
      return;
    }

    const currentIndex = currentSong ? playableQueue.findIndex((song) => song.id === currentSong.id) : -1;
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % playableQueue.length : 0;
    handlePlaySong(playableQueue[nextIndex]);
  }

  function handlePreviousSong() {
    if (!playableQueue.length) return;

    const currentIndex = currentSong ? playableQueue.findIndex((song) => song.id === currentSong.id) : -1;
    const previousIndex =
      currentIndex > 0 ? currentIndex - 1 : playableQueue.length - 1;
    handlePlaySong(playableQueue[previousIndex]);
  }

  async function handleDeleteSong(song: Song) {
    if (!window.confirm(`Xóa bài “${song.title}”?`)) return;
    try {
      await deleteSong(song.id);
      setSongs((current) => current.filter((item) => item.id !== song.id));
    } catch (error) {
      setMessage(readError(error, 'Không xóa được bài hát.'));
    }
  }

  async function handleCreateInvite() {
    if (!activePlaylist) return;
    setMessage('');
    try {
      const token = await createInvite(activePlaylist.id, inviteRole);
      const url = buildInviteUrl(token);
      setInviteUrl(url);
      await navigator.clipboard?.writeText(url);
      setMessage('Đã tạo link mời và copy vào clipboard.');
    } catch (error) {
      setMessage(readError(error, 'Không tạo được link mời.'));
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
      songs: songs.map(({ title, artist, youtube_url, key, tags, note, favorite }) => ({
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
      await loadSongs(activePlaylist.id);
      setMessage(`Đã import ${imported.length} bài hát.`);
    } catch (error) {
      setMessage(readError(error, 'File import không hợp lệ.'));
    }
  }

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <div className="app-logo">
          <Mic2 size={24} />
          <div>
            <strong>Karaoke</strong>
            <span>Playlist</span>
          </div>
        </div>
        <nav className="side-nav">
          <button className={filter === 'all' ? 'active' : undefined} type="button" onClick={() => setFilter('all')}>
            <Sparkles size={18} />
            Khám phá
          </button>
          <button
            className={filter === 'favorite' ? 'active' : undefined}
            type="button"
            onClick={() => setFilter('favorite')}
          >
            <Heart size={18} />
            Yêu thích
          </button>
          <button
            className={filter === 'with-youtube' ? 'active' : undefined}
            type="button"
            onClick={() => setFilter('with-youtube')}
          >
            <ListMusic size={18} />
            Có thể phát
          </button>
        </nav>

        <section className="sidebar-section">
          <div className="sidebar-section-title">Thư viện</div>
          <p className="sidebar-note">
            {playlists.length ? `${playlists.length} playlist - ${songs.length} bài hát` : 'Tạo playlist đầu tiên'}
          </p>
        </section>

        <section className="sidebar-section">
          <div className="sidebar-section-header">
            <div>
              <div className="sidebar-section-title">Danh sách phát</div>
              <p>{playlists.length} danh sách</p>
            </div>
            <div className="sidebar-section-actions">
              <button className="sidebar-icon-button" type="button" onClick={() => void loadPlaylists()} title="Tải lại">
                <RefreshCw size={15} />
              </button>
              <button
                className="sidebar-icon-button primary"
                type="button"
                onClick={() => setIsPlaylistCreatorOpen(true)}
                title="Tạo danh sách"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          <div className="playlist-list sidebar-playlist-list">
            {loading ? (
              <p className="muted">Đang tải playlist...</p>
            ) : playlists.length ? (
              playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  className={playlist.id === activePlaylistId ? 'playlist-item active' : 'playlist-item'}
                  type="button"
                  onClick={() => setActivePlaylistId(playlist.id)}
                >
                  <span>{playlist.name}</span>
                  <small>{roleLabel(playlist.role)}</small>
                </button>
              ))
            ) : (
              <div className="empty-state small sidebar-empty-state">
                <ListMusic size={24} />
                <p>Chưa có danh sách.</p>
              </div>
            )}
          </div>
        </section>

      </aside>

      <section className="music-shell">
        <header className="top-bar">
          <label className="top-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Bạn muốn hát bài gì?"
            />
          </label>
          <button className="icon-button dark" type="button" onClick={() => supabase.auth.signOut()} title="Đăng xuất">
            <LogOut size={19} />
          </button>
        </header>

        {message && <div className="toast" role="status">{message}</div>}

        <section className="topic-layout">
          <section className="content-panel">
            {activePlaylist ? (
              <>
                <div className="content-header">
                  <div>
                    <p className="eyebrow">Topics</p>
                    <h1>{activePlaylist.name}</h1>
                    <p>
                      {songs.length} bài hát
                      {activePlaylist.description ? ` - ${activePlaylist.description}` : ''}
                    </p>
                  </div>
                  <div className="hero-actions">
                    <span className="role-pill">{roleLabel(activePlaylist.role)}</span>
                    {canEdit && (
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => {
                          setEditingSong(null);
                          setIsFormOpen(true);
                        }}
                      >
                        <Plus size={18} />
                        Thêm bài
                      </button>
                    )}
                  </div>
                </div>

                <section className="topic-section">
                  <div className="section-heading">
                    <div>
                      <h2>Dành cho bạn</h2>
                      <p>Lọc nhanh theo trạng thái bài hát.</p>
                    </div>
                  </div>
                  <div className="topic-grid featured">
                    <button
                      className={filter === 'all' ? 'topic-card card-teal active' : 'topic-card card-teal'}
                      type="button"
                      onClick={() => setFilter('all')}
                    >
                      <span>Tất cả bài</span>
                      <strong>{songs.length}</strong>
                    </button>
                    <button
                      className={filter === 'favorite' ? 'topic-card card-rose active' : 'topic-card card-rose'}
                      type="button"
                      onClick={() => setFilter('favorite')}
                    >
                      <span>Yêu thích</span>
                      <strong>{favoriteCount}</strong>
                    </button>
                    <button
                      className={
                        filter === 'with-youtube' ? 'topic-card card-cyan active' : 'topic-card card-cyan'
                      }
                      type="button"
                      onClick={() => setFilter('with-youtube')}
                    >
                      <span>Có YouTube</span>
                      <strong>{playableCount}</strong>
                    </button>
                    <button
                      className={
                        filter === 'missing-youtube' ? 'topic-card card-amber active' : 'topic-card card-amber'
                      }
                      type="button"
                      onClick={() => setFilter('missing-youtube')}
                    >
                      <span>Thiếu link</span>
                      <strong>{songs.length - playableCount}</strong>
                    </button>
                  </div>
                </section>

                <section className="topic-section">
                  <div className="section-heading">
                    <div>
                      <h2>Thể loại</h2>
                      <p>Nhóm từ tags trong playlist.</p>
                    </div>
                  </div>
                  <div className="topic-grid">
                    {tagTopics.length ? (
                      tagTopics.map(([tag, count], index) => (
                        <button
                          className={`topic-card ${topicTone(index)}`}
                          key={tag}
                          type="button"
                          onClick={() => {
                            setFilter('all');
                            setQuery(tag);
                          }}
                        >
                          <span>{tag}</span>
                          <strong>{count}</strong>
                        </button>
                      ))
                    ) : (
                      <div className="empty-strip">Thêm tags cho bài hát để tạo topic.</div>
                    )}
                  </div>
                </section>

                <section className="feature-section">
                  <div className="section-heading">
                    <div>
                      <h2>Bài hát</h2>
                      <p>Thêm bài, tìm kiếm và phát trực tiếp từ YouTube.</p>
                    </div>
                  </div>

                  <SearchAndFilters
                    query={query}
                    filter={filter}
                    onQueryChange={setQuery}
                    onFilterChange={setFilter}
                  />

                  {songsLoading ? (
                    <div className="empty-state">
                      <p>Đang tải bài hát...</p>
                    </div>
                  ) : (
                    <SongList
                      songs={filteredSongs}
                      canEdit={canEdit}
                      onEdit={(song) => {
                        setEditingSong(song);
                        setIsFormOpen(true);
                      }}
                      onDelete={handleDeleteSong}
                      onPlay={handlePlaySong}
                    />
                  )}
                </section>

                {isOwner && (
                  <section className="feature-section compact-section">
                    <div className="section-heading">
                      <div>
                        <h2>Chia sẻ</h2>
                        <p>Tạo link mời cho người khác vào playlist.</p>
                      </div>
                    </div>
                    <div className="invite-controls">
                      <div className="role-segment" aria-label="Quyền link mời">
                        <button
                          className={inviteRole === 'viewer' ? 'active' : ''}
                          type="button"
                          onClick={() => setInviteRole('viewer')}
                        >
                          Viewer
                        </button>
                        <button
                          className={inviteRole === 'editor' ? 'active' : ''}
                          type="button"
                          onClick={() => setInviteRole('editor')}
                        >
                          Editor
                        </button>
                      </div>
                      <button className="ghost-button" type="button" onClick={handleCreateInvite}>
                        <Share2 size={18} />
                        Tạo link
                      </button>
                    </div>
                    {inviteUrl && (
                      <label className="copy-field">
                        <Link2 size={17} />
                        <input value={inviteUrl} readOnly onFocus={(event) => event.target.select()} />
                      </label>
                    )}
                  </section>
                )}

                <section className="feature-section compact-section">
                  <div className="section-heading">
                    <div>
                      <h2>Dữ liệu</h2>
                      <p>Backup hoặc chuyển bài hát bằng file JSON.</p>
                    </div>
                  </div>
                  <div className="data-actions">
                    <button className="ghost-button" type="button" onClick={handleExport}>
                      <Download size={18} />
                      Export
                    </button>
                    {canEdit && (
                      <>
                        <button className="ghost-button" type="button" onClick={() => fileInputRef.current?.click()}>
                          <Upload size={18} />
                          Import
                        </button>
                        <input ref={fileInputRef} hidden type="file" accept="application/json" onChange={handleImport} />
                      </>
                    )}
                    {isOwner && (
                      <button className="danger-button" type="button" onClick={handleDeletePlaylist}>
                        <Trash2 size={18} />
                        Xóa playlist
                      </button>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="empty-state">
                <ListMusic size={34} />
                <h3>Chưa có playlist</h3>
                <p>Tạo playlist cá nhân hoặc mở link mời để bắt đầu lưu bài karaoke.</p>
              </div>
            )}
          </section>
        </section>
      </section>

      {isFormOpen && (
        <SongForm
          song={editingSong}
          existingSongs={songs}
          onCancel={() => {
            setEditingSong(null);
            setIsFormOpen(false);
          }}
          onSubmit={handleSaveSong}
        />
      )}
      {isPlaylistCreatorOpen && (
        <div className="modal-backdrop dimmed-backdrop" role="presentation">
          <form className="playlist-modal" onSubmit={handleCreatePlaylist}>
            <div className="playlist-modal-header">
              <h2>Tạo playlist mới</h2>
              <button className="modal-close-button" type="button" onClick={handleCancelCreatePlaylist} title="Đóng">
                <X size={28} />
              </button>
            </div>

            <label className="playlist-name-field">
              <input
                autoFocus
                maxLength={100}
                value={playlistName}
                onChange={(event) => setPlaylistName(event.target.value)}
                placeholder="Nhập tên playlist"
                required
              />
              <span>{playlistName.length}/100</span>
            </label>

            <div className="playlist-modal-actions">
              <button className="ghost-button pill-action" type="button" onClick={handleCancelCreatePlaylist}>
                Hủy
              </button>
              <button className="primary-button pill-action" type="submit" disabled={!trimmedPlaylistName}>
                Lưu
              </button>
            </div>
          </form>
        </div>
      )}
      <PlayerBar
        song={currentSong}
        playRequestId={playRequestId}
        canSkip={playableQueue.length > 1}
        onPrevious={handlePreviousSong}
        onNext={handleNextSong}
        onClose={() => setCurrentSong(null)}
      />
    </main>
  );
}

function roleLabel(role: MemberRole) {
  const labels: Record<MemberRole, string> = {
    owner: 'Chủ playlist',
    editor: 'Được sửa',
    viewer: 'Chỉ xem',
  };
  return labels[role];
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

function topicTone(index: number) {
  const tones = ['card-purple', 'card-blue', 'card-green', 'card-orange', 'card-pink', 'card-slate'];
  return tones[index % tones.length];
}
