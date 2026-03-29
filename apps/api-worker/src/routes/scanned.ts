import type { Env } from '../index.js';
import { firestoreQuery } from '../gcp-client.js';

/**
 * GET /api/scanned — returns all scanned packages as a lightweight map.
 * Used by the browse page to show badges on scanned cards.
 * Response: { [packageName]: { slug, score, grade, label, color } }
 */
export async function handleScanned(env: Env): Promise<Response> {
  const GRADE_COLORS: Record<string, string> = {
    verified: '#4caf50',
    passes: '#ffc107',
    caution: '#ff9800',
    blocked: '#f44336',
  };
  const GRADE_LABELS: Record<string, string> = {
    verified: 'Verified Safe',
    passes: 'Passes with Notes',
    caution: 'Use with Caution',
    blocked: 'Blocked',
  };

  // Fetch all scanned packages from Firestore (limit 2000 for now)
  const results = await firestoreQuery(
    env,
    'scans',
    'timestamp',
    'DESCENDING',
    2000,
    0,
  );

  const map: Record<string, {
    slug: string;
    score: number;
    grade: string;
    label: string;
    color: string;
  }> = {};

  for (const r of results) {
    const name = r.packageName as string;
    const grade = r.grade as string;
    if (name) {
      map[name] = {
        slug: r.slug as string,
        score: r.overallScore as number,
        grade,
        label: GRADE_LABELS[grade] ?? grade,
        color: GRADE_COLORS[grade] ?? '#9ca3af',
      };
    }
  }

  return new Response(JSON.stringify(map), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300', // 5 min cache
    },
  });
}
