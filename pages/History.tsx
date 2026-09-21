import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import { SectionHeading, SimulationBadge } from '../components/lab/Primitives';
import { useLab } from '../context/LabContext';
import { experimentById } from '../lib/experiment';

/**
 * Experiment history and saved projects (spec §10.8, §11 "Save Project").
 *
 * A record holds the configuration and a handful of headline figures — not the
 * full result, which contains hundreds of chart points and several reconstructed
 * images. Re-running a saved configuration reproduces the full result exactly,
 * because the seed travels with it, so storing the whole thing would be storing
 * a cache of something already reproducible.
 */

const History: React.FC = () => {
  const { history, projects, clearHistory, deleteProject, setDraft } = useLab();

  return (
    <div className="space-y-8">
      <SectionHeading
        as="h1"
        title="Experiment history"
        description="Every run you have made in this browser, newest first. Load a configuration back into the workspace to reproduce it exactly — the seed is part of the record."
        action={<SimulationBadge />}
      />

      <Card className="border-l-4 border-amber-400">
        <p className="text-sm">
          <strong>This is browser storage.</strong> History and projects live in this browser on this
          device. They are not uploaded anywhere, they do not follow you to another machine, and
          clearing site data deletes them. Download a report for anything you need to keep.
        </p>
      </Card>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Saved projects ({projects.length})</h2>
        </div>

        {projects.length === 0 ? (
          <Card>
            <p className="text-sm text-secondary dark:text-gray-400">
              No saved projects yet. Run an experiment and save its configuration from the workspace.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => {
              const meta = experimentById(project.config.experimentId);
              return (
                <Card key={project.id} className="flex flex-col">
                  <p className="font-semibold">{project.name}</p>
                  <p className="mt-1 text-xs text-secondary dark:text-gray-400">
                    {meta.title} · saved {new Date(project.savedAt).toLocaleString()}
                  </p>
                  <p className="mt-3 flex-grow text-sm text-secondary dark:text-gray-400">
                    {project.note}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-secondary dark:text-gray-400">Band</dt>
                      <dd className="font-mono">
                        {(project.config.communication.frequencyHz / 1e9).toFixed(1)} GHz
                      </dd>
                    </div>
                    <div>
                      <dt className="text-secondary dark:text-gray-400">Distance</dt>
                      <dd className="font-mono">{project.config.communication.distanceM} m</dd>
                    </div>
                    <div>
                      <dt className="text-secondary dark:text-gray-400">IRS elements</dt>
                      <dd className="font-mono">
                        {project.config.irs.enabled ? project.config.irs.elementCount : 'none'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-secondary dark:text-gray-400">Seed</dt>
                      <dd className="font-mono">{project.config.seed}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex gap-2">
                    <Link
                      to={`/experiments/${project.config.experimentId}`}
                      onClick={() => setDraft(project.config.experimentId, project.config)}
                      className="flex-1 rounded-md bg-primary px-3 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
                    >
                      Load and run
                    </Link>
                    <button
                      type="button"
                      onClick={() => deleteProject(project.id)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm transition-colors hover:border-rose-500 hover:text-rose-600 dark:border-gray-600"
                    >
                      Delete
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Runs ({history.length})</h2>
          {history.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm transition-colors hover:border-rose-500 hover:text-rose-600 dark:border-gray-600"
            >
              Clear history
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <Card>
            <p className="text-sm text-secondary dark:text-gray-400">
              Nothing yet.{' '}
              <Link to="/experiments" className="font-semibold text-primary hover:underline">
                Run an experiment
              </Link>{' '}
              and it will appear here.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {history.map((record) => (
              <Card key={record.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{record.title}</p>
                    <p className="text-xs text-secondary dark:text-gray-400">
                      {new Date(record.savedAt).toLocaleString()} ·{' '}
                      {(record.durationMs / 1000).toFixed(2)} s · seed {record.config.seed} ·{' '}
                      <code className="font-mono">{record.id}</code>
                    </p>
                  </div>
                  <Link
                    to={`/experiments/${record.experimentId}`}
                    onClick={() => setDraft(record.experimentId, record.config)}
                    className="rounded-md border border-primary px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                  >
                    Reload this configuration
                  </Link>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {record.headline.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-md bg-background-light p-3 dark:bg-background-dark"
                    >
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-secondary dark:text-gray-400">
                        {item.label}
                      </dt>
                      <dd className="mt-0.5 font-mono text-sm font-bold">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default History;
