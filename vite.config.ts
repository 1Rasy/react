import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { legacyPages } from './src/migration/legacy-pages';

const root = import.meta.dirname;
const inputs = Object.fromEntries(
  [...legacyPages.map(page => page.file), 'react-shell.html'].map(file => [
    file.replace(/\.html$/, ''),
    resolve(root, file)
  ])
);

const cleanPathToFile = new Map(
  legacyPages.flatMap(page => [
    [page.cleanPath, `/${page.file}`] as const,
    ...(page.cleanPath === '/' ? [['/index', '/index.html'] as const] : [])
  ])
);

function legacyCleanUrlFallback(): Plugin {
  const install = (middlewares: { use: (handler: (req: { url?: string }, _res: unknown, next: () => void) => void) => void }) => {
    middlewares.use((req, _res, next) => {
      if (req.url) {
        const url = new URL(req.url, 'http://vite.local');
        const target = cleanPathToFile.get(url.pathname);
        if (target) req.url = target + url.search;
      }
      next();
    });
  };

  return {
    name: 'legacy-clean-url-fallback',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    }
  };
}

function copyLegacyClassicScripts(): Plugin {
  const assets = [
    ...readdirSync(root).filter(file => file.endsWith('.js')),
    '_redirects'
  ];

  return {
    name: 'copy-legacy-classic-scripts',
    buildStart() {
      assets.forEach(file => {
        this.emitFile({
          type: 'asset',
          fileName: file,
          source: readFileSync(resolve(root, file))
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [legacyCleanUrlFallback(), copyLegacyClassicScripts(), react()],
  build: {
    rollupOptions: { input: inputs }
  }
});
