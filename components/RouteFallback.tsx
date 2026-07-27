import React from 'react';

/**
 * Placeholder shown while a route chunk downloads.
 *
 * Deliberately a skeleton rather than a spinner: routes resolve in a few hundred
 * milliseconds on a warm cache, and a spinner that flashes for 200 ms reads as a
 * glitch. The skeleton also reserves layout space, so content does not jump when
 * the real page mounts.
 */
const RouteFallback: React.FC = () => (
  <div
    className="animate-pulse space-y-6 py-8"
    role="status"
    aria-live="polite"
    aria-label="Loading page"
  >
    <div className="h-8 w-2/3 max-w-md rounded bg-gray-200 dark:bg-gray-700" />
    <div className="h-4 w-full max-w-2xl rounded bg-gray-200 dark:bg-gray-700" />
    <div className="h-4 w-5/6 max-w-2xl rounded bg-gray-200 dark:bg-gray-700" />
    <div className="grid grid-cols-1 gap-6 pt-4 md:grid-cols-2">
      <div className="h-40 rounded-lg bg-gray-200 dark:bg-gray-700" />
      <div className="h-40 rounded-lg bg-gray-200 dark:bg-gray-700" />
    </div>
    <span className="sr-only">Loading…</span>
  </div>
);

export default RouteFallback;
