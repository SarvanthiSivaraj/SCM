import { Injectable } from '@nitrostack/core';
import { z } from 'zod';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export type ClaudeModel = 'claude-haiku-20240307' | 'claude-sonnet-4-5';

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

/**
 * Minimal Claude client.
 * Uses Haiku by default; swap to Sonnet for demo/verification passes only.
 */
@Injectable()
export class ClaudeClient {
  private readonly apiKey = process.env.ANTHROPIC_API_KEY ?? '';

  async complete(
    systemPrompt: string,
    userPrompt: string,
    model: ClaudeModel = 'claude-haiku-20240307',
    temperature = 0.1,
  ): Promise<string> {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as ClaudeResponse;
    return data.content[0]?.text ?? '';
  }

  /**
   * Call Claude and parse the result against a Zod schema.
   * Retries once on validation failure with the error appended to the prompt.
   */
  async completeAndParse<T>(
    schema: z.ZodType<T>,
    systemPrompt: string,
    userPrompt: string,
    model: ClaudeModel = 'claude-haiku-20240307',
  ): Promise<T> {
    const attempt = async (prompt: string): Promise<T> => {
      const raw = await this.complete(systemPrompt, prompt, model);
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
