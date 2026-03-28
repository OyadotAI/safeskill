import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const REPORTS_DIR = '/tmp/safeskill-reports';

function generateId(): string {
  return crypto.randomBytes(4).toString('hex'); // 8 hex chars
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Basic validation: must look like a ScanResult
    if (
      !body ||
      typeof body.packageName !== 'string' ||
      typeof body.overallScore !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Invalid scan result payload' },
        { status: 400 },
      );
    }

    const id = generateId();

    // Ensure the reports directory exists
    await mkdir(REPORTS_DIR, { recursive: true });

    // Write the report
    const filePath = path.join(REPORTS_DIR, `${id}.json`);
    await writeFile(filePath, JSON.stringify(body), 'utf-8');

    const baseUrl = process.env.SAFESKILL_BASE_URL ?? 'https://safeskill.dev';

    return NextResponse.json({
      id,
      url: `${baseUrl}/report/${id}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SafeSkill API] Report upload error:', message);
    return NextResponse.json(
      { error: `Failed to save report: ${message}` },
      { status: 500 },
    );
  }
}
