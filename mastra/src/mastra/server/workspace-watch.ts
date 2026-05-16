import { existsSync, watch, type FSWatcher } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { workspaceRoot } from '../workspace-root';
import { bus } from './bus';

let watcher: FSWatcher | null = null;

function toWorkspacePath(filename: string | Buffer | null): string | null {
  if (!filename) {
    return null;
  }

  const path = relative(workspaceRoot, resolve(workspaceRoot, filename.toString())).replaceAll('\\', '/');
  return path && !path.startsWith('..') ? path : null;
}

export async function startWorkspaceWatcher(): Promise<void> {
  if (watcher) {
    return;
  }

  await mkdir(workspaceRoot, { recursive: true });

  watcher = watch(workspaceRoot, { recursive: true }, (eventType, filename) => {
    const path = toWorkspacePath(filename);

    if (!path) {
      return;
    }

    if (path.startsWith('.preview/') || path.startsWith('node_modules/') || path.startsWith('.git/') || path === 'bun.lock') {
      return;
    }

    bus.emitEvent('workspace.file', {
      path,
      change: eventType === 'rename' && !existsSync(resolve(workspaceRoot, path)) ? 'unlink' : eventType === 'rename' ? 'add' : 'change',
    });
  });
}
