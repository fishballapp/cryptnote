import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { preloadDynamicImport } from '@internal/vite-plugins/preload-dynamic-import';
import { stripHtmlComments } from '@internal/vite-plugins/strip-html-comments';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const webPort = Number(process.env.CRYPTNOTE_WEB_PORT ?? 5184);
const workerPort = Number(process.env.CRYPTNOTE_WORKER_PORT ?? 8792);

const require = createRequire(import.meta.url);
const excalidrawFontsDir = path.join(
  path.dirname(require.resolve('@excalidraw/excalidraw')),
  'fonts',
);
const microlighterGrammarsDir = path.join(
  path.dirname(require.resolve('microlighter')),
  'grammars',
);

const EXCALIDRAW_FONTS_PREFIX = '/excalidraw-assets/fonts/';

const FONT_MIME: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.css': 'text/css; charset=utf-8',
};

/**
 * Self-hosts Excalidraw's bundled font files under `/excalidraw-assets/fonts/` in both dev and
 * production builds so the Drawing tab works with zero external CDN requests under strict CSP.
 *
 * Also points Excalidraw's hardcoded `ASSETS_FALLBACK_URL` (`https://esm.sh/...`) at our same-origin
 * asset path: Excalidraw 0.18 unconditionally appends `ASSETS_FALLBACK_URL` to every `FontFace`
 * source list even when `window.EXCALIDRAW_ASSET_PATH` is set, which makes Chromium fire CSP
 * violations on every font face. (Tracked in `projects/cryptnote/DECISIONS.md`.)
 */
const EXCALIDRAW_CDN_FALLBACK_PATTERN =
  /("ASSETS_FALLBACK_URL",\s*)`https:\/\/esm\.sh\/[^`]*`[^`]*`[^`]*`(?=\))/u;

const excalidrawAssets = (): Plugin => {
  let outDir = 'dist';
  let isBuild = false;
  let rewroteFallback = false;
  return {
    name: 'cryptnote:excalidraw-assets',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      isBuild = config.command === 'build';
    },
    transform(code, id) {
      if (!id.includes('@excalidraw/excalidraw') || !code.includes('ASSETS_FALLBACK_URL')) {
        return null;
      }
      const next = code.replace(
        EXCALIDRAW_CDN_FALLBACK_PATTERN,
        '$1((globalThis.location?.origin ?? "http://localhost") + "/excalidraw-assets/")',
      );
      if (next !== code) {
        rewroteFallback = true;
        return { code: next, map: null };
      }
      return null;
    },
    buildEnd(error) {
      if (isBuild && error === undefined && !rewroteFallback) {
        this.error(
          'Expected to rewrite @excalidraw/excalidraw ASSETS_FALLBACK_URL for strict CSP, but the pattern did not match. Check whether upstream fixed CDN fallback handling or changed the bundle shape.',
        );
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawPath = req.url?.split('?')[0];
        if (!rawPath?.startsWith(EXCALIDRAW_FONTS_PREFIX)) {
          next();
          return;
        }
        const relative = decodeURIComponent(rawPath.slice(EXCALIDRAW_FONTS_PREFIX.length));
        const resolved = path.resolve(excalidrawFontsDir, relative);
        if (!resolved.startsWith(`${excalidrawFontsDir}${path.sep}`) || !existsSync(resolved)) {
          next();
          return;
        }
        const stat = statSync(resolved);
        if (!stat.isFile()) {
          next();
          return;
        }
        const ext = path.extname(resolved).toLowerCase();
        res.setHeader('Content-Type', FONT_MIME[ext] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        createReadStream(resolved).pipe(res);
      });
    },
    writeBundle() {
      const target = path.join(outDir, 'excalidraw-assets/fonts');
      cpSync(excalidrawFontsDir, target, { recursive: true });
    },
  };
};

/**
 * Copies microlighter's zero-dependency ES grammar modules into `dist/assets/grammars/` so its
 * runtime `import(\`./grammars/${language}.js\`)` resolves on-demand from the same origin under
 * strict `script-src 'self'` CSP.
 */
const microlighterGrammars = (): Plugin => {
  let outDir = 'dist';
  return {
    name: 'cryptnote:microlighter-grammars',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const target = path.join(outDir, 'assets/grammars');
      mkdirSync(target, { recursive: true });
      for (const file of readdirSync(microlighterGrammarsDir)) {
        if (!file.endsWith('.js')) continue;
        cpSync(path.join(microlighterGrammarsDir, file), path.join(target, file));
      }
    },
  };
};

// tanstackRouter() must precede react() so routeTree.gen.ts stays up to date.
export default defineConfig({
  resolve: {
    // Keep transitive deps (e.g. Excalidraw's tunnel-rat) on @cryptnote/web's single React instance
    // instead of pnpm's hoisted root React copy.
    dedupe: ['react', 'react-dom'],
  },
  // Keep microlighter out of dev pre-bundling so its relative `./grammars/${lang}.js` dynamic
  // imports resolve straight from `node_modules/microlighter/dist/grammars/`.
  optimizeDeps: {
    exclude: ['microlighter'],
  },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    excalidrawAssets(),
    microlighterGrammars(),
    preloadDynamicImport('/src/app.tsx'),
    stripHtmlComments(),
  ],
  worker: {
    format: 'es',
  },
  server: {
    port: webPort,
    strictPort: true,
    proxy: { '/api': { target: `http://localhost:${workerPort}` } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
