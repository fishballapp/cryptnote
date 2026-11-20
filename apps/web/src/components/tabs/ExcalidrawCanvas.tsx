import type { DrawingTab, ExcalidrawBinaryFile, ExcalidrawElementData } from '@cryptnote/crypto';
import { CaptureUpdateAction, Excalidraw, MainMenu, restoreElements } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type ResolvedScheme, resolveActiveScheme, subscribeColorScheme } from '../../lib/theme.ts';

const UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: true,
    clearCanvas: true,
    export: { saveFileToDisk: true },
    loadScene: true,
    saveToActiveFile: false,
    toggleTheme: false,
    saveAsImage: true,
  },
} as const;

const isDeletedElement = (element: ExcalidrawElementData): boolean => element.isDeleted === true;

const collectReferencedFiles = (
  elements: readonly ExcalidrawElementData[],
  files: BinaryFiles | Readonly<Record<string, ExcalidrawBinaryFile>> | undefined,
): Record<string, ExcalidrawBinaryFile> | undefined => {
  if (files === undefined) return undefined;
  const usedIds = new Set<string>();
  for (const element of elements) {
    if (typeof element.fileId === 'string' && element.fileId.length > 0) {
      usedIds.add(element.fileId);
    }
  }
  if (usedIds.size === 0) return undefined;

  const picked: Record<string, ExcalidrawBinaryFile> = {};
  let count = 0;
  for (const id of usedIds) {
    const file = files[id];
    if (file === undefined) continue;
    picked[id] = {
      id: file.id,
      mimeType: file.mimeType,
      dataURL: file.dataURL,
      created: file.created,
    };
    count += 1;
  }
  return count > 0 ? picked : undefined;
};

const buildSceneSignature = (
  elements: readonly ExcalidrawElementData[],
  files: Readonly<Record<string, ExcalidrawBinaryFile>> | undefined,
): string => {
  const elemPart = elements
    .map(el => `${String(el.id ?? '')}:${String(el.version ?? 0)}:${String(el.versionNonce ?? 0)}`)
    .join(',');
  const filePart = files
    ? Object.values(files)
        .map(file => `${file.id}:${file.created}:${file.dataURL.length}`)
        .sort()
        .join(',')
    : '';
  return `${elemPart}|${filePart}`;
};

const toRestoredElements = (elements: readonly ExcalidrawElementData[]) =>
  restoreElements(elements as unknown as Parameters<typeof restoreElements>[0], null);

const toBinaryFiles = (
  files: Readonly<Record<string, ExcalidrawBinaryFile>> | undefined,
): BinaryFiles | undefined => (files === undefined ? undefined : (files as unknown as BinaryFiles));

const useResolvedScheme = (): ResolvedScheme => {
  const [scheme, setScheme] = useState<ResolvedScheme>(() => resolveActiveScheme());

  useEffect(() => {
    const unsubscribe = subscribeColorScheme(setScheme);
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta === null) return unsubscribe;
    const observer = new MutationObserver(() => setScheme(resolveActiveScheme()));
    observer.observe(meta, { attributes: true, attributeFilter: ['content'] });
    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, []);

  return scheme;
};

export function ExcalidrawCanvas({
  tab,
  onChange,
}: {
  readonly tab: DrawingTab;
  readonly onChange: (next: DrawingTab) => void;
}) {
  const scheme = useResolvedScheme();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

  // Seed Excalidraw once on mount; later external updates flow through `api.updateScene`.
  const [initialData] = useState<ExcalidrawInitialDataState>(() => ({
    elements: toRestoredElements(tab.elements),
    files: toBinaryFiles(tab.files),
    scrollToContent: tab.elements.length > 0,
  }));

  const lastSignatureRef = useRef<string>(buildSceneSignature(tab.elements, tab.files));

  // Push externally loaded scenes (switching titles, reloading, or remote refresh) into Excalidraw.
  useEffect(() => {
    if (api === null) return;
    const incomingSignature = buildSceneSignature(tab.elements, tab.files);
    if (incomingSignature === lastSignatureRef.current) return;

    lastSignatureRef.current = incomingSignature;
    const restored = toRestoredElements(tab.elements);
    if (tab.files !== undefined) {
      const fileList = Object.values(tab.files) as unknown as BinaryFileData[];
      if (fileList.length > 0) api.addFiles(fileList);
    }
    api.updateScene({
      elements: restored,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.history.clear();
    if (restored.length > 0) {
      api.scrollToContent(restored, { fitToViewport: false });
    }
  }, [api, tab]);

  const handleChange = useCallback(
    (elements: readonly Record<string, unknown>[], _appState: AppState, files: BinaryFiles) => {
      const nonDeleted = elements.filter(element => !isDeletedElement(element));
      const referencedFiles = collectReferencedFiles(nonDeleted, files);
      const nextSignature = buildSceneSignature(nonDeleted, referencedFiles);
      if (nextSignature === lastSignatureRef.current) return;

      lastSignatureRef.current = nextSignature;
      onChange(
        referencedFiles === undefined
          ? { kind: 'drawing', elements: nonDeleted }
          : { kind: 'drawing', elements: nonDeleted, files: referencedFiles },
      );
    },
    [onChange],
  );

  return (
    <div className="cryptnote-excalidraw relative h-full min-h-[420px] w-full flex-1">
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        onChange={handleChange}
        theme={scheme}
        UIOptions={UI_OPTIONS}
        aiEnabled={false}
        handleKeyboardGlobally={false}
        name="cryptnote-drawing"
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
