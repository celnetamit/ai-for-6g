import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json' with { type: 'json' };

/**
 * Identifies this build. Used for the service worker's cache names, so every
 * deploy retires the previous shell instead of inheriting it.
 */
const buildStamp = `${pkg.version}-${Date.now().toString(36)}`;

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      // The previous config pinned the HMR host to `localhost`, which breaks the
      // dev server whenever it is reached over the LAN or from a container.
      // Omitting `host` lets the client infer it from the page origin.
      hmr: { protocol: 'ws' },
    },

    plugins: [
      react(),
      tailwindcss(),
      /**
       * Stamps the service worker with this build's identity.
       *
       * `public/` is copied verbatim and never passes through the transform
       * pipeline, so the worker cannot read `__APP_VERSION__` the way the
       * application does — the token has to be substituted in the emitted file.
       * Without it the cache names never change between deploys and the old
       * shell is kept alive by the very code meant to retire it.
       */
      {
        name: 'stamp-service-worker',
        apply: 'build',
        // `writeBundle` rather than `closeBundle`: it is handed the directory
        // actually written to, so a build with `--outDir` (which the browser
        // verification uses) is stamped as well as the default one.
        async writeBundle(options) {
          const directory = options.dir ?? path.resolve(__dirname, 'dist');
          const file = path.resolve(directory, 'service-worker.js');
          try {
            const source = await readFile(file, 'utf8');
            await writeFile(file, source.replaceAll('__SW_BUILD_STAMP__', buildStamp));
            this.info(`service worker stamped ${buildStamp}`);
          } catch (error) {
            // A worker that cannot be stamped would ship with a cache name that
            // never changes — the exact defect this plugin exists to remove —
            // so fail the build rather than emit it.
            this.error(`could not stamp the service worker: ${String(error)}`);
          }
        },
      },
    ],

    define: {
      // NOTE: the old config injected `process.env.API_KEY` and
      // `process.env.GEMINI_API_KEY` here. Nothing in the source ever read
      // either one, so a Gemini key was being compiled into a public bundle for
      // no functional reason. Removed. If AI features are added later, route
      // them through a server-side endpoint rather than reinstating this.
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },

    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
      // Two copies of react in the graph break hooks in confusing ways, and the
      // three.js ecosystem pulls react in through several packages.
      dedupe: ['react', 'react-dom', 'three'],
    },

    build: {
      target: 'es2022',
      sourcemap: isProduction ? 'hidden' : true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          /**
           * Only `react` is pinned to a manual chunk — it is the one library on
           * every route's critical path.
           *
           * three.js and recharts are deliberately NOT pinned here. Naming a
           * manual chunk forces it into the graph as a shared chunk; combined
           * with the lazy routes that now import them, letting Rollup place them
           * keeps them attached to the route that actually needs them.
           */
          manualChunks(id: string) {
            if (id.includes('vite/preload-helper')) return 'react';
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
            return undefined;
          },
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },

    esbuild: {
      // Keeps console.warn/error, which the app uses for real diagnostics.
      pure: isProduction ? ['console.log', 'console.debug'] : [],
      legalComments: 'none',
    },

    test: {
      environment: 'node',
      // `.tsx` as well: component regression tests live beside the pure-logic
      // ones, and a pattern that silently matched none of them reported "no test
      // files found" rather than failing anything.
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      // Hook tests opt into jsdom per-file via a `@vitest-environment` comment,
      // so the fast node environment stays the default for pure-logic suites.
      globals: false,
    },
  };
});
