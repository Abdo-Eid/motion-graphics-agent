# Remotion Workspace

This is the Remotion project used by the motion graphics agent. The Implementor agent writes and edits scene code here.

## Preview Contract

The remote frontend preview bundles this workspace automatically. Keep the project shape stable:

- `src/index.ts` registers `RemotionRoot`.
- `src/Root.tsx` defines the `Composition` with id `MyComp`.
- `src/Composition.tsx` exports `MyComposition` and `composition` (`durationInFrames`, `fps`, `width`, `height`).

## Tailwind CSS

Tailwind is loaded via CDN in the preview. Classes like `bg-black`, `text-white`, `text-8xl` work as expected. Do not run `remotion bundle` or `npm run build` — the preview is handled automatically by the server.

## Reset to Baseline

After any test run, reset to the clean starting point:

```bash
cd mastra/.workspace
git reset --hard
git clean -fd
```

This restores the blank project with the stable preview contract.
