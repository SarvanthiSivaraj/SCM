import { Injectable, ExecutionContext } from '@nitrostack/core';
import type { Guard } from '@nitrostack/core';

/**
 * Simple API-key guard.
 * Set ALE_API_KEY in .env; send it as the `x-api-key` request header.
 */
@Injectable()
export class ApiKeyGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key =
      context.metadata?.['x-api-key'] ??
      context.metadata?.apiKey;

    if (!key) return false;

    const valid = process.env.ALE_API_KEY;
    if (!valid) {
      // If env var not set, allow through (dev convenience — remove for prod)
      return true;
    }

    if (key === valid) {
      context.auth = { subject: 'api_key_user', scopes: ['*'] };
      return true;
    }

    return false;
  }
}
