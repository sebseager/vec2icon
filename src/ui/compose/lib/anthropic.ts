/** The one place that talks to api.anthropic.com. Loaded on demand so the SDK stays out of
 * the main bundle until someone actually composes. */
import type Anthropic from '@anthropic-ai/sdk'
import { COMPOSE_MODEL, type Generate } from '@/core/compose'

/** Something the user can act on, in place of the SDK's error classes. */
export class ComposeApiError extends Error {}

const describe = (sdk: typeof Anthropic, error: unknown): string | null => {
  if (error instanceof sdk.AuthenticationError) return 'Anthropic rejected the API key.'
  if (error instanceof sdk.PermissionDeniedError) {
    return 'This API key is not allowed to use the model.'
  }
  if (error instanceof sdk.RateLimitError) return 'Rate limited by Anthropic. Try again shortly.'
  if (error instanceof sdk.InternalServerError) return 'Anthropic is having trouble. Try again.'
  if (error instanceof sdk.APIConnectionError) {
    return 'Could not reach api.anthropic.com. Check the connection.'
  }
  if (error instanceof sdk.APIError) return `Anthropic refused the request: ${error.message}`
  return null
}

export const createGenerate = (apiKey: string): Generate => {
  return async (request, signal) => {
    const { default: sdk } = await import('@anthropic-ai/sdk')
    const client = new sdk({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 })
    try {
      const message = await client.messages
        .stream(
          {
            model: COMPOSE_MODEL,
            max_tokens: request.maxTokens,
            system: request.system,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'medium' },
            messages: [{ role: 'user', content: request.user }],
          },
          { signal },
        )
        .finalMessage()
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
      return {
        text,
        usage: message.usage,
        stopReason: message.stop_reason,
        refusal: message.stop_details?.explanation ?? undefined,
      }
    } catch (error) {
      if (error instanceof sdk.APIUserAbortError) throw error
      const reason = describe(sdk, error)
      if (reason) throw new ComposeApiError(reason)
      throw error
    }
  }
}
