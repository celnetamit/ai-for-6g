/**
 * Who is signed in, according to the hub.
 *
 * The lab holds no cookie for live-labs.org, so the only trustworthy statement
 * about identity is the one `POST /api/auth/authorize-lab` returns after
 * verifying the launch token — the hub holds the signing secret and is the only
 * party that can verify anything. Nothing here parses a token: a lab that
 * decodes a credential it does not issue is reading a value it cannot check,
 * and in a sibling lab that mistake put every learner on one shared identity
 * and therefore one shared project history.
 *
 * This module only remembers what the hub said, so storage can be scoped to a
 * person and the interface can address them by name. It authorises nothing.
 */

export interface LabIdentity {
  /** The hub's user id. Stable across logins and devices — what storage scopes by. */
  userId: string;
  email: string | null;
  name: string | null;
  /** The hub's role string: USER, ADMIN, SUPER_ADMIN, … */
  role: string;
  labId: string | null;
  labSlug: string | null;
  /**
   * Set by the hub for accounts registered as expert reviewers. It decides
   * whether the review form is offered, and nothing more — the endpoint re-reads
   * the flag from the database on every call, because a hidden nav item is a
   * presentation choice rather than a rule.
   */
  isReviewer: boolean;
}

/**
 * sessionStorage, not localStorage. An identity that outlived the browser
 * session would be an unverified claim about who is at the keyboard, and these
 * labs run on shared machines.
 */
const STORAGE_KEY = '__lab_identity';

let current: LabIdentity | null = null;
const listeners = new Set<(identity: LabIdentity | null) => void>();

function readStored(): LabIdentity | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LabIdentity>;
    if (typeof parsed.userId !== 'string' || parsed.userId === '') return null;
    return {
      userId: parsed.userId,
      email: typeof parsed.email === 'string' ? parsed.email : null,
      name: typeof parsed.name === 'string' ? parsed.name : null,
      role: typeof parsed.role === 'string' ? parsed.role : 'USER',
      labId: typeof parsed.labId === 'string' ? parsed.labId : null,
      labSlug: typeof parsed.labSlug === 'string' ? parsed.labSlug : null,
      isReviewer: parsed.isReviewer === true,
    };
  } catch {
    return null;
  }
}

/** Record what the hub returned. Called only by the auth guard. */
export function setIdentity(identity: LabIdentity | null): void {
  current = identity;
  try {
    if (identity) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Private mode. The in-memory copy still serves this page load. */
  }
  for (const listener of listeners) listener(identity);
}

export function getIdentity(): LabIdentity | null {
  if (current) return current;
  current = readStored();
  return current;
}

export function subscribeToIdentity(listener: (identity: LabIdentity | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Build an identity from the authorize-lab response body.
 *
 * Returns null rather than a partial identity when the response carries no user
 * id: a session that cannot be named must not be used to scope storage, because
 * inventing a placeholder is exactly how separate people end up sharing one
 * history.
 */
export function identityFromAuthResponse(body: unknown): LabIdentity | null {
  if (typeof body !== 'object' || body === null) return null;
  const { user, lab } = body as { user?: Record<string, unknown>; lab?: Record<string, unknown> };
  const userId = user?.id;
  if (typeof userId !== 'string' || userId.trim() === '') return null;

  return {
    userId: userId.trim(),
    email: typeof user?.email === 'string' ? user.email : null,
    name: typeof user?.name === 'string' ? user.name : null,
    role: typeof user?.role === 'string' && user.role.trim() !== '' ? user.role.trim().toUpperCase() : 'USER',
    labId: typeof lab?.id === 'string' ? lab.id : null,
    labSlug: typeof lab?.slug === 'string' ? lab.slug : null,
    // Strictly `=== true`: an absent field, from an older hub build, means not
    // a reviewer rather than unknown.
    isReviewer: user?.isReviewer === true,
  };
}

/** What to call this person on screen. */
export function displayName(identity: LabIdentity | null): string {
  if (!identity) return 'this browser';
  return identity.name?.trim() || identity.email?.trim() || 'your account';
}

/**
 * A short, stable, non-reversible tag for the user id.
 *
 * The raw id is not used as a storage key suffix: keys are visible in devtools
 * and get copied into bug reports, and a hub user id is a real identifier for a
 * real person. A 32-bit FNV hash is not a security control — anyone holding the
 * id can recompute it — it simply keeps the identifier out of the key.
 */
function fingerprint(userId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * The storage scope for the signed-in learner.
 *
 * With no verified identity the scope is `anon`, and everything under it belongs
 * to the browser rather than to a person. The interface says so rather than
 * letting it look like an account.
 */
export function storageScope(): string {
  const identity = getIdentity();
  return identity ? `u-${fingerprint(identity.userId)}` : 'anon';
}

/** A storage key belonging to the signed-in learner rather than the browser. */
export function scopedKey(base: string): string {
  return `${base}.${storageScope()}`;
}

/** Whether the hub registers this account as an expert reviewer. */
export function isReviewer(identity: LabIdentity | null): boolean {
  return identity?.isReviewer === true;
}

/** Platform administration, as the hub defines it: SUPER_ADMIN and nothing else. */
export function isAdmin(identity: LabIdentity | null): boolean {
  return identity?.role === 'SUPER_ADMIN';
}
