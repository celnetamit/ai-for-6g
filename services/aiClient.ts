/**
 * Transport for the 6G Network Copilot.
 *
 * There is exactly one transport, and it is a server-side gateway. No model
 * vendor SDK is imported and no API key is read from the environment, because
 * anything a Vite `define` injects into this bundle is readable by anyone who
 * opens the network tab — a key compiled into a public single-page app is a
 * published key. The lab's assistant is therefore available only where the
 * operator has stood up a gateway, and absent (not faked) everywhere else.
 *
 * Gateway contract, so one can be put in front of any provider:
 *
 *   POST {VITE_LLM_PROXY_URL}/generate
 *   → { model?, prompt, systemInstruction?, temperature? }
 *   ← 200 { "text": "..." }   (a bare string body is also accepted)
 *   ← 4xx/5xx { "error": "..." }
 *
 * `credentials: 'include'` so the gateway can authorise the caller with the
 * session the Live Labs hub already issued, rather than the browser holding a
 * second credential. Note that this requires the gateway to answer the
 * preflight with an explicit `Access-Control-Allow-Origin` — a wildcard is
 * rejected by the browser when credentials are included, and the rejection
 * leaves no entry in the server log.
 */

const env = import.meta.env;

export interface CopilotConfig {
  gatewayUrl: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

export const copilotConfig: CopilotConfig = {
  gatewayUrl: (env.VITE_LLM_PROXY_URL ?? '').replace(/\/+$/, ''),
  model: env.VITE_LLM_MODEL ?? 'claude-sonnet-5',
  timeoutMs: Number.parseInt(env.VITE_LLM_TIMEOUT_MS ?? '', 10) || 30_000,
  maxRetries: 2,
};

/** True when an operator has configured a gateway for this deployment. */
export const isCopilotAvailable = (): boolean => copilotConfig.gatewayUrl.length > 0;

export class CopilotError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'CopilotError';
    this.retryable = retryable;
  }
}

export interface GenerateRequest {
  prompt: string;
  systemInstruction: string;
  temperature?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Combines the caller's cancellation with a hard deadline.
 *
 * Without the deadline a gateway that accepts the connection and then stalls
 * leaves the panel spinning for as long as the tab is open, which reads as a
 * broken lab rather than as a slow service.
 */
function withDeadline(timeoutMs: number, signal?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const forward = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forward, { once: true });
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forward);
    },
  };
}

async function callOnce(request: GenerateRequest, signal: AbortSignal): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${copilotConfig.gatewayUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal,
      body: JSON.stringify({
        model: copilotConfig.model,
        prompt: request.prompt,
        systemInstruction: request.systemInstruction,
        temperature: request.temperature ?? 0.2,
      }),
    });
  } catch (error) {
    if (signal.aborted) throw new CopilotError('The request was cancelled.', false);
    throw new CopilotError(
      `Could not reach the AI gateway at ${copilotConfig.gatewayUrl}.`,
      true,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new CopilotError(
      `The AI gateway responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      response.status === 429 || response.status >= 500,
    );
  }

  const raw = await response.text();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      const text = (parsed as { text?: unknown }).text;
      if (typeof text === 'string') return text;
    }
  } catch {
    /* Not JSON: the body is the completion. */
  }
  return raw;
}

/** One generation, with a deadline and bounded retry on transient failures. */
export async function generate(request: GenerateRequest): Promise<string> {
  if (!isCopilotAvailable()) {
    throw new CopilotError('No AI gateway is configured for this deployment.', false);
  }

  let attempt = 0;
  for (;;) {
    const deadline = withDeadline(copilotConfig.timeoutMs, request.signal);
    try {
      const text = await callOnce(request, deadline.signal);
      if (!text.trim()) throw new CopilotError('The gateway returned an empty response.', true);
      return text.trim();
    } catch (error) {
      const failure =
        error instanceof CopilotError
          ? error
          : new CopilotError('The Copilot request failed.', false);

      if (deadline.timedOut()) {
        throw new CopilotError(
          `The AI gateway did not respond within ${Math.round(copilotConfig.timeoutMs / 1000)} s.`,
          true,
        );
      }
      if (!failure.retryable || attempt >= copilotConfig.maxRetries) throw failure;

      attempt += 1;
      // Full jitter: every browser hitting a rate limit at once must not retry
      // in lockstep and hit it again.
      await sleep(Math.round(Math.random() * Math.min(6000, 400 * 2 ** attempt)));
    } finally {
      deadline.dispose();
    }
  }
}
