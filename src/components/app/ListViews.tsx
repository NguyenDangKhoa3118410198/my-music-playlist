import { Heart, Search } from 'lucide-react';
import type { PlaylistWithRole, Song } from '../../types';
import { NewPlaylistCard } from './HomeView';
import { PlaylistCard } from './PlaylistCard';
import { SongRow } from './SongRow';

type SongActions = {
  currentSongId: string | null;
  canEditSong: (song: Song) => boolean;
  playlistName: (song: Song) => string;
  onPlay: (song: Song, list: Song[]) => void;
  onEdit: (song: Song) => void;
  onDelete: (song: Song) => void;
  onToggleFavorite: (song: Song) => void;
};

function SongList({ songs, actions }: { songs: Song[]; actions: SongActions }) {
  return (
    <ul className="song-list">
      {songs.map((song, index) => (
        <SongRow
          key={song.id}
          song={song}
          index={index}
          isCurrent={song.id === actions.currentSongId}
          canEdit={actions.canEditSong(song)}
          subtitle={[song.artist, actions.playlistName(song)].filter(Boolean).join(' · ')}
          onPlay={(s) => actions.onPlay(s, songs)}
          onEdit={actions.onEdit}
          onDelete={actions.onDelete}
          onToggleFavorite={actions.onToggleFavorite}
        />
      ))}
    </ul>
  );
}

export function LibraryView({
  playlists,
  songs,
  onOpenPlaylist,
  onCreatePlaylist,
}: {
  playlists: PlaylistWithRole[];
  songs: Song[];
  onOpenPlaylist: (id: string) => void;
  onCreatePlaylist: () => void;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h1 style={{ fontSize: '1.9rem' }}>Thư viện</h1>
          <p>{playlists.length} playlist</p>
        </div>
      </div>
      <div className="card-grid">
        {playlists.map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            songs={songs.filter((song) => song.playlist_id === playlist.id)}
            onOpen={onOpenPlaylist}
          />
        ))}
        <NewPlaylistCard onCreate={onCreatePlaylist} />
      </div>
    </section>
  );
}

export function FavoritesView({ songs, actions }: { songs: Song[]; actions: SongActions }) {
  const favorites = songs.filter((song) => song.favorite);

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h1 style={{ fontSize: '1.9rem' }}>Yêu thích</h1>
          <p>{favorites.length} bài hát</p>
        </div>
      </div>
      {favorites.length ? (
        <SongList songs={favorites} actions={actions} />
      ) : (
        <div className="empty">
          <span className="empty-icon">
            <Heart size={30} />
          </span>
          <h3>Chưa có bài yêu thích</h3>
          <p>Bấm vào trái tim ở cạnh bài hát để lưu vào đây.</p>
        </div>
      )}
    </section>
  );
}

export function SearchResults({
  query,
  playlists,
  songs,
  matches,
  onOpenPlaylist,
  actions,
}: {
  query: string;
  playlists: PlaylistWithRole[];
  songs: Song[];
  matches: Song[];
  onOpenPlaylist: (id: string) => void;
  actions: SongActions;
}) {
  const q = query.trim().toLowerCase();
  const matchedPlaylists = playlists.filter((playlist) => playlist.name.toLowerCase().includes(q));

  if (!matches.length && !matchedPlaylists.length) {
    return (
      <div className="empty">
        <span className="empty-icon">
          <Search size={30} />
        </span>
        <h3>Không thấy kết quả cho “{query}”</h3>
        <p>Thử tên bài, ca sĩ hoặc thẻ khác.</p>
      </div>
    );
  }

  return (
    <>
      {matchedPlaylists.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Playlist</h2>
          </div>
          <div className="card-grid">
            {matchedPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                songs={songs.filter((song) => song.playlist_id === playlist.id)}
                onOpen={onOpenPlaylist}
              />
            ))}
          </div>
        </section>
      )}
      {matches.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Bài hát</h2>
          </div>
          <SongList songs={matches} actions={actions} />
        </section>
      )}
    </>
  );
}
