import React from 'react';

export function PageSkeleton({ type = 'chat' }: { type?: 'chat' | 'conversation' | 'settings' }) {
  if (type === 'conversation') {
    return (
      <div
        className="flex flex-col h-dvh w-full overflow-hidden select-none"
        style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}
      >
        {/* Header skeleton */}
        <div
          className="h-[54px] px-4 flex items-center justify-between border-b shrink-0 pt-safe"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
            <div className="w-8 h-8 rounded-full animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
            <div className="space-y-1.5">
              <div className="w-24 h-3.5 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
              <div className="w-16 h-2.5 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
            </div>
          </div>
          <div className="w-16 h-6 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
        </div>

        {/* Messages placeholder */}
        <div className="flex-1 p-4 space-y-4 overflow-hidden">
          <div className="w-48 h-10 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
          <div className="w-64 h-12 rounded-2xl ml-auto animate-pulse" style={{ backgroundColor: 'var(--surface-2)' }} />
          <div className="w-56 h-10 rounded-2xl animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
          <div className="w-40 h-10 rounded-2xl ml-auto animate-pulse" style={{ backgroundColor: 'var(--surface-2)' }} />
        </div>

        {/* Composer skeleton */}
        <div
          className="h-14 px-3 flex items-center gap-2 border-t shrink-0 pb-safe"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex-1 h-9 rounded-full animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
          <div className="w-9 h-9 rounded-full animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col min-h-dvh w-full p-4 pt-safe select-none"
      style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}
    >
      {/* Title skeleton */}
      <div className="flex items-center justify-between pb-4 pt-2">
        <div className="w-28 h-7 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
        <div className="w-8 h-8 rounded-full animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
      </div>

      {/* Search box skeleton */}
      <div className="w-full h-10 rounded-xl mb-4 animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />

      {/* List items skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="w-12 h-12 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
            <div className="flex-1 space-y-2">
              <div className="flex justify-between">
                <div className="w-32 h-3.5 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
                <div className="w-10 h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
              </div>
              <div className="w-48 h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-1)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PageSkeleton;
