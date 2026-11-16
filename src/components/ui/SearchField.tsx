import { Search, X } from 'lucide-react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
};

export function SearchField({ value, onChange, placeholder, label = 'Tìm kiếm' }: Props) {
  return (
    <div className="search-field" role="search">
      <Search size={18} aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button className="icon-btn icon-btn-sm is-quiet" type="button" aria-label="Xoá tìm kiếm" onClick={() => onChange('')}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
