import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Blog — SafeSkill',
  description: 'Articles about AI tool security, prompt injection, and the SafeSkill scanner.',
};

const POSTS = [
  {
    slug: 'we-scanned-10k-skills',
    title: 'We Scanned 10,000+ AI Tool Skills. Here\'s What We Found.',
    date: '2026-03-28',
    description: 'We crawled npm, Smithery, and GitHub to index 10,121 AI tool plugins. We scanned them for code exploits and prompt injection. The results are alarming.',
    tags: ['research', 'mcp', 'prompt-injection'],
  },
  {
    slug: 'how-skills-md-steals-your-ssh-keys',
    title: 'How a skills.md File Can Steal Your SSH Keys',
    date: '2026-03-28',
    description: 'No malicious code needed. A single markdown file with hidden instructions can make your AI exfiltrate credentials through its own response.',
    tags: ['security', 'prompt-injection', 'tutorial'],
  },
  {
    slug: 'mcp-server-security-checklist',
    title: 'The MCP Server Security Checklist',
    date: '2026-03-28',
    description: 'A practical checklist for MCP server developers to make their tools secure and get verified by SafeSkill.',
    tags: ['mcp', 'best-practices', 'checklist'],
  },
];

export default function BlogIndex() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      <h1 className="text-4xl font-bold tracking-tight mb-4">Blog</h1>
      <p className="text-gray-400 mb-12">Research, tutorials, and updates on AI tool security.</p>

      <div className="space-y-8">
        {POSTS.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="block group rounded-xl border border-gray-800/80 bg-gray-900/30 hover:bg-gray-900/60 hover:border-gray-700/80 p-6 transition-all"
          >
            <div className="flex items-center gap-3 mb-3 text-sm text-gray-500">
              <time dateTime={post.date}>{new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
              <div className="flex gap-2">
                {post.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded border border-gray-700/50 bg-gray-800/30 text-gray-500">{tag}</span>
                ))}
              </div>
            </div>
            <h2 className="text-xl font-semibold text-gray-200 group-hover:text-emerald-400 transition-colors mb-2">
              {post.title}
            </h2>
            <p className="text-gray-400 text-sm leading-relaxed">{post.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
