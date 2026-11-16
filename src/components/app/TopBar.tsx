import { LogOut, Mic2, User } from 'lucide-react';
import { RoomLauncher } from '../room/RoomLauncher';
import { Menu } from '../ui/Menu';
import { SearchField } from '../ui/SearchField';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  onSignOut: () => void;
};

export function TopBar({ query, onQueryChange, placeholder, onSignOut }: Props) {
  return (
    <header className="topbar">
      <span className="brand-logo topbar-brand" aria-hidden="true">
        <Mic2 size={20} />
      </span>
      <SearchField value={query} onChange={onQueryChange} placeholder={placeholder} label="Tìm bài hát hoặc playlist" />
      <div className="topbar-end">
        <RoomLauncher />
        <Menu
          label="Tài khoản"
          icon={<User size={19} />}
          buttonClassName="icon-btn"
          items={[{ label: 'Đăng xuất', icon: <LogOut size={18} />, onClick: onSignOut }]}
        />
      </div>
    </header>
  );
}
