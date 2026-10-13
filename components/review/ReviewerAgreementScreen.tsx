import React, { useEffect, useMemo, useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { appConfig } from '../../lib/config';
import { getIdentity, isReviewer } from '../../lib/hub/identity';
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
  type ReviewRoleId,
} from '../../lib/hub/reviewerAgreement';
import {
  fetchAgreementStatus,
  signAgreement,
  type AgreementStatus,
  type SignResult,
} from '../../lib/hub/reviewerAgreementClient';

/**
 * The NanoSchool Expert Reviewer Agreement & Confidentiality Undertaking.
 *
 * The document is displayed in full and verbatim, because an acknowledgement is
 * only meaningful if what was shown is what was agreed. Nothing here summarises
 * it, and `lib/hub/reviewerAgreement.ts` is byte-identical to the copy in every
 * other Live Lab — the stored acknowledgement carries a fingerprint computed
 * over the displayed strings, which is what lets the hub treat a signature
 * given here as being against the same words as one given in MicrobeAI or
 * FraudShield. Editing this lab's copy alone would fork the document silently.
 *
 * Whether it has been signed is asked of the hub and never cached. A browser
 * that could mark this as given would make the undertaking worthless, and a
 * cached "already signed" would survive the agreement being revoked.
 *
 * `gate` renders it as the door: ai-6g has no paid tier and no pre-release
 * level, so for an account the hub marks as a reviewer the whole lab is the
 * material under review and the undertaking is given before any of it is seen.
 * Accounts without the flag never reach this screen.
 */

const FIELD =
  'mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-on-surface-light placeholder:text-secondary/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-600 dark:bg-gray-800 dark:text-on-surface-dark';

const LAB_TITLE = 'AI for 6G: Intelligent Communication Networks, Semantic Connectivity & Autonomous Wireless Systems Lab';

function emptyForm(name: string, email: string): AcknowledgementForm {
  const today = new Date().toISOString().slice(0, 10);
  return {
    labTitle: LAB_TITLE,
    domain: '',
    reviewBuild: appConfig.version,
    reviewerName: name,
    designation: '',
    institution: '',
    email,
    dateAccessProvided: today,
    expectedCompletion: '',
    reviewRoles: [],
    signature: '',
    signedDate: today,
    confirmed: false,
  };
}

interface Props {
  /** Rendered as the lab's door rather than as a page inside it. */
  gate?: boolean;
  /** Called once the hub has recorded the signature. */
  onSigned?: () => void;
}

const ReviewerAgreementScreen: React.FC<Props> = ({ gate = false, onSigned }) => {
  const identity = getIdentity();
  const [status, setStatus] = useState<AgreementStatus | null>(null);
  const [form, setForm] = useState<AcknowledgementForm>(() =>
    emptyForm(identity?.name ?? '', identity?.email ?? ''),
  );
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SignResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAgreementStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const missing = useMemo(() => missingAcknowledgementFields(form), [form]);

  const set = <K extends keyof AcknowledgementForm>(key: K, value: AcknowledgementForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setResult(null);
  };

  const toggleRole = (role: ReviewRoleId) =>
    set(
      'reviewRoles',
      form.reviewRoles.includes(role)
        ? form.reviewRoles.filter((r) => r !== role)
        : [...form.reviewRoles, role],
    );

  const sign = async () => {
    setSubmitted(true);
    if (missing.length > 0) return;
    setBusy(true);
    try {
      const outcome = await signAgreement(form);
      setResult(outcome);
      if (outcome.ok) {
        setStatus(await fetchAgreementStatus());
        onSigned?.();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!isReviewer(identity)) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">{AGREEMENT_TITLE}</h2>
        <p className="mt-2 text-sm text-secondary dark:text-gray-400">
          This undertaking is given by accounts registered as expert reviewers on live-labs.org. This
          account is not one, so there is nothing here to sign. The agreement itself is confidential
          pre-release material, so its terms are not shown to people who are not being asked to give
          them.
        </p>
      </Card>
    );
  }

  const signed = status?.signed ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Card>
        <p className="text-xs font-bold uppercase tracking-wide text-secondary dark:text-gray-400">
          NanoSchool / NSTC
        </p>
        <h1 className="mt-1 text-2xl font-bold">{AGREEMENT_TITLE}</h1>
        <p className="mt-0.5 text-sm text-secondary dark:text-gray-400">{AGREEMENT_SUBTITLE}</p>
        <p className="mt-3 text-[11px] text-secondary dark:text-gray-400">
          Version <span className="font-mono">{AGREEMENT_VERSION}</span> · fingerprint{' '}
          <span className="font-mono text-primary">{agreementFingerprint()}</span>
        </p>
        {gate && !signed ? (
          <p className="mt-3 rounded-md border-l-4 border-primary bg-primary/5 p-3 text-sm">
            Your account is registered as an expert reviewer for this lab. The lab is pre-release
            material, so this undertaking is given before it opens. Signing it unlocks the whole lab —
            every level, every experiment and the review form.
          </p>
        ) : null}
      </Card>

      {status === null ? (
        <Card>
          <p className="text-sm text-secondary dark:text-gray-400">
            Checking whether you have already signed this…
          </p>
        </Card>
      ) : signed ? (
        <Card className="border-l-4 border-emerald-500">
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            You signed this agreement on {new Date(signed.acknowledgedAt).toLocaleString()}.
          </p>
          <p className="mt-1 text-xs text-secondary dark:text-gray-400">
            Recorded as {signed.reviewerName} ({signed.designation}, {signed.institution}) for{' '}
            {signed.reviewRoles.length} review role{signed.reviewRoles.length === 1 ? '' : 's'}.
          </p>
          <p className="mt-1 text-[11px] text-secondary dark:text-gray-400">
            Reference <span className="font-mono">{signed.id}</span> · version{' '}
            <span className="font-mono">{signed.agreementVersion}</span>
          </p>
        </Card>
      ) : status.unknown ? (
        <Card className="border-l-4 border-amber-400">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            The hub could not be reached, so whether you have already signed this is unknown. That is
            not the same as not signed — reload once the connection is back rather than signing a
            second time.
          </p>
        </Card>
      ) : status.previouslySignedVersion ? (
        <Card className="border-l-4 border-amber-400">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            You signed version <span className="font-mono">{status.previouslySignedVersion}</span> on{' '}
            {status.previouslySignedAt
              ? new Date(status.previouslySignedAt).toLocaleDateString()
              : 'an earlier date'}
            . The wording has changed since, so the current version needs a fresh acknowledgement.
          </p>
        </Card>
      ) : null}

      {/* --- the document, verbatim */}
      <Card>
        {AGREEMENT_PREAMBLE.map((paragraph) => (
          <p key={paragraph} className="mb-3 text-sm leading-relaxed">
            {paragraph}
          </p>
        ))}

        {AGREEMENT_SECTIONS.map((section) => (
          <section key={section.number} className="mt-5">
            <h2 className="text-sm font-bold">
              {section.number}. {section.heading}
            </h2>
            {section.blocks.map((block, index) => (
              <div key={index} className="mt-2">
                {block.subheading ? (
                  <h3 className="text-xs font-semibold">{block.subheading}</h3>
                ) : null}
                {block.text ? (
                  <p className="mt-1 text-sm leading-relaxed text-secondary dark:text-gray-400">
                    {block.text}
                  </p>
                ) : null}
                {block.bullets ? (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-secondary dark:text-gray-400">
                    {block.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </section>
        ))}

        <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
          {AGREEMENT_ISSUER.lines.map((line) => (
            <p key={line} className="text-xs text-secondary dark:text-gray-400">
              {line}
            </p>
          ))}
          <p className="mt-1 text-xs text-secondary dark:text-gray-400">{AGREEMENT_ISSUER.purpose}</p>
        </div>
      </Card>

      {/* --- the acknowledgement */}
      {!signed ? (
        <Card>
          <h2 className="text-base font-semibold">Reviewer acknowledgement</h2>
          <p className="mt-1 text-sm text-secondary dark:text-gray-400">
            Recorded against your account on live-labs.org, with the version and fingerprint of the
            text above.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {(
              [
                ['reviewerName', 'Name', 'Your full name'],
                ['designation', 'Designation', 'e.g. Professor of Wireless Communications'],
                ['institution', 'Institution / organisation', 'Where you work'],
                ['email', 'Email', 'reviewer@example.org'],
                ['domain', 'Domain', 'Wireless communications, applied machine learning…'],
                ['expectedCompletion', 'Expected completion', 'e.g. two weeks from access'],
              ] as const
            ).map(([key, label, placeholder]) => (
              <label key={key} className="block text-sm">
                <span className="font-semibold">{label}</span>
                <input
                  className={FIELD}
                  value={form[key]}
                  placeholder={placeholder}
                  onChange={(event) => set(key, event.target.value)}
                />
              </label>
            ))}
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold">Lab under review</span>
              {/* Read-only: the lab and build are facts, not something to type. */}
              <input className={`${FIELD} opacity-70`} value={`${form.labTitle} · ${form.reviewBuild}`} readOnly />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Date access provided</span>
              <input
                type="date"
                className={FIELD}
                value={form.dateAccessProvided}
                onChange={(event) => set('dateAccessProvided', event.target.value)}
              />
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">Review role(s)</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {REVIEW_ROLES.map((role) => (
                <label
                  key={role.id}
                  className="flex cursor-pointer items-start gap-2 text-xs text-secondary dark:text-gray-400"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 accent-[color:var(--color-primary)]"
                    checked={form.reviewRoles.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                  />
                  <span>{role.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-semibold">Reviewer signature</span>
              <input
                className={FIELD}
                value={form.signature}
                placeholder="Type your full name"
                onChange={(event) => set('signature', event.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Date</span>
              <input
                type="date"
                className={FIELD}
                value={form.signedDate}
                onChange={(event) => set('signedDate', event.target.value)}
              />
            </label>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[color:var(--color-primary)]"
              checked={form.confirmed}
              onChange={(event) => set('confirmed', event.target.checked)}
            />
            <span className="text-sm">{AGREEMENT_CONFIRMATION}</span>
          </label>

          {submitted && missing.length > 0 ? (
            <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
              Still needed: {missing.join('; ')}.
            </p>
          ) : null}
          {result && !result.ok ? (
            <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
              {result.message}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => void sign()} disabled={busy}>
              {busy ? 'Recording…' : 'Sign and record'}
            </Button>
            <span className="text-[11px] text-secondary dark:text-gray-400">
              Nothing is kept in this browser: the acknowledgement lives on your account.
            </span>
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export default ReviewerAgreementScreen;
