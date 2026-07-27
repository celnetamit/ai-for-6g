import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import Button from './ui/Button';

const ThreeScene = lazy(() => import('./ThreeScene'));

/**
 * Defers the WebGL scene until it is actually needed.
 *
 * three.js plus @react-three/fiber and drei is ~1.2 MB — roughly 85% of the
 * Tools page bundle — for a single widget at the bottom of the page. Loading it
 * with the rest of the route meant every learner paid for the 3D engine even if
 * they only used the charts and canvas simulators above it.
 *
 * The scene now downloads when it scrolls into view. `rootMargin` starts the
 * fetch slightly before it is visible so it is usually ready on arrival, and
 * browsers without IntersectionObserver (or with the API blocked) get an
 * explicit button rather than nothing.
 */
const LazyThreeScene: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) return;

    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef} className="w-full">
      {shouldLoad ? (
        <Suspense fallback={<ScenePlaceholder message="Loading 3D scene…" />}>
          <ThreeScene />
        </Suspense>
      ) : (
        <ScenePlaceholder message="The interactive 3D scene loads when you scroll to it.">
          <Button variant="secondary" onClick={() => setShouldLoad(true)}>
            Load 3D visualization
          </Button>
        </ScenePlaceholder>
      )}
    </div>
  );
};

const ScenePlaceholder: React.FC<{ message: string; children?: React.ReactNode }> = ({
  message,
  children,
}) => (
  // Same height as the real canvas so loading it does not shift the page.
  <div
    className="w-full h-96 rounded-lg bg-gray-900 flex flex-col items-center justify-center gap-4 text-gray-300"
    role="status"
    aria-live="polite"
  >
    <p className="text-sm px-4 text-center">{message}</p>
    {children}
  </div>
);

export default LazyThreeScene;
