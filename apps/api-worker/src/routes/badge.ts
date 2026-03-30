import type { Env } from '../index.js';
import { gcsGet } from '../gcp-client.js';

const GRADE_COLORS: Record<string, string> = {
  verified: '#4caf50',
  passes: '#ffc107',
  caution: '#ff9800',
  blocked: '#f44336',
};

const GRADE_LABELS: Record<string, string> = {
  verified: 'verified safe',
  passes: 'passes',
  caution: 'caution',
  blocked: 'blocked',
};

const THRESHOLDS = { VERIFIED: 90, PASSES: 70, CAUTION: 40 };

function getGrade(score: number): string {
  if (score >= THRESHOLDS.VERIFIED) return 'verified';
  if (score >= THRESHOLDS.PASSES) return 'passes';
  if (score >= THRESHOLDS.CAUTION) return 'caution';
  return 'blocked';
}

function makeBadgeSvg(score: number): string {
  const grade = getGrade(score);
  const color = GRADE_COLORS[grade];
  const label = 'safeskill';
  const value = `${score}/100 ${GRADE_LABELS[grade]}`;

  const labelWidth = 70;
  const valueWidth = Math.max(80, value.length * 7 + 10);
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

function notFoundBadge(): string {
  const label = 'safeskill';
  const value = 'not scanned';
  const labelWidth = 70;
  const valueWidth = 80;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="#9e9e9e"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

export async function handleBadge(slug: string, env: Env): Promise<Response> {
  const headers = {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const raw = await gcsGet(env, `results/${slug}.json`);
    if (!raw) {
      return new Response(notFoundBadge(), { status: 200, headers });
    }
    const result = JSON.parse(raw);
    if (!result?.overallScore && result?.overallScore !== 0) {
      return new Response(notFoundBadge(), { status: 200, headers });
    }
    return new Response(makeBadgeSvg(result.overallScore), { status: 200, headers });
  } catch {
    return new Response(notFoundBadge(), { status: 200, headers });
  }
}
