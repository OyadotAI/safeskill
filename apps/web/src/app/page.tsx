import { SearchBar } from '@/components/SearchBar';
import { FeatureCard } from '@/components/FeatureCard';

export default function HomePage() {
  return (
    <div className="relative">
      {/* Hero section */}
      <section className="relative hero-gradient overflow-hidden">
        <div className="bg-grid absolute inset-0" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 sm:pt-28 pb-20">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-sm text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Open source security scanner
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-center text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6 max-w-4xl mx-auto">
            Your AI tools can read
            <br className="hidden sm:block" />{' '}
            your files.{' '}
            <span className="text-gradient">Do you trust them?</span>
          </h1>

          {/* Subtitle */}
          <p className="text-center text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            SafeSkill scans AI skills for code exploits and prompt injection
            before you install. Know what you&apos;re running.
          </p>

          {/* Search bar */}
          <div className="max-w-2xl mx-auto mb-6">
            <SearchBar size="large" placeholder="Search any npm package..." />
          </div>

          {/* Quick suggestions */}
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            <span className="text-xs text-gray-500">Try:</span>
            {['@modelcontextprotocol/server-filesystem', '@modelcontextprotocol/server-puppeteer', '@modelcontextprotocol/server-github'].map(
              (pkg) => (
                <a
                  key={pkg}
                  href={`/scan/${encodeURIComponent(pkg)}`}
                  className="text-xs text-gray-400 hover:text-emerald-400 bg-gray-800/50 hover:bg-gray-800 px-2.5 py-1 rounded-md border border-gray-700/50 hover:border-emerald-500/30 transition-all"
                >
                  {pkg}
                </a>
              ),
            )}
          </div>
        </div>
      </section>

      {/* Features section */}
      <section className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Three layers of protection
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Every package is analyzed through our multi-layer engine that
              catches what manual review misses.
            </p>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-emerald-400"
                >
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                  <line x1="14" y1="4" x2="10" y2="20" />
                </svg>
              }
              title="Code Analysis"
              description="AST-based static analysis with taint tracking. Traces data from sensitive sources to network sinks across files."
              details={[
                'Filesystem access',
                'Network calls',
                'Env variables',
                'Process spawn',
                'Obfuscation',
                'Install scripts',
                'Dynamic require',
                'Crypto usage',
              ]}
            />

            <FeatureCard
              icon={
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-emerald-400"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
              }
              title="Prompt Injection"
              description="Detects manipulation attempts hidden in skill definitions, README files, and content templates."
              details={[
                'Instruction override',
                'Hidden text',
                'Data exfiltration',
                'Tool abuse',
                'Persona hijack',
                'CoT manipulation',
                'Delimiter escape',
                'Indirect injection',
              ]}
            />

            <FeatureCard
              icon={
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-emerald-400"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
              title="Instant Results"
              description="Full analysis completes in under 3 seconds. No waiting, no sign-up, no cost. Just paste a package name."
              details={[
                'Under 3 seconds',
                'No account required',
                'Free forever',
                'Open source',
              ]}
            />
          </div>
        </div>
      </section>

      {/* CLI CTA section */}
      <section className="relative py-20 sm:py-28 border-t border-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-2xl border border-gray-800/80 bg-gray-900/30 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-emerald-500/5" />

            <div className="relative px-8 sm:px-16 py-16 sm:py-20 flex flex-col lg:flex-row items-center gap-12">
              <div className="flex-1 text-center lg:text-left">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                  Scan from your terminal
                </h2>
                <p className="text-gray-400 max-w-lg mb-8 leading-relaxed">
                  One command. No install required. Scan any npm package or MCP
                  server and get a full security report in seconds.
                </p>

                {/* Terminal mockup */}
                <div className="inline-block w-full max-w-lg">
                  <div className="rounded-xl border border-gray-700/80 bg-gray-950 overflow-hidden shadow-2xl">
                    {/* Terminal title bar */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-900/50">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                      </div>
                      <span className="text-xs text-gray-500 ml-2">Terminal</span>
                    </div>
                    {/* Terminal content */}
                    <div className="p-5 font-mono text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 select-none">$</span>
                        <span className="text-gray-50">npx skillsafe scan @modelcontextprotocol/server-filesystem</span>
                      </div>
                      <div className="mt-3 text-gray-500">
                        <p className="text-emerald-400/70">Scanning package...</p>
                        <p className="mt-1">
                          <span className="text-gray-400">Score:</span>{' '}
                          <span className="text-emerald-400 font-bold">92/100</span>{' '}
                          <span className="text-emerald-400/60">Verified Safe</span>
                        </p>
                        <p>
                          <span className="text-gray-400">Code:</span>{' '}
                          <span className="text-gray-300">94</span>{' '}
                          <span className="text-gray-600">|</span>{' '}
                          <span className="text-gray-400">Content:</span>{' '}
                          <span className="text-gray-300">90</span>
                        </p>
                        <p className="mt-1">
                          <span className="text-gray-400">Findings:</span>{' '}
                          <span className="text-gray-300">2 low severity</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick stats */}
              <div className="flex-shrink-0 grid grid-cols-2 gap-6">
                <div className="text-center p-6 rounded-xl bg-gray-800/30 border border-gray-700/50">
                  <div className="text-3xl font-bold text-emerald-400 mb-1">8</div>
                  <div className="text-xs text-gray-400">Code detectors</div>
                </div>
                <div className="text-center p-6 rounded-xl bg-gray-800/30 border border-gray-700/50">
                  <div className="text-3xl font-bold text-emerald-400 mb-1">8</div>
                  <div className="text-xs text-gray-400">Prompt detectors</div>
                </div>
                <div className="text-center p-6 rounded-xl bg-gray-800/30 border border-gray-700/50">
                  <div className="text-3xl font-bold text-emerald-400 mb-1">&lt;3s</div>
                  <div className="text-xs text-gray-400">Scan time</div>
                </div>
                <div className="text-center p-6 rounded-xl bg-gray-800/30 border border-gray-700/50">
                  <div className="text-3xl font-bold text-emerald-400 mb-1">100%</div>
                  <div className="text-xs text-gray-400">Open source</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats section */}
      <section className="relative py-20 sm:py-28 border-t border-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              The AI supply chain has a trust problem
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto leading-relaxed">
              MCP servers and AI skills run with your permissions. They can read
              your files, access your API keys, and make network requests.
              Most developers install them without a second thought.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="text-center p-8 rounded-2xl border border-gray-800/80 bg-gray-900/30">
              <div className="text-5xl font-bold text-gradient mb-3">10K+</div>
              <div className="text-sm text-gray-400">Packages indexed</div>
            </div>
            <div className="text-center p-8 rounded-2xl border border-gray-800/80 bg-gray-900/30">
              <div className="text-5xl font-bold text-gradient mb-3">23%</div>
              <div className="text-sm text-gray-400">Had prompt injection risks</div>
            </div>
            <div className="text-center p-8 rounded-2xl border border-gray-800/80 bg-gray-900/30">
              <div className="text-5xl font-bold text-gradient mb-3">67%</div>
              <div className="text-sm text-gray-400">Access filesystem without disclosure</div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24 sm:py-32 border-t border-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Stop trusting. Start verifying.
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-10 leading-relaxed">
            Scan your first package in under 10 seconds.
            No sign-up required.
          </p>

          <div className="max-w-xl mx-auto">
            <SearchBar size="large" placeholder="Paste a package name..." />
          </div>
        </div>
      </section>
    </div>
  );
}
