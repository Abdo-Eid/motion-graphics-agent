import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { ApiRoute } from '@mastra/core/server';

import { workspaceRoot } from '../workspace-root';

const previewDir = resolve(workspaceRoot, '.preview');
const previewEntry = resolve(previewDir, 'preview-entry.tsx');
const previewOutDir = resolve(previewDir, 'dist');

function previewHtml(projectId: string, revision: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Preview ${projectId}</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <style>
      html, body, #root { margin: 0; width: 100%; height: 100%; background: #111114; }
      * { box-sizing: border-box; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/preview/assets/preview-entry.js?rev=${encodeURIComponent(revision)}"></script>
  </body>
</html>`;
}

function previewEntrySource(): string {
  return `import React from 'react';
import { createRoot } from 'react-dom/client';
import { Player } from '@remotion/player';
import { MyComposition, composition } from '../src/Composition';

function PreviewApp() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111114', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Player
        component={MyComposition}
        durationInFrames={composition.durationInFrames}
        fps={composition.fps}
        compositionWidth={composition.width}
        compositionHeight={composition.height}
        controls
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<PreviewApp />);
`;
}

function isPreviewAssetPath(path: string): boolean {
  const target = resolve(previewOutDir, path);
  return target === previewOutDir || target.startsWith(`${previewOutDir}${sep}`);
}

function contentType(path: string): string {
  switch (extname(path)) {
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

async function buildPreviewBundle(): Promise<void> {
  await mkdir(previewOutDir, { recursive: true });
  await writeFile(previewEntry, previewEntrySource(), 'utf8');

  const result = await Bun.build({
    entrypoints: [previewEntry],
    outdir: previewOutDir,
    target: 'browser',
    format: 'esm',
    splitting: false,
    sourcemap: 'none',
    minify: false,
  });

  if (!result.success) {
    const message = result.logs.map(log => log.message).join('\n') || 'Unable to build preview bundle';
    throw new Error(message);
  }
}

export const previewRoutes: ApiRoute[] = [
  {
    path: '/preview/:projectId',
    method: 'GET',
    handler: async c => {
      const projectId = c.req.param('projectId') ?? 'default';
      const revision = c.req.query('rev') ?? `${Date.now()}`;

      try {
        await buildPreviewBundle();
        return new Response(previewHtml(projectId, revision), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : 'Unable to build preview' }, 500);
      }
    },
  },
  {
    path: '/preview/assets/:file',
    method: 'GET',
    handler: async c => {
      const file = c.req.param('file') ?? '';

      if (!file || file.includes('\0') || file.includes('/') || file.includes('\\') || !isPreviewAssetPath(file)) {
        return c.json({ error: 'Invalid preview asset path' }, 400);
      }

      const target = resolve(previewOutDir, file);

      try {
        return new Response(await readFile(target), {
          headers: {
            'Content-Type': contentType(target),
            'Cache-Control': 'no-store',
          },
        });
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : 'Preview asset not found' }, 404);
      }
    },
  },
];
