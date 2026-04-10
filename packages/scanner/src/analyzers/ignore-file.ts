import { readFile } from 'fs/promises';
import path from 'path';
import type { CodeFinding, PromptFinding, TaintFlow } from '@safeskill/shared';

/**
 * Parses a `.safeskillignore` file and returns a filter that can suppress
 * documented false-positive findings before scoring.
 *
 * File format (line-based, similar to .gitignore):
 *
 *   # Comment lines start with #
 *   install-scripts          # Ignore all findings in this category
 *   network-access:exfil*    # Ignore network-access findings whose description matches glob
 *   taint:process.env->*     # Ignore taint flows from env to any sink
 *   file:src/tools/**        # Ignore all findings in matching file paths
 *
 * Supported prefixes:
 *   <category>                — suppress all findings in that category
 *   <category>:<glob>         — suppress findings whose description matches
 *   taint:<source>-><sink>    — suppress taint flows (use * for wildcard)
 *   file:<glob>               — suppress findings in matching file paths
 */

export interface IgnoreRules {
  /** Full categories to ignore */
  categories: Set<string>;
  /** Category + description pattern pairs */
  categoryPatterns: Array<{ category: string; pattern: RegExp }>;
  /** Taint flow source→sink patterns */
  taintPatterns: Array<{ source: RegExp; sink: RegExp }>;
  /** File path patterns */
  filePatterns: RegExp[];
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLESTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLESTAR__/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function parseIgnoreRules(content: string): IgnoreRules {
  const rules: IgnoreRules = {
    categories: new Set(),
    categoryPatterns: [],
    taintPatterns: [],
    filePatterns: [],
  };

  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    if (line.startsWith('file:')) {
      const glob = line.slice(5).trim();
      if (glob) rules.filePatterns.push(globToRegex(glob));
    } else if (line.startsWith('taint:')) {
      const spec = line.slice(6).trim();
      const arrowIdx = spec.indexOf('->');
      if (arrowIdx > 0) {
        const source = spec.slice(0, arrowIdx).trim();
        const sink = spec.slice(arrowIdx + 2).trim();
        rules.taintPatterns.push({
          source: globToRegex(source),
          sink: globToRegex(sink),
        });
      }
    } else if (line.includes(':')) {
      const colonIdx = line.indexOf(':');
      const category = line.slice(0, colonIdx).trim();
      const pattern = line.slice(colonIdx + 1).trim();
      if (category && pattern) {
        rules.categoryPatterns.push({ category, pattern: globToRegex(pattern) });
      }
    } else {
      rules.categories.add(line);
    }
  }

  return rules;
}

export async function loadIgnoreRules(dir: string): Promise<IgnoreRules | null> {
  try {
    const content = await readFile(path.join(dir, '.safeskillignore'), 'utf-8');
    return parseIgnoreRules(content);
  } catch {
    return null;
  }
}

export function applyIgnoreRules(
  codeFindings: CodeFinding[],
  promptFindings: PromptFinding[],
  taintFlows: TaintFlow[],
  rules: IgnoreRules,
): {
  codeFindings: CodeFinding[];
  promptFindings: PromptFinding[];
  taintFlows: TaintFlow[];
} {
  const matchesFile = (filePath: string) =>
    rules.filePatterns.some(re => re.test(filePath));

  const matchesCategoryPattern = (category: string, description: string) =>
    rules.categoryPatterns.some(cp =>
      cp.category === category && cp.pattern.test(description)
    );

  const filteredCode = codeFindings.filter(f => {
    if (rules.categories.has(f.category)) return false;
    if (matchesFile(f.location.file)) return false;
    if (matchesCategoryPattern(f.category, f.description)) return false;
    return true;
  });

  const filteredPrompt = promptFindings.filter(f => {
    if (rules.categories.has(f.category)) return false;
    if (matchesFile(f.location.file)) return false;
    if (matchesCategoryPattern(f.category, f.description)) return false;
    return true;
  });

  const filteredTaint = taintFlows.filter(f => {
    if (rules.taintPatterns.some(tp =>
      tp.source.test(f.source.type) && tp.sink.test(f.sink.type)
    )) return false;
    // Also filter if source or sink file matches a file pattern
    if (matchesFile(f.source.location.file)) return false;
    if (matchesFile(f.sink.location.file)) return false;
    return true;
  });

  return {
    codeFindings: filteredCode,
    promptFindings: filteredPrompt,
    taintFlows: filteredTaint,
  };
}
