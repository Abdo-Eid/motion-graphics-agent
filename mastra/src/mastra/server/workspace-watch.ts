import { mkdir } from 'node:fs/promises';

import chokidar, { type FSWatcher } from 'chokidar';

import { workspaceRoot } from '../workspace-root';
import { bus } from './bus';

let watcher: FSWatcher | null = null;

const IGNORED = [
  /[/\\]\.preview[/\\]/,
  /[/\\]node_modules[/\\]/,
  /[/\\]\.git[/\\]/,
  /bun\.lock$/,
];

function toWorkspacePath(absPath: string): string {
  const rel = absPath.replace(workspaceRoot, '').replaceAll('\\', '/').replace(/^\//, '');
  return rel;
}

export async function startWorkspaceWatcher(): Promise<void> {
  if (watcher) {
    return;
  }

  await mkdir(workspaceRoot, { recursive: true });

  // chokidar works cross-platform (including Linux where Node's fs.watch
  // with { recursive: true } only watches the top-level directory).
  watcher = chokidar.watch(workspaceRoot, {
    ignored: IGNORED,
    persistent: true,
    ignoreInitial: true,
    // Avoid emitting events for incomplete writes.
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 50 },
  });

  watcher.on('add', (absPath) => {
    bus.emitEvent('workspace.file', { path: toWorkspacePath(absPath), change: 'add' });
  });

  watcher.on('change', (absPath) => {
    bus.emitEvent('workspace.file', { path: toWorkspacePath(absPath), change: 'change' });
  });

  watcher.on('unlink', (absPath) => {
    bus.emitEvent('workspace.file', { path: toWorkspacePath(absPath), change: 'unlink' });
  });

  watcher.on('error', (err) => {
    console.error('[workspace-watch] watcher error:', err);
  });
}
