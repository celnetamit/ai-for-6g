/**
 * Deployment configuration, read once from the build-time environment.
 *
 * This exists because three separate places were each deriving the hub's
 * address independently — the auth guard held its own `CONFIG` literal, and the
 * hub client needed the same value to know where to POST feedback and
 * agreements. Two copies of "where is live-labs.org" is one copy too many: a
 * deployment pointed at a staging hub for authorisation and production for data
 * is a class of mistake worth making impossible.
 *
 * Everything here is `VITE_`-prefixed and therefore compiled into the public
 * bundle. Nothing secret belongs in it. The Copilot gateway is configured the
 * same way and holds no key for the same reason — see `services/aiClient.ts`.
 */

const env = import.meta.env;

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;

const int = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const appConfig = {
  /** Injected by vite.config.ts from package.json. */
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',

  auth: {
    /**
     * Default off in dev so `npm run dev` does not bounce the developer to the
     * central portal; on for production builds.
     */
    enabled: env.VITE_LAB_AUTH_ENABLED
      ? env.VITE_LAB_AUTH_ENABLED !== 'false'
      : Boolean(env.PROD),
    verifyUrl: str(env.VITE_LAB_AUTH_VERIFY_URL, 'https://live-labs.org/api/auth/authorize-lab'),
    loginUrl: str(env.VITE_LAB_LOGIN_URL, 'https://live-labs.org/login'),
    /**
     * Where the floating back button goes: this lab's page on the hub.
     *
     * The route is `/dashboard/labs/<slug>` and NOT `/labs/<slug>` — the
     * latter exists as the public guide and is a different page, so pointing
     * here at the wrong one gives a link that looks right and lands wrong.
     *
     * This is the fallback. When the hub has told us the slug (it comes back
     * from `authorize-lab` alongside the identity) the guard builds the URL
     * from that instead, so renaming the lab on the hub does not strand the
     * button on a 404 that nobody would notice until someone pressed it.
     */
    homeUrl: str(env.VITE_LAB_HOME_URL, 'https://live-labs.org/dashboard/labs/ai-6g'),
    revalidateMs: int(env.VITE_LAB_AUTH_REVALIDATE_MS, 900_000),
    verifyTimeoutMs: 15_000,
  },
} as const;
