import React from 'react';
import { LucideIcon, ChevronRight } from 'lucide-react';

export interface SettingsRowProps {
  icon?: LucideIcon | React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: 'chevron' | 'toggle' | 'text' | React.ReactNode;
  chevron?: boolean;
  rightElement?: React.ReactNode;
  trailingText?: string;
  toggleChecked?: boolean;
  onToggleChange?: (checked: boolean) => void;
  onClick?: () => void | Promise<void>;
  destructive?: boolean;
  iconColor?: string;
  className?: string;
}

export function SettingsRow({
  icon,
  title,
  subtitle,
  trailing = 'chevron',
  chevron,
  rightElement,
  trailingText,
  toggleChecked = false,
  onToggleChange,
  onClick,
  destructive = false,
  iconColor,
  className = '',
}: SettingsRowProps) {
  const isClickable = Boolean(onClick) || trailing === 'chevron' || trailing === 'toggle' || Boolean(chevron);

  const handleRowClick = () => {
    if (trailing === 'toggle') {
      onToggleChange?.(!toggleChecked);
    } else {
      onClick?.();
    }
  };

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) {
      return icon;
    }
    const IconComp = icon as LucideIcon;
    return (
      <IconComp
        size={18}
        strokeWidth={1.75}
        className="shrink-0"
        style={{ color: iconColor || 'var(--muted)' }}
        aria-hidden="true"
      />
    );
  };

  const renderTrailing = () => {
    if (rightElement) {
      return rightElement;
    }

    if (trailing === 'chevron' || chevron) {
      return (
        <ChevronRight
          size={18}
          strokeWidth={1.75}
          className="shrink-0"
          style={{ color: 'var(--muted)' }}
          aria-hidden="true"
        />
      );
    }

    if (trailing === 'toggle') {
      return (
        <button
          type="button"
          role="switch"
          aria-checked={toggleChecked}
          onClick={(e) => {
            e.stopPropagation();
            onToggleChange?.(!toggleChecked);
          }}
          className="w-[44px] h-[26px] rounded-full p-[2px] transition-colors flex items-center cursor-pointer shrink-0"
          style={{
            backgroundColor: toggleChecked ? 'var(--accent)' : 'var(--surface-2)',
            border: '1px solid var(--line)',
          }}
          aria-label={`${title} toggle`}
        >
          <span
            className="w-[20px] h-[20px] rounded-full bg-white transition-transform block shrink-0"
            style={{
              transform: toggleChecked ? 'translateX(18px)' : 'translateX(0px)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }}
          />
        </button>
      );
    }

    if (trailing === 'text' && trailingText) {
      return (
        <span
          className="text-right text-[13px] tnum"
          style={{
            color: 'var(--muted)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {trailingText}
        </span>
      );
    }

    if (React.isValidElement(trailing)) {
      return trailing;
    }

    return null;
  };

  return (
    <div
      role={isClickable ? 'button' : 'group'}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleRowClick : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleRowClick();
        }
      }}
      className={`w-full flex items-center justify-between min-h-[44px] px-[22px] py-[14px] select-none transition-colors border-b ${
        isClickable
          ? 'cursor-pointer hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]'
          : ''
      } ${className}`}
      style={{
        borderBottomColor: 'var(--line)',
      }}
    >
      {/* Leading Left Side: Icon + Title/Subtitle */}
      <div className="flex items-center gap-[12px] min-w-0 pr-3">
        {renderIcon()}
        <div className="min-w-0">
          <div
            className="truncate"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '15px',
              lineHeight: 1.35,
              fontWeight: 400,
              color: destructive ? 'var(--heart)' : 'var(--ink)',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div
              className="truncate mt-[2px]"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: 'var(--muted)',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Trailing Control */}
      <div className="shrink-0 flex items-center">{renderTrailing()}</div>
    </div>
  );
}

export default SettingsRow;
