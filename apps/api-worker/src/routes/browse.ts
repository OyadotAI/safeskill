import type { Env } from '../index.js';
import { firestoreQuery } from '../gcp-client.js';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

/** GET /api/browse?page=1&limit=50&sort=score&order=desc */
export async function handleBrowse(url: URL, env: Env): Promise<Response> {
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
  const sort = url.searchParams.get('sort') ?? 'timestamp';
  const order = url.searchParams.get('order') ?? 'desc';
  const offset = (page - 1) * limit;

  const sortField = sort === 'score' ? 'overallScore'
    : sort === 'name' ? 'packageName'
    : 'timestamp';
  const direction = order === 'asc' ? 'ASCENDING' : 'DESCENDING';

  const entries = await firestoreQuery(env, 'scans', sortField, direction as 'ASCENDING' | 'DESCENDING', limit, offset);

  return json({
    entries,
    page,
    limit,
  });
}
