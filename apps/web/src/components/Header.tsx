'use client';

import Link from 'next/link';
import { useState } from 'react';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-emerald-400"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Safe<span className="text-emerald-400">Skill</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/"
              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-50 rounded-lg hover:bg-gray-800/50 transition-colors"
            >
              Home
            </Link>
            <Link
              href="/browse"
              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-50 rounded-lg hover:bg-gray-800/50 transition-colors"
            >
              Browse
            </Link>
            <Link
              href="/docs"
              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-50 rounded-lg hover:bg-gray-800/50 transition-colors"
            >
              Docs
            </Link>
            <a
              href="https://github.com/OyadotAI/safeskill"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-50 rounded-lg hover:bg-gray-800/50 transition-colors flex items-center gap-1.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </a>
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-gray-400 hover:text-gray-50"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileMenuOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 border-t border-gray-800/50 mt-2 pt-4 flex flex-col gap-1">
            <Link
              href="/"
              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-50 rounded-lg hover:bg-gray-800/50"
              onClick={() => setMobileMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/browse"
              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-50 rounded-lg hover:bg-gray-800/50"
              onClick={() => setMobileMenuOpen(false)}
            >
              Browse
            </Link>
            <Link
              href="/docs"
              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-50 rounded-lg hover:bg-gray-800/50"
              onClick={() => setMobileMenuOpen(false)}
            >
              Docs
            </Link>
            <a
              href="https://github.com/OyadotAI/safeskill"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-sm text-gray-400 hover:text-gray-50 rounded-lg hover:bg-gray-800/50"
            >
              GitHub
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
