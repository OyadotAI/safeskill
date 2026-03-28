import { randomBytes } from 'crypto';

export function nanoid(size = 21): string {
  const bytes = randomBytes(size);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let id = '';
  for (let i = 0; i < size; i++) {
    id += chars[bytes[i]! & 63];
  }
  return id;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export function getLineContent(source: string, line: number): string {
  const lines = source.split('\n');
  return lines[line - 1] ?? '';
}
