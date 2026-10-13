import React, { useEffect, useState } from 'react';
import ReviewerAgreementScreen from './ReviewerAgreementScreen';
import LogoIcon from '../icons/LogoIcon';
import { getIdentity, subscribeToIdentity, type LabIdentity } from '../../lib/hub/identity';
import { fetchAgreementStatus } from '../../lib/hub/reviewerAgreementClient';

/**
 * The confidentiality undertaking, asked for before the lab opens.
 *
 * Who sees this: only an account the hub has marked `isReviewer`, which is set
 * per user in the admin console. Everybody else — every learner, every admin
 * without the flag, and anyone running the lab locally with no hub session —
 * passes straight through and never knows this component exists. That
 * restriction is the whole design, and it is checked twice below before
 * anything is rendered.
 *
 * Why the door and not a deeper gate. In the XRD lab the same undertaking was
 * first built as a door gate and had to be moved, because Basic and Moderate
 * are *released* levels there and admins who also carry the reviewer flag were
 * being asked to sign before teaching with material that was already public.
 * ai-6g has no released tier and no paid level: an account is sent here to
 * review the lab, and the lab in its entirety is the pre-release material the
 * agreement covers. Gating anything narrower would leave the thing under review
 * readable without the undertaking that governs it.
 *
 * The signed state is never cached in this browser. `fetchAgreementStatus`
 * asks the hub, which re-reads the reviewer flag and the signature on every
 * call — a browser that could mark this as given would make it worthless.
 */

type GateState = 'CHECKING' | 'REQUIRED' | 'PASSED' | 'NOT_APPLICABLE';

const Frame: React.FC<{ identity: LabIdentity | null; children: React.ReactNode }> = ({
  identity,
  children,
}) => (
  <div className="min-h-screen overflow-y-auto bg-background-light text-on-surface-light dark:bg-background-dark dark:text-on-surface-dark">
    <header className="border-b border-gray-200 bg-surface-light px-4 py-3 dark:border-gray-700 dark:bg-surface-dark">
      <div className="mx-auto flex max-w-4xl items-center gap-3">
        <span className="text-primary dark:text-white">
          <LogoIcon />
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold tracking-tight">AI for 6G Virtual Live Lab</p>
          <p className="truncate text-xs text-secondary dark:text-gray-400">
            Expert reviewer access{identity?.email ? ` — ${identity.email}` : ''}
          </p>
        </div>
      </div>
    </header>
    <main className="px-4 py-6">{children}</main>
  </div>
);

export const ReviewerGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [identity, setIdentityState] = useState<LabIdentity | null>(() => getIdentity());
  const [gate, setGate] = useState<GateState>('CHECKING');

  // The auth guard writes the identity after its network round trip, which can
  // land after this component has already mounted.
  useEffect(() => subscribeToIdentity(setIdentityState), []);

  useEffect(() => {
    let cancelled = false;

    if (identity === null || identity.isReviewer !== true) {
      // Not signed in through the hub, or not a reviewer: no gate, no request.
      setGate('NOT_APPLICABLE');
      return;
    }

    setGate('CHECKING');
    void (async () => {
      const status = await fetchAgreementStatus();
      if (cancelled) return;
      setGate(status.signed ? 'PASSED' : 'REQUIRED');
    })();

    return () => {
      cancelled = true;
    };
  }, [identity]);

  if (gate === 'PASSED' || gate === 'NOT_APPLICABLE') return <>{children}</>;

  if (gate === 'CHECKING') {
    return (
      <Frame identity={identity}>
        <div className="mx-auto max-w-4xl rounded-lg border-l-4 border-primary bg-surface-light p-6 shadow-md dark:bg-surface-dark">
          <p className="font-semibold">Checking your reviewer agreement</p>
          <p className="mt-1 text-sm text-secondary dark:text-gray-400">
            One moment while your account is checked with the hub.
          </p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame identity={identity}>
      <ReviewerAgreementScreen
        gate
        onSigned={() => {
          // Signed: the whole lab opens, at the dashboard, with every level and
          // every experiment available.
          setGate('PASSED');
          window.location.hash = '#/';
        }}
      />
    </Frame>
  );
};

export default ReviewerGate;
