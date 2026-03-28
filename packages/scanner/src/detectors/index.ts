import type { SourceFile } from 'ts-morph';
import type { CodeFinding } from '@safeskill/shared';

import { detect as detectFilesystemAccess } from './filesystem-access.js';
import { detect as detectNetworkAccess } from './network-access.js';
import { detect as detectEnvAccess } from './env-access.js';
import { detect as detectProcessSpawn } from './process-spawn.js';
import { detect as detectCryptoUsage } from './crypto-usage.js';
import { detect as detectObfuscation } from './obfuscation.js';
import { detect as detectInstallScripts } from './install-scripts.js';
import { detect as detectDynamicRequire } from './dynamic-require.js';

export type Detector = (sourceFile: SourceFile, relPath: string) => CodeFinding[];

export const ALL_DETECTORS: readonly Detector[] = [
  detectFilesystemAccess,
  detectNetworkAccess,
  detectEnvAccess,
  detectProcessSpawn,
  detectCryptoUsage,
  detectObfuscation,
  detectInstallScripts,
  detectDynamicRequire,
] as const;

export {
  detectFilesystemAccess,
  detectNetworkAccess,
  detectEnvAccess,
  detectProcessSpawn,
  detectCryptoUsage,
  detectObfuscation,
  detectInstallScripts,
  detectDynamicRequire,
};
