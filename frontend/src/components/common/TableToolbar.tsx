import React from 'react';

interface Option {
  value: string;
  label: string;
}

interface TableToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  sortOption?: string;
  onSortChange?: (value: string) => void;
  sortOptions?: Option[];

  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterOptions?: Option[];

  children?: React.ReactNode;
}

export const TableToolbar: React.FC<TableToolbarProps> = ({
  searchTerm,
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm...',
  sortOption,
  onSortChange,
  sortOptions = [],
  filterValue,
  onFilterChange,
  filterOptions = [],
  children
}) => {
  return (
    <div className="table-actions" style={{ flex: 1 }}>
      <input
        type="text"
        className="form-input search-input"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
      />

      {onFilterChange && filterOptions.length > 0 && (
        <select
          value={filterValue}
          onChange={(e) => onFilterChange(e.target.value)}
          className="form-input"
          style={{ padding: '8px' }}
        >
          {filterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {onSortChange && sortOptions.length > 0 && (
        <select
          value={sortOption}
          onChange={(e) => onSortChange(e.target.value)}
          className="form-input"
          style={{ padding: '8px' }}
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {children && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {children}
        </div>
      )}
    </div>
  );
};

export default TableToolbar;
