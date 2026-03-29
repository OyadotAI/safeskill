import type { ScanResult } from '@safeskill/shared';

const GITHUB_API = 'https://api.github.com';
const BOT_NAME = 'SafeSkill Scanner';

interface GitHubHeaders {
  Authorization: string;
  Accept: string;
  'User-Agent': string;
  'X-GitHub-Api-Version': string;
  'Content-Type'?: string;
}

function headers(token: string): GitHubHeaders {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SafeSkill-Scanner/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function ghFetch(url: string, token: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...opts,
    headers: { ...headers(token), ...(opts.headers as Record<string, string> ?? {}) },
  });
}

function getGradeEmoji(score: number): string {
  if (score >= 90) return '✅';
  if (score >= 70) return '⚠️';
  if (score >= 40) return '🟠';
  return '🔴';
}

function getGradeLabel(score: number): string {
  if (score >= 90) return 'Verified Safe';
  if (score >= 70) return 'Passes with Notes';
  if (score >= 40) return 'Use with Caution';
  return 'Blocked';
}

function getBadgeColor(score: number): string {
  if (score >= 90) return 'brightgreen';
  if (score >= 70) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

function buildBadgeMarkdown(slug: string, result: ScanResult): string {
  const color = getBadgeColor(result.overallScore);
  const label = getGradeLabel(result.overallScore);
  return `[![SafeSkill ${result.overallScore}/100](https://img.shields.io/badge/SafeSkill-${result.overallScore}%2F100_${encodeURIComponent(label)}-${color})](https://safeskill.dev/scan/${slug})`;
}

function buildPRBody(slug: string, result: ScanResult): string {
  const emoji = getGradeEmoji(result.overallScore);
  const label = getGradeLabel(result.overallScore);
  const totalFindings = result.codeFindings.length + result.promptFindings.length;
  const criticalCount = [...result.codeFindings, ...result.promptFindings].filter(f => f.severity === 'critical').length;
  const highCount = [...result.codeFindings, ...result.promptFindings].filter(f => f.severity === 'high').length;

  let findingsSummary = `${totalFindings} finding${totalFindings !== 1 ? 's' : ''} detected`;
  if (criticalCount > 0) findingsSummary += ` (${criticalCount} critical)`;
  else if (highCount > 0) findingsSummary += ` (${highCount} high)`;

  let body = `## ${emoji} SafeSkill Security Scan Results\n\n`;
  body += `| Metric | Value |\n|:-------|:------|\n`;
  body += `| **Overall Score** | **${result.overallScore}/100** (${label}) |\n`;
  body += `| Code Score | ${result.codeScore}/100 |\n`;
  body += `| Content Score | ${result.contentScore}/100 |\n`;
  body += `| Findings | ${findingsSummary} |\n`;
  body += `| Taint Flows | ${result.taintFlows.length} |\n`;
  body += `| Files Scanned | ${result.filesScanned} |\n`;
  body += `| Scan Duration | ${(result.duration / 1000).toFixed(1)}s |\n\n`;

  if (totalFindings > 0) {
    body += `### Top Findings\n\n`;
    const top = [...result.codeFindings, ...result.promptFindings]
      .sort((a, b) => {
        const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return (sevOrder[a.severity] ?? 5) - (sevOrder[b.severity] ?? 5);
      })
      .slice(0, 5);

    for (const f of top) {
      const sevEmoji = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : f.severity === 'medium' ? '🟡' : '⚪';
      body += `- ${sevEmoji} **${f.severity}**: ${f.description} (\`${f.location.file}:${f.location.line}\`)\n`;
    }
    body += '\n';
  }

  body += `[View full report on SafeSkill](https://safeskill.dev/scan/${slug})\n\n`;
  body += `---\n\n`;
  body += `### About SafeSkill\n\n`;
  body += `[SafeSkill](https://safeskill.dev) is a **free, open-source** security scanner for AI tools, MCP servers, and Claude Code skills. `;
  body += `We scan for code exploits, prompt injection, and data exfiltration risks.\n\n`;
  body += `**False positive?** We take accuracy seriously. If any finding above is incorrect, `;
  body += `please [open an issue](https://github.com/OyadotAI/safeskill/issues/new?title=False+positive+in+${encodeURIComponent(result.packageName)}&labels=false-positive) `;
  body += `and we will fix it immediately.\n\n`;
  body += `- [GitHub](https://github.com/OyadotAI/safeskill) | [Website](https://safeskill.dev) | [Docs](https://safeskill.dev/docs)\n`;
  body += `- Built by [Oya.ai](https://oya.ai) -- AI Employees Builder\n`;

  return body;
}

function buildReadmeBadgeSection(slug: string, result: ScanResult): string {
  const badge = buildBadgeMarkdown(slug, result);
  return `\n\n## Security\n\n${badge}\n\n*Scanned by [SafeSkill](https://safeskill.dev) — security scanner for AI tools.*\n`;
}

/**
 * Create a PR on a GitHub repo adding a SafeSkill badge to the README.
 */
export async function createScanPR(
  repo: string, // "owner/name"
  slug: string,
  result: ScanResult,
  token: string,
): Promise<string | null> {
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) return null;

  try {
    // 1. Fork the repo
    const forkRes = await ghFetch(`${GITHUB_API}/repos/${owner}/${repoName}/forks`, token, {
      method: 'POST',
      body: JSON.stringify({ default_branch_only: true }),
    });

    if (!forkRes.ok && forkRes.status !== 202) {
      console.log(`Fork failed (${forkRes.status}), skipping PR`);
      return null;
    }

    const forkData = await forkRes.json() as { full_name: string; owner: { login: string } };
    const forkOwner = forkData.owner.login;

    // Wait for fork to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 2. Get the default branch
    const repoRes = await ghFetch(`${GITHUB_API}/repos/${owner}/${repoName}`, token);
    const repoData = await repoRes.json() as { default_branch: string };
    const defaultBranch = repoData.default_branch;

    // 3. Get the latest commit SHA on default branch
    const refRes = await ghFetch(`${GITHUB_API}/repos/${forkOwner}/${repoName}/git/ref/heads/${defaultBranch}`, token);
    if (!refRes.ok) {
      console.log(`Could not get ref for fork, status ${refRes.status}`);
      return null;
    }
    const refData = await refRes.json() as { object: { sha: string } };
    const baseSha = refData.object.sha;

    // 4. Create a new branch on the fork
    const branchName = `safeskill-scan-${Date.now()}`;
    const branchRes = await ghFetch(`${GITHUB_API}/repos/${forkOwner}/${repoName}/git/refs`, token, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
    });
    if (!branchRes.ok) {
      console.log(`Could not create branch, status ${branchRes.status}`);
      return null;
    }

    // 5. Get README content
    let readmePath = 'README.md';
    let readmeContent = '';
    let readmeSha = '';

    for (const candidate of ['README.md', 'readme.md', 'Readme.md']) {
      const readmeRes = await ghFetch(
        `${GITHUB_API}/repos/${forkOwner}/${repoName}/contents/${candidate}?ref=${branchName}`,
        token,
      );
      if (readmeRes.ok) {
        const data = await readmeRes.json() as { content: string; sha: string; path: string };
        readmeContent = Buffer.from(data.content, 'base64').toString('utf-8');
        readmeSha = data.sha;
        readmePath = data.path;
        break;
      }
    }

    // 6. Add badge to README
    let updatedContent: string;
    if (readmeContent) {
      // Check if badge already exists
      if (readmeContent.includes('safeskill.dev/scan/')) {
        console.log('SafeSkill badge already exists in README, skipping PR');
        return null;
      }
      // Add badge after the first heading
      const firstHeadingEnd = readmeContent.indexOf('\n', readmeContent.indexOf('# '));
      if (firstHeadingEnd > 0) {
        const badge = buildBadgeMarkdown(slug, result);
        updatedContent = readmeContent.slice(0, firstHeadingEnd + 1) +
          `\n${badge}\n` +
          readmeContent.slice(firstHeadingEnd + 1);
      } else {
        updatedContent = readmeContent + buildReadmeBadgeSection(slug, result);
      }
    } else {
      // No README — create one
      readmePath = 'README.md';
      updatedContent = `# ${repoName}\n\n${buildBadgeMarkdown(slug, result)}\n`;
    }

    // 7. Commit the updated README
    const commitRes = await ghFetch(
      `${GITHUB_API}/repos/${forkOwner}/${repoName}/contents/${readmePath}`,
      token,
      {
        method: 'PUT',
        body: JSON.stringify({
          message: `Add SafeSkill security badge (${result.overallScore}/100)`,
          content: Buffer.from(updatedContent).toString('base64'),
          branch: branchName,
          ...(readmeSha ? { sha: readmeSha } : {}),
        }),
      },
    );

    if (!commitRes.ok) {
      const err = await commitRes.text();
      console.log(`Could not commit README update: ${err}`);
      return null;
    }

    // 8. Create the PR
    const prBody = buildPRBody(slug, result);
    const prRes = await ghFetch(`${GITHUB_API}/repos/${owner}/${repoName}/pulls`, token, {
      method: 'POST',
      body: JSON.stringify({
        title: `Add SafeSkill security badge (${result.overallScore}/100 — ${getGradeLabel(result.overallScore)})`,
        body: prBody,
        head: `${forkOwner}:${branchName}`,
        base: defaultBranch,
      }),
    });

    if (!prRes.ok) {
      const err = await prRes.text();
      console.log(`Could not create PR: ${err}`);
      return null;
    }

    const prData = await prRes.json() as { html_url: string; number: number };
    console.log(`PR created: ${prData.html_url}`);
    return prData.html_url;
  } catch (error) {
    console.error(`PR creation failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}
