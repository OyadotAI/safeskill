import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'SafeSkill — Trust layer for AI tools',
  description:
    'Scan AI skills and MCP servers for code exploits, prompt injection, and data exfiltration before you install them.',
  keywords: ['AI safety', 'MCP', 'prompt injection', 'code scanning', 'AI tools', 'MCP server security', 'Claude Code skills', 'OpenClaw', 'npm security'],
  metadataBase: new URL('https://safeskill.dev'),
  openGraph: {
    title: 'SafeSkill — Trust layer for AI tools',
    description: 'Scan 10,000+ AI skills for code exploits and prompt injection. One command, under 3 seconds.',
    url: 'https://safeskill.dev',
    siteName: 'SafeSkill',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SafeSkill — Your AI tools can read your SSH keys. We check if they do.',
    description: 'Scan 10,000+ AI skills for code exploits and prompt injection. npx skillsafe scan <package>',
  },
  alternates: {
    canonical: 'https://safeskill.dev',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans bg-gray-950 text-gray-50 min-h-screen flex flex-col`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'SafeSkill',
              applicationCategory: 'DeveloperApplication',
              operatingSystem: 'Any',
              description: 'Scan AI tool skills for security risks and prompt injection before you install. Indexes 10,000+ MCP servers, Claude skills, and OpenClaw tools.',
              url: 'https://safeskill.dev',
              downloadUrl: 'https://www.npmjs.com/package/skillsafe',
              softwareVersion: '0.2.2',
              author: { '@type': 'Organization', name: 'OyadotAI', url: 'https://github.com/OyadotAI' },
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            }),
          }}
        />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
