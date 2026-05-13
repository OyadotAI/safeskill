import type { PromptFinding, PromptDetectorCategory } from '@safeskill/shared';
import { PROMPT_INJECTION_PATTERNS } from '@safeskill/shared';

const CATEGORY: PromptDetectorCategory = 'indirect-injection';

/**
 * Additional patterns for indirect injection (payload-via-URL/content-loading).
 */
const EXTRA_PATTERNS: Array<{ regex: RegExp; technique: string }> = [
  // URLs to raw content hosting that could contain payloads
  { regex: /https?:\/\/(?:raw\.githubusercontent\.com|gist\.githubusercontent\.com|pastebin\.com\/raw)[^\s)"]*/gi, technique: 'raw-content-url' },
  { regex: /https?:\/\/(?:hastebin|dpaste|ghostbin|ix\.io|sprunge\.us)[^\s)"]*/gi, technique: 'paste-service-url' },
  // Fetch/load instructions
  { regex: /download\s+(and\s+)?(run|execute|follow|apply)/i, technique: 'download-execute' },
  { regex: /(?:curl|wget|fetch)\s+(?:this\s+)?(?:URL|link|address)/i, technique: 'fetch-instruction' },
  { regex: /import\s+(?:instructions?|config|rules?)\s+from\s+(?:this\s+)?(?:URL|link|endpoint)/i, technique: 'import-from-url' },
];

/**
 * Detect markdown links where the display text is misleading relative to the URL.
 * e.g. [Click here for docs](https://evil.com/inject.txt)
 */
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Suspicious display text patterns.
 */
const BENIGN_DISPLAY_WORDS = /^(?:here|click|link|source|docs?|documentation|reference|see|more|details|read\s+more)$/i;

/**
 * Check if a URL points to a potentially dangerous file type.
 */
const DANGEROUS_URL_EXTENSION_RE = /\.(txt|md|prompt|sh|bash|ps1|bat|cmd|py|rb|pl)(?:\?|#|$)/i;

/**
 * Image references with suspicious alt text or encoded URLs.
 */
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Detect data: URIs or overly-encoded URLs in image references.
 */
const SUSPICIOUS_IMAGE_URL_RE = /(?:data:text\/|%(?:0a|0d|20|3c|3e)){3,}/i;

function lineColFromIndex(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function snippet(content: string, index: number, length: number): string {
  const raw = content.slice(index, index + Math.min(length, 120));
  return raw.replace(/\n/g, '\\n');
}

/**
 * Detect whether the URL match at `index` is the value of a `url=`/`uri=`
 * query parameter on a shields.io endpoint-badge URL. Shields renders the
 * JSON body as badge label/colour text inside an <img>, so the inner URL
 * is consumed as data by a badge proxy, not loaded as page content.
 */
const SHIELDS_BADGE_HOSTS = ['img.shields.io', 'shields.io'];
function isShieldsBadgeEndpoint(content: string, index: number): boolean {
  // Look back a bounded distance for `?url=` or `&url=` (or uri=) preceded
  // by a shields.io host. 256 chars covers any realistic badge URL.
  const lookbackStart = Math.max(0, index - 256);
  const before = content.slice(lookbackStart, index).toLowerCase();
  if (!/[?&](?:url|uri)=$/.test(before)) return false;
  return SHIELDS_BADGE_HOSTS.some((h) => before.includes(h));
}

/**
 * Static image / icon assets cannot inject instructions into a model — they
 * are rendered as binary pixels, not consumed as text. A raw URL that ends
 * in an image extension is a logo or screenshot, not a content payload.
 */
const STATIC_ASSET_EXT_RE = /\.(?:svg|png|jpe?g|gif|webp|avif|bmp|ico|tiff?|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|ogg|wav)(?:[?#].*)?$/i;

/**
 * Detect raw-content URLs that appear inside a markdown image (`![alt](url)`)
 * or HTML `<img src="url">` / `<picture><source srcset="url">`. The
 * surrounding tag forces image rendering, so the content cannot be
 * interpreted as text instructions.
 */
function isInsideImageContext(content: string, index: number): boolean {
  // Look back for a markdown image opener `](` preceded by `![...]` or
  // an HTML <img src=/<source srcset= on the same line.
  const lookbackStart = Math.max(0, index - 200);
  const before = content.slice(lookbackStart, index);
  // Markdown image: `![alt-text](URL...`
  if (/!\[[^\]]*\]\([^)]*$/.test(before)) return true;
  // HTML img/source on the same logical span
  if (/<(?:img|source)\b[^>]*?(?:src|srcset)\s*=\s*["']?[^"'>]*$/i.test(before)) return true;
  return false;
}

/**
 * Check if a link's display text is significantly different from where it actually points.
 * For example, display text says "documentation" but URL goes to pastebin.
 */
/**
 * Extract hostname from a URL string without relying on the URL constructor
 * (not available in the configured TS lib).
 */
function extractHostname(urlStr: string): string | null {
  const match = urlStr.match(/^https?:\/\/([^/?#]+)/);
  return match?.[1]?.toLowerCase() ?? null;
}

function isMisleadingLink(display: string, url: string): boolean {
  // If display text looks like a URL itself, compare domains
  if (/^https?:\/\//.test(display)) {
    const displayHost = extractHostname(display);
    const urlHost = extractHostname(url);
    if (displayHost && urlHost && displayHost !== urlHost) {
      return true;
    }
  }

  // If the URL points to a dangerous file extension and the display text is benign
  if (DANGEROUS_URL_EXTENSION_RE.test(url) && BENIGN_DISPLAY_WORDS.test(display.trim())) {
    return true;
  }

  return false;
}

export function detect(
  content: string,
  filePath: string,
  isPriority: boolean,
): PromptFinding[] {
  const findings: PromptFinding[] = [];

  // --- Standard regex-based detectors ---
  const allPatterns: Array<{ regex: RegExp; technique: string }> = [
    ...PROMPT_INJECTION_PATTERNS.indirectInjection.map((r) => ({
      regex: r,
      technique: 'indirect-injection-pattern',
    })),
    ...EXTRA_PATTERNS,
  ];

  for (const { regex, technique } of allPatterns) {
    const globalRe = new RegExp(
      regex.source,
      regex.flags.includes('g') ? regex.flags : regex.flags + 'g',
    );
    let match: RegExpExecArray | null;

    while ((match = globalRe.exec(content)) !== null) {
      // Skip raw-content URLs that are passed as a query parameter to a
      // known badge proxy (shields.io endpoint badges). The badge service
      // renders the JSON as label text in an <img>, not as page content,
      // so it cannot inject instructions into a model.
      if (technique === 'raw-content-url' && isShieldsBadgeEndpoint(content, match.index)) {
        continue;
      }
      // Skip raw URLs pointing to static image / font / media assets.
      // These render as binary content, not as text the model would read.
      if (technique === 'raw-content-url' && STATIC_ASSET_EXT_RE.test(match[0])) {
        continue;
      }
      // Skip raw URLs that sit inside a markdown image or <img>/<source>
      // tag — the URL is consumed as an image source, never as instructions.
      if (technique === 'raw-content-url' && isInsideImageContext(content, match.index)) {
        continue;
      }

      const { line, column } = lineColFromIndex(content, match.index);

      const severity = isPriority ? 'high' : 'medium';
      const confidence = isPriority ? 0.8 : 0.6;

      findings.push({
        category: CATEGORY,
        severity,
        location: { file: filePath, line, column },
        description: `Indirect injection vector detected (${technique}): "${match[0].trim().slice(0, 80)}"`,
        contentSnippet: snippet(content, match.index, match[0].length + 40),
        confidence,
        technique,
      });
    }
  }

  // --- Misleading markdown links ---
  {
    const re = new RegExp(MARKDOWN_LINK_RE.source, MARKDOWN_LINK_RE.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(content)) !== null) {
      const display = match[1]!;
      const url = match[2]!;

      if (isMisleadingLink(display, url)) {
        const { line, column } = lineColFromIndex(content, match.index);

        findings.push({
          category: CATEGORY,
          severity: isPriority ? 'high' : 'medium',
          location: { file: filePath, line, column },
          description: `Misleading markdown link: display text "${display}" points to "${url.slice(0, 60)}"`,
          contentSnippet: snippet(content, match.index, match[0].length),
          confidence: isPriority ? 0.75 : 0.55,
          technique: 'misleading-link',
        });
      }
    }
  }

  // --- Suspicious image references ---
  {
    const re = new RegExp(MARKDOWN_IMAGE_RE.source, MARKDOWN_IMAGE_RE.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(content)) !== null) {
      const altText = match[1]!;
      const url = match[2]!;
      let suspicious = false;
      let technique = 'suspicious-image';

      // Check for encoded URLs that could hide payloads
      if (SUSPICIOUS_IMAGE_URL_RE.test(url)) {
        suspicious = true;
        technique = 'encoded-image-url';
      }

      // Check if alt text contains instruction-like content
      if (/(?:ignore|override|system|execute|run|fetch|send)/i.test(altText)) {
        suspicious = true;
        technique = 'instruction-in-alt-text';
      }

      if (suspicious) {
        const { line, column } = lineColFromIndex(content, match.index);

        findings.push({
          category: CATEGORY,
          severity: isPriority ? 'high' : 'medium',
          location: { file: filePath, line, column },
          description: `Suspicious image reference (${technique}): alt="${altText.slice(0, 40)}"`,
          contentSnippet: snippet(content, match.index, match[0].length),
          confidence: isPriority ? 0.7 : 0.5,
          technique,
        });
      }
    }
  }

  return findings;
}
