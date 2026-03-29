/**
 * Scan a package by calling the scanner-worker Cloud Run service.
 */

import { packageToSlug } from '@safeskill/scan-store';

export interface ScanRequest {
  packageName: string;
  isGitHub: boolean;
  scannerUrl: string;
  githubToken: string;
}

export interface ScanResponse {
  success: boolean;
  score?: number;
  prUrl?: string | null;
  error?: string;
}

function nanoid(size = 21): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export async function scanAndStore(req: ScanRequest): Promise<ScanResponse> {
  const slug = packageToSlug(req.packageName);
  const jobId = `discovery-${nanoid(12)}`;

  try {
    const res = await fetch(`${req.scannerUrl}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageName: req.packageName,
        slug,
        jobId,
        createPR: req.isGitHub, // Auto-create PRs on GitHub repos
      }),
      signal: AbortSignal.timeout(180000), // 3 min timeout
    });

    const data = await res.json() as {
      status: string;
      score?: number;
      prUrl?: string | null;
      error?: string;
    };

    if (data.status === 'completed') {
      return {
        success: true,
        score: data.score,
        prUrl: data.prUrl,
      };
    }

    return {
      success: false,
      error: data.error ?? `Status: ${data.status}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
