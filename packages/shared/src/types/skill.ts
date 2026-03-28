export type SkillCategory =
  | 'mcp-server'
  | 'claude-skill'
  | 'openclaw-tool'
  | 'cli-tool'
  | 'development'
  | 'devops'
  | 'data'
  | 'ai-ml'
  | 'other';

export type SkillStatus =
  | 'pending'
  | 'scanning'
  | 'in-review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type ScoreGrade = 'verified' | 'passes' | 'caution' | 'blocked';

export interface Skill {
  slug: string; // npm package name
  name: string;
  description: string;
  repositoryUrl: string | null;
  homepageUrl: string | null;
  author: string;
  category: SkillCategory;
  tags: string[];
  latestVersion: string | null;
  latestScore: number | null;
  latestCodeScore: number | null;
  latestContentScore: number | null;
  status: SkillStatus;
  downloads: number;
  createdAt: number; // unix timestamp
  updatedAt: number;
}

export interface MarketplaceEntry {
  source: string; // e.g. "smithery", "npm", "awesome-mcp-servers"
  packageName: string;
  description: string;
  repositoryUrl: string | null;
  category: SkillCategory;
  tags: string[];
  discoveredAt: number;
}
