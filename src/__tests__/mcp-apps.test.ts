/**
 * MCP Apps (SEP-1865) contract tests — mirrors the checks an MCP Apps host
 * performs to render the scheduling-request card:
 *   1. the renderable tool advertises the UI resource via _meta
 *   2. the ui:// resource lists and reads back as profile=mcp-app HTML
 *   3. buildSchedulingRequestCard normalizes a TimeZest scheduling request
 *      into the flat, label-resolved payload the iframe renders from
 */
import { describe, it, expect, vi } from 'vitest';
import { getAllTools } from '../domains/index.js';
import { listResources, readResource } from '../resources.js';
import {
  buildSchedulingRequestCard,
  applyBrandInjection,
  SCHEDULING_REQUEST_CARD_RESOURCE_URI,
  MCP_APP_RESOURCE_MIME,
} from '../card.builder.js';
import { SCHEDULING_REQUEST_CARD_HTML } from '../generated/scheduling-request-card-html.js';

const RENDERABLE_TOOLS = ['timezest_scheduling_get'];

describe('MCP Apps scheduling-request card', () => {
  describe('tool _meta advertisement', () => {
    it.each(RENDERABLE_TOOLS)('%s links the card via _meta', async (name) => {
      const tool = getAllTools().find((t) => t.name === name);
      expect(tool).toBeDefined();
      // Canonical flat key (ext-apps RESOURCE_URI_META_KEY) …
      expect(tool?._meta?.['ui/resourceUri']).toBe(SCHEDULING_REQUEST_CARD_RESOURCE_URI);
      // … and the nested form registerAppTool also emits.
      expect((tool?._meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
        SCHEDULING_REQUEST_CARD_RESOURCE_URI
      );
    });

    it('no other tools carry UI metadata', async () => {
      const others = getAllTools().filter(
        (t) => t._meta && !RENDERABLE_TOOLS.includes(t.name)
      );
      expect(others).toEqual([]);
    });
  });

  describe('ui:// resource', () => {
    it('is listed with the MCP Apps MIME type', () => {
      const card = listResources().find((r) => r.uri === SCHEDULING_REQUEST_CARD_RESOURCE_URI);
      expect(card?.mimeType).toBe(MCP_APP_RESOURCE_MIME);
    });

    it('reads back as profile=mcp-app HTML containing the card app', () => {
      const content = readResource(SCHEDULING_REQUEST_CARD_RESOURCE_URI);
      expect(content.mimeType).toBe(MCP_APP_RESOURCE_MIME);
      // No MCP_BRAND_* env set → the embedded HTML is served byte-identical.
      expect(content.text).toBe(SCHEDULING_REQUEST_CARD_HTML);
      expect(content.text).toContain('card__bar');
      // The injection marker survives the vite build — exactly once, so
      // serve-time replacement is unambiguous.
      expect(content.text.match(/BRAND_INJECT/g)).toHaveLength(1);
      // The vite build must have inlined the bridge script — a bare
      // <script src> would be unloadable from a resources/read HTML string.
      expect(content.text).not.toContain('src="./scheduling-request-card.ts"');
    });

    it('serves neutral defaults with no vendor identity', () => {
      const { text } = readResource(SCHEDULING_REQUEST_CARD_RESOURCE_URI);
      expect(text).not.toMatch(/WYRE/i);
      expect(text).not.toContain('00c9db'); // WYRE cyan
      expect(text).not.toContain('ede947'); // WYRE yellow
      expect(text).not.toContain('fonts.googleapis.com'); // no external fetches
    });

    it('injects MCP_BRAND_* env vars into the served HTML', () => {
      vi.stubEnv('MCP_BRAND_NAME', 'Acme MSP');
      vi.stubEnv('MCP_BRAND_PRIMARY_COLOR', '#ff0000');
      try {
        const { text } = readResource(SCHEDULING_REQUEST_CARD_RESOURCE_URI);
        expect(text).toContain(
          '<script>window.__BRAND__={"name":"Acme MSP","primaryColor":"#ff0000"}</script>'
        );
        expect(text).not.toContain('BRAND_INJECT');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('rejects unknown resource URIs', () => {
      expect(() => readResource('ui://timezest/nope.html')).toThrow(/Unknown resource/);
    });
  });

  describe('applyBrandInjection', () => {
    const html = SCHEDULING_REQUEST_CARD_HTML;

    it('replaces the marker with an inline window.__BRAND__ script', () => {
      const out = applyBrandInjection(html, { name: 'Acme', primaryColor: '#123456' });
      expect(out).toContain('window.__BRAND__={"name":"Acme","primaryColor":"#123456"}');
      expect(out).not.toContain('BRAND_INJECT');
    });

    it('escapes < so brand values cannot break out of the script tag', () => {
      const out = applyBrandInjection(html, { name: '</script><script>alert(1)' });
      expect(out).not.toContain('</script><script>alert(1)');
      expect(out).toContain('\\u003c/script>\\u003cscript>alert(1)');
    });

    it('returns the HTML unchanged for an empty brand', () => {
      expect(applyBrandInjection(html, {})).toBe(html);
      expect(applyBrandInjection(html, { name: '' })).toBe(html);
    });
  });

  describe('buildSchedulingRequestCard', () => {
    const request = {
      id: 'sr_123',
      appointmentTypeId: 'at_9',
      triggerMode: 'generate_url',
      endUser: { name: 'John Doe', email: 'john@customer.com', company: 'Customer Corp' },
      timeRange: {
        earliestDate: '2026-08-01',
        earliestTime: '09:00',
        latestDate: '2026-08-01',
        latestTime: '17:00',
        timezone: 'America/New_York',
      },
      notes: 'Server room access required',
      associatedEntities: [
        { type: 'connectwise', id: '12345', number: 'T20240001' },
        { type: 'autotask', id: 67890 },
      ],
      bookingUrl: 'https://book.example.com/sr_123',
      status: 'booked',
      scheduledAt: '2026-08-01T14:00:00Z',
      assignedResourceId: 'agent_7',
      createdAt: '2026-07-17T09:00:00Z',
      updatedAt: '2026-07-17T09:05:00Z',
    };

    const client = {
      appointmentTypes: {
        get: vi.fn(async () => ({ id: 'at_9', name: 'On-site Repair', duration: 60 })),
      },
      agents: { get: vi.fn(async () => ({ id: 'agent_7', name: 'Dana Ruiz' })) },
      teams: { get: vi.fn(async () => ({ id: 'team_1', name: 'Service Desk' })) },
    };

    it('normalizes ids, labels, and PSA links into a flat card payload', async () => {
      const card = await buildSchedulingRequestCard(request, client as never);
      expect(card).toEqual({
        id: 'sr_123',
        title: 'On-site Repair',
        status: 'booked',
        mode: 'Booking link',
        customer: 'John Doe',
        company: 'Customer Corp',
        email: 'john@customer.com',
        assignedTo: 'Dana Ruiz',
        window: '2026-08-01 09:00 → 2026-08-01 17:00 (America/New_York)',
        duration: '60 min',
        scheduledAt: '2026-08-01T14:00:00Z',
        createdAt: '2026-07-17T09:00:00Z',
        bookingUrl: 'https://book.example.com/sr_123',
        notes: 'Server room access required',
        psaTickets: ['ConnectWise #T20240001', 'Autotask #67890'],
      });
    });

    it('falls back to #id labels when lookups fail (best-effort)', async () => {
      const failing = {
        appointmentTypes: {
          get: vi.fn(async () => {
            throw new Error('TimeZest 500');
          }),
        },
        agents: {
          get: vi.fn(async () => {
            throw new Error('not an agent');
          }),
        },
        teams: {
          get: vi.fn(async () => {
            throw new Error('not a team');
          }),
        },
      };
      const card = await buildSchedulingRequestCard(request, failing as never);
      expect(card?.title).toBe('Appointment type #at_9');
      expect(card?.assignedTo).toBe('#agent_7');
      expect(card?.status).toBe('booked');
    });

    it('resolves team resources when the id is not an agent', async () => {
      const teamClient = {
        ...client,
        agents: {
          get: vi.fn(async () => {
            throw new Error('404');
          }),
        },
      };
      const card = await buildSchedulingRequestCard(
        { ...request, assignedResourceId: 'team_1' },
        teamClient as never
      );
      expect(card?.assignedTo).toBe('Service Desk');
    });

    it('drops non-http(s) booking URLs', async () => {
      const card = await buildSchedulingRequestCard(
        // eslint-disable-next-line no-script-url
        { ...request, bookingUrl: 'javascript:alert(1)' },
        client as never
      );
      expect(card?.bookingUrl).toBeUndefined();
    });

    it('truncates long notes so the card payload stays small', async () => {
      const card = await buildSchedulingRequestCard(
        { ...request, notes: 'x'.repeat(600) },
        client as never
      );
      expect(card?.notes).toHaveLength(500);
    });

    it('returns null for payloads that are not a scheduling request', async () => {
      expect(await buildSchedulingRequestCard({}, client as never)).toBeNull();
      expect(await buildSchedulingRequestCard({ id: 42, status: 'pending' } as never, client as never)).toBeNull();
      expect(await buildSchedulingRequestCard({ id: 'sr_1' }, client as never)).toBeNull();
    });

    it('renders a minimal card for a bare pending request', async () => {
      const card = await buildSchedulingRequestCard(
        { id: 'sr_2', status: 'pending' },
        client as never
      );
      expect(card).toEqual({
        id: 'sr_2',
        title: 'Scheduling request',
        status: 'pending',
        psaTickets: [],
      });
    });
  });
});
