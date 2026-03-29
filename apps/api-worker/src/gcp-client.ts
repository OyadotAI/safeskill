import type { Env } from './index.js';

/**
 * Minimal GCP REST client for Cloudflare Workers.
 * Uses service account key JSON for auth (stored as CF secret).
 */

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

let cachedToken: { token: string; expires: number } | null = null;

/** Get an OAuth2 access token using a service account key. */
async function getAccessToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60000) {
    return cachedToken.token;
  }

  const key: ServiceAccountKey = JSON.parse(env.GCP_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);

  // Create JWT
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  }));

  const signInput = `${header}.${payload}`;

  // Import the private key and sign
  const pemBody = key.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signInput),
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const jwt = `${header}.${payload}.${sig}`;

  // Exchange JWT for access token
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

// --- GCS ---

export async function gcsGet(env: Env, objectPath: string): Promise<string | null> {
  const token = await getAccessToken(env);
  const url = `https://storage.googleapis.com/storage/v1/b/${env.GCS_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.text();
}

export async function gcsPut(env: Env, objectPath: string, data: string): Promise<void> {
  const token = await getAccessToken(env);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${env.GCS_BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;

  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: data,
  });
}

// --- Firestore ---

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1';

function firestoreDocUrl(env: Env, collection: string, docId: string): string {
  return `${FIRESTORE_BASE}/projects/${env.GCP_PROJECT}/databases/(default)/documents/${collection}/${docId}`;
}

function firestoreQueryUrl(env: Env): string {
  return `${FIRESTORE_BASE}/projects/${env.GCP_PROJECT}/databases/(default)/documents:runQuery`;
}

/** Convert a plain object to Firestore value format. */
function toFirestoreFields(obj: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') fields[key] = { stringValue: value };
    else if (typeof value === 'number') {
      fields[key] = Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    }
    else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
    else if (value === null || value === undefined) fields[key] = { nullValue: null };
    else fields[key] = { stringValue: JSON.stringify(value) };
  }
  return fields;
}

/** Convert Firestore fields back to a plain object. */
function fromFirestoreFields(fields: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if ('stringValue' in value) obj[key] = value.stringValue;
    else if ('integerValue' in value) obj[key] = parseInt(value.integerValue as string, 10);
    else if ('doubleValue' in value) obj[key] = value.doubleValue;
    else if ('booleanValue' in value) obj[key] = value.booleanValue;
    else if ('nullValue' in value) obj[key] = null;
    else obj[key] = null;
  }
  return obj;
}

export async function firestoreGet(env: Env, collection: string, docId: string): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken(env);
  const url = firestoreDocUrl(env, collection, docId);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const doc = await res.json() as { fields?: Record<string, Record<string, unknown>> };
  if (!doc.fields) return null;
  return fromFirestoreFields(doc.fields);
}

export async function firestorePut(env: Env, collection: string, docId: string, data: Record<string, unknown>): Promise<void> {
  const token = await getAccessToken(env);
  const url = firestoreDocUrl(env, collection, docId);
  await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
}

export async function firestoreQuery(
  env: Env,
  collection: string,
  orderBy: string,
  direction: 'ASCENDING' | 'DESCENDING',
  limit: number,
  offset: number,
): Promise<Record<string, unknown>[]> {
  const token = await getAccessToken(env);
  const url = firestoreQueryUrl(env);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        orderBy: [{ field: { fieldPath: orderBy }, direction }],
        limit: limit,
        offset,
      },
    }),
  });

  const results = await res.json() as Array<{ document?: { fields?: Record<string, Record<string, unknown>> } }>;
  return results
    .filter((r) => r.document?.fields)
    .map((r) => fromFirestoreFields(r.document!.fields!));
}

// --- Cloud Tasks ---

export async function enqueueCloudTask(
  env: Env,
  payload: { packageName: string; slug: string; jobId: string },
): Promise<void> {
  const token = await getAccessToken(env);
  const url = `https://cloudtasks.googleapis.com/v2/${env.CLOUD_TASKS_QUEUE}/tasks`;

  const body = {
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url: `${env.SCANNER_URL}/scan`,
        headers: { 'Content-Type': 'application/json' },
        body: btoa(JSON.stringify(payload)),
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to enqueue task: ${err}`);
  }
}
