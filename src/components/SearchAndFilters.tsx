import type { FilterMode } from '../types';

type Props = {
  query: string;
  filter: FilterMode;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: FilterMode) => void;
};

const filterLabels: Record<FilterMode, string> = {
  all: 'Tất cả bài',
  favorite: 'Yêu thích',
  'with-youtube': 'Có YouTube',
  'missing-youtube': 'Thiếu link',
};

export function SearchAndFilters({ query, filter, onQueryChange, onFilterChange }: Props) {
  if (!query && filter === 'all') return null;

  return (
    <div className="active-filter-row">
      {filter !== 'all' && (
        <button className="clear-search" type="button" onClick={() => onFilterChange('all')}>
          Đang xem: {filterLabels[filter]} x
        </button>
      )}
      {query && (
        <button className="clear-search" type="button" onClick={() => onQueryChange('')}>
          Tìm: {query} x
        </button>
      )}
    </div>
  );
}
