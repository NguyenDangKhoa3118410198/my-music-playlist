import type { PlaylistWithRole, Song } from '../../types';
import { Cover } from '../ui/Cover';

type Props = { playlist: PlaylistWithRole; songs: Song[]; onOpen: (id: string) => void };

export function PlaylistCard({ playlist, songs, onOpen }: Props) {
  return (
    <button className="pl-card" type="button" onClick={() => onOpen(playlist.id)}>
      <Cover seed={playlist.id} name={playlist.name} songs={songs} />
      <span>
        <strong>{playlist.name}</strong>
        <small>{songs.length} bài hát</small>
      </span>
    </button>
  );
}
