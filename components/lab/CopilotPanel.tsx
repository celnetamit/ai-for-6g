import React from 'react';
import type { ExperimentResult } from '../../lib/experiment';
import {
  type CopilotReply,
  SUGGESTED_PROMPTS,
  askCopilot,
  explainWithEngine,
  isCopilotAvailable,
} from '../../services/copilot';
import { SimulationBadge } from './Primitives';

/**
 * The 6G Network Copilot panel.
 *
 * Three things about this component are deliberate and would be easy to get
 * wrong in the direction of looking better:
 *
 *   1. When no gateway is configured there is no chat box. The panel shows the
 *      engine's own reading of the numbers and says so. A disabled input with a
 *      cheerful placeholder would imply a feature the deployment does not have.
 *   2. Every reply is tagged with where it came from — the model, or the
 *      engine — because the two have very different epistemic status and the
 *      learner is entitled to know which they are reading.
 *   3. Figures in a model's reply that do not appear in the supplied results
 *      are listed under it. The audit is a heuristic and the panel says so,
 *      but a fabricated throughput will not pass silently.
 */

interface Message {
  id: string;
  role: 'learner' | 'copilot';
  text: string;
  source?: CopilotReply['source'];
  unverified?: string[];
}

const renderMarkdownish = (text: string): React.ReactNode =>
  text.split('\n').map((line, index) => {
    if (!line.trim()) return <div key={index} className="h-2" />;
    const bold = line.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, partIndex) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
        return (
          <em key={partIndex} className="text-secondary dark:text-gray-400">
            {part.slice(1, -1)}
          </em>
        );
      }
      return <React.Fragment key={partIndex}>{part}</React.Fragment>;
    });
    return line.startsWith('- ') ? (
      <div key={index} className="flex gap-2">
        <span aria-hidden="true" className="text-primary">
          •
        </span>
        <span>{bold}</span>
      </div>
    ) : (
      <p key={index}>{bold}</p>
    );
  });

export const CopilotPanel: React.FC<{ result: ExperimentResult | null }> = ({ result }) => {
  const available = isCopilotAvailable();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [question, setQuestion] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // A new result invalidates the conversation: the answers referred to numbers
  // that are no longer on screen, and leaving them visible under a different
  // experiment is how a learner ends up quoting the wrong run.
  React.useEffect(() => {
    setMessages([]);
    setError(null);
  }, [result?.id]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const ask = React.useCallback(
    async (text: string) => {
      if (!result || busy) return;
      setBusy(true);
      setError(null);
      setQuestion('');
      setMessages((previous) => [
        ...previous,
        { id: `q-${Date.now()}`, role: 'learner', text },
      ]);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const reply = await askCopilot(text, result, controller.signal);
        setMessages((previous) => [
          ...previous,
          {
            id: `a-${Date.now()}`,
            role: 'copilot',
            text: reply.text,
            source: reply.source,
            unverified: reply.unverifiedNumbers,
          },
        ]);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'The Copilot request failed.');
      } finally {
        setBusy(false);
      }
    },
    [busy, result],
  );

  /*
   * This useMemo sits ABOVE the early return deliberately.
   *
   * It used to sit below it, which is a Rules-of-Hooks violation: React
   * identifies hooks by call order, so the first render with `result === null`
   * registers four hooks and the next one registers five, and React throws
   * "Rendered more hooks than during the previous render" — a blank panel, or
   * a blank page. The workspace happens only ever to mount this component with
   * a result, which is precisely why the bug was invisible; it would have
   * appeared the first time anyone rendered the panel before a run.
   */
  const engineReading = React.useMemo(
    () => (result ? explainWithEngine(result) : null),
    [result],
  );

  if (!result || !engineReading) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-secondary dark:border-gray-700 dark:text-gray-400">
        Run an experiment and the Copilot will have results to explain. It is not given any
        figures of its own — it can only discuss what the engine measured.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-lg border border-gray-200 bg-background-light p-4 text-xs dark:border-gray-700 dark:bg-background-dark">
        <p className="font-semibold">What this assistant will and will not do</p>
        <ul className="mt-2 space-y-1 text-secondary dark:text-gray-400">
          <li>• It explains results the simulation engine has already computed.</li>
          <li>• It will not produce an experimental result of its own.</li>
          <li>• It will not claim any of this has been validated on a real network.</li>
          <li>• It will not make an engineering decision for you.</li>
        </ul>
      </div>

      {!available && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-secondary dark:bg-gray-700 dark:text-gray-300">
              Engine reading
            </span>
            <SimulationBadge />
          </div>
          <div className="space-y-1 text-sm leading-relaxed">
            {renderMarkdownish(engineReading.text)}
          </div>
        </div>
      )}

      {available && (
        <>
          <div className="flex-1 space-y-4 overflow-y-auto" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-1 text-sm leading-relaxed">
                {renderMarkdownish(engineReading.text)}
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === 'learner'
                    ? 'rounded-lg bg-primary/10 p-3 text-sm'
                    : 'rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700'
                }
              >
                {message.role === 'copilot' && (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                      {message.source === 'gateway' ? '6G Network Copilot' : 'Engine reading'}
                    </span>
                    <SimulationBadge />
                  </div>
                )}
                <div className="space-y-1 leading-relaxed">{renderMarkdownish(message.text)}</div>
                {message.unverified && message.unverified.length > 0 && (
                  <p className="mt-3 rounded-md border border-amber-400/60 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                    <strong>Check these figures.</strong> {message.unverified.join(', ')} —{' '}
                    {message.unverified.length === 1 ? 'this number does' : 'these numbers do'} not
                    appear in the results supplied to the assistant. The check is a heuristic and can
                    flag a legitimate rounding, but a figure listed here has not been verified
                    against this run.
                  </p>
                )}
              </div>
            ))}
            {busy && (
              <p className="text-sm text-secondary dark:text-gray-400" role="status">
                Thinking…
              </p>
            )}
            {error && (
              <p className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.slice(0, 4).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={busy}
                  onClick={() => void ask(prompt)}
                  className="rounded-full border border-gray-300 px-3 py-1 text-xs transition-colors hover:border-primary hover:text-primary disabled:opacity-50 dark:border-gray-600"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (question.trim()) void ask(question.trim());
              }}
              className="flex gap-2"
            >
              <label htmlFor="copilot-input" className="sr-only">
                Ask the 6G Network Copilot
              </label>
              <input
                id="copilot-input"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about this result…"
                disabled={busy}
                className="flex-1 rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              />
              <button
                type="submit"
                disabled={busy || !question.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
              >
                Ask
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default CopilotPanel;
