'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface SearchBarProps {
  size?: 'default' | 'large';
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  size = 'default',
  placeholder = 'Search any npm package...',
  className = '',
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed) {
        router.push(`/scan/${encodeURIComponent(trimmed)}`);
      }
    },
    [query, router],
  );

  const isLarge = size === 'large';

  return (
    <form onSubmit={handleSubmit} className={`relative w-full ${className}`}>
      <div className={`relative group ${isLarge ? 'glow-emerald' : ''} rounded-xl`}>
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-emerald-500/20 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
        <div className="relative flex items-center">
          {/* Search icon */}
          <div className={`absolute left-0 flex items-center pointer-events-none text-gray-500 group-focus-within:text-emerald-400 transition-colors ${isLarge ? 'pl-5' : 'pl-4'}`}>
            <svg
              width={isLarge ? 22 : 18}
              height={isLarge ? 22 : 18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className={`w-full bg-gray-900 border border-gray-800 rounded-xl text-gray-50 placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25 transition-all ${
              isLarge
                ? 'pl-14 pr-32 py-5 text-lg'
                : 'pl-11 pr-24 py-3 text-sm'
            }`}
          />

          <button
            type="submit"
            className={`absolute right-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-semibold rounded-lg transition-colors ${
              isLarge
                ? 'px-6 py-3 text-sm'
                : 'px-4 py-2 text-xs'
            }`}
          >
            Scan
          </button>
        </div>
      </div>
    </form>
  );
}
