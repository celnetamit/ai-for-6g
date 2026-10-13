// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  FEEDBACK_CATEGORIES,
  MAX_MESSAGE_LENGTH,
  clearDraft,
  isValid,
  loadDraft,
  saveDraft,
  validateFeedback,
  type FeedbackDraft,
} from '../lib/hub/feedback';
import { setIdentity, identityFromAuthResponse } from '../lib/hub/identity';

/**
 * The in-lab feedback form.
 *
 * Two properties matter beyond "the fields are required". The draft must be
 * recoverable after an accidental refresh, because losing a long report is how
 * a reporter decides not to write it again — and it must NOT outlive the
 * browser session, because a half-written message carries the sender's name and
 * email and these labs run on shared machines.
 */

const good = (): FeedbackDraft => ({
  name: 'Reviewer One',
  email: 'reviewer1@example.org',
  designation: 'Professor of Wireless Communications',
  category: 'SCIENCE',
  rating: 4,
  message: 'The IRS element sweep disagrees with the slope quoted in the report at low N.',
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  setIdentity(null);
});

describe('validation', () => {
  it('accepts a complete report', () => {
    const errors = validateFeedback(good());
    expect(errors).toEqual({});
    expect(isValid(errors)).toBe(true);
  });

  it('requires a name, an email, a designation and a message', () => {
    const errors = validateFeedback(EMPTY_DRAFT);
    expect(isValid(errors)).toBe(false);
    for (const field of ['name', 'email', 'designation', 'message'] as const) {
      expect(errors[field], `${field} should be reported`).toBeTruthy();
    }
  });

  it('rejects whitespace as an answer', () => {
    const errors = validateFeedback({ ...good(), name: '   ', message: '  \n ' });
    expect(errors.name).toBeTruthy();
    expect(errors.message).toBeTruthy();
  });

  it('is permissive about email shape but still demands one', () => {
    // A strict pattern turns away more legitimate addresses than it catches
    // bad ones, so this checks only that something address-shaped was given.
    expect(validateFeedback({ ...good(), email: 'a@b.co' }).email).toBeUndefined();
    expect(validateFeedback({ ...good(), email: 'not-an-address' }).email).toBeTruthy();
  });

  it('asks for more than a couple of words', () => {
    // "broken" is a report nobody can act on. The lower bound is validated;
    // the UPPER bound is enforced by `maxLength` on the textarea rather than
    // here, which is why MAX_MESSAGE_LENGTH is exported — the counter under
    // the field reads from the same constant the input is capped with.
    expect(validateFeedback({ ...good(), message: 'broken' }).message).toBeTruthy();
    expect(MAX_MESSAGE_LENGTH).toBeGreaterThan(1000);
  });

  it('offers categories with distinct values and a hint for each', () => {
    expect(new Set(FEEDBACK_CATEGORIES.map((c) => c.value)).size).toBe(FEEDBACK_CATEGORIES.length);
    for (const category of FEEDBACK_CATEGORIES) expect(category.hint.length).toBeGreaterThan(10);
  });
});

describe('the draft', () => {
  it('survives a reload', () => {
    saveDraft(good());
    expect(loadDraft()?.message).toBe(good().message);
  });

  it('is kept in sessionStorage, never localStorage', () => {
    saveDraft(good());
    // The draft holds a name and an email. On a shared machine, one that
    // outlived the browser session would be left for the next person.
    expect(JSON.stringify(localStorage)).not.toContain('reviewer1@example.org');
    expect(sessionStorage.length).toBeGreaterThan(0);
  });

  it('is cleared once it has been sent', () => {
    saveDraft(good());
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('is scoped per account, so two people on one machine do not share one', () => {
    setIdentity(
      identityFromAuthResponse({ user: { id: 'user-a', email: 'a@example.org' } }),
    );
    saveDraft({ ...good(), message: 'from A' });

    setIdentity(
      identityFromAuthResponse({ user: { id: 'user-b', email: 'b@example.org' } }),
    );
    expect(loadDraft()?.message).not.toBe('from A');
  });
});
