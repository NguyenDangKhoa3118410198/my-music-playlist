import { Compass, Heart, Library, Radio } from 'lucide-react';
import { RoomLauncher } from '../room/RoomLauncher';
import type { AppView } from './Sidebar';

type Props = { view: AppView; onNavigate: (path: string) => void };

// Thanh tab ở đáy, chỉ hiện trên điện thoại (xem app.css).
export function TabBar({ view, onNavigate }: Props) {
  const tab = (target: AppView, path: string, icon: React.ReactNode, label: string) => (
    <button
      className={view === target ? 'tab-item is-active' : 'tab-item'}
      type="button"
      aria-current={view === target ? 'page' : undefined}
      onClick={() => onNavigate(path)}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <nav className="tabbar" aria-label="Điều hướng">
      {tab('home', '/', <Compass size={22} />, 'Khám phá')}
      {tab('library', '/library', <Library size={22} />, 'Thư viện')}
      {tab('favorites', '/favorites', <Heart size={22} />, 'Yêu thích')}
      <RoomLauncher
        renderTrigger={(open) => (
          <button className="tab-item" type="button" onClick={() => open()}>
            <Radio size={22} />
            Phòng
          </button>
        )}
      />
    </nav>
  );
}
