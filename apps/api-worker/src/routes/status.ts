import type { Env } from '../index.js';
import { firestoreGet } from '../gcp-client.js';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

/** GET /api/scan-status/:jobId */
export async function handleStatus(jobId: string, env: Env): Promise<Response> {
  const job = await firestoreGet(env, 'jobs', jobId);

  if (!job) {
    return json({ error: 'Job not found' }, 404);
  }

  return json(job);
}
