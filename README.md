# AI for 6G — Experiential Learning Platform

An interactive workshop application covering Intelligent Reflecting Surfaces and
Semantic Communication. It ships embedded lesson content, browser-based simulators
(canvas and WebGL), assessments, and progress tracking that persists locally.

---

## Quick start

**Prerequisites:** Node.js 20+

```bash
npm install
cp .env.example .env.local   # optional; sensible defaults apply
npm run dev                  # http://localhost:3000
```

The central lab authorization gate is **off by default in development** so
`npm run dev` does not redirect you to the login portal, and **on by default in
production builds**.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000 |
| `npm run typecheck` | `tsc --noEmit` in strict mode |
| `npm test` | Vitest suite |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run verify` | Typecheck + tests + build — run before pushing |
| `npm run docker:build` / `docker:run` | Build and run the production image |

---

## Architecture

```
index.tsx          Bootstrap: error boundary → lab auth gate → App
App.tsx            Providers + HashRouter; every page is lazy-loaded
context/           Theme · Auth · Progress (all localStorage-backed)
hooks/             useLocalStorage — stable setter, cross-tab sync
lib/               random (Fisher–Yates) · quiz · registerServiceWorker
components/        UI primitives, simulators, LazyThreeScene
pages/             One module per route, code-split
data/content.ts    All lesson, glossary and assessment content
public/            manifest, icons, service-worker.js
nginx.conf         Production server config
nginx-security-headers.conf   Shared headers, included per location
```

### Performance notes

- **Every route is code-split.** Statically importing the pages pulled three.js
  (~1.2 MB), recharts (~360 KB) and react-markdown into the initial download, so
  visitors paid for the entire 3D engine before they could log in.
- **The 3D scene loads on scroll** (`components/LazyThreeScene.tsx`). It is one
  widget at the bottom of the Tools page and accounts for most of that page's
  weight, so it downloads via IntersectionObserver — or on an explicit button
  press when that API is unavailable.
- **`manualChunks` pins only `react`** plus Vite's preload helper. Naming a
  manual chunk forces it into the shared graph; leaving three.js and recharts
  unpinned lets Rollup attach them to the routes that actually import them.

### Things that are easy to get wrong here

- **Dark mode is class-based and that requires one line of CSS.** Tailwind v4
  ignores `darkMode: 'class'` in `tailwind.config.js` — the
  `@custom-variant dark (&:where(.dark, .dark *));` in `index.css` is what makes
  the theme toggle work. Without it every `dark:` utility compiles into
  `@media (prefers-color-scheme: dark)` and the toggle silently does nothing.
- **`@tailwindcss/typography` is load-bearing.** Lesson content and the legal
  pages render markdown inside `prose` containers; without the plugin those
  classes match nothing and the content renders unstyled.
- **Never write unlayered CSS in `index.css`.** Cascade layers make unlayered
  rules beat *every* layered rule regardless of specificity, and all Tailwind
  output — including `prose` — lives in layers. A stray global
  `* { margin: 0 }` here silently zeroed the margins on every heading and
  paragraph in the lesson content. Custom CSS belongs in `@layer base` or
  `@layer components`.
- **The service worker must never be cached.** `nginx.conf` sends
  `no-store` for `/service-worker.js`. If it is cached, clients keep running the
  old worker and can never receive a fix to the caching strategy.
- **nginx drops inherited `add_header`.** Any `location` that declares its own
  `add_header` loses every header from the parent block. That is why the security
  headers live in `nginx-security-headers.conf` and are `include`-d into each
  location rather than being declared once at `server` level.

---

## Authentication

Two independent layers:

1. **Lab authorization** (`components/LabAuthGuard.tsx`) — verifies a token with
   the central live-labs service. A verified session is re-checked every 15
   minutes rather than trusted for the tab's lifetime, so revoking access takes
   effect. Configure with the `VITE_LAB_*` variables.
2. **Workshop demo login** (`context/AuthContext.tsx`) — a `demo_user`/`demo123`
   form. **This is not a security boundary.** Anything prefixed with `VITE_` is
   compiled into the public bundle, and the login screen prints the credentials
   on the page. It exists to shape the workshop flow; layer 1 is the real control.

---

## Deployment

The app builds to static files served by nginx in a two-stage image.

```bash
docker build -t ai-for-6g .
docker run --rm -p 3000:3000 ai-for-6g
```

The image runs as the unprivileged `nginx` user, exposes `/healthz` for
orchestrator probes, and applies the security headers and cache policy described
above. `cloudbuild.yaml` deploys it to Cloud Run.

**Verify a build before shipping** — only the entry chunk, the `react` chunk and
the stylesheet should be preloaded:

```bash
npm run verify
grep -E 'modulepreload|stylesheet' dist/index.html
```

If a large chunk such as `Tools-` or `ThreeScene-` appears there, something in
the entry's static import graph is reaching code that should be lazy.
