import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-gray-800/50 bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                <svg
                  width="14"
                  height="14"
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
              <span className="text-sm font-semibold tracking-tight">
                Safe<span className="text-emerald-400">Skill</span>
              </span>
            </div>
            <p className="text-sm text-gray-500 max-w-xs">
              Trust layer for AI tools. Scan AI skills for code exploits and prompt
              injection before you install.
            </p>
          </div>

          {/* Product links */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">
              Product
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
                  Scanner
                </Link>
              </li>
              <li>
                <Link href="/browse" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
                  Browse Skills
                </Link>
              </li>
              <li>
                <a
                  href="https://www.npmjs.com/package/safeskill"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  CLI Tool
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">
              Resources
            </h3>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://github.com/OyadotAI/safeskill"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/OyadotAI/safeskill/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Report Issue
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800/50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-600">
            SafeSkill &mdash; Trust layer for AI tools
          </p>
          <p className="text-xs text-gray-600">
            Open source under MIT License
          </p>
        </div>
      </div>
    </footer>
  );
}
