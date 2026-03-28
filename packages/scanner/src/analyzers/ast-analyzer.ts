import { Project, SyntaxKind, type SourceFile } from 'ts-morph';
import path from 'path';
import type { CodeFinding, DetectorCategory, SourceLocation } from '@safeskill/shared';
import { ALL_DETECTORS } from '../detectors/index.js';
import { truncate } from '../utils.js';

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

export interface ASTResult {
  findings: CodeFinding[];
  filesScanned: number;
  fileAnalyses: FileAnalysis[];
}

export interface FileAnalysis {
  filePath: string;
  imports: ImportInfo[];
  callExpressions: CallInfo[];
  envAccesses: EnvAccessInfo[];
  functionDeclarations: FunctionInfo[];
}

export interface ImportInfo {
  module: string;
  namedImports: string[];
  defaultImport: string | null;
  location: SourceLocation;
}

export interface CallInfo {
  expression: string; // e.g. "fs.readFileSync"
  arguments: string[]; // stringified args
  location: SourceLocation;
  category: DetectorCategory | null;
}

export interface EnvAccessInfo {
  variable: string | null; // the env var name, or null if dynamic
  isBulk: boolean;
  location: SourceLocation;
}

export interface FunctionInfo {
  name: string;
  parameters: string[];
  returnType: string | null;
  location: SourceLocation;
  bodyRange: { start: number; end: number };
}

// ---------------------------------------------------------------------------
// Category lookup for call expressions — maps known APIs to detector categories
// ---------------------------------------------------------------------------

const CALL_CATEGORY_MAP: Record<string, DetectorCategory> = {
  // filesystem
  readFile: 'filesystem-access',
  readFileSync: 'filesystem-access',
  writeFile: 'filesystem-access',
  writeFileSync: 'filesystem-access',
  unlink: 'filesystem-access',
  unlinkSync: 'filesystem-access',
  readdir: 'filesystem-access',
  readdirSync: 'filesystem-access',
  mkdir: 'filesystem-access',
  mkdirSync: 'filesystem-access',
  rmSync: 'filesystem-access',
  rm: 'filesystem-access',
  createReadStream: 'filesystem-access',
  createWriteStream: 'filesystem-access',
  // network
  fetch: 'network-access',
  request: 'network-access',
  // process
  exec: 'process-spawn',
  execSync: 'process-spawn',
  spawn: 'process-spawn',
  spawnSync: 'process-spawn',
  execFile: 'process-spawn',
  execFileSync: 'process-spawn',
  fork: 'process-spawn',
  eval: 'process-spawn',
  // crypto
  createHash: 'crypto-usage',
  createCipher: 'crypto-usage',
  createCipheriv: 'crypto-usage',
  createHmac: 'crypto-usage',
  btoa: 'crypto-usage',
  atob: 'crypto-usage',
};

function getCategoryForCall(expression: string): DetectorCategory | null {
  const parts = expression.split('.');
  const method = parts[parts.length - 1]!;
  return CALL_CATEGORY_MAP[method] ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLocation(sourceFile: SourceFile, pos: number, relPath: string): SourceLocation {
  const { line, column } = sourceFile.getLineAndColumnAtPos(pos);
  return { file: relPath, line, column };
}

// ---------------------------------------------------------------------------
// Per-file structural analysis (for the taint tracker)
// ---------------------------------------------------------------------------

function extractFileAnalysis(sourceFile: SourceFile, relPath: string): FileAnalysis {
  const imports: ImportInfo[] = [];
  const callExpressions: CallInfo[] = [];
  const envAccesses: EnvAccessInfo[] = [];
  const functionDeclarations: FunctionInfo[] = [];

  // --- Imports ---
  for (const decl of sourceFile.getImportDeclarations()) {
    const namedImports = decl.getNamedImports().map((ni) => ni.getName());
    const defaultImport = decl.getDefaultImport()?.getText() ?? null;

    imports.push({
      module: decl.getModuleSpecifierValue(),
      namedImports,
      defaultImport,
      location: getLocation(sourceFile, decl.getStart(), relPath),
    });
  }

  // --- Call expressions ---
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = call.getExpression().getText();
    const args = call.getArguments().map((a) => truncate(a.getText(), 80));
    const category = getCategoryForCall(expression);

    callExpressions.push({
      expression,
      arguments: args,
      location: getLocation(sourceFile, call.getStart(), relPath),
      category,
    });
  }

  // --- Env accesses ---
  // process.env.VAR
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (access.getExpression().getText() === 'process.env') {
      envAccesses.push({
        variable: access.getName(),
        isBulk: false,
        location: getLocation(sourceFile, access.getStart(), relPath),
      });
    }
  }
  // process.env['VAR'] or process.env[dynamic]
  for (const access of sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    if (access.getExpression().getText() !== 'process.env') continue;
    const argExpr = access.getArgumentExpression();
    if (!argExpr) continue;

    if (argExpr.getKind() === SyntaxKind.StringLiteral) {
      envAccesses.push({
        variable: argExpr.getText().slice(1, -1),
        isBulk: false,
        location: getLocation(sourceFile, access.getStart(), relPath),
      });
    } else {
      envAccesses.push({
        variable: null,
        isBulk: false,
        location: getLocation(sourceFile, access.getStart(), relPath),
      });
    }
  }
  // Object.keys/entries/values(process.env) or destructuring
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const exprText = call.getExpression().getText();
    if (['Object.keys', 'Object.entries', 'Object.values'].includes(exprText)) {
      const args = call.getArguments();
      if (args.length > 0 && args[0]!.getText() === 'process.env') {
        envAccesses.push({
          variable: null,
          isBulk: true,
          location: getLocation(sourceFile, call.getStart(), relPath),
        });
      }
    }
  }
  // Destructuring: const { ... } = process.env
  for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    if (!init || init.getText() !== 'process.env') continue;
    const nameNode = decl.getNameNode();
    if (nameNode.getKind() === SyntaxKind.ObjectBindingPattern) {
      const elements = nameNode.asKind(SyntaxKind.ObjectBindingPattern)?.getElements() ?? [];
      for (const el of elements) {
        envAccesses.push({
          variable: el.getName(),
          isBulk: false,
          location: getLocation(sourceFile, el.getStart(), relPath),
        });
      }
    } else if (nameNode.getKind() === SyntaxKind.Identifier) {
      envAccesses.push({
        variable: null,
        isBulk: true,
        location: getLocation(sourceFile, decl.getStart(), relPath),
      });
    }
  }

  // --- Function declarations ---
  // Named function declarations
  for (const fn of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = fn.getName() ?? '<anonymous>';
    const params = fn.getParameters().map((p) => p.getName());
    const returnType = fn.getReturnTypeNode()?.getText() ?? null;
    const body = fn.getBody();

    functionDeclarations.push({
      name,
      parameters: params,
      returnType,
      location: getLocation(sourceFile, fn.getStart(), relPath),
      bodyRange: body
        ? { start: body.getStart(), end: body.getEnd() }
        : { start: fn.getStart(), end: fn.getEnd() },
    });
  }
  // Arrow functions assigned to variables
  for (const decl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    if (!init) continue;
    if (init.getKind() !== SyntaxKind.ArrowFunction && init.getKind() !== SyntaxKind.FunctionExpression) continue;

    const name = decl.getName();
    const fn = init.asKind(SyntaxKind.ArrowFunction) ?? init.asKind(SyntaxKind.FunctionExpression);
    if (!fn) continue;

    const params = fn.getParameters().map((p) => p.getName());
    const returnType = fn.getReturnTypeNode()?.getText() ?? null;
    const body = fn.getBody();

    functionDeclarations.push({
      name,
      parameters: params,
      returnType,
      location: getLocation(sourceFile, decl.getStart(), relPath),
      bodyRange: body
        ? { start: body.getStart(), end: body.getEnd() }
        : { start: fn.getStart(), end: fn.getEnd() },
    });
  }
  // Method declarations in classes
  for (const method of sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration)) {
    const name = method.getName();
    const params = method.getParameters().map((p) => p.getName());
    const returnType = method.getReturnTypeNode()?.getText() ?? null;
    const body = method.getBody();

    functionDeclarations.push({
      name,
      parameters: params,
      returnType,
      location: getLocation(sourceFile, method.getStart(), relPath),
      bodyRange: body
        ? { start: body.getStart(), end: body.getEnd() }
        : { start: method.getStart(), end: method.getEnd() },
    });
  }

  return { filePath: relPath, imports, callExpressions, envAccesses, functionDeclarations };
}

// ---------------------------------------------------------------------------
// Run all 8 detectors on a single source file
// ---------------------------------------------------------------------------

function analyzeSourceFile(
  sourceFile: SourceFile,
  relPath: string,
): { findings: CodeFinding[]; analysis: FileAnalysis } {
  const findings: CodeFinding[] = [];

  // Run each detector (sync — they are CPU-bound AST traversals)
  for (const detector of ALL_DETECTORS) {
    try {
      const detectorFindings = detector(sourceFile, relPath);
      findings.push(...detectorFindings);
    } catch {
      // If a single detector fails, continue with the rest.
      // In production we'd log this; for now, silently skip.
    }
  }

  // Extract structural analysis for taint tracking
  const analysis = extractFileAnalysis(sourceFile, relPath);

  return { findings, analysis };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function analyzeAST(
  dir: string,
  flaggedFiles: Set<string>,
): Promise<ASTResult> {
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
      // Don't resolve to node_modules — we only care about source files
      types: [],
    },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  // Add source files — prioritize flagged files but scan all code files
  const globPatterns = [
    path.join(dir, '**/*.ts'),
    path.join(dir, '**/*.js'),
    path.join(dir, '**/*.mjs'),
    path.join(dir, '**/*.cjs'),
  ];

  const ignorePatterns = [
    path.join(dir, 'node_modules/**'),
    path.join(dir, 'dist/**'),
    path.join(dir, '.git/**'),
    path.join(dir, '**/*.d.ts'),
    path.join(dir, '**/*.test.*'),
    path.join(dir, '**/*.spec.*'),
  ];

  project.addSourceFilesAtPaths(
    globPatterns.map((p) => `${p}`),
  );

  // Remove files matching ignore patterns
  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    if (ignorePatterns.some((pattern) => {
      // Simple glob matching: convert ** to regex
      const regexStr = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');
      return new RegExp(`^${regexStr}$`).test(filePath);
    })) {
      project.removeSourceFile(sf);
    }
  }

  const sourceFiles = project.getSourceFiles();
  const allFindings: CodeFinding[] = [];
  const fileAnalyses: FileAnalysis[] = [];

  // Process files — flagged files first, then the rest
  const flaggedSourceFiles: SourceFile[] = [];
  const unflaggedSourceFiles: SourceFile[] = [];

  for (const sf of sourceFiles) {
    const relPath = path.relative(dir, sf.getFilePath());
    if (flaggedFiles.has(relPath)) {
      flaggedSourceFiles.push(sf);
    } else {
      unflaggedSourceFiles.push(sf);
    }
  }

  // Process flagged files first (higher priority)
  const orderedFiles = [...flaggedSourceFiles, ...unflaggedSourceFiles];

  for (const sf of orderedFiles) {
    const relPath = path.relative(dir, sf.getFilePath());

    try {
      const { findings, analysis } = analyzeSourceFile(sf, relPath);
      allFindings.push(...findings);
      fileAnalyses.push(analysis);
    } catch {
      // If parsing/analysis fails for a file, skip it
    }
  }

  return {
    findings: allFindings,
    filesScanned: orderedFiles.length,
    fileAnalyses,
  };
}
