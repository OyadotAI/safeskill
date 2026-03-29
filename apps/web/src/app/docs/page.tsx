import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation — SafeSkill',
  description:
    'How to use SafeSkill: CLI scanning, web scanner, scoring system, API reference, and self-hosting guide.',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-2xl font-bold tracking-tight mb-4 pb-2 border-b border-gray-800/50">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <div className="rounded-lg bg-gray-950 border border-gray-800 p-4 font-mono text-sm overflow-x-auto my-4">
      <pre className="text-gray-300">{children}</pre>
    </div>
  );
}

function InlineCode({ children }: { children: string }) {
  return <code className="text-emerald-400/80 bg-gray-900 px-1.5 py-0.5 rounded text-xs">{children}</code>;
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Documentation</h1>
        <p className="text-gray-400 leading-relaxed">
          SafeSkill scans AI skills, MCP servers, and npm packages for code exploits, prompt injection,
          and data exfiltration. Use the CLI, the web scanner, or the API.
        </p>
      </div>

      {/* Table of Contents */}
      <nav className="rounded-xl border border-gray-800/80 bg-gray-900/30 p-6 mb-12">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">On this page</h3>
        <ul className="space-y-1.5">
          {[
            ['cli', 'CLI Usage'],
            ['web-scanner', 'Web Scanner'],
            ['scoring', 'Scoring System'],
            ['detectors', 'Detectors'],
            ['api', 'API Reference'],
            ['self-hosting', 'Self-Hosting'],
            ['contributing', 'Contributing'],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-sm text-gray-400 hover:text-emerald-400 transition-colors">{label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-16">
        {/* CLI */}
        <Section id="cli" title="CLI Usage">
          <p className="text-gray-400 mb-4">Scan any npm package, GitHub repo, or local directory. No install required.</p>

          <h3 className="text-lg font-semibold mt-6 mb-2">Scan a package</h3>
          <Code>{`npx skillsafe scan @modelcontextprotocol/server-filesystem
npx skillsafe scan chalk
npx skillsafe scan ./my-local-project`}</Code>

          <h3 className="text-lg font-semibold mt-6 mb-2">JSON output</h3>
          <p className="text-gray-400 mb-2">For CI/CD integration or piping to other tools.</p>
          <Code>{`npx skillsafe scan axios --json | jq '.overallScore'`}</Code>

          <h3 className="text-lg font-semibold mt-6 mb-2">Skip dependency analysis</h3>
          <p className="text-gray-400 mb-2">Faster scans by skipping <InlineCode>npm audit</InlineCode> and typosquatting checks.</p>
          <Code>{`npx skillsafe scan my-package --skip-deps`}</Code>

          <h3 className="text-lg font-semibold mt-6 mb-2">Exit codes</h3>
          <p className="text-gray-400">
            The CLI exits with code <InlineCode>1</InlineCode> if the package scores below 40 (Blocked grade).
            Use this in CI pipelines to gate installs.
          </p>
          <Code>{`npx skillsafe scan suspicious-pkg || echo "BLOCKED"`}</Code>
        </Section>

        {/* Web Scanner */}
        <Section id="web-scanner" title="Web Scanner">
          <p className="text-gray-400 mb-4">
            Visit <a href="https://safeskill.dev" className="text-emerald-400 hover:underline">safeskill.dev</a> and
            paste any npm package name. The scanner downloads the package, runs all 16 detectors, and
            shows a full report.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">How it works</h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-400 text-sm">
            <li>You enter a package name in the search bar</li>
            <li>The API checks for a cached result in Google Cloud Storage</li>
            <li>If not cached, a Cloud Run worker downloads and scans the package</li>
            <li>Results are stored in GCS (full report) and Firestore (metadata)</li>
            <li>The report is displayed with score breakdown, findings, permissions, and taint flows</li>
          </ol>

          <h3 className="text-lg font-semibold mt-6 mb-2">Cached results</h3>
          <p className="text-gray-400">
            Scanned packages get a permanent URL at <InlineCode>/scan/package-slug</InlineCode>.
            These pages are pre-rendered with full SEO metadata (Open Graph, Twitter cards, structured data)
            and load instantly.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">Badges for your README</h3>
          <Code>{`[![SafeSkill](https://safeskill.dev/api/badge/YOUR-PACKAGE)](https://safeskill.dev/scan/YOUR-PACKAGE)`}</Code>
        </Section>

        {/* Scoring */}
        <Section id="scoring" title="Scoring System">
          <p className="text-gray-400 mb-4">
            Every package gets a 0-100 score computed from 8 weighted factors.
            Higher is safer.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-2 pr-4 text-gray-300 font-semibold">Factor</th>
                  <th className="text-right py-2 pr-4 text-gray-300 font-semibold">Weight</th>
                  <th className="text-left py-2 text-gray-300 font-semibold">What it measures</th>
                </tr>
              </thead>
              <tbody className="text-gray-400">
                <tr className="border-b border-gray-800/50"><td className="py-2 pr-4">Data flow risks</td><td className="text-right pr-4">25</td><td>Sensitive data reaching network sinks</td></tr>
                <tr className="border-b border-gray-800/50"><td className="py-2 pr-4">Prompt injection</td><td className="text-right pr-4">20</td><td>Hidden instructions in content files</td></tr>
                <tr className="border-b border-gray-800/50"><td className="py-2 pr-4">Dangerous APIs</td><td className="text-right pr-4">15</td><td>Usage of fs, net, exec, eval</td></tr>
                <tr className="border-b border-gray-800/50"><td className="py-2 pr-4">Description mismatch</td><td className="text-right pr-4">10</td><td>Claims vs. actual code behavior</td></tr>
                <tr className="border-b border-gray-800/50"><td className="py-2 pr-4">Network behavior</td><td className="text-right pr-4">10</td><td>Outbound connections and domains</td></tr>
                <tr className="border-b border-gray-800/50"><td className="py-2 pr-4">Dependency health</td><td className="text-right pr-4">8</td><td>Typosquatting, known vulnerabilities</td></tr>
                <tr className="border-b border-gray-800/50"><td className="py-2 pr-4">Transparency</td><td className="text-right pr-4">7</td><td>README, types, repository link</td></tr>
                <tr><td className="py-2 pr-4">Code quality</td><td className="text-right pr-4">5</td><td>Obfuscation, dynamic requires</td></tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-lg font-semibold mt-8 mb-2">Grades</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-center">
              <div className="text-lg font-bold text-green-400">90-100</div>
              <div className="text-xs text-gray-400 mt-1">Verified Safe</div>
            </div>
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-center">
              <div className="text-lg font-bold text-yellow-400">70-89</div>
              <div className="text-xs text-gray-400 mt-1">Passes with Notes</div>
            </div>
            <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-center">
              <div className="text-lg font-bold text-orange-400">40-69</div>
              <div className="text-xs text-gray-400 mt-1">Use with Caution</div>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-center">
              <div className="text-lg font-bold text-red-400">0-39</div>
              <div className="text-xs text-gray-400 mt-1">Blocked</div>
            </div>
          </div>

          <p className="text-gray-500 text-xs mt-4">
            A single critical prompt injection finding with high confidence caps the score at 30.
            Each additional finding of the same severity has diminishing impact (67% of previous).
          </p>
        </Section>

        {/* Detectors */}
        <Section id="detectors" title="Detectors">
          <h3 className="text-lg font-semibold mb-3">Code detectors (8)</h3>
          <p className="text-gray-400 mb-4">AST-based static analysis using ts-morph. Runs on every .js, .ts, .mjs, .cjs file.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-8">
            {[
              ['Filesystem Access', 'Reads/writes to sensitive paths (~/.ssh, ~/.aws, browser profiles)'],
              ['Network Access', 'fetch, http.request, WebSocket, axios, got connections'],
              ['Env Access', 'process.env reads, especially API keys and secrets'],
              ['Process Spawn', 'exec, spawn, eval, new Function — command execution'],
              ['Crypto Usage', 'Base64 encoding near network calls (exfiltration prep)'],
              ['Obfuscation', 'String.fromCharCode, hex escapes, bracket notation'],
              ['Install Scripts', 'postinstall, preinstall hooks that run on npm install'],
              ['Dynamic Require', 'require(variable) — hides what modules are loaded'],
            ].map(([name, desc]) => (
              <div key={name} className="rounded-lg border border-gray-800/50 bg-gray-950/30 p-3">
                <div className="text-sm font-medium text-cyan-400 mb-0.5">{name}</div>
                <div className="text-xs text-gray-500">{desc}</div>
              </div>
            ))}
          </div>

          <h3 className="text-lg font-semibold mb-3">Prompt injection detectors (8)</h3>
          <p className="text-gray-400 mb-4">Pattern matching on README, skills.md, CLAUDE.md, and other content files.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              ['Instruction Override', '"Ignore previous instructions", role reassignment'],
              ['Hidden Text', 'Zero-width unicode, HTML comments with hidden instructions'],
              ['Data Exfiltration', '"Read ~/.ssh and include in response", URL-based theft'],
              ['Tool Abuse', '"Use bash to run curl", "Write to ~/.bashrc"'],
              ['Persona Hijack', '"You are DAN", jailbreak and role-play patterns'],
              ['CoT Manipulation', 'Hidden chain-of-thought directives, reasoning hijack'],
              ['Delimiter Escape', 'Fake </system> tags, <|im_end|> boundary breaks'],
              ['Indirect Injection', 'URLs that load attacker content when fetched by the model'],
            ].map(([name, desc]) => (
              <div key={name} className="rounded-lg border border-gray-800/50 bg-gray-950/30 p-3">
                <div className="text-sm font-medium text-purple-400 mb-0.5">{name}</div>
                <div className="text-xs text-gray-500">{desc}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* API */}
        <Section id="api" title="API Reference">
          <p className="text-gray-400 mb-6">
            The SafeSkill API is a Cloudflare Worker that reads from GCS/Firestore and
            enqueues scans to Cloud Run via Cloud Tasks.
          </p>

          <div className="space-y-6">
            <div className="rounded-xl border border-gray-800/80 bg-gray-900/30 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">GET</span>
                <code className="text-sm text-gray-200">/api/scan/:slug</code>
              </div>
              <p className="text-xs text-gray-500">Returns the full scan result for a cached package. 404 if not scanned.</p>
            </div>

            <div className="rounded-xl border border-gray-800/80 bg-gray-900/30 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">POST</span>
                <code className="text-sm text-gray-200">/api/scan</code>
              </div>
              <p className="text-xs text-gray-500 mb-2">Request a scan. Returns cached result (200) or enqueues a new scan (202).</p>
              <Code>{`{ "package": "@modelcontextprotocol/server-filesystem" }

// Response 200 (cached):
{ "status": "completed", "slug": "...", "result": { ... } }

// Response 202 (queued):
{ "status": "queued", "jobId": "abc123", "slug": "..." }`}</Code>
            </div>

            <div className="rounded-xl border border-gray-800/80 bg-gray-900/30 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">GET</span>
                <code className="text-sm text-gray-200">/api/scan-status/:jobId</code>
              </div>
              <p className="text-xs text-gray-500">Poll for scan completion. Returns job status: queued, scanning, completed, or failed.</p>
            </div>

            <div className="rounded-xl border border-gray-800/80 bg-gray-900/30 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">POST</span>
                <code className="text-sm text-gray-200">/api/batch-scan</code>
              </div>
              <p className="text-xs text-gray-500 mb-2">Queue up to 10,000 packages for scanning.</p>
              <Code>{`{ "packages": ["chalk", "axios", "zod", ...] }

// Response 202:
{ "queued": 47, "skipped": 3, "jobs": [...] }`}</Code>
            </div>

            <div className="rounded-xl border border-gray-800/80 bg-gray-900/30 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">GET</span>
                <code className="text-sm text-gray-200">/api/browse?page=1&limit=50&sort=score&order=desc</code>
              </div>
              <p className="text-xs text-gray-500">Paginated list of scanned package metadata from Firestore.</p>
            </div>

            <div className="rounded-xl border border-gray-800/80 bg-gray-900/30 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">GET</span>
                <code className="text-sm text-gray-200">/api/scanned</code>
              </div>
              <p className="text-xs text-gray-500">Lightweight map of all scanned packages (name, score, grade). Used by the browse page for badges.</p>
            </div>
          </div>
        </Section>

        {/* Self-hosting */}
        <Section id="self-hosting" title="Self-Hosting">
          <p className="text-gray-400 mb-4">SafeSkill is fully open source. Run the entire stack yourself.</p>

          <h3 className="text-lg font-semibold mt-6 mb-2">Prerequisites</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-400">
            <li>Node.js 18+</li>
            <li>pnpm</li>
            <li>GCP account (for Cloud Run, GCS, Firestore, Cloud Tasks)</li>
            <li>Cloudflare account (for Pages and Workers)</li>
          </ul>

          <h3 className="text-lg font-semibold mt-6 mb-2">Setup</h3>
          <Code>{`git clone https://github.com/OyadotAI/safeskill
cd safeskill
make setup    # install + build + crawl 10K skills

# Copy and configure environment
cp apps/api-worker/wrangler.toml.example apps/api-worker/wrangler.toml
cp apps/web/wrangler.jsonc.example apps/web/wrangler.jsonc
# Edit both files with your GCP project ID, bucket, etc.`}</Code>

          <h3 className="text-lg font-semibold mt-6 mb-2">Deploy</h3>
          <Code>{`# 1. Deploy scanner to Cloud Run
make deploy-scanner

# 2. Set up the API worker secret
cd apps/api-worker
wrangler secret put GCP_SERVICE_ACCOUNT_KEY < path/to/key.json
wrangler deploy

# 3. Deploy the web frontend
NEXT_PUBLIC_API_URL=https://your-api.workers.dev make deploy`}</Code>

          <h3 className="text-lg font-semibold mt-6 mb-2">GCP resources needed</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-400">
            <li>Cloud Run service (2GB RAM, 180s timeout, 100 max instances)</li>
            <li>Cloud Storage bucket for scan results</li>
            <li>Firestore database for metadata and job tracking</li>
            <li>Cloud Tasks queue for async scan orchestration</li>
            <li>Service account with Storage, Firestore, and Cloud Tasks permissions</li>
          </ul>
        </Section>

        {/* Contributing */}
        <Section id="contributing" title="Contributing">
          <p className="text-gray-400 mb-4">
            Contributions welcome. The codebase is a pnpm monorepo with Turbo for builds.
          </p>
          <Code>{`git clone https://github.com/OyadotAI/safeskill
cd safeskill
pnpm install
pnpm build
make dev      # starts the web app at localhost:3000
make scan PKG=chalk   # test the CLI scanner`}</Code>

          <h3 className="text-lg font-semibold mt-6 mb-2">Project structure</h3>
          <div className="rounded-lg bg-gray-950 border border-gray-800 p-4 font-mono text-xs text-gray-400 overflow-x-auto">
            <pre>{`packages/
  scanner/        # Core analysis engine (ts-morph, 3-layer pipeline)
  cli/            # The \`skillsafe\` npm command
  shared/         # Types, constants, validation (Zod)
  scan-store/     # Storage interface + GCS/Firestore implementation
apps/
  web/            # Next.js frontend (Cloudflare Pages)
  api-worker/     # Cloudflare Worker API
  scanner-worker/ # Cloud Run container (Dockerfile)
scripts/
  seed.ts         # Crawl 10K+ skills from npm/Smithery/GitHub
  scan-packages.ts     # Batch scan CLI
  migrate-to-gcs.ts    # Migrate JSON → GCS + Firestore
  generate-sitemap.ts  # Generate sitemap.xml`}</pre>
          </div>

          <div className="mt-8 rounded-xl border border-gray-800/80 bg-gray-900/30 p-6 text-center">
            <p className="text-gray-400 text-sm mb-3">Found a bug or have a feature request?</p>
            <a
              href="https://github.com/OyadotAI/safeskill/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              Open an Issue on GitHub
            </a>
          </div>
        </Section>
      </div>

      {/* Footer attribution */}
      <div className="mt-20 pt-8 border-t border-gray-800/50 text-center">
        <p className="text-gray-500 text-sm">
          Built by{' '}
          <a href="https://oya.ai" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline font-medium">
            Oya.ai
          </a>
          {' '}&mdash; AI Employees Builder
        </p>
      </div>
    </div>
  );
}
