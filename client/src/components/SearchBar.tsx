import React from 'react';
import { Search as SearchIcon, X } from 'lucide-react';

export interface SearchBarProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  onClear?: () => void;
  className?: string;
  wrapperClassName?: string;
}

export function SearchBar({
  value = '',
  onChange,
  placeholder = 'Search',
  onClear,
  className = '',
  wrapperClassName = '',
  ...inputProps
}: SearchBarProps) {
  const handleClear = () => {
    onChange?.('');
    onClear?.();
  };

  return (
    <div className={`w-full px-[22px] pb-[14px] ${wrapperClassName}`}>
      <div
        className={`w-full flex items-center gap-[8px] px-[16px] py-[10px] min-h-[44px] transition-colors ${className}`}
        style={{
          backgroundColor: 'var(--surface-1)',
          borderRadius: '20px',
        }}
      >
        <SearchIcon
          size={16}
          strokeWidth={1.75}
          className="shrink-0"
          style={{ color: 'var(--muted)' }}
          aria-hidden="true"
        />

        <input
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none min-w-0"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            color: 'var(--ink)',
          }}
          {...inputProps}
        />

        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="w-[28px] h-[28px] -mr-1 flex items-center justify-center rounded-full cursor-pointer hover:opacity-80 active:opacity-60 transition-opacity"
            aria-label="Clear search"
          >
            <X size={14} strokeWidth={1.75} style={{ color: 'var(--muted)' }} />
          </button>
        )}
      </div>
    </div>
  );
}

export default SearchBar;
