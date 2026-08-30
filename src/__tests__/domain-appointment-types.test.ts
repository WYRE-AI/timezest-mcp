/**
 * Handler-invocation coverage for the appointment-types domain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appointmentTypesHandler } from '../domains/appointment-types.js';
import { getClient } from '../utils/client.js';

vi.mock('../utils/client.js', () => ({
  getClient: vi.fn(),
}));

const mockedGetClient = vi.mocked(getClient);

function clientWith(overrides: Partial<{ list: any; get: any }>) {
  return {
    appointmentTypes: {
      list: overrides.list ?? vi.fn(),
      get: overrides.get ?? vi.fn(),
    },
  } as any;
}

describe('appointmentTypesHandler.getTools', () => {
  it('exposes list, get, and back tools', () => {
    const names = appointmentTypesHandler.getTools().map((t) => t.name);
    expect(names).toEqual([
      'timezest_appointment_types_list',
      'timezest_appointment_types_get',
      'timezest_back',
    ]);
  });
});

describe('appointmentTypesHandler.handleCall', () => {
  beforeEach(() => {
    mockedGetClient.mockReset();
  });

  it('timezest_appointment_types_list forwards pageSize and filter, and returns the JSON-stringified list', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 'at1', name: 'Repair', duration: 30 }]);
    mockedGetClient.mockResolvedValue(clientWith({ list }));

    const result = await appointmentTypesHandler.handleCall('timezest_appointment_types_list', {
      pageSize: 5,
      filter: 'active:true',
    });

    expect(list).toHaveBeenCalledWith({ pageSize: 5, filter: 'active:true' });
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify([{ id: 'at1', name: 'Repair', duration: 30 }], null, 2),
    });
  });

  it('timezest_appointment_types_get forwards the appointmentTypeId and returns the JSON-stringified type', async () => {
    const get = vi.fn().mockResolvedValue({ id: 'at1', name: 'Repair' });
    mockedGetClient.mockResolvedValue(clientWith({ get }));

    const result = await appointmentTypesHandler.handleCall('timezest_appointment_types_get', {
      appointmentTypeId: 'at1',
    });

    expect(get).toHaveBeenCalledWith('at1');
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify({ id: 'at1', name: 'Repair' }, null, 2),
    });
  });

  it('timezest_back returns a navigation message without touching the client', async () => {
    const list = vi.fn();
    mockedGetClient.mockResolvedValue(clientWith({ list }));

    const result = await appointmentTypesHandler.handleCall('timezest_back', {});

    expect(list).not.toHaveBeenCalled();
    expect(result.content[0].text).toMatch(/Returned to main navigation/);
  });

  it('returns isError for an unknown tool name', async () => {
    mockedGetClient.mockResolvedValue(clientWith({}));

    const result = await appointmentTypesHandler.handleCall('timezest_appointment_types_delete', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Unknown tool: timezest_appointment_types_delete');
  });

  it('maps a thrown client error into an isError result instead of throwing', async () => {
    const get = vi.fn().mockRejectedValue(new Error('type not found'));
    mockedGetClient.mockResolvedValue(clientWith({ get }));

    const result = await appointmentTypesHandler.handleCall('timezest_appointment_types_get', {
      appointmentTypeId: 'missing',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: type not found');
  });
});
