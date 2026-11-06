import { getProvider } from './registry';
import { FALLBACK_MODEL_BY_PROVIDER, FALLBACK_ORDER } from './models';
import type { ChatMessage, ProviderConfig, ProviderId, StreamChunk } from './types';

export type FallbackChunk = StreamChunk & { providerUsed?: ProviderId };

/**
 * A queued or unhealthy provider can leave the composer on “Thinking…” for a
 * long time before it emits anything. Once a provider has produced its first
 * token we stay with it, but before that we switch quickly rather than waiting
 * indefinitely.
 */
const FIRST_TOKEN_TIMEOUT_MS = 8_000;

function providerFailureMessage(errors: string[], oidcTokenPresent: boolean): string {
  const summary = errors
    .join(' | ')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|gsk|pk)[-_][A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/\bAIza[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .slice(0, 700);

  const tokenState = oidcTokenPresent ? 'gateway-token-present' : 'gateway-token-missing';
  return `All providers failed (${tokenState}): ${summary || 'no provider detail'}`;
}

async function nextWithTimeout(
  iterator: AsyncGenerator<StreamChunk>,
): Promise<IteratorResult<StreamChunk> | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      iterator.next(),
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), FIRST_TOKEN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Stream from the primary provider, transparently retrying alternates when the
 * failure happens BEFORE any token reaches the client.
 *
 * Once a token has been emitted we can no longer switch: doing so would splice
 * two different completions together. In that case the error is surfaced and
 * the stream stops.
 */
export async function* streamWithFallback(
  primaryProviderId: ProviderId,
  messages: ChatMessage[],
  config: ProviderConfig,
): AsyncGenerator<FallbackChunk> {
  const order: ProviderId[] = [
    ...new Set<ProviderId>([primaryProviderId, ...FALLBACK_ORDER]),
  ];

  const errors: string[] = [];

  for (const providerId of order) {
    if (config.signal?.aborted) break;

    const provider = getProvider(providerId);
    const providerModel =
      providerId === primaryProviderId ? config.model : FALLBACK_MODEL_BY_PROVIDER[providerId];
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort();

    if (config.signal?.aborted) {
      attemptController.abort();
    } else {
      config.signal?.addEventListener('abort', abortAttempt, { once: true });
    }

    const providerConfig: ProviderConfig = {
      ...config,
      model: providerModel,
      signal: attemptController.signal,
    };
    const iterator = provider.stream(messages, providerConfig);
    let emittedTokens = false;
    let completed = false;
    let timedOut = false;

    try {
      while (true) {
        const next = emittedTokens
          ? await iterator.next()
          : await nextWithTimeout(iterator);

        if ('timedOut' in next) {
          timedOut = true;
          errors.push(`${providerId}: no first token within ${FIRST_TOKEN_TIMEOUT_MS}ms`);
          attemptController.abort();
          break;
        }

        if (next.done) break;

        const chunk = next.value;

        if (chunk.type === 'token') {
          if (!chunk.token) continue;
          emittedTokens = true;
          yield { ...chunk, providerUsed: providerId };
          continue;
        }

        if (chunk.type === 'done') {
          if (!emittedTokens) {
            // A provider that closes without producing anything is a failed
            // attempt, not an empty answer. Try the next provider.
            errors.push(`${providerId}: empty stream`);
            break;
          }
          completed = true;
          yield { ...chunk, providerUsed: providerId };
          return;
        }

        if (chunk.type === 'error') {
          if (emittedTokens) {
            yield { type: 'error', error: chunk.error, providerUsed: providerId };
            return;
          }
          errors.push(`${providerId}: ${chunk.error ?? 'provider error'}`);
          break;
        }
      }

      if (completed) return;

      if (emittedTokens) {
        yield {
          type: 'error',
          error: 'Provider stream ended unexpectedly.',
          providerUsed: providerId,
        };
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown provider error';

      if (emittedTokens) {
        yield { type: 'error', error: message, providerUsed: providerId };
        return;
      }

      errors.push(`${providerId}: ${message}`);
    } finally {
      config.signal?.removeEventListener('abort', abortAttempt);
      attemptController.abort();

      // Close the provider generator so its fetch/SDK stream is released even
      // when we abandon it mid-flight. After a first-token timeout, do not wait
      // for an unresponsive provider to acknowledge the close; the abort signal
      // is already doing the cleanup.
      if (timedOut) {
        const closing = iterator.return?.(undefined);
        if (closing) void closing.catch(() => undefined);
      } else {
        try {
          await iterator.return?.(undefined);
        } catch {
          // The stream may already be closed after the timeout abort.
        }
      }
    }
  }

  if (config.signal?.aborted) {
    yield { type: 'error', error: 'Request aborted.' };
    return;
  }

  const failureMessage = providerFailureMessage(errors, Boolean(config.oidcToken));
  console.error(`[ai] ${failureMessage}`);
  yield { type: 'error', error: failureMessage };
}
