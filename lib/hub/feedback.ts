/**
 * Feedback sent from inside the lab to the hub's admin centre.
 *
 * The form asks for a name, an email address, a designation and a rating even
 * though the session token already establishes which account is signed in. The
 * two are not the same claim, and both are stored. Labs run on shared machines
 * and in taught sessions, so the person at the keyboard is often not the account
 * holder, and a reply address may legitimately differ from the registration one.
 * The designation is what makes a report actionable: "this is confusing" from a
 * fraud analyst and from an undergraduate are different findings needing
 * different responses.
 *
 * The draft lives in sessionStorage, scoped to the signed-in learner. A
 * half-written message carrying someone's name and email is personal data, and
 * one that outlived the browser session would sit on a shared machine after they
 * had walked away from it.
 */

import { appConfig } from '../config';
import { hasHubSession, hubEndpoints, hubFetch } from './hub';
import { scopedKey } from './identity';

export type FeedbackCategory = 'GENERAL' | 'BUG' | 'SCIENCE' | 'USABILITY' | 'FEATURE';

export const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string; hint: string }[] = [
  { value: 'GENERAL', label: 'General', hint: 'Anything that does not fit the others.' },
  {
    value: 'BUG',
    label: 'Something is broken',
    hint: 'A control that does nothing, a number that looks wrong, a screen that fails.',
  },
  {
    value: 'SCIENCE',
    label: 'Method or accuracy',
    hint: 'A metric you disagree with, a modelling choice you would have made differently.',
  },
  { value: 'USABILITY', label: 'Hard to use or unclear', hint: 'Wording that confused you, a step you could not find.' },
  { value: 'FEATURE', label: 'Something missing', hint: 'What you needed the lab to do and it did not.' },
];

export interface FeedbackDraft {
  name: string;
  email: string;
  designation: string;
  category: FeedbackCategory;
  /** 0 means "not given". A rating is optional and is never invented. */
  rating: number;
  message: string;
}

export const EMPTY_DRAFT: FeedbackDraft = {
  name: '',
  email: '',
  designation: '',
  category: 'GENERAL',
  rating: 0,
  message: '',
};

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_FIELD_LENGTH = 200;

export type FeedbackErrors = Partial<Record<keyof FeedbackDraft, string>>;

/**
 * Validation, deliberately permissive on the email.
 *
 * A shape check and nothing more. Address syntax is a poor proxy for
 * deliverability — a perfectly formed address can bounce and an unusual one can
 * be fine — so a strict pattern mostly turns away people with legitimate
 * addresses, which is worse than storing one that bounces.
 */
export function validateFeedback(draft: FeedbackDraft): FeedbackErrors {
  const errors: FeedbackErrors = {};
  if (!draft.name.trim()) errors.name = 'Please give a name we can address a reply to.';
  if (!draft.email.trim()) errors.email = 'An email address is needed to reply.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    errors.email = 'That does not look like an email address.';
  }
  if (!draft.designation.trim()) {
    errors.designation = 'Your role or job title — it decides how your feedback is read.';
  }
  if (!draft.message.trim()) errors.message = 'There is nothing to send yet.';
  else if (draft.message.trim().length < 10) errors.message = 'A few more words would make this actionable.';
  return errors;
}

export function isValid(errors: FeedbackErrors): boolean {
  return Object.keys(errors).length === 0;
}

const FEEDBACK_DRAFT_KEY = 'fraudshield.feedback.draft.v1';

export function draftStorageKey(): string {
  return scopedKey(FEEDBACK_DRAFT_KEY);
}

export function saveDraft(draft: FeedbackDraft): void {
  try {
    const empty = !draft.name && !draft.email && !draft.designation && !draft.message;
    if (empty) sessionStorage.removeItem(draftStorageKey());
    else sessionStorage.setItem(draftStorageKey(), JSON.stringify(draft));
  } catch {
    /* Private mode: the draft simply is not preserved across a reload. */
  }
}

export function loadDraft(): FeedbackDraft | null {
  try {
    const raw = sessionStorage.getItem(draftStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FeedbackDraft>;
    return {
      ...EMPTY_DRAFT,
      ...parsed,
      // A stored category that is no longer offered falls back rather than
      // reaching the hub as an unknown value.
      category: FEEDBACK_CATEGORIES.some((c) => c.value === parsed.category)
        ? (parsed.category as FeedbackCategory)
        : 'GENERAL',
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(draftStorageKey());
  } catch {
    /* Nothing to clear. */
  }
}

export type FeedbackResult =
  | {
      ok: true;
      id: string;
      receivedAt: string;
      note: string;
      /** The account the hub recorded this against — may differ from the typed address. */
      signedInAs: string | null;
    }
  | { ok: false; code: string; message: string };

/**
 * Send it, and report honestly when it did not go.
 *
 * The failure paths matter more than the success one. Someone who has just
 * written a considered piece of feedback and sees a cheerful "thank you" when
 * nothing was transmitted has been lied to, and will not write a second one.
 * Every branch below returns a message the sender can act on, and the caller
 * keeps the draft.
 */
export async function sendFeedback(
  draft: FeedbackDraft,
  context: { screen: string },
  fetchImpl: typeof fetch = fetch,
): Promise<FeedbackResult> {
  if (!hasHubSession()) {
    return {
      ok: false,
      code: 'NO_SESSION',
      message:
        'This lab has no signed-in hub session, so there is nowhere to send feedback. Open the lab from your ' +
        'dashboard on live-labs.org and try again — your draft is kept.',
    };
  }

  const errors = validateFeedback(draft);
  if (!isValid(errors)) {
    return { ok: false, code: 'INVALID', message: Object.values(errors).join(' ') };
  }

  let response: Response;
  try {
    response = await hubFetch(
      hubEndpoints.feedback(),
      {
        method: 'POST',
        body: JSON.stringify({
          name: draft.name.trim(),
          email: draft.email.trim(),
          designation: draft.designation.trim(),
          category: draft.category,
          // 0 is the sentinel for "not given"; it is not sent as a score.
          rating: draft.rating > 0 ? draft.rating : undefined,
          message: draft.message.trim(),
          screen: context.screen,
          appVersion: appConfig.version,
        }),
      },
      20_000,
      fetchImpl,
    );
  } catch (error) {
    // "You are offline" and "the server rejected this" call for different
    // actions from the sender, so they are not folded into one message.
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      code: aborted ? 'TIMEOUT' : 'NETWORK',
      message: aborted
        ? 'The hub did not respond within 20 seconds. Nothing was sent; your draft is kept.'
        : 'Could not reach the hub. Check your connection — nothing was sent, and your draft is kept.',
    };
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    /* Fall through to the status-based message below. */
  }

  if (!response.ok) {
    return {
      ok: false,
      code: typeof body.code === 'string' ? body.code : `HTTP_${response.status}`,
      message:
        typeof body.message === 'string'
          ? body.message
          : `The hub refused this with status ${response.status}. Nothing was sent; your draft is kept.`,
    };
  }

  return {
    ok: true,
    id: typeof body.id === 'string' ? body.id : 'unknown',
    receivedAt: typeof body.receivedAt === 'string' ? body.receivedAt : new Date().toISOString(),
    note:
      typeof body.note === 'string'
        ? body.note
        : 'Stored for the team to read. No automatic reply is sent.',
    signedInAs: typeof body.signedInAs === 'string' ? body.signedInAs : null,
  };
}
