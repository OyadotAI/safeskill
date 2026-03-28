import type { CodeFinding, PromptFinding, MismatchFinding, Severity } from '@safeskill/shared';
import type { ContentFile } from './content-scanner.js';

/**
 * Code ↔ Content Correlation
 *
 * Cross-references what the content files CLAIM the tool does
 * vs what the code ACTUALLY does. Mismatches indicate deception.
 */

interface CapabilityClaim {
  capability: string;
  file: string;
  line: number;
  snippet: string;
}

interface CodeCapability {
  capability: string;
  file: string;
  line: number;
  snippet: string;
}

// Patterns in content that claim certain capabilities.
// These must be VERY specific to avoid false positives on normal documentation.
// Only match explicit denial claims like "does not access files", not generic words.
const CLAIM_PATTERNS: Array<{ pattern: RegExp; capability: string }> = [
  { pattern: /(?:does\s+not|doesn'?t|never)\s+(?:access|read|write|modify|touch)\s+(?:any\s+)?(?:local\s+)?files?/i, capability: 'no-filesystem' },
  { pattern: /(?:does\s+not|doesn'?t|never)\s+(?:make|send|perform)\s+(?:any\s+)?(?:network|http|api)\s+(?:requests?|calls?)/i, capability: 'no-network' },
  { pattern: /(?:does\s+not|doesn'?t|never)\s+(?:access|read|use)\s+(?:any\s+)?(?:environment|env)\s+var/i, capability: 'no-env' },
  { pattern: /(?:does\s+not|doesn'?t|never)\s+(?:execute|run|spawn)\s+(?:any\s+)?(?:commands?|processes?|shell|scripts?)/i, capability: 'no-process' },
  { pattern: /(?:only|just)\s+(?:reads?|accesses?)\s+(?:project|local|current|working)\s+(?:files?|directory|folder)/i, capability: 'local-only-fs' },
  { pattern: /(?:no|zero|without)\s+(?:external|internet|network|outbound)\s+(?:access|connectivity|connection|requests?)/i, capability: 'no-network' },
  { pattern: /no\s+data\s+(?:collection|sharing|sending|exfiltration|leaking)/i, capability: 'privacy-claim' },
  { pattern: /does\s+not\s+(?:collect|share|send|transmit|leak)\s+(?:any\s+)?(?:user\s+)?data/i, capability: 'privacy-claim' },
  { pattern: /fully\s+(?:sandboxed|isolated)\s+(?:environment|execution|runtime)/i, capability: 'safe-claim' },
];

// Map code finding categories to claim contradictions
const CONTRADICTION_MAP: Record<string, string[]> = {
  'filesystem-access': ['no-filesystem'],
  'network-access': ['no-network', 'privacy-claim'],
  'env-access': ['no-env'],
  'process-spawn': ['no-process', 'safe-claim'],
};

export function correlateCodeContent(
  codeFindings: CodeFinding[],
  promptFindings: PromptFinding[],
  contentFiles: ContentFile[],
): MismatchFinding[] {
  const mismatches: MismatchFinding[] = [];

  // Step 1: Extract claims from content files
  const claims = extractClaims(contentFiles);

  // Step 2: Extract actual capabilities from code findings
  const actualCapabilities = extractCapabilities(codeFindings);

  // Step 3: Find contradictions
  for (const claim of claims) {
    const contradictingCategories = Object.entries(CONTRADICTION_MAP)
      .filter(([_, claimTypes]) => claimTypes.includes(claim.capability))
      .map(([category]) => category);

    for (const category of contradictingCategories) {
      const contradictingCode = actualCapabilities.filter(c => c.capability === category);

      for (const code of contradictingCode) {
        // Determine severity based on what's being hidden
        let severity: Severity = 'high';
        if (category === 'network-access' && codeFindings.some(f =>
          f.category === 'filesystem-access' && (f.severity === 'critical' || f.severity === 'high')
        )) {
          // Claims no network but reads sensitive files AND makes network calls = likely exfil
          severity = 'critical';
        }
        if (category === 'process-spawn') {
          severity = 'critical'; // hiding process spawn is always bad
        }

        mismatches.push({
          claimed: `Content claims: "${claim.snippet}"`,
          actual: `Code does: ${code.snippet}`,
          contentLocation: { file: claim.file, line: claim.line, column: 0 },
          codeLocation: { file: code.file, line: code.line, column: 0 },
          severity,
          description: `Content claims "${claim.capability}" but code contains ${category} operations`,
        });
      }
    }
  }

  // Step 4: Check for "safe" claims when prompt injection is detected
  const safeClaims = claims.filter(c => c.capability === 'safe-claim' || c.capability === 'privacy-claim');
  if (safeClaims.length > 0 && promptFindings.some(f => f.severity === 'critical' || f.severity === 'high')) {
    for (const claim of safeClaims) {
      mismatches.push({
        claimed: `Content claims: "${claim.snippet}"`,
        actual: 'Prompt injection patterns detected in content files',
        contentLocation: { file: claim.file, line: claim.line, column: 0 },
        codeLocation: { file: claim.file, line: claim.line, column: 0 },
        severity: 'critical',
        description: `Claims to be "${claim.capability}" but contains prompt injection patterns`,
      });
    }
  }

  return mismatches;
}

function extractClaims(contentFiles: ContentFile[]): CapabilityClaim[] {
  const claims: CapabilityClaim[] = [];

  for (const file of contentFiles) {
    const lines = file.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      for (const { pattern, capability } of CLAIM_PATTERNS) {
        const match = pattern.exec(line);
        if (match) {
          claims.push({
            capability,
            file: file.relativePath,
            line: i + 1,
            snippet: line.trim().slice(0, 120),
          });
        }
      }
    }
  }

  return claims;
}

function extractCapabilities(codeFindings: CodeFinding[]): CodeCapability[] {
  const caps: CodeCapability[] = [];
  const seen = new Set<string>();

  for (const finding of codeFindings) {
    // Only consider medium+ severity findings as actual capabilities
    if (finding.severity === 'low' || finding.severity === 'info') continue;

    const key = `${finding.category}:${finding.location.file}`;
    if (seen.has(key)) continue;
    seen.add(key);

    caps.push({
      capability: finding.category,
      file: finding.location.file,
      line: finding.location.line,
      snippet: finding.description,
    });
  }

  return caps;
}
