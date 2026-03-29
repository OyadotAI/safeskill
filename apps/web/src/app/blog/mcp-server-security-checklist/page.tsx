import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'The MCP Server Security Checklist — SafeSkill',
  description: 'A practical checklist for MCP server developers to build secure tools and get verified by SafeSkill.',
  openGraph: {
    title: 'The MCP Server Security Checklist',
    description: '15-point security checklist for MCP server developers.',
    type: 'article',
    publishedTime: '2026-03-28T00:00:00Z',
  },
};

export default function BlogPost() {
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      <header className="mb-12">
        <div className="flex items-center gap-3 mb-6 text-sm text-gray-500">
          <time dateTime="2026-03-28">March 28, 2026</time>
          <span className="text-gray-700">|</span>
          <span>SafeSkill Team</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
          The MCP Server{' '}
          <span className="text-gradient">Security Checklist</span>
        </h1>
        <p className="text-xl text-gray-400 leading-relaxed">
          Building an MCP server? Here&apos;s how to make it secure, trustworthy, and verified by SafeSkill.
        </p>
      </header>

      <div className="space-y-8 text-gray-300 leading-relaxed">

        <p>
          If you publish an MCP server, people are trusting you with access to their machine. Here&apos;s
          how to earn that trust.
        </p>

        <h2 className="text-2xl font-bold text-gray-100 mt-12 mb-4">Code Security</h2>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">1.</span>
              <div>
                <h3 className="font-semibold text-gray-200">Only access files you need</h3>
                <p className="text-sm text-gray-400 mt-1">Restrict filesystem access to the project directory. Never access ~/.ssh, ~/.aws, ~/.gnupg, or browser profile directories unless that&apos;s the explicit purpose of your tool.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">2.</span>
              <div>
                <h3 className="font-semibold text-gray-200">Declare your network calls</h3>
                <p className="text-sm text-gray-400 mt-1">If your server makes HTTP requests, document exactly which domains it talks to and why. Unexpected network calls are the #1 red flag.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">3.</span>
              <div>
                <h3 className="font-semibold text-gray-200">Don&apos;t read env vars you don&apos;t need</h3>
                <p className="text-sm text-gray-400 mt-1">Access only the specific env vars your tool requires. Never bulk-read <code className="text-emerald-400/70 bg-gray-950 px-1 rounded text-xs">process.env</code> or <code className="text-emerald-400/70 bg-gray-950 px-1 rounded text-xs">Object.keys(process.env)</code>.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">4.</span>
              <div>
                <h3 className="font-semibold text-gray-200">Avoid child_process unless necessary</h3>
                <p className="text-sm text-gray-400 mt-1">exec(), spawn(), and eval() are automatic critical findings. If you must use them, document why and never pass user input directly.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">5.</span>
              <div>
                <h3 className="font-semibold text-gray-200">No install scripts</h3>
                <p className="text-sm text-gray-400 mt-1">Remove preinstall/postinstall scripts from package.json. They run automatically and are a common attack vector.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">6.</span>
              <div>
                <h3 className="font-semibold text-gray-200">Don&apos;t obfuscate</h3>
                <p className="text-sm text-gray-400 mt-1">Ship readable source. Obfuscated code (String.fromCharCode, eval chains, hex escapes) is an automatic critical flag. If you&apos;re not hiding anything, don&apos;t minify your source.</p>
              </div>
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-100 mt-12 mb-4">Content Security</h2>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">7.</span>
              <div>
                <h3 className="font-semibold text-gray-200">No hidden text in markdown</h3>
                <p className="text-sm text-gray-400 mt-1">Don&apos;t use HTML comments for instructions. Don&apos;t use zero-width unicode characters. Everything the AI reads should be visible to the user.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">8.</span>
              <div>
                <h3 className="font-semibold text-gray-200">Match your description to your code</h3>
                <p className="text-sm text-gray-400 mt-1">If your README says &quot;no network access&quot; but your code imports fetch, SafeSkill will flag it. Be honest about what your tool does.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">9.</span>
              <div>
                <h3 className="font-semibold text-gray-200">Don&apos;t reference external URLs in instructions</h3>
                <p className="text-sm text-gray-400 mt-1">Instruction files that tell the AI to fetch content from external URLs are flagged as indirect injection vectors.</p>
              </div>
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-100 mt-12 mb-4">Transparency</h2>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">10.</span>
              <div>
                <h3 className="font-semibold text-gray-200">Include a README</h3>
                <p className="text-sm text-gray-400 mt-1">Explain what your tool does, what it accesses, and why. Missing READMEs reduce your trust score.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">11.</span>
              <div>
                <h3 className="font-semibold text-gray-200">Link your repository</h3>
                <p className="text-sm text-gray-400 mt-1">Add a <code className="text-emerald-400/70 bg-gray-950 px-1 rounded text-xs">repository</code> field to package.json. Open source = higher trust score.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">12.</span>
              <div>
                <h3 className="font-semibold text-gray-200">Ship TypeScript types</h3>
                <p className="text-sm text-gray-400 mt-1">Add a <code className="text-emerald-400/70 bg-gray-950 px-1 rounded text-xs">types</code> field. Typed packages are more transparent and get a trust bonus.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
            <div className="flex gap-3">
              <span className="text-emerald-400 font-bold shrink-0">13.</span>
              <div>
                <h3 className="font-semibold text-gray-200">Minimize dependencies</h3>
                <p className="text-sm text-gray-400 mt-1">Every dependency is attack surface. Packages with 50+ deps get a score penalty. 100+ deps get a bigger one.</p>
              </div>
            </div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-gray-100 mt-12 mb-4">Verify Your Score</h2>

        <div className="rounded-xl border border-gray-700/80 bg-gray-950 overflow-hidden my-8">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-gray-900/50">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
            </div>
            <span className="text-xs text-gray-500">Terminal</span>
          </div>
          <div className="p-4 font-mono text-sm space-y-2">
            <div>
              <span className="text-emerald-400 select-none">$ </span>
              <span className="text-gray-50">npx skillsafe scan .</span>
              <span className="text-gray-600 ml-4"># scan your local project</span>
            </div>
          </div>
        </div>

        <p>Score 90+ to earn the <strong className="text-emerald-400">Verified Safe</strong> badge for your README:</p>

        <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4 my-6 font-mono text-xs text-gray-400 overflow-x-auto">
          [![SafeSkill](https://safeskill.dev/api/badge/YOUR-PACKAGE)](https://safeskill.dev/scan?pkg=YOUR-PACKAGE)
        </div>

        <div className="flex gap-4 my-8">
          <Link href="/browse" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors">
            Browse 10K+ Skills
          </Link>
          <a href="https://github.com/OyadotAI/safeskill" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-gray-700 hover:border-gray-600 text-gray-300 font-medium transition-colors">
            GitHub
          </a>
        </div>
      </div>
    </article>
  );
}
