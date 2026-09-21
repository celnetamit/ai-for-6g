import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import { LevelPill, SectionHeading, SimulationBadge } from '../components/lab/Primitives';
import { useProgress } from '../context/ProgressContext';
import { useLab } from '../context/LabContext';
import { content } from '../data/content';
import { KNOWLEDGE_MODULES } from '../data/knowledge';
import { EXPERIMENTS, LEVEL_ORDER, experimentById } from '../lib/experiment';

/**
 * User dashboard (spec §10.1).
 *
 * Its job is to answer three questions in one screen: where am I, what is
 * there, and what did I last do. The workflow diagram is on it deliberately —
 * the nine stages of §4 are the mental model the whole lab is organised around,
 * and a learner who has seen it once can place any screen they land on.
 */

const WORKFLOW = [
  { label: 'Scenario', detail: 'Pick an experiment — a question with a measurable answer.', to: '/experiments' },
  { label: 'Parameters', detail: 'Frequency, bandwidth, users, distance, power, noise.', to: '/experiments' },
  { label: 'Channel', detail: 'Line of sight, urban NLOS, indoor, or high mobility.', to: '/experiments' },
  { label: 'AI model', detail: 'A trained encoder, or a search method for the surface.', to: '/models' },
  { label: 'Simulation', detail: 'Generate channels, transmit symbols, count errors.', to: '/experiments' },
  { label: 'Evaluation', detail: 'Throughput, latency, energy, BER, signal quality.', to: '/experiments' },
  { label: 'Optimisation', detail: 'Measured sensitivity to every parameter you could change.', to: '/experiments' },
  { label: 'Visualisation', detail: 'Waterfalls, sweeps, constellations, reconstructions.', to: '/experiments' },
  { label: 'Report', detail: 'Methods, results, discussion, limitations, reproduction.', to: '/history' },
];

const MODULES = [
  { title: 'Knowledge Bank', description: 'Five modules, from 3G-to-6G history to DeepJSCC.', to: '/knowledge-bank' },
  { title: 'Learning levels', description: 'Foundation, Engineering or Research.', to: '/levels' },
  { title: 'Experiment catalogue', description: 'Six experiments, each with a measurable question.', to: '/experiments' },
  { title: 'AI model engine', description: 'Three trained architectures and their model cards.', to: '/models' },
  { title: 'Dataset manager', description: 'Three demo datasets, generated and exportable.', to: '/datasets' },
  { title: 'Experiment history', description: 'Every run, and your saved projects.', to: '/history' },
  { title: 'Interactive tools', description: 'Standalone simulators and the 3D surface view.', to: '/tools' },
  { title: 'Lessons and assessments', description: 'The guided course and its quizzes.', to: '/lessons' },
];

const Dashboard: React.FC = () => {
  const { progress } = useProgress();
  const { level, history, projects } = useLab();

  const totalLessons = content.learningMaterials.reduce(
    (total, module) => total + module.lessons.length,
    0,
  );
  const completed = progress.completedLessons.length;
  const percentage = totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0;
  const unlocked = level
    ? EXPERIMENTS.filter((e) => LEVEL_ORDER.indexOf(e.level) <= LEVEL_ORDER.indexOf(level)).length
    : EXPERIMENTS.filter((e) => e.level === 'beginner').length;

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {level && <LevelPill level={level} />}
          <SimulationBadge />
        </div>
        <h1 className="text-3xl font-bold">{content.workshopTitle}</h1>
        <p className="mt-2 max-w-4xl text-lg text-secondary dark:text-gray-400">
          A virtual research environment for understanding, configuring, simulating and optimising
          next-generation communication systems. Every number on every screen is computed here, from
          the parameters you set, by models you can read.
        </p>

        {!level && (
          <Card className="mt-5 border-l-4 border-primary">
            <h2 className="text-lg font-semibold">Start by choosing a level</h2>
            <p className="mt-1 text-sm text-secondary dark:text-gray-400">
              Foundation, Engineering or Research. It sets what the Knowledge Bank shows and which
              experiments appear by default — and you can change it at any time.
            </p>
            <Link
              to="/levels"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Choose your level
            </Link>
          </Card>
        )}
      </section>

      <section>
        <SectionHeading
          title="How the lab works"
          description="Nine stages, from a question to a report. Every experiment walks the same path; they differ in which stages carry the weight."
        />
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WORKFLOW.map((stage, index) => (
            <li key={stage.label}>
              <Link
                to={stage.to}
                className="block h-full rounded-lg border border-gray-200 p-4 transition-colors hover:border-primary dark:border-gray-700"
              >
                <p className="text-xs font-semibold text-primary">Stage {index + 1}</p>
                <p className="font-semibold">{stage.label}</p>
                <p className="mt-1 text-sm text-secondary dark:text-gray-400">{stage.detail}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="text-lg font-semibold">Course progress</h2>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="mt-2 text-sm font-semibold">
            {percentage}% — {completed} of {totalLessons} lessons
          </p>
          <p className="mt-1 text-xs text-secondary dark:text-gray-400">
            {Object.keys(progress.assessmentScores).length} of{' '}
            {content.learningMaterials.length} assessments attempted
          </p>
          <Link
            to="/lessons"
            className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Continue the course →
          </Link>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Laboratory</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-secondary dark:text-gray-400">Experiments unlocked</dt>
              <dd className="font-mono font-semibold">
                {unlocked} of {EXPERIMENTS.length}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secondary dark:text-gray-400">Runs recorded</dt>
              <dd className="font-mono font-semibold">{history.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secondary dark:text-gray-400">Saved projects</dt>
              <dd className="font-mono font-semibold">{projects.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-secondary dark:text-gray-400">Knowledge sections</dt>
              <dd className="font-mono font-semibold">
                {KNOWLEDGE_MODULES.reduce((total, module) => total + module.sections.length, 0)}
              </dd>
            </div>
          </dl>
          <Link
            to="/experiments"
            className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Go to the experiments →
          </Link>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Most recent run</h2>
          {history[0] ? (
            <>
              <p className="mt-2 font-semibold">{history[0].title}</p>
              <p className="text-xs text-secondary dark:text-gray-400">
                {new Date(history[0].savedAt).toLocaleString()}
              </p>
              <dl className="mt-3 space-y-1.5 text-sm">
                {history[0].headline.slice(0, 3).map((item) => (
                  <div key={item.label} className="flex justify-between gap-3">
                    <dt className="text-secondary dark:text-gray-400">{item.label}</dt>
                    <dd className="text-right font-mono font-semibold">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <Link
                to={`/experiments/${history[0].experimentId}`}
                className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
              >
                Open {experimentById(history[0].experimentId).title} →
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-secondary dark:text-gray-400">
              Nothing yet. The link budget experiment is the shortest way in — it runs immediately
              and shows a measured bit error rate next to the textbook curve.
            </p>
          )}
        </Card>
      </section>

      <section>
        <SectionHeading title="Everything in the lab" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((module) => (
            <Link
              key={module.to}
              to={module.to}
              className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-primary dark:border-gray-700"
            >
              <p className="font-semibold">{module.title}</p>
              <p className="mt-1 text-sm text-secondary dark:text-gray-400">{module.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <Card className="border-l-4 border-amber-400">
        <h2 className="text-lg font-semibold">What this lab is, and is not</h2>
        <p className="mt-2 text-sm text-secondary dark:text-gray-400">
          It is a teaching simulator. The physics is the textbook physics — free-space path loss,
          Rician block fading, Gray-coded QAM, the IRS cascade, Shannon capacity — implemented
          honestly and unit-tested against closed-form references. The neural models were really
          trained and ship with the measurements that justify them.
        </p>
        <p className="mt-2 text-sm text-secondary dark:text-gray-400">
          It is not a measurement of any deployed network, and none of it has been validated against
          hardware. Every result screen carries that label, every export carries it in its header,
          and every run lists what its models leave out.
        </p>
      </Card>
    </div>
  );
};

export default Dashboard;
