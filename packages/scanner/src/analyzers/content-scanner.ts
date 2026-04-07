import { readFile } from 'fs/promises';
import { globby } from 'globby';
import path from 'path';
import { CONTENT_FILE_PATTERNS, PRIORITY_CONTENT_FILES, isTestFixturePath } from '@safeskill/shared';

export interface ContentFile {
  relativePath: string;
  absolutePath: string;
  content: string;
  isPriority: boolean;
  isTestFixture: boolean;
  source: 'file' | 'code-string'; // whether from a .md file or extracted from code
}

/**
 * Discovers all content files that need prompt injection scanning.
 * Also extracts long string literals from code that look like prompts.
 */
export async function discoverContent(dir: string): Promise<ContentFile[]> {
  const results: ContentFile[] = [];

  // Find all content files
  const contentGlobs = [...CONTENT_FILE_PATTERNS];
  const files = await globby(contentGlobs, {
    cwd: dir,
    ignore: [
      'node_modules/**', 'dist/**', '.git/**',
      'CHANGELOG.md', 'CHANGELOG/**',
      // License files contain standard legal text — not security-relevant content
      'LICENSE', 'LICENSE.*', 'LICENCE', 'LICENCE.*',
      'LICENSES/**', 'LICENCES/**',
      '**/LICENSE', '**/LICENSE.*',
    ],
    absolute: false,
  });

  const prioritySet = new Set(PRIORITY_CONTENT_FILES.map(f => f.toLowerCase()));

  // Read content files in parallel
  await Promise.all(
    files.map(async (relPath) => {
      const absPath = path.join(dir, relPath);
      try {
        const content = await readFile(absPath, 'utf-8');
        const basename = path.basename(relPath).toLowerCase();
        const isPriority = prioritySet.has(basename);
        const isFixture = isTestFixturePath(relPath);

        results.push({
          relativePath: relPath,
          absolutePath: absPath,
          content,
          isPriority: isPriority && !isFixture, // test fixtures never get priority boost
          isTestFixture: isFixture,
          source: 'file',
        });
      } catch {
        // skip unreadable files
      }
    }),
  );

  // Extract prompt-like strings from code files
  const codeFiles = await globby(['**/*.{ts,js,mjs,cjs}'], {
    cwd: dir,
    ignore: ['node_modules/**', 'dist/**', '.git/**', '**/*.d.ts'],
    absolute: false,
  });

  await Promise.all(
    codeFiles.map(async (relPath) => {
      const absPath = path.join(dir, relPath);
      try {
        const code = await readFile(absPath, 'utf-8');
        extractPromptStrings(code, relPath, absPath, results);
      } catch {
        // skip
      }
    }),
  );

  return results;
}

/**
 * Extracts string literals from code that look like embedded prompts.
 * Targets template literals and multi-line strings > 100 chars with instruction patterns.
 */
function extractPromptStrings(
  code: string,
  relPath: string,
  absPath: string,
  results: ContentFile[],
): void {
  // Match template literals (backtick strings) that are long
  const templateLiteralRegex = /`([^`]{100,})`/gs;
  let match: RegExpExecArray | null;

  while ((match = templateLiteralRegex.exec(code)) !== null) {
    const content = match[1]!;
    if (looksLikePrompt(content)) {
      const upToMatch = code.slice(0, match.index);
      const line = upToMatch.split('\n').length;

      const isFixture = isTestFixturePath(relPath);
      results.push({
        relativePath: `${relPath}:${line}`,
        absolutePath: absPath,
        content,
        isPriority: !isFixture, // embedded prompts are high priority unless in test fixture
        isTestFixture: isFixture,
        source: 'code-string',
      });
    }
  }

  // Match description fields in MCP tool definitions
  const descriptionRegex = /description\s*:\s*['"]([^'"]{50,})['"]/g;
  while ((match = descriptionRegex.exec(code)) !== null) {
    const content = match[1]!;
    if (looksLikePrompt(content)) {
      const upToMatch = code.slice(0, match.index);
      const line = upToMatch.split('\n').length;

      const isFixture = isTestFixturePath(relPath);
      results.push({
        relativePath: `${relPath}:${line}`,
        absolutePath: absPath,
        content,
        isPriority: !isFixture,
        isTestFixture: isFixture,
        source: 'code-string',
      });
    }
  }
}

/**
 * Heuristic: does this string look like an AI prompt/instruction?
 */
function looksLikePrompt(text: string): boolean {
  const promptIndicators = [
    /you\s+(are|should|must|will|can)/i,
    /\b(always|never)\s+(respond|answer|output|include|exclude)/i,
    /\b(system|assistant|user)\s*:/i,
    /\b(ignore|disregard|override|forget)\b/i,
    /\b(instruction|directive|rule|guideline|prompt)\b/i,
    /\b(tool|function|command)\s+(call|use|execution)/i,
    /\b(read|write|execute|send|fetch|access)\s+(the|any|all)\s+(file|data|content|secret|key|token)/i,
  ];

  let matches = 0;
  for (const pattern of promptIndicators) {
    if (pattern.test(text)) matches++;
  }

  return matches >= 2;
}
