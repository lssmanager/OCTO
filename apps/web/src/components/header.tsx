'use client';

import Link from 'next/link';
import { useTheme } from './theme-provider';

export function Header() {
  const { theme, toggle } = useTheme();

  return (
    <header
      className="sticky top-0 z-50 border-b px-4 py-3"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        {/* Logo + phase badge */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 no-underline">
            {/* OCTO SVG logo */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-label="OCTO"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10" stroke="var(--color-primary)" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="4" fill="var(--color-primary)" opacity="0.7" />
              <line x1="12" y1="2" x2="12" y2="7" stroke="var(--color-primary)" strokeWidth="1.5" />
              <line
                x1="12"
                y1="17"
                x2="12"
                y2="22"
                stroke="var(--color-primary)"
                strokeWidth="1.5"
              />
              <line x1="2" y1="12" x2="7" y2="12" stroke="var(--color-primary)" strokeWidth="1.5" />
              <line
                x1="17"
                y1="12"
                x2="22"
                y2="12"
                stroke="var(--color-primary)"
                strokeWidth="1.5"
              />
            </svg>
            <span
              className="font-semibold text-sm tracking-wider uppercase"
              style={{ color: 'var(--color-text)' }}
            >
              OCTO
            </span>
          </Link>
          <span
            className="text-xs px-2 py-0.5 rounded border font-mono"
            style={{
              color: 'var(--color-primary)',
              borderColor: 'var(--color-primary)',
              backgroundColor: 'rgba(79,152,163,0.1)',
            }}
          >
            F1
          </span>
        </div>

        {/* Nav */}
        <nav className="hidden sm:flex items-center gap-6">
          {(
            [
              ['/', 'Agent Graph'],
              ['/status', 'Status'],
              ['/health', 'Health'],
              ['/version', 'Version'],
            ] as const
          ).map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="p-2 rounded-md"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {theme === 'dark' ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
