import { ScanPageClient } from './client';

interface ScanPageProps {
  params: Promise<{ pkg: string }>;
}

export async function generateMetadata({ params }: ScanPageProps) {
  const { pkg } = await params;
  const packageName = decodeURIComponent(pkg);
  return {
    title: `${packageName} — SafeSkill Scan`,
    description: `Security scan results for ${packageName}`,
  };
}

export default async function ScanPage({ params }: ScanPageProps) {
  const { pkg } = await params;
  const packageName = decodeURIComponent(pkg);
  return <ScanPageClient packageName={packageName} />;
}
