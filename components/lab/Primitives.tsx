import React from 'react';

/**
 * Small building blocks shared by every lab screen.
 *
 * They exist so the parameter panels, metric readouts and provenance labels
 * look and behave identically wherever they appear — a slider that reports its
 * units in one experiment and not in another is how a learner ends up reading a
 * dBm as a linear watt.
 */

export const SIM_LABEL = 'Simulated result — not a measurement of a real network';

/**
 * The provenance badge.
 *
 * Spec §7 requires results to be clearly labelled as simulation or teaching
 * outcomes, and that requirement is easy to satisfy once, in an "about" page
 * nobody reads. It is satisfied here by putting the label next to the numbers
 * themselves, on every screen that shows one.
 */
export const SimulationBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300 ${className}`}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    Simulated
  </span>
);

export interface MetricTileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
  /** Small print naming where the number came from. */
  source?: string;
}

const TONES: Record<NonNullable<MetricTileProps['tone']>, string> = {
  neutral: 'text-on-surface-light dark:text-on-surface-dark',
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-rose-600 dark:text-rose-400',
};

export const MetricTile: React.FC<MetricTileProps> = ({ label, value, hint, tone = 'neutral', source }) => (
  <div className="rounded-lg border border-gray-200 bg-background-light p-4 dark:border-gray-700 dark:bg-background-dark">
    <p className="text-xs font-semibold uppercase tracking-wide text-secondary dark:text-gray-400">
      {label}
    </p>
    <p className={`mt-1 text-2xl font-bold tabular-nums ${TONES[tone]}`}>{value}</p>
    {hint && <p className="mt-1 text-xs text-secondary dark:text-gray-400">{hint}</p>}
    {source && (
      <p className="mt-2 text-[11px] italic text-secondary/80 dark:text-gray-500">{source}</p>
    )}
  </div>
);

export interface SliderFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  format?: (value: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export const SliderField: React.FC<SliderFieldProps> = ({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  hint,
  format,
  onChange,
  disabled,
}) => (
  <div className={disabled ? 'opacity-50' : ''}>
    <div className="flex items-baseline justify-between gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <span className="font-mono text-sm tabular-nums text-primary">
        {format ? format(value) : value}
        {unit ? ` ${unit}` : ''}
      </span>
    </div>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-2 w-full"
      aria-describedby={hint ? `${id}-hint` : undefined}
    />
    {hint && (
      <p id={`${id}-hint`} className="mt-1 text-xs text-secondary dark:text-gray-400">
        {hint}
      </p>
    )}
  </div>
);

export interface SelectFieldProps<T extends string | number> {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  hint?: string;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function SelectField<T extends string | number>({
  id,
  label,
  value,
  options,
  hint,
  onChange,
  disabled,
}: SelectFieldProps<T>): React.ReactElement {
  const active = options.find((option) => String(option.value) === String(value));
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => {
          const chosen = options.find((option) => String(option.value) === event.target.value);
          if (chosen) onChange(chosen.value);
        }}
        className="mt-2 w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-800"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
      {(active?.hint || hint) && (
        <p className="mt-1 text-xs text-secondary dark:text-gray-400">{active?.hint ?? hint}</p>
      )}
    </div>
  );
}

export const ToggleField: React.FC<{
  id: string;
  label: string;
  checked: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}> = ({ id, label, checked, hint, onChange }) => (
  <div>
    <label htmlFor={id} className="flex cursor-pointer items-center gap-3">
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-primary dark:bg-gray-600" />
        <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </label>
    {hint && <p className="mt-1 text-xs text-secondary dark:text-gray-400">{hint}</p>}
  </div>
);

/**
 * A section title, or the page title when `as="h1"`.
 *
 * The level is explicit rather than inferred from position. Every page needs
 * exactly one `h1` — a screen reader's heading list is the primary way a
 * non-visual user finds their place on a page this dense, and six pages that
 * started at `h2` gave that list no anchor at all.
 */
export const SectionHeading: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  as?: 'h1' | 'h2';
}> = ({ title, description, action, as = 'h2' }) => {
  const Heading = as;
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <Heading className={as === 'h1' ? 'text-2xl font-bold' : 'text-xl font-bold'}>
          {title}
        </Heading>
        {description && (
          <p className="mt-1 max-w-3xl text-sm text-secondary dark:text-gray-400">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
};

export const LevelPill: React.FC<{ level: string }> = ({ level }) => {
  const tones: Record<string, string> = {
    beginner: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    intermediate: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
    advanced: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tones[level] ?? tones.beginner}`}
    >
      {level}
    </span>
  );
};

/**
 * Renders a [0, 1] grayscale buffer at a readable size.
 *
 * `imageRendering: pixelated` is load-bearing: these are 16×16 images shown at
 * 128 px, and the browser's default smooth upscaling would blur away exactly
 * the block structure the learner is being asked to compare.
 */
export const SceneImage: React.FC<{
  pixels: Float64Array;
  size?: number;
  label: string;
  className?: string;
}> = ({ pixels, size = 16, label, className = '' }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const image = context.createImageData(size, size);
    for (let i = 0; i < size * size; i += 1) {
      const value = Math.round(Math.min(1, Math.max(0, pixels[i] ?? 0)) * 255);
      image.data[i * 4] = value;
      image.data[i * 4 + 1] = value;
      image.data[i * 4 + 2] = value;
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [pixels, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-label={label}
      role="img"
      className={`h-auto w-full rounded-md border border-gray-300 dark:border-gray-600 ${className}`}
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

/** A labelled step in the §4 workflow, shown as a progress spine. */
export const WorkflowStepper: React.FC<{
  steps: { label: string; state: 'done' | 'active' | 'pending' }[];
}> = ({ steps }) => (
  <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
    {steps.map((step, index) => (
      <li key={step.label} className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
            step.state === 'done'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
              : step.state === 'active'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-secondary dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          <span className="tabular-nums opacity-70">{index + 1}</span>
          {step.label}
        </span>
        {index < steps.length - 1 && <span aria-hidden="true" className="text-gray-400">→</span>}
      </li>
    ))}
  </ol>
);

/** Inline progress for a run that takes seconds. */
export const RunProgressBar: React.FC<{ stage: string; fraction: number }> = ({ stage, fraction }) => (
  <div>
    <div className="flex items-baseline justify-between text-xs">
      <span className="font-semibold">{stage}</span>
      <span className="tabular-nums text-secondary dark:text-gray-400">
        {Math.round(fraction * 100)}%
      </span>
    </div>
    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-200"
        style={{ width: `${Math.max(2, Math.round(fraction * 100))}%` }}
      />
    </div>
  </div>
);

/** Triggers a client-side download of generated text. */
export function downloadText(filename: string, contents: string, mime = 'text/plain'): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the navigation to have started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
