import { Injectable } from '@nitrostack/core';
import { z } from 'zod';

/**
 * LLM client backed by OpenRouter (https://openrouter.ai).
 *
 * OpenRouter exposes an OpenAI-compatible `/chat/completions` endpoint.
 * Free-tier models (`:free` suffix) require no billing setup — just a
 * free API key from https://openrouter.ai/keys.
 *
 * Set OPENROUTER_API_KEY in your .env / NitroCloud Vault.
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Free models available on OpenRouter (no credit card required).
 * Primary: meta-llama/llama-3.1-8b-instruct:free  — fast, good at structured JSON.
 * Fallback: google/gemma-3-12b-it:free             — strong instruction-following.
 *
 * Keep the `:free` suffix — it selects the zero-cost provider route on OpenRouter.
 */
export type LlmModel =
  | 'meta-llama/llama-3.1-8b-instruct:free'
  | 'google/gemma-3-12b-it:free'
  | 'mistralai/mistral-7b-instruct:free'
  | 'deepseek/deepseek-r1-0528:free';

const DEFAULT_MODEL: LlmModel = 'meta-llama/llama-3.1-8b-instruct:free';

interface OpenRouterResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

// Keep the old name so all existing imports (`ClaudeClient`) compile without change.
@Injectable()
export class ClaudeClient {
  private readonly apiKey = process.env.OPENROUTER_API_KEY ?? '';

  async complete(
    systemPrompt: string,
    userPrompt: string,
    _model: string = DEFAULT_MODEL, // param kept for call-site compatibility
    temperature = 0.1,
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY is not set. ' +
        'Get a free key at https://openrouter.ai/keys and add it to your .env / NitroCloud Vault.',
      );
    }

    const res = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://nitrocloud.ai',   // required by OpenRouter
        'X-Title': 'ALE-SCM MCP Server',           // optional — shows in OpenRouter dashboard
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as OpenRouterResponse;
    return data.choices[0]?.message?.content ?? '';
  }

  /**
   * Call the LLM and parse the JSON result against a Zod schema.
   * Retries once on validation failure with the error appended to the prompt.
   */
  async completeAndParse<T>(
    schema: z.ZodType<T>,
    systemPrompt: string,
    userPrompt: string,
    _model: string = DEFAULT_MODEL,
  ): Promise<T> {
    const attempt = async (prompt: string): Promise<T> => {
      const raw = await this.complete(systemPrompt, prompt);
      // Strip markdown fences if the model adds them anyway
      const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
      return schema.parse(JSON.parse(cleaned));
    };

    try {
      return await attempt(userPrompt);
    } catch (firstErr: unknown) {
      const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      const retryPrompt = `${userPrompt}\n\nYour last output failed validation: ${errMsg}. Fix and return JSON only.`;
      return await attempt(retryPrompt);
    }
  }
}
