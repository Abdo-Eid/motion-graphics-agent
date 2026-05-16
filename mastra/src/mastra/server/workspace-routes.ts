import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import type { ApiRoute } from '@mastra/core/server';

import { workspaceRoot } from '../workspace-root';

function resolveWorkspacePath(path: string): string | null {
  if (path.includes('\0')) {
    return null;
  }

  const root = resolve(workspaceRoot);
  const target = resolve(root, path || '.');

  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    return null;
  }

  return target;
}

function toWorkspacePath(absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).replaceAll('\\', '/');
}

function mimeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.css':
      return 'text/css';
    case '.html':
      return 'text/html';
    case '.json':
      return 'application/json';
    case '.md':
      return 'text/markdown';
    case '.svg':
      return 'image/svg+xml';
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
      return 'text/typescript';
    default:
      return 'text/plain';
  }
}

export const workspaceRoutes: ApiRoute[] = [
  {
    path: '/workspace/files',
    method: 'GET',
    handler: async c => {
      const path = c.req.query('path') ?? '';
      const target = resolveWorkspacePath(path);

      if (!target) {
        return c.json({ error: 'Invalid workspace path' }, 400);
      }

      try {
        const entries = await readdir(target, { withFileTypes: true });
        return c.json(entries
          .filter(entry => entry.name !== '.git')
          .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
          .map(entry => ({
            name: entry.name,
            kind: entry.isDirectory() ? 'dir' as const : 'file' as const,
          })));
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : 'Unable to list workspace files' }, 404);
      }
    },
  },
  {
    path: '/workspace/file',
    method: 'GET',
    handler: async c => {
      const path = c.req.query('path') ?? '';
      const target = resolveWorkspacePath(path);

      if (!target) {
        return c.json({ error: 'Invalid workspace path' }, 400);
      }

      try {
        const info = await stat(target);

        if (!info.isFile()) {
          return c.json({ error: `${toWorkspacePath(target)} is not a file` }, 400);
        }

        return c.json({
          content: await readFile(target, 'utf8'),
          mime: mimeFor(target),
        });
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : 'Unable to read workspace file' }, 404);
      }
    },
  },
];
