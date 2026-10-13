import React from 'react';
import { Link } from 'react-router-dom';

/**
 * The nine-stage workflow, drawn as a workflow.
 *
 * This replaced a 3×3 grid of cards. The grid listed the same nine stages and
 * was perfectly readable, but it said nothing a numbered list did not: a grid
 * implies "here are nine things", and what a learner needs to take from this
 * screen is "here is one path, and it has a loop in it". Three facts were
 * missing and are now drawn rather than described —
 *
 *   • the stages group into three phases: four choices, one run, four readings;
 *   • the run is the single hinge between configuring and interpreting, which
 *     is why it gets its own band rather than a cell of equal weight;
 *   • optimisation feeds back into the parameters. That return edge is not
 *     decorative — the advisor on the results page ends every suggestion with
 *     "Apply this to the configuration", which is literally this arrow.
 *
 * Layout: one column on phones, three phase columns from `lg` up. The
 * connectors are separate elements rather than borders so they can flip from
 * vertical to horizontal with the breakpoint, and they are `aria-hidden` —
 * a screen reader gets the ordered list semantics from `<ol>` instead, which
 * conveys the sequence better than an arrow glyph would.
 */

export interface WorkflowStage {
  number: number;
  label: string;
  detail: string;
  to: string;
}

export interface WorkflowPhase {
  id: string;
  title: string;
  summary: string;
  stages: WorkflowStage[];
}

export const WORKFLOW_PHASES: WorkflowPhase[] = [
  {
    id: 'configure',
    title: 'Configure',
    summary: 'Four choices that decide what is simulated.',
    stages: [
      {
        number: 1,
        label: 'Scenario',
        detail: 'Pick an experiment — a question with a measurable answer.',
        to: '/experiments',
      },
      {
        number: 2,
        label: 'Parameters',
        detail: 'Frequency, bandwidth, users, distance, power, noise.',
        to: '/experiments',
      },
      {
        number: 3,
        label: 'Channel',
        detail: 'Line of sight, urban NLOS, indoor, or high mobility.',
        to: '/experiments',
      },
      {
        number: 4,
        label: 'AI model',
        detail: 'A trained encoder, or a search method for the surface.',
        to: '/models',
      },
    ],
  },
  {
    id: 'run',
    title: 'Run',
    summary: 'The hinge: everything above decides it, everything below reads it.',
    stages: [
      {
        number: 5,
        label: 'Simulation',
        detail: 'Generate channels, transmit symbols, count errors.',
        to: '/experiments',
      },
    ],
  },
  {
    id: 'interpret',
    title: 'Interpret',
    summary: 'Four readings of one run — and the way back to a better one.',
    stages: [
      {
        number: 6,
        label: 'Evaluation',
        detail: 'Throughput, latency, energy, BER, signal quality.',
        to: '/experiments',
      },
      {
        number: 7,
        label: 'Optimisation',
        detail: 'Measured sensitivity to every parameter you could change.',
        to: '/experiments',
      },
      {
        number: 8,
        label: 'Visualisation',
        detail: 'Waterfalls, sweeps, constellations, reconstructions.',
        to: '/experiments',
      },
      {
        number: 9,
        label: 'Report',
        detail: 'Methods, results, discussion, limitations, reproduction.',
        to: '/history',
      },
    ],
  },
];

/** A chevron that points down on small screens and right from `lg` up. */
const PhaseConnector: React.FC = () => (
  <div aria-hidden="true" className="flex items-center justify-center py-2 lg:py-0 lg:px-1">
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="rotate-90 text-primary lg:rotate-0"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  </div>
);

const StageNode: React.FC<{ stage: WorkflowStage; emphasis?: boolean }> = ({ stage, emphasis }) => (
  <li>
    <Link
      to={stage.to}
      className={`group block rounded-lg border p-3 transition-colors hover:border-primary ${
        emphasis
          ? 'border-primary bg-primary/5'
          : 'border-gray-200 bg-surface-light dark:border-gray-700 dark:bg-surface-dark'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
            emphasis
              ? 'bg-primary text-white'
              : 'bg-gray-200 text-secondary group-hover:bg-primary group-hover:text-white dark:bg-gray-700 dark:text-gray-300'
          }`}
        >
          {stage.number}
        </span>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{stage.label}</p>
          <p className="mt-0.5 text-xs leading-snug text-secondary dark:text-gray-400">
            {stage.detail}
          </p>
        </div>
      </div>
    </Link>
  </li>
);

/** The small vertical tick between two stages inside one phase. */
const StageConnector: React.FC = () => (
  <li aria-hidden="true" className="flex justify-center py-1">
    <span className="h-3 w-px bg-gray-300 dark:bg-gray-600" />
  </li>
);

const WorkflowDiagram: React.FC = () => (
  <div>
    <div className="flex flex-col lg:flex-row lg:items-stretch">
      {WORKFLOW_PHASES.map((phase, phaseIndex) => (
        <React.Fragment key={phase.id}>
          <section className="flex flex-1 flex-col rounded-lg bg-background-light p-4 dark:bg-background-dark">
            <h3 className="text-xs font-bold uppercase tracking-wide text-primary">{phase.title}</h3>
            <p className="mt-0.5 mb-3 text-xs text-secondary dark:text-gray-400">{phase.summary}</p>
            {/*
              Centred vertically so the arrows between phases meet the nodes
              rather than the empty space under them. "Run" holds a single
              stage against four on either side, and top-aligning the columns
              left its arrow pointing at nothing.
            */}
            <ol className="flex flex-1 flex-col justify-center">
              {phase.stages.map((stage, stageIndex) => (
                <React.Fragment key={stage.number}>
                  {stageIndex > 0 && <StageConnector />}
                  <StageNode stage={stage} emphasis={phase.id === 'run'} />
                </React.Fragment>
              ))}
            </ol>
          </section>
          {phaseIndex < WORKFLOW_PHASES.length - 1 && <PhaseConnector />}
        </React.Fragment>
      ))}
    </div>

    {/*
      The return edge, stated in words rather than drawn as a line that would
      have to cross two phase columns at every breakpoint. It is the part of the
      workflow a learner is most likely to skip, so it gets its own strip.
    */}
    <div className="mt-3 flex items-start gap-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-primary"
      >
        <path d="M3 2v6h6" />
        <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
      </svg>
      <p className="text-sm">
        <span className="font-semibold">Stage 7 loops back to stage 2.</span>{' '}
        <span className="text-secondary dark:text-gray-400">
          The optimisation step ranks changes by their <em>measured</em> effect on this run, and each
          one can be applied to the configuration and run again. A single pass through the nine
          stages is one data point; the loop is the experiment.
        </span>
      </p>
    </div>
  </div>
);

export default WorkflowDiagram;
