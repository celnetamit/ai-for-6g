/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Deployment environment label, surfaced in diagnostics. */
  readonly VITE_APP_ENV?: string;

  /** Demo credentials for the workshop login. Never real secrets — see AuthContext. */
  readonly VITE_DEMO_USER?: string;
  readonly VITE_DEMO_PASSWORD?: string;

  /** Set to 'false' to bypass the central lab authorization gate (local development). */
  readonly VITE_LAB_AUTH_ENABLED?: string;
  readonly VITE_LAB_AUTH_VERIFY_URL?: string;
  readonly VITE_LAB_LOGIN_URL?: string;
  readonly VITE_LAB_HOME_URL?: string;
  readonly VITE_LAB_AUTH_REVALIDATE_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
declare const __APP_BUILD_TIME__: string;
