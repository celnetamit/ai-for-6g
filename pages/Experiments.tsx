import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import { LevelPill, SectionHeading, WorkflowStepper } from '../components/lab/Primitives';
import { useLab } from '../context/LabContext';
import { EXPERIMENTS, LEVEL_ORDER, type ExperimentMeta } from '../lib/experiment';

/**
 * Experiment selection (spec §11, third screen).
 *
 * Experiments above the learner's level are shown rather than hidden, greyed
 * with the reason. A catalogue that silently omits half its entries teaches the
 * learner that there is nothing more; one that shows what is ahead, and what it
 * would take to get there, is an argument for advancing.
 */

const COST_LABEL: Record<ExperimentMeta['cost'], string> = {
  instant: 'Runs immediately',
  seconds: 'Takes a few seconds',
  slow: 'Takes up to a minute',
};

const Experiments: React.FC = () => {
  const { level } = useLab();
  const ceiling = level ? LEVEL_ORDER.indexOf(level) : 0;

  return (
    <div className="space-y-8">
      <SectionHeading
        as="h1"
        title="Experiment catalogue"
        description="Each experiment is a question with a measurable answer. Pick one, configure it, run it, and read what came back — the engine computes every figure from the parameters you set, and records what it could not model."
        action={
          <Link
            to="/levels"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-primary hover:text-primary dark:border-gray-600"
          >
            {level ? `Level: ${level} — change` : 'Choose a level'}
          </Link>
        }
      />

      {!level && (
        <Card className="border-l-4 border-primary">
          <p className="text-sm">
            You have not chosen a learning level yet, so only the foundation experiments are
            unlocked. <Link to="/levels" className="font-semibold text-primary hover:underline">
              Choose a level
            </Link>{' '}
            to open the rest.
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {EXPERIMENTS.map((experiment) => {
          const locked = LEVEL_ORDER.indexOf(experiment.level) > ceiling;

          return (
            <Card key={experiment.id} className={`flex flex-col ${locked ? 'opacity-70' : ''}`}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <LevelPill level={experiment.level} />
                <span className="text-xs text-secondary dark:text-gray-400">
                  {COST_LABEL[experiment.cost]}
                </span>
              </div>

              <h3 className="text-lg font-bold">{experiment.title}</h3>
              <p className="mt-1 text-sm font-semibold text-primary">{experiment.question}</p>
              <p className="mt-3 flex-grow text-sm text-secondary dark:text-gray-400">
                {experiment.summary}
              </p>

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-secondary dark:text-gray-400">
                  Workflow stages
                </p>
                <WorkflowStepper
                  steps={experiment.stages.map((label) => ({ label, state: 'pending' as const }))}
                />
              </div>

              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-secondary dark:text-gray-400">
                  Outputs
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {experiment.outputs.map((output) => (
                    <span
                      key={output}
                      className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] dark:bg-gray-800"
                    >
                      {output}
                    </span>
                  ))}
                </div>
              </div>

              {locked ? (
                <p className="mt-5 rounded-md border border-dashed border-gray-300 p-3 text-xs text-secondary dark:border-gray-600 dark:text-gray-400">
                  Available at the <strong>{experiment.level}</strong> level.{' '}
                  <Link to="/levels" className="font-semibold text-primary hover:underline">
                    Change your level
                  </Link>{' '}
                  to open it — nothing is withheld, the level only sets the default catalogue.
                </p>
              ) : (
                <Link
                  to={`/experiments/${experiment.id}`}
                  className="mt-5 block rounded-md bg-primary px-4 py-2.5 text-center font-semibold text-white transition-colors hover:bg-primary-dark"
                >
                  Configure and run
                </Link>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Experiments;
