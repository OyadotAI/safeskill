import { z } from 'zod';

export const severitySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);

export const sourceLocationSchema = z.object({
  file: z.string(),
  line: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
});

export const codeFindingSchema = z.object({
  category: z.enum([
    'filesystem-access',
    'network-access',
    'env-access',
    'process-spawn',
    'crypto-usage',
    'obfuscation',
    'install-scripts',
    'dynamic-require',
  ]),
  severity: severitySchema,
  location: sourceLocationSchema,
  description: z.string(),
  codeSnippet: z.string(),
  confidence: z.number().min(0).max(1),
});

export const promptFindingSchema = z.object({
  category: z.enum([
    'instruction-override',
    'hidden-text',
    'data-exfiltration-prompt',
    'tool-abuse',
    'persona-hijack',
    'cot-manipulation',
    'delimiter-escape',
    'indirect-injection',
  ]),
  severity: severitySchema,
  location: sourceLocationSchema,
  description: z.string(),
  contentSnippet: z.string(),
  confidence: z.number().min(0).max(1),
  technique: z.string(),
});

export const scanRequestSchema = z.object({
  package: z.string().min(1).max(214), // npm package name max length
});

export const skillCategorySchema = z.enum([
  'mcp-server',
  'claude-skill',
  'openclaw-tool',
  'cli-tool',
  'development',
  'devops',
  'data',
  'ai-ml',
  'other',
]);

export const skillSubmitSchema = z.object({
  packageName: z.string().min(1).max(214),
  category: skillCategorySchema.optional(),
  tags: z.array(z.string()).max(10).optional(),
});
