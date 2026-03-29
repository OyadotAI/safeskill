/**
 * Convert an npm package name to a URL-safe slug.
 *   @modelcontextprotocol/server-filesystem → modelcontextprotocol-server-filesystem
 *   openai → openai
 *   @anthropic-ai/sdk → anthropic-ai-sdk
 */
export function packageToSlug(packageName: string): string {
  return packageName
    .replace(/^@/, '')     // strip leading @
    .replace(/\//g, '-')   // replace / with -
    .replace(/[^a-z0-9\-]/gi, '-')   // replace special chars (dots, underscores too)
    .replace(/-+/g, '-')   // collapse multiple dashes
    .replace(/^-|-$/g, '') // trim dashes
    .toLowerCase();
}

/**
 * Build slug→packageName lookup from a list of package names.
 */
export function buildSlugIndex(packageNames: string[]): Record<string, string> {
  const index: Record<string, string> = {};
  for (const name of packageNames) {
    index[packageToSlug(name)] = name;
  }
  return index;
}
