import { NextRequest, NextResponse } from 'next/server';
import { scan } from '@safeskill/scanner';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, readFile, access } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

export const maxDuration = 60;

// Clean env to suppress pnpm-injected warnings
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.npm_config_globalconfig;
  delete env.npm_config_recursive;
  delete env.npm_config_verify_deps_before_run;
  delete env['npm_config__jsr-registry'];
  delete env.npm_config_only_built_dependencies;
  return env;
}

/**
 * Detect if input is a GitHub repo (owner/repo) vs npm package (@scope/name).
 */
function isGitHubRepo(name: string): boolean {
  // npm scoped: @scope/name
  if (name.startsWith('@')) return false;
  // GitHub: owner/name (no @ prefix, has exactly one /)
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(name)) return true;
  // GitHub URL
  if (name.includes('github.com')) return true;
  return false;
}

/**
 * Download an npm package to a temp dir via `npm pack`.
 */
async function downloadNpm(packageName: string, tempDir: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', packageName, '--pack-destination', tempDir],
    { timeout: 45000, env: cleanEnv() },
  );

  const tarball = stdout.trim().split('\n').pop()!;
  const tarballPath = path.join(tempDir, tarball);

  await execFileAsync('tar', ['xzf', tarballPath, '-C', tempDir], { timeout: 15000 });
  return path.join(tempDir, 'package');
}

/**
 * Shallow-clone a GitHub repo to a temp dir.
 */
async function cloneGitHub(repo: string, tempDir: string): Promise<string> {
  // Normalize to owner/repo
  const ownerRepo = repo
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');

  const cloneDir = path.join(tempDir, 'repo');
  const url = `https://github.com/${ownerRepo}.git`;

  await execFileAsync(
    'git',
    ['clone', '--depth', '1', '--single-branch', url, cloneDir],
    { timeout: 45000, env: cleanEnv() },
  );

  return cloneDir;
}

export async function POST(request: NextRequest) {
  let tempDir: string | null = null;

  try {
    const body = await request.json();
    const packageName = body.package;

    if (!packageName || typeof packageName !== 'string' || packageName.length > 500) {
      return NextResponse.json(
        { error: 'Missing or invalid "package" field' },
        { status: 400 },
      );
    }

    tempDir = await mkdtemp(path.join(tmpdir(), 'safeskill-web-'));

    let extractDir: string;
    const isGH = isGitHubRepo(packageName);

    if (isGH) {
      // --- GitHub repo ---
      try {
        extractDir = await cloneGitHub(packageName, tempDir);
      } catch (cloneError) {
        const msg = cloneError instanceof Error ? cloneError.message : String(cloneError);
        if (msg.includes('not found') || msg.includes('Repository not found') || msg.includes('128')) {
          return NextResponse.json(
            { error: `GitHub repo "${packageName}" not found or is private.` },
            { status: 404 },
          );
        }
        throw cloneError;
      }
    } else {
      // --- npm package ---
      try {
        extractDir = await downloadNpm(packageName, tempDir);
      } catch (packError) {
        const msg = packError instanceof Error ? packError.message : String(packError);
        if (msg.includes('E404') || msg.includes('Not found') || msg.includes('not found')) {
          return NextResponse.json(
            { error: `Package "${packageName}" not found on npm.` },
            { status: 404 },
          );
        }
        if (msg.includes('ETARGET') || msg.includes('No matching version')) {
          return NextResponse.json(
            { error: `No matching version found for "${packageName}".` },
            { status: 404 },
          );
        }
        throw packError;
      }
    }

    // Verify dir exists
    try {
      await access(extractDir);
    } catch {
      return NextResponse.json(
        { error: `Failed to download "${packageName}".` },
        { status: 500 },
      );
    }

    // Read package.json for metadata
    let pkgName = packageName;
    let pkgVersion: string | null = null;
    try {
      const raw = await readFile(path.join(extractDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(raw) as Record<string, string>;
      pkgName = pkg.name ?? packageName;
      pkgVersion = pkg.version ?? null;
    } catch {
      // use provided name (some repos/skills don't have package.json)
    }

    // Run the scanner
    const result = await scan({
      dir: extractDir,
      packageName: pkgName,
      packageVersion: pkgVersion ?? undefined,
      skipDeps: true,
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SafeSkill API] Scan error:', message);
    return NextResponse.json(
      { error: `Scan failed: ${message}` },
      { status: 500 },
    );
  } finally {
    if (tempDir) {
      rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'Use POST with { "package": "<name>" }',
      example: {
        method: 'POST',
        body: { package: '@modelcontextprotocol/server-filesystem' },
        github: { package: 'owner/repo' },
      },
    },
    { status: 405 },
  );
}
