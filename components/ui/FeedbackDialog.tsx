import React, { useEffect, useMemo, useRef, useState } from 'react';
import Button from './Button';
import {
  EMPTY_DRAFT,
  FEEDBACK_CATEGORIES,
  MAX_FIELD_LENGTH,
  MAX_MESSAGE_LENGTH,
  clearDraft,
  isValid,
  loadDraft,
  saveDraft,
  sendFeedback,
  validateFeedback,
  type FeedbackDraft,
  type FeedbackResult,
} from '../../lib/hub/feedback';
import { getIdentity } from '../../lib/hub/identity';
import { hasHubSession } from '../../lib/hub/hub';

/**
 * Send feedback to the hub's admin centre.
 *
 * The name, email and designation are asked for even though the session token
 * already says which account is signed in, and both are stored. They answer
 * different questions: the token establishes who is *signed in*, the fields
 * record what the sender says about *themselves*. On a shared machine or in a
 * taught session those routinely differ, and the designation is what makes a
 * report actionable — "this number looks wrong" from a communications engineer
 * and from a first-year student need different responses.
 *
 * The account's own name and email prefill the form as a convenience, and the
 * dialog shows which account the message will be recorded against, so a
 * mismatch is visible rather than silent.
 *
 * The draft lives in sessionStorage, not localStorage: a half-written message
 * carrying someone's name and email should not outlive the browser session on a
 * shared machine.
 */

const FIELD =
  'w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-on-surface-light focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-600 dark:bg-gray-800 dark:text-on-surface-dark';

/**
 * The modal shell.
 *
 * Declared at module scope, which is load-bearing rather than stylistic. It
 * began life inside `FeedbackDialog`, and React identifies a component by its
 * *type*: a function defined in a render body is a brand-new type on every
 * render, so React unmounted and remounted the entire dialog on each keystroke.
 * The observable effect was that typing "Hello" into the name field left "H"
 * and dropped focus — the form could not be filled in at all. A validation test
 * never caught it because validation does not type.
 */
const Shell: React.FC<{
  title: string;
  onClose: () => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}> = ({ title, onClose, panelRef, children }) => (
  <div
    className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
    onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
      tabIndex={-1}
      className="w-full max-w-2xl rounded-lg bg-surface-light p-6 shadow-xl outline-none dark:bg-surface-dark"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 id="feedback-title" className="text-xl font-bold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-secondary transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  </div>
);

const FeedbackDialog: React.FC<{ screen: string; onClose: () => void }> = ({ screen, onClose }) => {
  const identity = getIdentity();
  const [draft, setDraft] = useState<FeedbackDraft>(() => {
    const stored = loadDraft();
    if (stored) return stored;
    return { ...EMPTY_DRAFT, name: identity?.name ?? '', email: identity?.email ?? '' };
  });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const errors = useMemo(() => validateFeedback(draft), [draft]);

  // Kept across a reload so a half-written message survives an accidental
  // refresh; cleared as soon as it is successfully sent.
  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  // Escape closes, and the page behind does not scroll while this is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const set = <K extends keyof FeedbackDraft>(key: K, value: FeedbackDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    setSubmitted(true);
    if (!isValid(errors)) return;
    setSending(true);
    const outcome = await sendFeedback(draft, { screen });
    setResult(outcome);
    setSending(false);
    if (outcome.ok) clearDraft();
  };

  const show = (field: keyof FeedbackDraft) => (submitted ? errors[field] : undefined);

  if (result?.ok) {
    return (
      <Shell title="Feedback sent" onClose={onClose} panelRef={panelRef}>
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
            Your feedback reached the hub and was stored.
          </p>
          <p className="text-secondary dark:text-gray-400">{result.note}</p>
          <dl className="grid gap-2 text-xs text-secondary dark:text-gray-400">
            <div>
              <dt className="inline">Reference: </dt>
              <dd className="inline font-mono">{result.id}</dd>
            </div>
            <div>
              <dt className="inline">Received: </dt>
              <dd className="inline">{new Date(result.receivedAt).toLocaleString()}</dd>
            </div>
            {result.signedInAs ? (
              <div>
                <dt className="inline">Recorded against: </dt>
                <dd className="inline">{result.signedInAs}</dd>
              </div>
            ) : null}
          </dl>
          {result.signedInAs &&
          result.signedInAs.toLowerCase() !== draft.email.trim().toLowerCase() ? (
            <p className="rounded-md border border-amber-400/60 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              You gave {draft.email.trim()} as a reply address, and this was recorded against{' '}
              {result.signedInAs}. Both are stored — a reply will go to the address you gave.
            </p>
          ) : null}
          <div className="pt-2">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Send feedback" onClose={onClose} panelRef={panelRef}>
      <div className="space-y-4">
        <p className="text-sm text-secondary dark:text-gray-400">
          This goes to the administrators of live-labs.org, who read it. No automatic reply is sent
          and no response time is promised.
        </p>

        {!hasHubSession() ? (
          <p className="rounded-md border border-amber-400/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            This lab has no signed-in hub session, so there is nowhere to send feedback. Open the lab
            from your dashboard on live-labs.org — anything you type here is kept as a draft.
          </p>
        ) : identity ? (
          <p className="text-xs text-secondary dark:text-gray-400">
            This will be recorded against {identity.email ?? identity.name ?? 'your account'}. The
            details below are what you say about yourself, and are stored alongside it rather than
            replacing it.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="feedback-name" className="block text-xs font-semibold">
              Name
            </label>
            <input
              id="feedback-name"
              className={FIELD}
              maxLength={MAX_FIELD_LENGTH}
              value={draft.name}
              onChange={(event) => set('name', event.target.value)}
            />
            {show('name') ? (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">{errors.name}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-email" className="block text-xs font-semibold">
              Email
            </label>
            <input
              id="feedback-email"
              type="email"
              className={FIELD}
              maxLength={MAX_FIELD_LENGTH}
              value={draft.email}
              onChange={(event) => set('email', event.target.value)}
            />
            {show('email') ? (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">{errors.email}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-designation" className="block text-xs font-semibold">
              Designation
            </label>
            <input
              id="feedback-designation"
              className={FIELD}
              maxLength={MAX_FIELD_LENGTH}
              placeholder="e.g. Communications engineer, MSc student, Lecturer"
              value={draft.designation}
              onChange={(event) => set('designation', event.target.value)}
            />
            {show('designation') ? (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">{errors.designation}</p>
            ) : (
              <p className="text-[11px] text-secondary dark:text-gray-400">
                Your role decides how this is read — it is the field that makes a report actionable.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-category" className="block text-xs font-semibold">
              Category
            </label>
            <select
              id="feedback-category"
              className={FIELD}
              value={draft.category}
              onChange={(event) => set('category', event.target.value as FeedbackDraft['category'])}
            >
              {FEEDBACK_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-secondary dark:text-gray-400">
              {FEEDBACK_CATEGORIES.find((c) => c.value === draft.category)?.hint}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-semibold">Rating (optional)</span>
          <div className="flex items-center gap-2" role="radiogroup" aria-label="Rating out of five">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={draft.rating === value}
                aria-label={`${value} out of 5`}
                // Clicking the current value clears it: a rating given by
                // accident should be removable, and 0 is sent as "not given"
                // rather than as a score of zero.
                onClick={() => set('rating', draft.rating === value ? 0 : value)}
                className={`flex h-10 w-10 items-center justify-center rounded-md border text-sm font-semibold transition-colors ${
                  draft.rating >= value
                    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                    : 'border-gray-300 text-secondary hover:border-primary dark:border-gray-600 dark:text-gray-400'
                }`}
              >
                {value}
              </button>
            ))}
            <span className="ml-2 text-[11px] text-secondary dark:text-gray-400">
              {draft.rating === 0 ? 'Not given — nothing is recorded.' : `${draft.rating} of 5`}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="feedback-message" className="block text-xs font-semibold">
            Message
          </label>
          <textarea
            id="feedback-message"
            rows={6}
            className={FIELD}
            maxLength={MAX_MESSAGE_LENGTH}
            value={draft.message}
            onChange={(event) => set('message', event.target.value)}
            placeholder="What happened, what you expected, and where in the lab you were."
          />
          <div className="flex justify-between gap-3">
            {show('message') ? (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">{errors.message}</p>
            ) : (
              <p className="text-[11px] text-secondary dark:text-gray-400">Screen: {screen}</p>
            )}
            <p className="text-[11px] tabular-nums text-secondary dark:text-gray-400">
              {draft.message.length} / {MAX_MESSAGE_LENGTH}
            </p>
          </div>
        </div>

        {result && !result.ok ? (
          <p className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
            {result.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={() => void submit()} disabled={sending}>
            {sending ? 'Sending…' : 'Send feedback'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <span className="text-[11px] text-secondary dark:text-gray-400">
            Your draft is kept until it sends.
          </span>
        </div>
      </div>
    </Shell>
  );
};

export default FeedbackDialog;
