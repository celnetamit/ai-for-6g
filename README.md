# AI for 6G — Virtual Live Lab

**AI for 6G: Intelligent Communication Networks, Semantic Connectivity &
Autonomous Wireless Systems Lab.**

A virtual research environment in which a learner configures, simulates and
optimises next-generation communication systems. Five knowledge modules, three
learning levels, six experiments, three trained neural models, three generated
datasets and a research-report generator.

The organising principle is that **nothing is asserted that could be measured**:

- bit error rates are *counted* over generated noise, not read off a curve, and
  the closed-form curve is plotted beside the count so the two can be compared;
- the gain of a reflecting surface is the magnitude of a complex sum, `|h_d + Σ
  βe^{jθ}h_r h_t|²`, not a fitted line;
- the three DeepJSCC architectures were really trained, offline, by a script in
  this repository, and ship with model cards whose numbers a test re-verifies
  against the shipped weights;
- everything the models leave out is printed on the screen that shows their
  output and in the header of every export.

Nothing here is a measurement of a deployed network, and none of it has been
validated against hardware. Every results screen says so.

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
| `npm run train` | Retrain the three DeepJSCC models and rewrite their weights and cards |
| `npm run docker:build` / `docker:run` | Build and run the production image |

`npm run train` takes about twenty minutes and is only needed when an
architecture or the data generator changes. Its output is committed — the
browser never trains. After running it, `npm test` re-verifies that each model
card matches the weights it describes; a card that has drifted fails there
rather than misleading a reader.

---

## Architecture

```
index.tsx              Bootstrap: error boundary → lab auth gate → App
App.tsx                Providers + HashRouter; every page is lazy-loaded
context/               Theme · Auth · Progress · Lab (all localStorage-backed)
hooks/                 useLocalStorage — stable setter, cross-tab sync

lib/                   THE SIMULATION ENGINE — pure, seeded, unit-tested
  complex.ts           Complex arithmetic for the baseband model
  channel.ts           Link budget: FSPL, thermal noise, Shannon capacity
  modulation.ts        Gray-coded QAM, ML detection, link adaptation, EVM
  signalModel.ts       Y = HX + N; Rician block fading; counted BER/BLER
  irs.ts               y = (h_rᵀ Φ h_t + h_d)x + n; phase quantisation
  optimizers.ts        Random · greedy · REINFORCE · cross-entropy · closed form
  performance.ts       Throughput, HARQ latency, energy efficiency, grading
  sources.ts           Procedural 16×16 scene generator (Node and browser)
  classical.ts         DCT + quantisation + coded transmission baseline
  semantic.ts          Runs both systems over one channel and measures them
  experiment.ts        The §4 workflow as one async function
  advisor.ts           Parameter suggestions, each one evaluated
  report.ts            Research report; no language model contributes to it
  datasets.ts          The three demo datasets and their exports
  nn/                  autograd · layers · the three JSCC architectures
  models/weights/      Trained int8 weights + model cards (generated)

services/              aiClient.ts (gateway transport) · copilot.ts
scripts/train-models.ts  Offline training; writes lib/models/weights/
components/lab/        Parameter panel, result dashboard, charts, Copilot
pages/                 One module per route, code-split
data/knowledge.ts      The five knowledge-bank modules, written per level
data/content.ts        Lessons, glossary, assessments, legal copy
public/                manifest, icons, service-worker.js
nginx.conf             Production server config
```

### The engine

| Quantity | How it is obtained |
| --- | --- |
| Bit error rate | Counted over generated symbols through a generated channel |
| Block error rate | Counted per block under block fading |
| EVM | RMS error vector of the equalised symbols |
| SNR with a surface | `\|h_d + Σ βe^{jθ_n} h_{r,n} h_{t,n}\|²·P/N₀` |
| Throughput | Highest sustainable MCS, less 14% overhead and block errors |
| Latency | Alignment + time on air + propagation + processing + HARQ |
| Energy efficiency | Goodput / (P_tx/η + baseband + per-element control) |
| Reconstruction quality | PSNR, SSIM and a task-weighted PSNR against the source |

Every one of those is checked somewhere in `tests/`: the measured BER against
the closed-form curve, the N² scaling law against 6.02 dB per doubling, the
phase-quantisation loss against `(2^b/π·sin(π/2^b))²`, and every gradient in the
autodiff engine against finite differences.

### The AI models

Three DeepJSCC architectures — convolutional, single-block self-attention, and
fully connected — trained identically on the same generated scenes at the same
bandwidth ratios, so the comparison isolates the architecture. They are
rate-adaptive: the cut point is drawn during training, so puncturing the latent
at inference is a supported operation rather than an out-of-distribution one.

Weights ship as int8; the cost of that quantisation is *measured* on the
held-out set and recorded on each card, and float32 is used instead if it ever
exceeds 0.25 dB.

Reinforcement learning appears where it belongs: configuring the surface from
reward alone. REINFORCE uses a factored categorical policy over the phases the
hardware can actually set — a continuous Gaussian policy over 64 dimensions was
measurably worse than random search, and the comment in `lib/optimizers.ts`
records that measurement.

### The Copilot

`services/copilot.ts`. One transport, a server-side gateway, configured by
`VITE_LLM_PROXY_URL`. No vendor SDK is bundled and no key is read into the
client, because anything a `VITE_` variable holds is published.

It is never asked to compute anything: every figure it can see was produced by
the engine and handed to it as context, and a numeric audit flags any figure in
a reply that does not appear there. With no gateway configured the assistant is
**absent rather than simulated** — the panel shows the engine's own reading of
its own numbers, labelled as such.

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
