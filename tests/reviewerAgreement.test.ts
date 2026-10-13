import { describe, expect, it } from 'vitest';
import {
  AGREEMENT_CONFIRMATION,
  AGREEMENT_ISSUER,
  AGREEMENT_PREAMBLE,
  AGREEMENT_SECTIONS,
  AGREEMENT_SUBTITLE,
  AGREEMENT_TITLE,
  AGREEMENT_VERSION,
  REVIEW_ROLES,
  agreementFingerprint,
  missingAcknowledgementFields,
  type AcknowledgementForm,
} from '../lib/hub/reviewerAgreement';

/**
 * The NanoSchool Expert Reviewer Agreement.
 *
 * This document is ONE document across every Live Lab, not a per-lab copy that
 * happens to look similar. The acknowledgement stored on the hub carries the
 * version and a fingerprint computed over the displayed strings, which is what
 * lets a signature given in this lab be treated as being against the same words
 * as one given in MicrobeAI or FraudShield.
 *
 * The pinned fingerprint below is therefore a cross-repository assertion: if it
 * moves here and not there, the document has silently forked and a reviewer has
 * signed text nobody else displays. `lib/hub/reviewerAgreement.ts` is a
 * byte-identical copy — change the wording in every lab together, and re-pin
 * this value in each lab's test.
 */

const PINNED_FINGERPRINT = 'fnv1a-3d58a7d0-7254';

function completeForm(): AcknowledgementForm {
  return {
    labTitle: 'AI for 6G Virtual Live Lab',
    reviewBuild: '1.0.0',
    dateAccessProvided: '2026-10-13',
    expectedCompletion: '2026-10-27',
    signedDate: '2026-10-13',
    reviewerName: 'Reviewer One',
    designation: 'Professor of Wireless Communications',
    institution: 'Example University',
    email: 'reviewer1@example.org',
    domain: 'Wireless communications and applied machine learning',
    reviewRoles: ['SCIENTIFIC'],
    signature: 'Reviewer One',
    confirmed: true,
  };
}

describe('the agreement text', () => {
  it('matches the fingerprint every other lab computes', () => {
    expect(agreementFingerprint()).toBe(PINNED_FINGERPRINT);
  });

  it('is versioned, so a later change cannot silently apply to past signatures', () => {
    expect(AGREEMENT_VERSION).toBe('nanoschool-reviewer-agreement-2026-09');
  });

  it('carries the issued headings rather than a summary', () => {
    expect(AGREEMENT_TITLE).toBe('Expert Reviewer Agreement & Confidentiality Undertaking');
    expect(AGREEMENT_SUBTITLE).toBe('For Confidential Pre-Release Expert Review');
    expect(AGREEMENT_PREAMBLE.length).toBeGreaterThan(1);
    expect(AGREEMENT_SECTIONS.length).toBeGreaterThan(5);
    expect(AGREEMENT_CONFIRMATION.length).toBeGreaterThan(40);
    expect(AGREEMENT_ISSUER.lines.length).toBeGreaterThan(0);
  });

  it('numbers its sections consecutively from 1', () => {
    AGREEMENT_SECTIONS.forEach((section, index) => {
      expect(section.number).toBe(String(index + 1));
      expect(section.heading.length).toBeGreaterThan(0);
      expect(section.blocks.length).toBeGreaterThan(0);
    });
  });

  it('offers review roles with stable ids', () => {
    expect(REVIEW_ROLES.length).toBeGreaterThan(2);
    expect(new Set(REVIEW_ROLES.map((role) => role.id)).size).toBe(REVIEW_ROLES.length);
  });
});

describe('the acknowledgement form', () => {
  it('accepts a complete form', () => {
    expect(missingAcknowledgementFields(completeForm())).toEqual([]);
  });

  it('names every field it is still waiting for', () => {
    // The signer sees this list, so a missing field must be reported by name
    // rather than as a disabled button with no explanation.
    const empty = {
      ...completeForm(),
      reviewerName: '',
      email: '',
      signature: '',
      reviewRoles: [],
      confirmed: false,
    };
    const missing = missingAcknowledgementFields(empty);
    expect(missing.length).toBeGreaterThanOrEqual(5);
    expect(missing.join(' ').toLowerCase()).toContain('name');
  });

  it('will not accept an unticked confirmation', () => {
    expect(missingAcknowledgementFields({ ...completeForm(), confirmed: false })).not.toEqual([]);
  });

  it('will not accept a signature with no review role chosen', () => {
    expect(missingAcknowledgementFields({ ...completeForm(), reviewRoles: [] })).not.toEqual([]);
  });

  it('treats whitespace as absent rather than as an answer', () => {
    expect(missingAcknowledgementFields({ ...completeForm(), signature: '   ' })).not.toEqual([]);
  });
});
