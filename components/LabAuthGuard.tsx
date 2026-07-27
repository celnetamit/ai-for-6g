import React, { useCallback, useEffect, useRef, useState } from 'react';

const TOKEN_KEY = '__lab_auth_token';
const VERIFIED_AT_KEY = '__lab_verified_at';
const REDIRECT_ATTEMPT_KEY = '__lab_redirect_attempt';
const MAX_REDIRECT_ATTEMPTS = 2;

const env = import.meta.env;

const CONFIG = {
  // Default off in dev so `npm run dev` does not bounce the developer to the
  // central portal; on for production builds.
  enabled: env.VITE_LAB_AUTH_ENABLED ? env.VITE_LAB_AUTH_ENABLED !== 'false' : Boolean(env.PROD),
  verifyUrl: env.VITE_LAB_AUTH_VERIFY_URL || 'https://live-labs.org/api/auth/authorize-lab',
  loginUrl: env.VITE_LAB_LOGIN_URL || 'https://live-labs.org/login',
  homeUrl: env.VITE_LAB_HOME_URL || 'https://live-labs.org/labs',
  revalidateMs: Number.parseInt(env.VITE_LAB_AUTH_REVALIDATE_MS ?? '', 10) || 900_000,
  verifyTimeoutMs: 15_000,
} as const;

type GuardState =
  | { status: 'checking' }
  | { status: 'authorized' }
  | { status: 'denied'; message: string; canRetry: boolean };

const readStorage = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked; the guard still works for this page view */
  }
};

const removeStorage = (key: string): void => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* nothing actionable */
  }
};

/** Strips the token from the address bar and from the history entry. */
const stripTokenFromUrl = (): void => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('auth_token')) return;
  url.searchParams.delete('auth_token');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};

/**
 * Gates the lab behind the central authorization service.
 *
 * Hardened over the original in four ways:
 *  - the verification request has a deadline, so a hung auth service no longer
 *    parks the learner on "Securing Session…" indefinitely;
 *  - the token is stripped from the URL on every path, not only on success, so
 *    it stops leaking into browser history and the Referer header after a failure;
 *  - a verified session is re-checked periodically rather than trusted for the
 *    whole tab lifetime, so revoking access actually takes effect;
 *  - redirects are counted, so a persistently failing service produces one
 *    actionable screen instead of an endless bounce between origins.
 */
export const LabAuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GuardState>(() =>
    CONFIG.enabled ? { status: 'checking' } : { status: 'authorized' },
  );
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const redirectToLogin = useCallback((delayMs: number) => {
    const attempts = Number.parseInt(readStorage(REDIRECT_ATTEMPT_KEY) ?? '0', 10) || 0;
    if (attempts >= MAX_REDIRECT_ATTEMPTS) return;
    writeStorage(REDIRECT_ATTEMPT_KEY, String(attempts + 1));

    redirectTimer.current = setTimeout(() => {
      const callbackUrl = encodeURIComponent(window.location.href);
      window.location.replace(`${CONFIG.loginUrl}?callbackUrl=${callbackUrl}`);
    }, delayMs);
  }, []);

  const verify = useCallback(async (): Promise<void> => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('auth_token');
    const token = tokenFromUrl ?? readStorage(TOKEN_KEY);

    // Strip before any await, so the token is never left in the URL while a
    // slow request is in flight.
    if (tokenFromUrl) stripTokenFromUrl();

    if (!token) {
      redirectToLogin(0);
      return;
    }

    const verifiedAt = Number.parseInt(readStorage(VERIFIED_AT_KEY) ?? '', 10);
    const isFresh = Number.isFinite(verifiedAt) && Date.now() - verifiedAt < CONFIG.revalidateMs;
    if (!tokenFromUrl && isFresh) {
      setState({ status: 'authorized' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.verifyTimeoutMs);

    try {
      const response = await fetch(CONFIG.verifyUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, domainUrl: window.location.origin }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        authorized?: boolean;
        message?: string;
      };

      if (!response.ok || !data.authorized) {
        removeStorage(TOKEN_KEY);
        removeStorage(VERIFIED_AT_KEY);
        setState({
          status: 'denied',
          message: data.message || 'You are not authorized to access this lab.',
          canRetry: false,
        });
        redirectToLogin(3000);
        return;
      }

      writeStorage(TOKEN_KEY, token);
      writeStorage(VERIFIED_AT_KEY, String(Date.now()));
      removeStorage(REDIRECT_ATTEMPT_KEY);
      setState({ status: 'authorized' });
    } catch {
      // A network failure is not a denial: keep the stored token and let the
      // learner retry rather than signing them out of a working session.
      setState({
        status: 'denied',
        message: controller.signal.aborted
          ? 'The authorization service did not respond in time.'
          : 'Unable to reach the authorization service.',
        canRetry: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }, [redirectToLogin]);

  useEffect(() => {
    if (!CONFIG.enabled) return;

    void verify();

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void verify();
    }, CONFIG.revalidateMs);

    return () => {
      clearInterval(interval);
      if (redirectTimer.current !== null) clearTimeout(redirectTimer.current);
    };
  }, [verify]);

  const handleRetry = useCallback(() => {
    setState({ status: 'checking' });
    void verify();
  }, [verify]);

  if (state.status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-4">
          <span
            className="h-8 w-8 rounded-full border-2 border-white/25 border-t-white animate-spin"
            role="status"
            aria-label="Verifying your session"
          />
          <h2 className="text-lg font-semibold">Securing session…</h2>
        </div>
      </div>
    );
  }

  if (state.status === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-4">
        <div className="w-full max-w-md text-center p-8 bg-slate-800 rounded-2xl border border-slate-700">
          <h1 className="text-xl font-bold text-red-400 mb-3">
            {state.canRetry ? 'Verification unavailable' : '403 — Access denied'}
          </h1>
          <p className="text-slate-300 mb-6">{state.message}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {state.canRetry && (
              <button
                type="button"
                onClick={handleRetry}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold transition-colors"
              >
                Try again
              </button>
            )}
            <a
              href={CONFIG.loginUrl}
              className="px-5 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 font-semibold transition-colors"
            >
              Return to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <a
        href={CONFIG.homeUrl}
        className="fixed bottom-6 left-6 z-[9999] inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to Labs
      </a>
      {children}
    </>
  );
};
