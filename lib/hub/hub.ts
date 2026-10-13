/**
 * Where the hub is, and the credential used to talk to it.
 *
 * The lab runs on its own origin and holds no cookie for live-labs.org, so every
 * call back carries the *session* token that `authorize-lab` issued after
 * verifying the launch. The launch token is not reused for this: it rides in a
 * URL, lives minutes, and is replay-checked, so a lab using it as an API
 * credential would stop working part-way through the first session.
 *
 * The base URL is derived from the configured verification endpoint rather than
 * being a second, independently-settable variable — a deployment pointed at a
 * staging hub for auth and production for data storage is a class of mistake
 * worth making impossible.
 */

import { appConfig } from '../config';

export function hubBaseUrl(): string {
  try {
    return new URL(appConfig.auth.verifyUrl).origin;
  } catch {
    return 'https://live-labs.org';
  }
}

export const hubEndpoints = {
  authorize: () => `${hubBaseUrl()}/api/auth/authorize-lab`,
  projects: () => `${hubBaseUrl()}/api/labs/projects`,
  feedback: () => `${hubBaseUrl()}/api/labs/feedback`,
  review: () => `${hubBaseUrl()}/api/labs/review`,
  reviewerAgreement: () => `${hubBaseUrl()}/api/labs/reviewer-agreement`,
  /** Paid-access check for the Advanced mode. */
  entitlement: () => `${hubBaseUrl()}/api/labs/entitlement`,
};

const SESSION_TOKEN_KEY = '__lab_session_token';

export function setHubSessionToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    else sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* Private mode — this session simply has no server-side storage. */
  }
}

export function getHubSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** True when this session can reach the hub on the learner's behalf. */
export function hasHubSession(): boolean {
  return getHubSessionToken() !== null;
}

/**
 * A hub request carrying the session token.
 *
 * It times out rather than hanging: this sits behind the history screen and the
 * feedback form, both of which must degrade to a clear message rather than
 * leaving a spinner on screen indefinitely.
 */
export async function hubFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const token = getHubSessionToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
