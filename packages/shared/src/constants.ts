import type { ScoreGrade, Severity } from './types/index.js';

// --- Score thresholds ---
export const SCORE_THRESHOLDS = {
  VERIFIED: 90,
  PASSES: 70,
  CAUTION: 40,
  BLOCKED: 0,
} as const;

export function getGrade(score: number): ScoreGrade {
  if (score >= SCORE_THRESHOLDS.VERIFIED) return 'verified';
  if (score >= SCORE_THRESHOLDS.PASSES) return 'passes';
  if (score >= SCORE_THRESHOLDS.CAUTION) return 'caution';
  return 'blocked';
}

export const GRADE_COLORS = {
  verified: '#4caf50',
  passes: '#ffc107',
  caution: '#ff9800',
  blocked: '#f44336',
} as const;

export const GRADE_LABELS = {
  verified: 'Verified Safe',
  passes: 'Passes with Notes',
  caution: 'Use with Caution',
  blocked: 'Blocked',
} as const;

// --- Score weights (must sum to 100) ---
export const SCORE_WEIGHTS = {
  dataFlowRisks: 25,
  promptInjectionRisks: 20,
  dangerousApis: 15,
  descriptionMismatch: 10,
  networkBehavior: 10,
  dependencyHealth: 8,
  transparency: 7,
  codeQuality: 5,
} as const;

// Any single CRITICAL prompt injection = cap score at this
export const CRITICAL_PROMPT_INJECTION_CAP = 30;

// Critical/high dependency vulnerabilities = cap score
export const CRITICAL_DEPENDENCY_CAP = 50;

// --- Severity weights for score deductions ---
export const SEVERITY_MULTIPLIER: Record<Severity, number> = {
  critical: 1.0,
  high: 0.6,
  medium: 0.3,
  low: 0.1,
  info: 0,
};

// --- Sensitive paths ---
export const SENSITIVE_PATHS = [
  '~/.ssh',
  '~/.aws',
  '~/.env',
  '~/.gnupg',
  '~/.config',
  '~/.netrc',
  '~/.npmrc',
  '~/.docker',
  '~/.kube',
  '~/.gitconfig',
  '~/.git-credentials',
  '~/.bashrc',
  '~/.zshrc',
  '~/.bash_history',
  '~/.zsh_history',
  '/etc/passwd',
  '/etc/shadow',
  // Browser profiles
  '~/Library/Application Support/Google/Chrome',
  '~/Library/Application Support/Firefox',
  '~/.mozilla/firefox',
  '~/.config/google-chrome',
  // Credential stores
  '~/Library/Keychains',
  '~/.local/share/keyrings',
] as const;

// --- Sensitive env vars ---
export const SENSITIVE_ENV_VARS = [
  'AWS_SECRET_ACCESS_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'DATABASE_URL',
  'NPM_TOKEN',
  'DOCKER_PASSWORD',
  'SLACK_TOKEN',
  'SLACK_WEBHOOK',
  'STRIPE_SECRET_KEY',
  'TWILIO_AUTH_TOKEN',
  'SENDGRID_API_KEY',
  'PRIVATE_KEY',
  'SECRET_KEY',
  'ENCRYPTION_KEY',
  'JWT_SECRET',
  'SESSION_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'AZURE_CLIENT_SECRET',
] as const;

// --- Dangerous modules ---
export const DANGEROUS_MODULES = {
  filesystem: ['fs', 'fs/promises', 'node:fs', 'node:fs/promises', 'fs-extra', 'graceful-fs'],
  network: ['http', 'https', 'net', 'dgram', 'dns', 'node:http', 'node:https', 'node:net', 'node:dgram', 'node:dns', 'node-fetch', 'axios', 'got', 'undici', 'request', 'superagent'],
  process: ['child_process', 'node:child_process'],
  crypto: ['crypto', 'node:crypto'],
  vm: ['vm', 'node:vm', 'vm2'],
} as const;

// --- Prompt injection patterns ---
export const PROMPT_INJECTION_PATTERNS = {
  instructionOverride: [
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|guidelines?)/i,
    /disregard\s+(all\s+)?(previous|prior|above|earlier|current)\s+(instructions?|prompts?|rules?|guidelines?)/i,
    /forget\s+(everything|all)\s+(you|that)\s+(know|were|have)/i,
    /your\s+new\s+(role|instructions?|task|purpose)\s+(is|are)/i,
    /you\s+are\s+now\s+(?!going\s+to\s+see)(?!able)/i,
    /from\s+now\s+on[\s,]+you\s+(must|should|will|are)/i,
    /override\s+(all\s+)?(previous\s+)?(prior\s+)?(system\s+)?(instructions?|prompts?|rules?|safety)/i,
    /override\s+(all\s+)?(safety|security)\s+(protocols?|measures?|checks?|rules?)/i,
    /\bSYSTEM\s*:\s*(?!$)/i,
    /new\s+system\s+prompt\s*:/i,
    /\[INST\]/i,
    /<<\s*SYS\s*>>/i,
    /your\s+new\s+(role|purpose|task)\s+is\s+to/i,
    /forget\s+all\s+.{0,20}?(restrictions?|rules?|guidelines?)/i,
  ],
  hiddenText: [
    /[\u200B\u200C\u200D\uFEFF\u2060\u2061\u2062\u2063\u2064]/,
    /[\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069]/,
    /<!--[\s\S]*?-->/,
    /\x00/,
  ],
  dataExfiltration: [
    /read\s+(the\s+)?(contents?|files?|data)\s+(of|from|in)\s+[~\/]/i,
    /send\s+(the\s+)?(contents?|files?|data|keys?|tokens?|credentials?|secrets?)\s+(to|via)\s+https?:\/\//i,
    /include\s+(the\s+)?(contents?|files?|keys?|tokens?|credentials?).{0,40}?\s+in\s+(your\s+)?(response|output|reply|message)/i,
    /encode\s+(the\s+)?(credentials?|keys?|tokens?|secrets?|data)?\s*(as|in|to)\s+base64/i,
    /write\s+(the\s+)?(credentials?|keys?|tokens?|secrets?)\s+to\s+/i,
    /curl\s+.*?-d\s+/i,
    /(steal|exfiltrate|forward|transmit|upload)\s+(the\s+)?.{0,30}?(keys?|tokens?|credentials?|secrets?|passwords?|API_KEY)/i,
    /(keys?|tokens?|credentials?|secrets?|passwords?|API_KEY).{0,30}?(sent|send|forward|transmit|upload)\s+(to|via)\s+/i,
    /send\s+(the\s+)?[A-Z_]{3,}KEY\s+to\s+https?:\/\//i,
  ],
  toolAbuse: [
    /use\s+(the\s+)?(bash|shell|terminal|exec|command)\s+(tool\s+)?(to\s+)?run/i,
    /execute\s+(this|the\s+following)\s+(command|script|code)/i,
    /write\s+(this|the\s+following)\s+(to|into)\s+(disk|file|~\/)/i,
    /create\s+(a\s+)?file\s+(at|in)\s+[~\/]/i,
    /\brun\s+curl\b/i,
    /\brun\s+wget\b/i,
    /modify\s+(the\s+)?(~\/)?\.(bashrc|zshrc|profile|bash_profile)/i,
    /add\s+.{0,30}?(~\/)?\.(bashrc|zshrc|profile|ssh|crontab)/i,
    /use\s+fetch\s+to\s+(POST|GET|send)/i,
    /write\s+.{0,20}?to\s+\/(etc|tmp|var)\//i,
  ],
  personaHijack: [
    /you\s+are\s+(DAN|evil|uncensored|unfiltered|unrestricted|jailbroken)/i,
    /pretend\s+(you\s+are|to\s+be)/i,
    /act\s+as\s+(an?\s+)?(unrestricted|uncensored|evil|unfiltered)/i,
    /jailbreak/i,
    /bypass\s+(all\s+)?(safety|content|ethical)\s+(filters?|restrictions?|guidelines?|protocols?)/i,
    /bypass\s+all\s+restrictions/i,
    /without\s+(any\s+)?(safety|ethical|content)\s+(restrictions?|filters?|guidelines?)/i,
    /do\s+not\s+(refuse|decline|reject|filter)/i,
    /never\s+(refuse|decline|reject|say\s+no)/i,
  ],
  cotManipulation: [
    /in\s+your\s+(internal\s+)?(reasoning|thinking|chain.of.thought)/i,
    /before\s+(answering|responding),?\s+(internally|first|secretly)/i,
    /hidden?\s+(reasoning|thinking|thought)/i,
    /think\s+step\s+by\s+step\s+about\s+how\s+to\s+(bypass|circumvent|avoid|hack|exploit)/i,
    /in\s+your\s+<thinking>/i,
  ],
  delimiterEscape: [
    /<\/system>/i,
    /<\/tool>/i,
    /<\/function>/i,
    /<\/user>/i,
    /<\/assistant>/i,
    /<\|im_end\|>/i,
    /<\|endoftext\|>/i,
    /```\s*system/i,
    /\[\/?INST\]/i,
    /\[\/?(SYS|SYSTEM)\]/i,
  ],
  indirectInjection: [
    /https?:\/\/[^\s]*\.(txt|md|prompt)\b/i,
    /fetch\s+(this|the)\s+URL/i,
    /load\s+(the\s+)?(content|instructions?)\s+from/i,
    /follow\s+(the\s+)?instructions?\s+(at|from|in)\s+https?:\/\//i,
  ],
} as const;

// --- Content file patterns ---
export const CONTENT_FILE_PATTERNS = [
  '**/*.md',
  '**/*.txt',
  '**/*.yaml',
  '**/*.yml',
  '**/*.prompt',
  '**/*.template',
] as const;

export const PRIORITY_CONTENT_FILES = [
  'skills.md',
  'SKILLS.md',
  'skill.md',
  'SKILL.md',
  'system-prompt.md',
  'system-prompt.txt',
  'instructions.md',
  'instructions.txt',
  'tool-description.md',
  'CLAUDE.md',
  '.cursorrules',
  '.windsurfrules',
] as const;
