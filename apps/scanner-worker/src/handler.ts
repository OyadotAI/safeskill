import express from 'express';
import { scan } from '@safeskill/scanner';
import { GcpScanStore } from '@safeskill/scan-store/gcp';
import { packageToSlug } from '@safeskill/scan-store';
import { resolvePackage } from './npm-wrapper.js';
import { createScanPR } from './github-pr.js';

const app = express();
app.use(express.json());

const store = new GcpScanStore({
  bucket: process.env.GCS_BUCKET ?? '',
  projectId: process.env.GCP_PROJECT ?? '',
});

/**
 * Cloud Tasks sends an HTTP POST with the scan job payload.
 * This handler downloads the package, scans it, and stores the result.
 */
app.post('/scan', async (req, res) => {
  const { packageName, slug, jobId } = req.body as {
    packageName: string;
    slug: string;
    jobId: string;
  };

  if (!packageName || !slug || !jobId) {
    res.status(400).json({ error: 'Missing packageName, slug, or jobId' });
    return;
  }

  console.log(`[${jobId}] Scanning ${packageName} (slug: ${slug})`);

  // Update job status → scanning
  await store.putJob({
    jobId,
    packageName,
    slug,
    status: 'scanning',
    createdAt: Date.now(),
  });

  let cleanup: (() => Promise<void>) | null = null;

  try {
    // Download and extract package
    const resolved = await resolvePackage(packageName);
    cleanup = resolved.cleanup;

    // Run the scanner
    const result = await scan({
      dir: resolved.dir,
      packageName: resolved.packageName,
      packageVersion: resolved.packageVersion ?? undefined,
      skipDeps: true,
    });

    // Store result in GCS + Firestore
    await store.putResult(slug, result);

    // Update job status → completed
    await store.putJob({
      jobId,
      packageName,
      slug,
      status: 'completed',
      createdAt: Date.now(),
      completedAt: Date.now(),
    });

    console.log(`[${jobId}] Completed: ${result.overallScore}/100`);

    // For GitHub repos, create a PR with the badge
    const githubToken = process.env.GITHUB_TOKEN;
    const isGitHubRepo = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(packageName) && !packageName.startsWith('@');
    let prUrl: string | null = null;

    if (isGitHubRepo && githubToken) {
      try {
        prUrl = await createScanPR(packageName, slug, result, githubToken);
        if (prUrl) console.log(`[${jobId}] PR created: ${prUrl}`);
      } catch (e) {
        console.log(`[${jobId}] PR creation skipped: ${e instanceof Error ? e.message : e}`);
      }
    }

    res.status(200).json({ status: 'completed', score: result.overallScore, prUrl });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[${jobId}] Failed: ${msg}`);

    await store.putJob({
      jobId,
      packageName,
      slug,
      status: 'failed',
      createdAt: Date.now(),
      completedAt: Date.now(),
      error: msg,
    });

    res.status(500).json({ status: 'failed', error: msg });
  } finally {
    if (cleanup) {
      try { await cleanup(); } catch { /* best effort */ }
    }
  }
});

// Health check
app.get('/', (_req, res) => {
  res.json({ service: 'safeskill-scanner', status: 'ok' });
});

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, () => {
  console.log(`Scanner worker listening on port ${PORT}`);
});
