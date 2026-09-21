import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import { LevelPill, SectionHeading } from '../components/lab/Primitives';
import { useLab } from '../context/LabContext';
import { EXPERIMENTS, type LearningLevel } from '../lib/experiment';
import { KNOWLEDGE_MODULES, sectionsForLevel } from '../data/knowledge';

/**
 * Learning level selection (spec §2).
 *
 * The level is not a lock. It sets what the Knowledge Bank shows by default and
 * which experiments are offered, and it can be changed at any time from here or
 * from the header. Gating a learner *out* of material they want to read is a
 * way of losing them; gating material *in* by default is a way of not drowning
 * them on day one.
 */

interface LevelDefinition {
  id: LearningLevel;
  title: string;
  tagline: string;
  audience: string;
  learn: string[];
  build: string[];
}

const LEVELS: LevelDefinition[] = [
  {
    id: 'beginner',
    title: 'Foundation',
    tagline: 'What 6G is trying to do, and why the obvious answers run out.',
    audience:
      'For learners meeting wireless communication for the first time, or meeting 6G for the first time. No prior radio engineering is assumed.',
    learn: [
      'How the generations from 3G to 6G each changed what the network carries',
      'Why moving to a higher carrier frequency costs 18 dB and what that means',
      'What signal-to-noise ratio is, and how it turns into a data rate',
      'What a reflecting surface does, in words before equations',
      'Where AI genuinely belongs in a radio, and where it is decoration',
    ],
    build: [
      'Run a link budget and watch the reach collapse as the frequency rises',
      'See a measured bit error rate appear next to the textbook curve',
    ],
  },
  {
    id: 'intermediate',
    title: 'Engineering',
    tagline: 'Configure real parameters and read what comes back.',
    audience:
      'For learners comfortable with dB, SNR and the idea of a channel. The level where the lab starts asking you to make choices and defend them.',
    learn: [
      'The signal model Y = HX + N, and what block fading does to a BER curve',
      'The IRS equation y = (h_rᵀ Φ h_t)x + n and the N² scaling law it implies',
      'Why a passive surface pays path loss twice, and what that costs',
      'Reinforcement learning as a controller, stated concretely',
      'What semantic communication changes, and what it does not',
    ],
    build: [
      'Find how many reflecting elements it takes to beat a blocked direct path',
      'Race four search methods against the closed-form optimum on equal budgets',
      'Send a scene two ways over one channel and measure both reconstructions',
    ],
  },
  {
    id: 'advanced',
    title: 'Research',
    tagline: 'Compare approaches, sweep parameters, write it up.',
    audience:
      'For learners who want to produce a defensible result: a comparison with controlled variables, stated limitations, and a report someone else could reproduce.',
    learn: [
      'How to read an architecture comparison and see what it was conditional on',
      'Discrete phase quantisation, reflection loss and the channel-estimation problem',
      'The cliff effect against graceful degradation, and when each is preferable',
      'What a model card has to record before its numbers mean anything',
      'The open problems in semantic communication, stated plainly',
    ],
    build: [
      'Sweep three trained architectures and a classical baseline across SNR',
      'Serve several users at different distances and weigh rate against fairness',
      'Generate a research-style report with methods, results and limitations',
    ],
  },
];

const Levels: React.FC = () => {
  const { level, setLevel } = useLab();
  const navigate = useNavigate();

  const choose = (next: LearningLevel) => {
    setLevel(next);
    navigate('/experiments');
  };

  return (
    <div className="space-y-8">
      <SectionHeading
        as="h1"
        title="Choose your learning level"
        description="The level sets what the Knowledge Bank shows by default and which experiments appear in the catalogue. You can change it whenever you like — nothing is hidden permanently, and moving up adds material rather than replacing it."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {LEVELS.map((definition) => {
          const experiments = EXPERIMENTS.filter((e) => e.level === definition.id).length;
          const sections = KNOWLEDGE_MODULES.reduce(
            (total, module) =>
              total + module.sections.filter((s) => s.level === definition.id).length,
            0,
          );
          const selected = level === definition.id;

          return (
            <Card
              key={definition.id}
              className={`flex flex-col border-2 transition-colors ${
                selected ? 'border-primary' : 'border-transparent'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <LevelPill level={definition.id} />
                {selected && (
                  <span className="text-xs font-semibold text-primary">Currently selected</span>
                )}
              </div>
              <h3 className="text-xl font-bold">{definition.title}</h3>
              <p className="mt-1 text-sm text-secondary dark:text-gray-400">{definition.tagline}</p>

              <p className="mt-4 text-sm">{definition.audience}</p>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-secondary dark:text-gray-400">
                  You will learn
                </p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {definition.learn.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden="true" className="text-primary">
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 flex-grow">
                <p className="text-xs font-semibold uppercase tracking-wide text-secondary dark:text-gray-400">
                  You will run
                </p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {definition.build.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden="true" className="text-primary">
                        →
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-5 text-xs text-secondary dark:text-gray-400">
                {sections} new knowledge {sections === 1 ? 'section' : 'sections'} ·{' '}
                {experiments} new {experiments === 1 ? 'experiment' : 'experiments'}
                {definition.id !== 'beginner' && ', plus everything below'}
              </p>

              <button
                type="button"
                onClick={() => choose(definition.id)}
                className={`mt-4 w-full rounded-md px-4 py-2.5 font-semibold transition-colors ${
                  selected
                    ? 'bg-primary text-white hover:bg-primary-dark'
                    : 'border border-primary text-primary hover:bg-primary hover:text-white'
                }`}
              >
                {selected ? 'Continue at this level' : `Start at ${definition.title}`}
              </button>
            </Card>
          );
        })}
      </div>

      {level && (
        <Card>
          <h3 className="text-lg font-semibold">Where this takes you</h3>
          <p className="mt-2 text-sm text-secondary dark:text-gray-400">
            At <strong>{level}</strong> level the Knowledge Bank shows{' '}
            {KNOWLEDGE_MODULES.reduce(
              (total, module) => total + sectionsForLevel(module, level).length,
              0,
            )}{' '}
            sections across five modules, and the catalogue offers{' '}
            {EXPERIMENTS.filter((e) =>
              ['beginner', 'intermediate', 'advanced'].indexOf(e.level) <=
              ['beginner', 'intermediate', 'advanced'].indexOf(level),
            ).length}{' '}
            experiments.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/knowledge-bank"
              className="rounded-md border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
            >
              Read the Knowledge Bank first
            </Link>
            <Link
              to="/experiments"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Go to the experiments
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Levels;
