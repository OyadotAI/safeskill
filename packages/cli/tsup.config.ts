import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'bin/safeskill': 'src/bin/safeskill.ts',
    'index': 'src/index.ts',
  },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  splitting: true,
  clean: true,
  dts: true,
  // Bundle workspace packages into the output so npm users don't need them
  noExternal: ['@safeskill/shared', '@safeskill/scanner'],
  // Shebang is already in src/bin/safeskill.ts, tsup preserves it
});
