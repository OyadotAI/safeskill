import { NextRequest, NextResponse } from 'next/server';
import { getGrade, GRADE_LABELS } from '@safeskill/shared';
import { scan } from '@safeskill/scanner';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

const GRADE_BADGE_COLORS: Record<string, string> = {
  verified: 'brightgreen',
  passes: 'yellow',
  caution: 'orange',
  blocked: 'red',
};

// Simple in-memory cache so we don't re-scan on every badge request
const cache = new Map<string, { score: number; timestamp: number }>();
const CACHE_TTL = 3600_000; // 1 hour

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.npm_config_globalconfig;
  delete env.npm_config_recursive;
  delete env.npm_config_verify_deps_before_run;
  delete env['npm_config__jsr-registry'];
  delete env.npm_config_only_built_dependencies;
  return env;
}

function isGitHubRepo(name: string): boolean {
  if (name.startsWith('@')) return false;
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(name)) return true;
  return false;
}

async function getScore(packageName: string): Promise<number | null> {
  // Check cache
  const cached = cache.get(packageName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.score;
  }

  let tempDir: string | null = null;
  try {
    tempDir = await mkdtemp(path.join(tmpdir(), 'safeskill-badge-'));
    let extractDir: string;

    if (isGitHubRepo(packageName)) {
      extractDir = path.join(tempDir, 'repo');
      const url = `https://github.com/${packageName}.git`;
      await execFileAsync('git', ['clone', '--depth', '1', '--single-branch', url, extractDir], {
        timeout: 30000, env: cleanEnv(),
      });
    } else {
      const { stdout } = await execFileAsync('npm', ['pack', packageName, '--pack-destination', tempDir], {
        timeout: 30000, env: cleanEnv(),
      });
      const tarball = stdout.trim().split('\n').pop()!;
      await execFileAsync('tar', ['xzf', path.join(tempDir, tarball), '-C', tempDir], { timeout: 10000 });
      extractDir = path.join(tempDir, 'package');
    }

    const result = await scan({
      dir: extractDir,
      packageName,
      skipDeps: true,
    });

    cache.set(packageName, { score: result.overallScore, timestamp: Date.now() });
    return result.overallScore;
  } catch {
    return null;
  } finally {
    if (tempDir) rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const packageName = decodeURIComponent(slug);

  const score = await getScore(packageName);

  let badge;
  if (score === null) {
    badge = {
      schemaVersion: 1,
      label: 'SafeSkill',
      message: 'not scanned',
      color: 'lightgrey',
    };
  } else {
    const grade = getGrade(score);
    badge = {
      schemaVersion: 1,
      label: 'SafeSkill',
      message: `${score}/100 ${GRADE_LABELS[grade]}`,
      color: GRADE_BADGE_COLORS[grade] ?? 'lightgrey',
    };
  }

  return NextResponse.json(badge, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
