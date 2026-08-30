/**
 * getDomainHandler is the lazy-loading registry every MCP tool call routes
 * through (see server.ts). It was never invoked directly by any existing
 * test — only indirectly, and only for the always-loaded navigation handler.
 */
import { describe, it, expect } from 'vitest';
import { getDomainHandler, navigationHandler } from '../domains/index.js';

describe('getDomainHandler', () => {
  it('resolves each known domain to a handler exposing getTools/handleCall', async () => {
    for (const domain of ['agents', 'teams', 'appointment_types', 'resources', 'scheduling']) {
      const handler = await getDomainHandler(domain);
      expect(handler, `domain "${domain}"`).not.toBeNull();
      expect(typeof handler!.getTools).toBe('function');
      expect(typeof handler!.handleCall).toBe('function');
    }
  });

  it('returns null for an unknown domain', async () => {
    const handler = await getDomainHandler('billing');
    expect(handler).toBeNull();
  });

  it('caches the handler instance across repeated lookups of the same domain', async () => {
    const first = await getDomainHandler('agents');
    const second = await getDomainHandler('agents');
    expect(first).toBe(second);
  });

  it('exports navigationHandler directly (always-available, not lazy-loaded)', () => {
    expect(typeof navigationHandler.getTools).toBe('function');
    expect(navigationHandler.getTools().map((t) => t.name)).toContain('timezest_status');
  });
});
