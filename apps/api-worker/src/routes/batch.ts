import type { Env } from '../index.js';
import { gcsGet, firestorePut, enqueueCloudTask } from '../gcp-client.js';

function packageToSlug(name: string): string {
  return name.replace(/^@/, '').replace(/\//g, '-').replace(/[^a-z0-9\-._]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function nanoid(size = 21): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

/** POST /api/batch-scan — enqueue many packages for scanning. */
export async function handleBatchScan(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { packages?: string[] };
  const packages = body.packages;

  if (!packages || !Array.isArray(packages) || packages.length === 0) {
    return json({ error: 'Missing "packages" array' }, 400);
  }

  if (packages.length > 10000) {
    return json({ error: 'Maximum 10,000 packages per batch' }, 400);
  }

  const jobs: Array<{ jobId: string; package: string; slug: string }> = [];
  let skipped = 0;

  // Process in batches of 50 to avoid hitting rate limits
  for (let i = 0; i < packages.length; i += 50) {
    const batch = packages.slice(i, i + 50);

    await Promise.all(
      batch.map(async (pkg) => {
        const slug = packageToSlug(pkg);

        // Check if already scanned
        const existing = await gcsGet(env, `results/${slug}.json`);
        if (existing) {
          skipped++;
          return;
        }

        const jobId = nanoid();

        await firestorePut(env, 'jobs', jobId, {
          jobId,
          packageName: pkg,
          slug,
          status: 'queued',
          createdAt: Date.now(),
        });

        await enqueueCloudTask(env, { packageName: pkg, slug, jobId });

        jobs.push({ jobId, package: pkg, slug });
      }),
    );
  }

  return json({
    queued: jobs.length,
    skipped,
    total: packages.length,
    jobs,
  }, 202);
}
