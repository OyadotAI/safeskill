import { handleScan, handleScanPost } from './routes/scan.js';
import { handleStatus } from './routes/status.js';
import { handleBatchScan } from './routes/batch.js';
import { handleBrowse } from './routes/browse.js';
import { handleScanned } from './routes/scanned.js';
import { handleBadge } from './routes/badge.js';

export interface Env {
  GCS_BUCKET: string;
  GCP_PROJECT: string;
  GCP_SERVICE_ACCOUNT_KEY: string;
  SCANNER_URL: string;
  CLOUD_TASKS_QUEUE: string;
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
      // GET /api/scan/:slug — fetch cached result
      const scanMatch = path.match(/^\/api\/scan\/([a-z0-9\-._]+)$/i);
      if (scanMatch && request.method === 'GET') {
        return handleScan(scanMatch[1], env);
      }

      // POST /api/scan — request a new scan
      if (path === '/api/scan' && request.method === 'POST') {
        return handleScanPost(request, env);
      }

      // GET /api/scan-status/:jobId
      const statusMatch = path.match(/^\/api\/scan-status\/([a-zA-Z0-9_-]+)$/);
      if (statusMatch && request.method === 'GET') {
        return handleStatus(statusMatch[1], env);
      }

      // POST /api/batch-scan
      if (path === '/api/batch-scan' && request.method === 'POST') {
        return handleBatchScan(request, env);
      }

      // GET /api/browse
      if (path === '/api/browse' && request.method === 'GET') {
        return handleBrowse(url, env);
      }

      // GET /api/scanned — lightweight map of all scanned packages
      if (path === '/api/scanned' && request.method === 'GET') {
        return handleScanned(env);
      }

      // GET /api/badge/:slug — SVG badge image
      const badgeMatch = path.match(/^\/api\/badge\/([a-z0-9\-._]+)$/i);
      if (badgeMatch && request.method === 'GET') {
        return handleBadge(badgeMatch[1], env);
      }

      // Health
      if (path === '/api/health') {
        return jsonResponse({ status: 'ok' });
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: msg }, 500);
    }
  },
};
