import React from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import Card from '../components/ui/Card';
import KnowledgeCheck from '../components/KnowledgeCheck';
import { LevelPill, SectionHeading } from '../components/lab/Primitives';
import { content } from '../data/content';
import { KNOWLEDGE_MODULES, sectionsForLevel } from '../data/knowledge';
import { useLab } from '../context/LabContext';
import { LEVEL_ORDER, experimentById, type LearningLevel } from '../lib/experiment';

/**
 * Knowledge Bank (spec §3, §10.2).
 *
 * Five modules, each written across the three levels, filtered by the level the
 * learner selected. The filter is a default rather than a wall — the toggle
 * below shows everything — because material a learner cannot reach is material
 * they do not know exists.
 *
 * Markdown is rendered with `react-markdown` rather than `dangerouslySetInnerHTML`.
 * The content is authored in this repository and not user-supplied, so the risk
 * is small, but a content pipeline that is safe only because of where the text
 * currently comes from is one edit away from not being safe.
 */

const LEVEL_LABEL: Record<LearningLevel, string> = {
  beginner: 'Foundation',
  intermediate: 'Engineering',
  advanced: 'Research',
};

const KnowledgeBank: React.FC = () => {
  const { level } = useLab();
  const effectiveLevel: LearningLevel = level ?? 'beginner';
  const [showEverything, setShowEverything] = React.useState(false);
  const [openModule, setOpenModule] = React.useState<string>(KNOWLEDGE_MODULES[0]!.id);
  const [search, setSearch] = React.useState('');

  const { glossary, faqs } = content.knowledgeBank;

  const filteredGlossary = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return glossary;
    return glossary.filter(
      (item) =>
        item.term.toLowerCase().includes(term) || item.definition.toLowerCase().includes(term),
    );
  }, [glossary, search]);

  const active = KNOWLEDGE_MODULES.find((module) => module.id === openModule) ?? KNOWLEDGE_MODULES[0]!;
  const sections = showEverything ? active.sections : sectionsForLevel(active, effectiveLevel);
  const hidden = active.sections.length - sections.length;

  return (
    <div className="space-y-8">
      <SectionHeading
        as="h1"
        title="Knowledge Bank"
        description="Five modules covering the ground the lab experiments stand on. Each section is written for a level, and every quantitative claim names the experiment that produces it — so nothing here has to be taken on trust."
        action={
          <Link
            to="/levels"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-primary hover:text-primary dark:border-gray-600"
          >
            Level: {LEVEL_LABEL[effectiveLevel]} — change
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <nav aria-label="Knowledge bank modules" className="space-y-2">
          {KNOWLEDGE_MODULES.map((module) => {
            const available = sectionsForLevel(module, effectiveLevel).length;
            const isOpen = module.id === active.id;
            return (
              <button
                key={module.id}
                type="button"
                onClick={() => setOpenModule(module.id)}
                aria-current={isOpen ? 'true' : undefined}
                aria-pressed={isOpen}
                className={`w-full rounded-lg border-2 p-3 text-left transition-colors ${
                  isOpen
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-primary/50 dark:border-gray-700'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary dark:text-gray-400">
                  Module {module.number}
                </p>
                <p className="font-semibold leading-tight">{module.title}</p>
                <p className="text-xs text-secondary dark:text-gray-400">{module.subtitle}</p>
                <p className="mt-1.5 text-[11px] text-secondary dark:text-gray-400">
                  {available} of {module.sections.length} sections at your level
                </p>
              </button>
            );
          })}

          <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-dashed border-gray-300 p-3 text-xs dark:border-gray-600">
            <input
              type="checkbox"
              checked={showEverything}
              onChange={(event) => setShowEverything(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              Show every section, including those above my level. Nothing is locked — the level only
              sets what appears by default.
            </span>
          </label>
        </nav>

        <div className="space-y-6">
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary dark:text-gray-400">
              Module {active.number}
            </p>
            <h2 className="text-2xl font-bold">{active.title}</h2>
            <p className="text-sm text-secondary dark:text-gray-400">{active.subtitle}</p>
            <p className="mt-3 text-base">{active.promise}</p>
            {hidden > 0 && (
              <p className="mt-3 text-xs text-secondary dark:text-gray-400">
                {hidden} further {hidden === 1 ? 'section is' : 'sections are'} written for higher
                levels. Tick the box on the left to read them now.
              </p>
            )}
          </Card>

          {sections.map((section) => {
            const experiment = section.experiment ? experimentById(section.experiment) : null;
            return (
              <Card key={section.id}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <LevelPill level={section.level} />
                  {LEVEL_ORDER.indexOf(section.level) > LEVEL_ORDER.indexOf(effectiveLevel) && (
                    <span className="text-xs text-secondary dark:text-gray-400">
                      above your selected level
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold">{section.title}</h3>
                <div className="prose prose-sm mt-3 max-w-none dark:prose-invert prose-table:text-sm">
                  <ReactMarkdown>{section.body}</ReactMarkdown>
                </div>
                {experiment && (
                  <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <p className="text-sm font-semibold">Check this yourself</p>
                    <p className="mt-1 text-sm text-secondary dark:text-gray-400">
                      {experiment.question}
                    </p>
                    <Link
                      to={`/experiments/${experiment.id}`}
                      className="mt-3 inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
                    >
                      Open “{experiment.title}”
                    </Link>
                  </div>
                )}
              </Card>
            );
          })}

          {sections.length === 0 && (
            <Card>
              <p className="text-sm text-secondary dark:text-gray-400">
                No sections at this level for this module. Tick “show every section” to read the
                rest.
              </p>
            </Card>
          )}
        </div>
      </div>

      <section>
        <SectionHeading
          title="Quick knowledge check"
          description="A handful of questions drawn from the module assessments, shuffled each time."
        />
        <KnowledgeCheck />
      </section>

      <section>
        <SectionHeading title="Glossary" description={`${glossary.length} terms used across the lab.`} />
        <div className="mb-4">
          <label htmlFor="glossary-search" className="sr-only">
            Search the glossary
          </label>
          <input
            id="glossary-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search terms and definitions…"
            className="w-full max-w-md rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {filteredGlossary.map((item) => (
            <Card key={item.term}>
              <h3 className="font-semibold text-primary">{item.term}</h3>
              {item.category && (
                <p className="text-[11px] uppercase tracking-wide text-secondary dark:text-gray-400">
                  {item.category}
                </p>
              )}
              <p className="mt-2 text-sm text-secondary dark:text-gray-400">{item.definition}</p>
            </Card>
          ))}
          {filteredGlossary.length === 0 && (
            <Card>
              <p className="text-sm text-secondary dark:text-gray-400">
                No terms match “{search}”.
              </p>
            </Card>
          )}
        </div>
      </section>

      <section>
        <SectionHeading title="Frequently asked" />
        <div className="space-y-3">
          {faqs.map((faq) => (
            <Card key={faq.question}>
              <h3 className="font-semibold">{faq.question}</h3>
              <p className="mt-2 text-sm text-secondary dark:text-gray-400">{faq.answer}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};

export default KnowledgeBank;
