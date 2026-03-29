import type { Env } from '../index.js';
import { gcsGet, firestoreGet, firestorePut, enqueueCloudTask } from '../gcp-client.js';

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

/** GET /api/scan/:slug — return cached result. */
export async function handleScan(slug: string, env: Env): Promise<Response> {
  // Try GCS for full result
  const result = await gcsGet(env, `results/${slug}.json`);
  if (result) {
    return new Response(result, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  // Check if there's a pending job in Firestore
  const meta = await firestoreGet(env, 'scans', slug);
  if (meta) {
    // Meta exists but GCS result is missing — stale state, return meta
    return json(meta);
  }

  return json({ error: 'not_found', slug }, 404);
}

/** POST /api/scan — request a scan (returns cached or enqueues). */
export async function handleScanPost(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { package?: string };
  const packageName = body.package?.trim();

  if (!packageName) {
    return json({ error: 'Missing "package" field' }, 400);
  }

  // Validate: npm package (@scope/name, name) or GitHub repo (owner/repo)
  const isNpm = /^(@[a-z0-9\-~][a-z0-9\-._~]*\/)?[a-z0-9\-~][a-z0-9\-._~]*$/i.test(packageName);
  const isGitHub = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(packageName) && !packageName.startsWith('@');
  if (!isNpm && !isGitHub) {
    return json({ error: 'Invalid package name. Use npm package name or GitHub owner/repo.' }, 400);
  }

  const slug = packageToSlug(packageName);

  // Check if already scanned
  const existing = await gcsGet(env, `results/${slug}.json`);
  if (existing) {
    return json({ status: 'completed', slug, result: JSON.parse(existing) });
  }

  // Check if already queued
  const meta = await firestoreGet(env, 'scans', slug);
  if (meta && meta.overallScore != null) {
    // Has metadata but somehow GCS is missing — return what we have
    return json({ status: 'completed', slug, meta });
  }

  // Enqueue a new scan
  const jobId = nanoid();

  await firestorePut(env, 'jobs', jobId, {
    jobId,
    packageName,
    slug,
    status: 'queued',
    createdAt: Date.now(),
  });

  await enqueueCloudTask(env, { packageName, slug, jobId });

  return json({ status: 'queued', jobId, slug }, 202);
}
