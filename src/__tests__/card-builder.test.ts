/**
 * Handler-invocation coverage for card.builder.ts — the scheduling-request
 * card payload builder used by domains/scheduling.ts's timezest_scheduling_get.
 * domain-scheduling.test.ts covers the happy-path integration; this file
 * covers the builder's own edge cases (best-effort fallbacks, security
 * guards) in isolation with a minimal mocked client.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSchedulingRequestCard,
  applyBrandInjection,
  resolveBrandFromEnv,
} from '../card.builder.js';

function client(overrides: Record<string, any> = {}) {
  return {
    appointmentTypes: { get: async () => { throw new Error('not found'); }, ...overrides.appointmentTypes },
    agents: { get: async () => { throw new Error('not found'); }, ...overrides.agents },
    teams: { get: async () => { throw new Error('not found'); }, ...overrides.teams },
  } as any;
}

describe('buildSchedulingRequestCard', () => {
  it('returns null when id is missing', async () => {
    const card = await buildSchedulingRequestCard({ status: 'pending' }, client());
    expect(card).toBeNull();
  });

  it('returns null when status is missing', async () => {
    const card = await buildSchedulingRequestCard({ id: 'sr1' }, client());
    expect(card).toBeNull();
  });

  it('falls back to a #id heading when the appointment type lookup fails', async () => {
    const card = await buildSchedulingRequestCard(
      { id: 'sr1', status: 'pending', appointmentTypeId: 'at1' },
      client()
    );
    expect(card!.title).toBe('Appointment type #at1');
    expect(card!.duration).toBeUndefined();
  });

  it('falls back to a team lookup when the agent lookup fails, and uses the team name', async () => {
    const card = await buildSchedulingRequestCard(
      { id: 'sr1', status: 'pending', assignedResourceId: 'res1' },
      client({ teams: { get: async () => ({ id: 'res1', name: 'Support Team' }) } })
    );
    expect(card!.assignedTo).toBe('Support Team');
  });

  it('falls back to a #id label when both agent and team lookups fail', async () => {
    const card = await buildSchedulingRequestCard(
      { id: 'sr1', status: 'pending', assignedResourceId: 'res-missing' },
      client()
    );
    expect(card!.assignedTo).toBe('#res-missing');
  });

  it('rejects a non-http(s) bookingUrl', async () => {
    const card = await buildSchedulingRequestCard(
      { id: 'sr1', status: 'pending', bookingUrl: 'javascript:alert(1)' },
      client()
    );
    expect(card!.bookingUrl).toBeUndefined();
  });

  it('accepts an https bookingUrl', async () => {
    const card = await buildSchedulingRequestCard(
      { id: 'sr1', status: 'pending', bookingUrl: 'https://timezest.example.com/book/sr1' },
      client()
    );
    expect(card!.bookingUrl).toBe('https://timezest.example.com/book/sr1');
  });

  it('truncates notes to 500 characters', async () => {
    const longNotes = 'x'.repeat(600);
    const card = await buildSchedulingRequestCard(
      { id: 'sr1', status: 'pending', notes: longNotes },
      client()
    );
    expect(card!.notes).toHaveLength(500);
  });

  it('maps PSA associated entities to flat labels, preferring number over id', async () => {
    const card = await buildSchedulingRequestCard(
      {
        id: 'sr1',
        status: 'pending',
        associatedEntities: [
          { type: 'connectwise', id: 'internal-1', number: 'T20240001' },
          { type: 'autotask', id: 'internal-2' },
          { type: 'unknown-psa', id: 'internal-3' },
        ],
      },
      client()
    );
    expect(card!.psaTickets).toEqual([
      'ConnectWise #T20240001',
      'Autotask #internal-2',
      'unknown-psa #internal-3',
    ]);
  });

  it('formats the preferred time window with timezone', async () => {
    const card = await buildSchedulingRequestCard(
      {
        id: 'sr1',
        status: 'pending',
        timeRange: {
          earliestDate: '2024-02-01',
          earliestTime: '09:00',
          latestDate: '2024-02-01',
          latestTime: '17:00',
          timezone: 'America/New_York',
        },
      },
      client()
    );
    expect(card!.window).toBe('2024-02-01 09:00 → 2024-02-01 17:00 (America/New_York)');
  });
});

describe('applyBrandInjection', () => {
  const html = '<html><!-- BRAND_INJECT:default --></html>';

  it('returns the html unchanged for an empty brand', () => {
    expect(applyBrandInjection(html, {})).toBe(html);
  });

  it('injects a window.__BRAND__ script for a non-empty brand', () => {
    const result = applyBrandInjection(html, { name: 'Acme' });
    expect(result).toContain('window.__BRAND__={"name":"Acme"}');
    expect(result).not.toContain('BRAND_INJECT');
  });

  it('escapes "<" in brand values so they cannot break out of the script tag', () => {
    const result = applyBrandInjection(html, { name: '</script><script>alert(1)</script>' });
    expect(result).not.toContain('</script><script>alert');
    expect(result).toContain('\\u003c/script');
  });
});

describe('resolveBrandFromEnv', () => {
  it('reads only the MCP_BRAND_* variables that are set', () => {
    const original = { ...process.env };
    delete process.env.MCP_BRAND_NAME;
    delete process.env.MCP_BRAND_LOGO_URL;
    process.env.MCP_BRAND_PRIMARY_COLOR = '#123456';

    try {
      expect(resolveBrandFromEnv()).toEqual({ primaryColor: '#123456' });
    } finally {
      process.env = original;
    }
  });
});
