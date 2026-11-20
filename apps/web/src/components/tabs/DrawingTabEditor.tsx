import type { DrawingTab } from '@cryptnote/crypto';
import { CircleNotchIcon } from '@phosphor-icons/react';
import { lazy, Suspense } from 'react';

// Set before dynamically importing Excalidraw (ESM static imports hoist above module body code)
// so Excalidraw registers FontFaces against our self-hosted `/excalidraw-assets/fonts/` origin.
const excalidrawGlobal = globalThis as typeof globalThis & {
  EXCALIDRAW_ASSET_PATH?: string;
};
excalidrawGlobal.EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';

const LazyExcalidrawCanvas = lazy(() =>
  import('./ExcalidrawCanvas.tsx').then(module => ({ default: module.ExcalidrawCanvas })),
);

export function DrawingTabEditor({
  tab,
  onChange,
}: {
  readonly tab: DrawingTab;
  readonly onChange: (next: DrawingTab) => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-surface">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted">
            <CircleNotchIcon className="size-4 animate-spin text-accent" aria-hidden="true" />
            <span>Loading whiteboard…</span>
          </div>
        }
      >
        <LazyExcalidrawCanvas tab={tab} onChange={onChange} />
      </Suspense>
    </div>
  );
}
