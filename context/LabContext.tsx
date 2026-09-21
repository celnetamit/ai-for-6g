import React, { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import {
  type ExperimentConfig,
  type ExperimentId,
  type ExperimentRecord,
  type LearningLevel,
  defaultsFor,
} from '../lib/experiment';

/**
 * The learner's place in the lab: which level they selected, what they have
 * configured, and what they have run.
 *
 * Kept separate from `ProgressContext`, which owns lesson and assessment
 * progress. The split is along a real seam — progress is about the course,
 * this is about the laboratory — and merging them would make every experiment
 * run rewrite the lesson state.
 *
 * Everything here is persisted to `localStorage`, which means it lives on one
 * browser on one device. That is stated on the dashboard rather than implied,
 * because a learner who assumes their saved projects are on a server will
 * eventually lose them.
 */

export interface SavedProject {
  id: string;
  name: string;
  savedAt: string;
  config: ExperimentConfig;
  note: string;
}

interface LabState {
  level: LearningLevel | null;
  history: ExperimentRecord[];
  projects: SavedProject[];
  /**
   * One configuration per experiment, so switching between them and coming
   * back does not silently discard what the learner set up. A single shared
   * draft would also mean the opening parameters of one experiment become the
   * opening parameters of the next, which is how a learner ends up running the
   * semantic comparison on a link that is in outage.
   */
  drafts: Partial<Record<ExperimentId, ExperimentConfig>>;
}

const INITIAL: LabState = {
  level: null,
  history: [],
  projects: [],
  drafts: {},
};

/**
 * History is capped. Each record is small, but `localStorage` is a few
 * megabytes per origin and an unbounded log would eventually throw a quota
 * error inside an unrelated write — a failure that surfaces as "the theme
 * toggle stopped working".
 */
const MAX_HISTORY = 40;
const MAX_PROJECTS = 25;

interface LabContextValue extends LabState {
  setLevel: (level: LearningLevel) => void;
  /** The learner's configuration for one experiment, or its opening defaults. */
  draftFor: (id: ExperimentId) => ExperimentConfig;
  setDraft: (
    id: ExperimentId,
    update: ExperimentConfig | ((previous: ExperimentConfig) => ExperimentConfig),
  ) => void;
  /** Puts a configuration back to the experiment's opening parameters. */
  resetDraft: (id: ExperimentId) => void;
  recordRun: (record: ExperimentRecord) => void;
  clearHistory: () => void;
  saveProject: (project: Omit<SavedProject, 'id' | 'savedAt'>) => SavedProject;
  deleteProject: (id: string) => void;
  resetLab: () => void;
}

const LabContext = createContext<LabContextValue | undefined>(undefined);

export const LabProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useLocalStorage<LabState>('ai6g.lab', INITIAL);

  const setLevel = useCallback(
    (level: LearningLevel) => setState((previous) => ({ ...previous, level })),
    [setState],
  );

  const draftFor = useCallback<LabContextValue['draftFor']>(
    (id) => ({ ...defaultsFor(id), ...(state.drafts?.[id] ?? {}), experimentId: id }),
    [state.drafts],
  );

  const setDraft = useCallback<LabContextValue['setDraft']>(
    (id, update) =>
      setState((previous) => {
        const current = { ...defaultsFor(id), ...(previous.drafts?.[id] ?? {}), experimentId: id };
        const next = typeof update === 'function' ? update(current) : update;
        return {
          ...previous,
          drafts: { ...(previous.drafts ?? {}), [id]: { ...next, experimentId: id } },
        };
      }),
    [setState],
  );

  const resetDraft = useCallback<LabContextValue['resetDraft']>(
    (id) =>
      setState((previous) => {
        const drafts = { ...(previous.drafts ?? {}) };
        delete drafts[id];
        return { ...previous, drafts };
      }),
    [setState],
  );

  /*
   * Every reducer below coalesces the array it touches.
   *
   * The context value already defends the READ path with `?? []`, which made
   * the write path look safe when it was not: `previous` comes from
   * `localStorage`, not from the memo, so an entry written by an older build —
   * or a partially-written one — reaches these callbacks with `history` or
   * `projects` undefined and `.filter` throws inside a state updater, which
   * React surfaces as a blank page rather than as a storage problem.
   */
  const recordRun = useCallback(
    (record: ExperimentRecord) =>
      setState((previous) => ({
        ...previous,
        history: [record, ...(previous.history ?? []).filter((r) => r.id !== record.id)].slice(
          0,
          MAX_HISTORY,
        ),
      })),
    [setState],
  );

  const clearHistory = useCallback(
    () => setState((previous) => ({ ...previous, history: [] })),
    [setState],
  );

  const saveProject = useCallback<LabContextValue['saveProject']>(
    (project) => {
      const saved: SavedProject = {
        ...project,
        id: `prj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        savedAt: new Date().toISOString(),
      };
      setState((previous) => ({
        ...previous,
        projects: [saved, ...(previous.projects ?? [])].slice(0, MAX_PROJECTS),
      }));
      return saved;
    },
    [setState],
  );

  const deleteProject = useCallback(
    (id: string) =>
      setState((previous) => ({
        ...previous,
        projects: (previous.projects ?? []).filter((project) => project.id !== id),
      })),
    [setState],
  );

  const resetLab = useCallback(() => setState(INITIAL), [setState]);

  const value = useMemo<LabContextValue>(
    () => ({
      ...state,
      // A `localStorage` entry written by an older build can be missing fields
      // added since. Defaulting here keeps a stale entry from crashing a page
      // that maps over `history`.
      level: state.level ?? null,
      history: state.history ?? [],
      projects: state.projects ?? [],
      drafts: state.drafts ?? {},
      setLevel,
      draftFor,
      setDraft,
      resetDraft,
      recordRun,
      clearHistory,
      saveProject,
      deleteProject,
      resetLab,
    }),
    [clearHistory, deleteProject, draftFor, recordRun, resetDraft, resetLab, saveProject, setDraft, setLevel, state],
  );

  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
};

export const useLab = (): LabContextValue => {
  const context = useContext(LabContext);
  if (!context) throw new Error('useLab must be used within a LabProvider');
  return context;
};
