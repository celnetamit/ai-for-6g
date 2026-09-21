import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import ParameterPanel from '../components/lab/ParameterPanel';
import ResultDashboard from '../components/lab/ResultDashboard';
import CopilotPanel from '../components/lab/CopilotPanel';
import {
  LevelPill,
  RunProgressBar,
  SimulationBadge,
  WorkflowStepper,
  downloadText,
} from '../components/lab/Primitives';
import { useLab } from '../context/LabContext';
import {
  type ExperimentId,
  type ExperimentResult,
  type RunProgress,
  EXPERIMENTS,
  runExperiment,
  toRecord,
} from '../lib/experiment';
import { analyseSensitivity } from '../lib/advisor';
import { buildReport, reportFilename } from '../lib/report';
import { formatRate } from '../lib/performance';

/**
 * The workspace: configuration, run, optimisation, results, report, save.
 *
 * Screens 5 through 10 of the spec's front-end flow live on one page rather
 * than on six. Splitting them across routes would mean carrying the result
 * object through navigation and would put a page transition between changing a
 * parameter and seeing what it did — which is the loop the whole lab is built
 * around.
 *
 * The run happens on the main thread. It yields to the event loop between
 * stages so the progress bar paints; a web worker would be better for the
 * longest sweeps and is the obvious next step, but it would also put the
 * trained models behind a message boundary for a run that currently takes a few
 * seconds.
 */

type Phase = 'configuring' | 'running' | 'complete';

const Workspace: React.FC = () => {
  const { experimentId } = useParams<{ experimentId: string }>();
  const navigate = useNavigate();
  const { draftFor, setDraft, resetDraft, recordRun, saveProject, level } = useLab();

  const meta = React.useMemo(() => {
    const known = EXPERIMENTS.find((entry) => entry.id === experimentId);
    return known ?? null;
  }, [experimentId]);

  const [phase, setPhase] = React.useState<Phase>('configuring');
  const [progress, setProgress] = React.useState<RunProgress>({ stage: '', fraction: 0 });
  const [result, setResult] = React.useState<ExperimentResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [projectName, setProjectName] = React.useState('');
  const [savedNotice, setSavedNotice] = React.useState<string | null>(null);
  const runToken = React.useRef(0);

  // Each experiment carries its own configuration, so this reads the one for
  // the route and falls back to that experiment's opening parameters.
  const draft = React.useMemo(
    () => draftFor((meta?.id ?? 'link-budget') as ExperimentId),
    [draftFor, meta?.id],
  );

  React.useEffect(() => {
    // A different experiment invalidates the result on screen.
    setResult(null);
    setPhase('configuring');
    setError(null);
  }, [experimentId]);

  /*
   * Invalidate the in-flight run when this page goes away.
   *
   * `run()` guards its writes with `runToken`, but nothing was bumping the
   * token on unmount — so navigating away from a slow experiment (the
   * architecture sweep takes the best part of a minute) still ran to
   * completion and then called `recordRun`, writing a run the learner had
   * abandoned into their history. Bumping the token here makes the existing
   * guard fire: the computation still finishes, because it is plain
   * arithmetic with nothing to cancel, but its results are discarded.
   */
  React.useEffect(
    () => () => {
      runToken.current += 1;
    },
    [],
  );

  const run = React.useCallback(async () => {
    if (!meta) return;
    const token = runToken.current + 1;
    runToken.current = token;

    setPhase('running');
    setError(null);
    setSavedNotice(null);
    setProgress({ stage: 'Starting', fraction: 0 });

    try {
      const outcome = await runExperiment(
        { ...draft, experimentId: meta.id },
        (update) => {
          if (runToken.current === token) setProgress(update);
        },
      );
      if (runToken.current !== token) return;
      setResult(outcome);
      setPhase('complete');
      recordRun(toRecord(outcome));
    } catch (failure) {
      if (runToken.current !== token) return;
      setError(
        failure instanceof Error
          ? failure.message
          : 'The run failed. Check the console for details.',
      );
      setPhase('configuring');
    }
  }, [draft, meta, recordRun]);

  const sensitivity = React.useMemo(
    () => (result ? analyseSensitivity(result.config) : null),
    [result],
  );

  if (!meta) {
    return (
      <Card>
        <h1 className="text-xl font-bold">Unknown experiment</h1>
        <p className="mt-2 text-sm text-secondary dark:text-gray-400">
          There is no experiment with the identifier <code>{experimentId}</code>.
        </p>
        <Link
          to="/experiments"
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 font-semibold text-white"
        >
          Back to the catalogue
        </Link>
      </Card>
    );
  }

  const stages = ['Parameters', 'Channel', 'AI model', 'Simulation', 'Evaluation', 'Report'];
  const activeStage =
    phase === 'configuring' ? 0 : phase === 'running' ? 3 : stages.length - 1;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <LevelPill level={meta.level} />
          <SimulationBadge />
          {level && level !== meta.level && (
            <span className="text-xs text-secondary dark:text-gray-400">
              your level: {level}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold">{meta.title}</h1>
        <p className="mt-1 text-base font-semibold text-primary">{meta.question}</p>
        <p className="mt-2 max-w-4xl text-sm text-secondary dark:text-gray-400">{meta.summary}</p>
        <div className="mt-4">
          <WorkflowStepper
            steps={stages.map((label, index) => ({
              label,
              state: index < activeStage ? 'done' : index === activeStage ? 'active' : 'pending',
            }))}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Parameter configuration</h2>
            <ParameterPanel
              config={draft}
              experimentId={meta.id}
              onChange={(update) => setDraft(meta.id, update)}
              disabled={phase === 'running'}
            />
            <button
              type="button"
              disabled={phase === 'running'}
              onClick={() => resetDraft(meta.id)}
              className="mt-4 w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs font-semibold text-secondary transition-colors hover:border-primary hover:text-primary disabled:opacity-50 dark:border-gray-600 dark:text-gray-400"
            >
              Reset to this experiment's opening parameters
            </button>
          </Card>

          <Card>
            {phase === 'running' ? (
              <div className="space-y-3">
                <RunProgressBar stage={progress.stage} fraction={progress.fraction} />
                <p className="text-xs text-secondary dark:text-gray-400">
                  The engine is generating channels, transmitting symbols and counting errors. This
                  is arithmetic, not a network request — it will finish.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void run()}
                className="w-full rounded-md bg-primary px-4 py-3 font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                {result ? 'Run again with these parameters' : 'Run experiment'}
              </button>
            )}
            {error && (
              <p className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </p>
            )}
            {result && phase === 'complete' && (
              <p className="mt-3 text-xs text-secondary dark:text-gray-400">
                Completed in {(result.durationMs / 1000).toFixed(2)} s · run{' '}
                <code className="font-mono">{result.id}</code>
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {!result && phase !== 'running' && (
            <Card className="border-l-4 border-primary">
              <h2 className="text-lg font-semibold">Before you run it</h2>
              <p className="mt-2 text-sm text-secondary dark:text-gray-400">
                Predict the answer first. Write down what you expect the SNR and the bit error rate
                to be, then run it. The value of a simulator is in the times it disagrees with you,
                and you only notice those if you committed to an expectation.
              </p>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-secondary dark:text-gray-400">
                  This experiment will produce
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {meta.outputs.map((output) => (
                    <span
                      key={output}
                      className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs dark:bg-gray-800"
                    >
                      {output}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {result && <ResultDashboard result={result} />}

          {result && sensitivity && sensitivity.suggestions.length > 0 && (
            <Card>
              <h2 className="text-lg font-bold">Where to go from here</h2>
              <p className="mt-1 text-sm text-secondary dark:text-gray-400">
                Each of these changes was applied to your configuration and the link recomputed. The
                deltas are measured, not estimated — and one of them may well be negative, which is
                itself worth knowing.
              </p>
              <div className="mt-4 space-y-3">
                {sensitivity.suggestions.slice(0, 5).map((suggestion) => (
                  <div
                    key={suggestion.change}
                    className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">{suggestion.change}</p>
                      <p
                        className={`font-mono text-sm font-bold ${
                          suggestion.deltaSnrDb >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {suggestion.deltaSnrDb >= 0 ? '+' : ''}
                        {suggestion.deltaSnrDb.toFixed(2)} dB
                        {suggestion.deltaRateBps !== 0 && (
                          <span className="ml-2 font-normal text-secondary dark:text-gray-400">
                            {suggestion.deltaRateBps >= 0 ? '+' : '−'}
                            {formatRate(Math.abs(suggestion.deltaRateBps))}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="mt-1.5 text-sm text-secondary dark:text-gray-400">
                      {suggestion.reason}
                    </p>
                    <p className="mt-1.5 text-xs text-secondary dark:text-gray-400">
                      <strong>Cost:</strong> {suggestion.cost}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(meta.id, (previous) => suggestion.apply(previous));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="mt-3 rounded-md border border-primary px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                    >
                      Apply this to the configuration
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {result && (
            <Card>
              <h2 className="text-lg font-bold">6G Network Copilot</h2>
              <p className="mb-4 mt-1 text-sm text-secondary dark:text-gray-400">
                The assistant is given the measurements above and nothing else. It cannot compute a
                result, and any figure it states that does not appear in this run is flagged
                underneath its answer.
              </p>
              <CopilotPanel result={result} />
            </Card>
          )}

          {result && (
            <Card>
              <h2 className="text-lg font-bold">Research report and saved project</h2>
              <p className="mt-1 text-sm text-secondary dark:text-gray-400">
                The report is assembled from the result object — methods, results, discussion,
                limitations and the configuration needed to reproduce it. No language model
                contributes a number, a table or a finding to it.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    downloadText(
                      `${reportFilename(result)}.md`,
                      buildReport(result),
                      'text/markdown',
                    )
                  }
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
                >
                  Download the report (Markdown)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadText(
                      `${reportFilename(result)}.json`,
                      JSON.stringify(
                        {
                          disclaimer:
                            'Simulated results from the AI for 6G Virtual Live Lab. Not a measurement of a real network.',
                          id: result.id,
                          experiment: result.experimentId,
                          startedAt: result.startedAt,
                          config: result.config,
                          link: result.link,
                          measured: { ...result.measured, symbols: undefined },
                          throughput: result.throughput,
                          latency: result.latency,
                          energy: result.energy,
                          elementSweep: result.elementSweep,
                          waterfall: result.waterfall,
                          optimisers: result.optimisers?.map((o) => ({ ...o, phases: undefined })),
                          architectureSweep: result.architectureSweep,
                          users: result.users,
                          fairness: result.fairness,
                          notes: result.notes,
                        },
                        null,
                        2,
                      ),
                      'application/json',
                    )
                  }
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold transition-colors hover:border-primary hover:text-primary dark:border-gray-600"
                >
                  Download the raw results (JSON)
                </button>
                <Link
                  to="/history"
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold transition-colors hover:border-primary hover:text-primary dark:border-gray-600"
                >
                  Experiment history
                </Link>
              </div>

              <form
                className="mt-6 flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const saved = saveProject({
                    name: projectName.trim() || `${meta.title} — ${new Date().toLocaleDateString()}`,
                    config: result.config,
                    note: `Serving SNR ${result.link.servingSnrDb.toFixed(1)} dB, goodput ${formatRate(result.throughput.goodputBps)}`,
                  });
                  setProjectName('');
                  setSavedNotice(`Saved as "${saved.name}".`);
                }}
              >
                <div className="flex-1 min-w-[220px]">
                  <label htmlFor="project-name" className="block text-sm font-semibold">
                    Save this configuration as a project
                  </label>
                  <input
                    id="project-name"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="Give it a name"
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-md border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                >
                  Save project
                </button>
              </form>
              {savedNotice && (
                <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{savedNotice}</p>
              )}
              <p className="mt-3 text-xs text-secondary dark:text-gray-400">
                Projects and history are stored in this browser only. They are not uploaded
                anywhere, which also means they do not follow you to another device and will be lost
                if you clear site data. Download the report for anything you need to keep.
              </p>
            </Card>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => navigate('/experiments')}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold transition-colors hover:border-primary hover:text-primary dark:border-gray-600"
        >
          Back to the catalogue
        </button>
      </div>
    </div>
  );
};

export default Workspace;
