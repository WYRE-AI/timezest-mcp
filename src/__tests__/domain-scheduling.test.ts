/**
 * Handler-invocation coverage for the scheduling domain — the largest and
 * most behaviorally rich domain (create/list/get/cancel, elicitation
 * fallback, and _card attachment via card.builder.ts). None of this was
 * exercised by any existing test; mcp-apps.test.ts only asserts that the
 * tool is *registered* with the right _meta, never that handleCall does the
 * right thing.
 *
 * elicitSelection/elicitConfirmation both resolve to null when no MCP
 * server reference has been set (see utils/server-ref.ts, utils/elicitation.ts)
 * — which is always true in this unit-test process — so
 * timezest_scheduling_create_request falls back to the first available
 * appointment type, and timezest_scheduling_cancel proceeds (only a literal
 * `false` aborts it). Both fallback paths are asserted explicitly below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { schedulingHandler } from '../domains/scheduling.js';
import { getClient } from '../utils/client.js';

vi.mock('../utils/client.js', () => ({
  getClient: vi.fn(),
}));

const mockedGetClient = vi.mocked(getClient);

function baseClient(overrides: Record<string, any> = {}) {
  return {
    schedulingRequests: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      cancel: vi.fn(),
      ...overrides.schedulingRequests,
    },
    appointmentTypes: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockRejectedValue(new Error('not found')),
      ...overrides.appointmentTypes,
    },
    agents: {
      get: vi.fn().mockRejectedValue(new Error('not found')),
      ...overrides.agents,
    },
    teams: {
      get: vi.fn().mockRejectedValue(new Error('not found')),
      ...overrides.teams,
    },
  } as any;
}

describe('schedulingHandler.getTools', () => {
  it('exposes list, get, create, cancel, and back tools', () => {
    const names = schedulingHandler.getTools().map((t) => t.name);
    expect(names).toEqual([
      'timezest_scheduling_list',
      'timezest_scheduling_get',
      'timezest_scheduling_create_request',
      'timezest_scheduling_cancel',
      'timezest_back',
    ]);
  });

  it('advertises the scheduling-request card resource on timezest_scheduling_get', () => {
    const get = schedulingHandler.getTools().find((t) => t.name === 'timezest_scheduling_get')!;
    expect((get as any)._meta['ui/resourceUri']).toBe('ui://timezest/scheduling-request-card.html');
  });
});

describe('schedulingHandler.handleCall — list', () => {
  beforeEach(() => mockedGetClient.mockReset());

  it('forwards pageSize, status, and filter, and returns the JSON-stringified list', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 'sr1', status: 'pending' }]);
    mockedGetClient.mockResolvedValue(baseClient({ schedulingRequests: { list } }));

    const result = await schedulingHandler.handleCall('timezest_scheduling_list', {
      pageSize: 15,
      status: 'pending',
      filter: 'createdAt:>=2024-01-01',
    });

    expect(list).toHaveBeenCalledWith({
      pageSize: 15,
      status: 'pending',
      filter: 'createdAt:>=2024-01-01',
    });
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify([{ id: 'sr1', status: 'pending' }], null, 2),
    });
  });
});

describe('schedulingHandler.handleCall — get (with _card attachment)', () => {
  beforeEach(() => mockedGetClient.mockReset());

  it('attaches a resolved _card built from the appointment type and assigned agent', async () => {
    const get = vi.fn().mockResolvedValue({
      id: 'sr1',
      status: 'booked',
      triggerMode: 'pod',
      appointmentTypeId: 'at1',
      assignedResourceId: 'ag1',
      endUser: { name: 'Jane Doe', email: 'jane@example.com', company: 'Acme' },
      bookingUrl: 'https://timezest.example.com/book/sr1',
    });
    const appointmentTypesGet = vi.fn().mockResolvedValue({ id: 'at1', name: 'Repair', duration: 45 });
    const agentsGet = vi.fn().mockResolvedValue({ id: 'ag1', name: 'Alice Tech' });
    mockedGetClient.mockResolvedValue(
      baseClient({
        schedulingRequests: { get },
        appointmentTypes: { get: appointmentTypesGet },
        agents: { get: agentsGet },
      })
    );

    const result = await schedulingHandler.handleCall('timezest_scheduling_get', { requestId: 'sr1' });

    expect(get).toHaveBeenCalledWith('sr1');
    const payload = JSON.parse(result.content[0].text);
    expect(payload.id).toBe('sr1');
    expect(payload._card).toMatchObject({
      id: 'sr1',
      status: 'booked',
      mode: 'PSA workflow',
      title: 'Repair',
      duration: '45 min',
      customer: 'Jane Doe',
      company: 'Acme',
      email: 'jane@example.com',
      assignedTo: 'Alice Tech',
      bookingUrl: 'https://timezest.example.com/book/sr1',
    });
  });

  it('omits _card entirely when the request has no id (card builder returns null)', async () => {
    const get = vi.fn().mockResolvedValue({ status: 'pending' });
    mockedGetClient.mockResolvedValue(baseClient({ schedulingRequests: { get } }));

    const result = await schedulingHandler.handleCall('timezest_scheduling_get', { requestId: 'sr-missing-id' });

    const payload = JSON.parse(result.content[0].text);
    expect(payload._card).toBeUndefined();
  });
});

describe('schedulingHandler.handleCall — create_request', () => {
  beforeEach(() => mockedGetClient.mockReset());

  it('uses the provided appointmentTypeId directly and forwards args + id to create', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'sr2', triggerMode: 'generate_url' });
    const appointmentTypesList = vi.fn();
    mockedGetClient.mockResolvedValue(
      baseClient({
        schedulingRequests: { create },
        appointmentTypes: { list: appointmentTypesList },
      })
    );

    const args = {
      appointmentTypeId: 'at1',
      triggerMode: 'generate_url',
      endUser: { name: 'Jane Doe' },
    };
    const result = await schedulingHandler.handleCall('timezest_scheduling_create_request', args);

    // No appointmentTypeId was missing, so the elicitation/list-types path must not run.
    expect(appointmentTypesList).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({ ...args, appointmentTypeId: 'at1' });
    expect(result.content[0].text).toContain('"id": "sr2"');
  });

  it('falls back to the first available appointment type when none is provided (elicitation unavailable)', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'sr3', triggerMode: 'pod' });
    const appointmentTypesList = vi
      .fn()
      .mockResolvedValue([{ id: 'at-first', name: 'Repair', duration: 30 }, { id: 'at-second', name: 'Install', duration: 60 }]);
    mockedGetClient.mockResolvedValue(
      baseClient({
        schedulingRequests: { create },
        appointmentTypes: { list: appointmentTypesList },
      })
    );

    const args = { triggerMode: 'pod', endUser: { name: 'Jane Doe' } };
    const result = await schedulingHandler.handleCall('timezest_scheduling_create_request', args);

    expect(appointmentTypesList).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({ ...args, appointmentTypeId: 'at-first' });
    expect(result.isError).toBeUndefined();
  });

  it('returns isError without calling create when no appointment types exist at all', async () => {
    const create = vi.fn();
    const appointmentTypesList = vi.fn().mockResolvedValue([]);
    mockedGetClient.mockResolvedValue(
      baseClient({
        schedulingRequests: { create },
        appointmentTypes: { list: appointmentTypesList },
      })
    );

    const result = await schedulingHandler.handleCall('timezest_scheduling_create_request', {
      triggerMode: 'pod',
      endUser: { name: 'Jane Doe' },
    });

    expect(create).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('No appointment types available. Please contact your administrator.');
  });

  it('appends the booking URL line to the response text when the created request has one', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'sr4',
      triggerMode: 'generate_url',
      bookingUrl: 'https://timezest.example.com/book/sr4',
    });
    mockedGetClient.mockResolvedValue(baseClient({ schedulingRequests: { create } }));

    const result = await schedulingHandler.handleCall('timezest_scheduling_create_request', {
      appointmentTypeId: 'at1',
      triggerMode: 'generate_url',
      endUser: { name: 'Jane Doe' },
    });

    expect(result.content[0].text).toContain('✅ Booking URL generated: https://timezest.example.com/book/sr4');
  });
});

describe('schedulingHandler.handleCall — cancel', () => {
  beforeEach(() => mockedGetClient.mockReset());

  it('proceeds to cancel when elicitConfirmation resolves null (no server ref === not explicitly declined)', async () => {
    const cancel = vi.fn().mockResolvedValue({ id: 'sr5', status: 'cancelled' });
    mockedGetClient.mockResolvedValue(baseClient({ schedulingRequests: { cancel } }));

    const result = await schedulingHandler.handleCall('timezest_scheduling_cancel', {
      requestId: 'sr5',
      reason: 'customer request',
    });

    expect(cancel).toHaveBeenCalledWith('sr5', { reason: 'customer request' });
    expect(result.content[0].text).toContain('"status": "cancelled"');
  });
});

describe('schedulingHandler.handleCall — back / unknown / errors', () => {
  beforeEach(() => mockedGetClient.mockReset());

  it('timezest_back returns a navigation message without touching the client', async () => {
    const list = vi.fn();
    mockedGetClient.mockResolvedValue(baseClient({ schedulingRequests: { list } }));

    const result = await schedulingHandler.handleCall('timezest_back', {});

    expect(list).not.toHaveBeenCalled();
    expect(result.content[0].text).toMatch(/Returned to main navigation/);
  });

  it('returns isError for an unknown tool name', async () => {
    mockedGetClient.mockResolvedValue(baseClient());

    const result = await schedulingHandler.handleCall('timezest_scheduling_reschedule', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Unknown tool: timezest_scheduling_reschedule');
  });

  it('maps a thrown client error into an isError result instead of throwing', async () => {
    const list = vi.fn().mockRejectedValue(new Error('rate limited'));
    mockedGetClient.mockResolvedValue(baseClient({ schedulingRequests: { list } }));

    const result = await schedulingHandler.handleCall('timezest_scheduling_list', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: rate limited');
  });
});
