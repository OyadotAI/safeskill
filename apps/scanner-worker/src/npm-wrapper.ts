import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

export interface ResolvedPackage {
  dir: string;
  packageName: string;
  packageVersion: string | null;
  cleanup: (() => Promise<void>) | null;
}

/**
 * Check if a string looks like a GitHub repo (owner/repo).
 */
function isGitHubRepo(pkg: string): boolean {
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(pkg) && !pkg.startsWith('@');
}

/**
 * Clone a GitHub repo to a temp directory.
 */
async function resolveGitHubRepo(repo: string): Promise<ResolvedPackage> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'safeskill-gh-'));
  const cloneDir = path.join(tempDir, 'repo');

  try {
    await execFileAsync('git', [
      'clone',
      '--depth', '1',
      `https://github.com/${repo}.git`,
      cloneDir,
    ], { timeout: 60000 });

    let packageName = repo;
    let packageVersion: string | null = null;

    // Try to read package.json for metadata
    const pkgJsonPath = path.join(cloneDir, 'package.json');
    if (existsSync(pkgJsonPath)) {
      try {
        const raw = await readFile(pkgJsonPath, 'utf-8');
        const pkgJson = JSON.parse(raw) as Record<string, string>;
        packageName = pkgJson.name ?? repo;
        packageVersion = pkgJson.version ?? null;
      } catch {
        // use repo name
      }
    }

    const cleanup = async () => {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch { /* best effort */ }
    };

    return { dir: cloneDir, packageName, packageVersion, cleanup };
  } catch (error) {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
    throw new Error(`Failed to clone "github.com/${repo}": ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Download an npm package to a temp directory and extract it.
 */
async function resolveNpmPackage(pkg: string): Promise<ResolvedPackage> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'safeskill-'));

  try {
    const { stdout } = await execFileAsync('npm', ['pack', pkg, '--pack-destination', tempDir], {
      timeout: 60000,
    });

    const tarball = stdout.trim().split('\n').pop()!;
    const tarballPath = path.join(tempDir, tarball);

    await execFileAsync('tar', ['xzf', tarballPath, '-C', tempDir], { timeout: 30000 });

    const extractDir = path.join(tempDir, 'package');

    let packageName = pkg;
    let packageVersion: string | null = null;

    try {
      const raw = await readFile(path.join(extractDir, 'package.json'), 'utf-8');
      const pkgJson = JSON.parse(raw) as Record<string, string>;
      packageName = pkgJson.name ?? pkg;
      packageVersion = pkgJson.version ?? null;
    } catch {
      // use provided name
    }

    const cleanup = async () => {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch { /* best effort */ }
    };

    return { dir: extractDir, packageName, packageVersion, cleanup };
  } catch (error) {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
    throw new Error(`Failed to download "${pkg}": ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Resolve a package to a scannable directory.
 * Supports npm packages (@scope/name, name) and GitHub repos (owner/repo).
 */
export async function resolvePackage(pkg: string): Promise<ResolvedPackage> {
  if (isGitHubRepo(pkg)) {
    return resolveGitHubRepo(pkg);
  }
  return resolveNpmPackage(pkg);
}
