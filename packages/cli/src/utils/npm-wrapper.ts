import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);

export interface ResolvedPackage {
  dir: string;
  packageName: string;
  packageVersion: string | null;
  cleanup: (() => Promise<void>) | null;
}

/**
 * Resolves a package argument to a scannable directory.
 * - If it's a local path (starts with . or /), use it directly
 * - If it's an npm package name, download and extract it to a temp dir
 */
export async function resolvePackage(pkg: string): Promise<ResolvedPackage> {
  // Local directory
  if (pkg.startsWith('.') || pkg.startsWith('/') || pkg.startsWith('~')) {
    const resolved = path.resolve(pkg);
    if (!existsSync(resolved)) {
      throw new Error(`Directory not found: ${resolved}`);
    }

    let packageName = 'local';
    let packageVersion: string | null = null;

    try {
      const pkgJson = await import(path.join(resolved, 'package.json'), { with: { type: 'json' } });
      packageName = pkgJson.default?.name ?? 'local';
      packageVersion = pkgJson.default?.version ?? null;
    } catch {
      // no package.json
    }

    return { dir: resolved, packageName, packageVersion, cleanup: null };
  }

  // npm package — download to temp dir
  const tempDir = await mkdtemp(path.join(tmpdir(), 'safeskill-'));

  try {
    // Use npm pack to download the package
    const { stdout } = await execFileAsync('npm', ['pack', pkg, '--pack-destination', tempDir], {
      timeout: 60000,
    });

    const tarball = stdout.trim().split('\n').pop()!;
    const tarballPath = path.join(tempDir, tarball);

    // Extract the tarball
    const extractDir = path.join(tempDir, 'package');
    await execFileAsync('tar', ['xzf', tarballPath, '-C', tempDir], { timeout: 30000 });

    // npm pack extracts to a 'package' directory
    let packageName = pkg;
    let packageVersion: string | null = null;

    try {
      const pkgJsonPath = path.join(extractDir, 'package.json');
      const { readFile } = await import('fs/promises');
      const raw = await readFile(pkgJsonPath, 'utf-8');
      const pkgJson = JSON.parse(raw) as Record<string, string>;
      packageName = pkgJson.name ?? pkg;
      packageVersion = pkgJson.version ?? null;
    } catch {
      // use provided name
    }

    const cleanup = async () => {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
    };

    return { dir: extractDir, packageName, packageVersion, cleanup };
  } catch (error) {
    // Cleanup on failure
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    throw new Error(`Failed to download package "${pkg}": ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Run npx with the given package.
 */
export async function runNpx(pkg: string): Promise<void> {
  const { execFileSync } = await import('child_process');
  execFileSync('npx', [pkg], {
    timeout: 120000,
    stdio: 'inherit',
  });
}
