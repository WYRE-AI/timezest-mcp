/**
 * Handler-invocation coverage for the agents domain.
 *
 * The tool surface (getTools) was implicitly exercised by mcp-apps.test.ts
 * via server registration, but handleCall — the actual request-shaping into
 * the TimeZest client and response-mapping back to CallToolResult — was
 * never invoked anywhere. These tests mock the vendored TimeZest client and
 * call handleCall directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { agentsHandler } from '../domains/agents.js';
import { getClient } from '../utils/client.js';

vi.mock('../utils/client.js', () => ({
  getClient: vi.fn(),
}));

const mockedGetClient = vi.mocked(getClient);

function clientWith(overrides: Partial<{ list: any; get: any }>) {
  return {
    agents: {
      list: overrides.list ?? vi.fn(),
      get: overrides.get ?? vi.fn(),
    },
  } as any;
}

describe('agentsHandler.getTools', () => {
  it('exposes list, get, and back tools', () => {
    const names = agentsHandler.getTools().map((t) => t.name);
    expect(names).toEqual(['timezest_agents_list', 'timezest_agents_get', 'timezest_back']);
  });
});

describe('agentsHandler.handleCall', () => {
  beforeEach(() => {
    mockedGetClient.mockReset();
  });

  it('timezest_agents_list forwards pageSize and filter, and returns the JSON-stringified list', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 'a1', name: 'Alice' }]);
    mockedGetClient.mockResolvedValue(clientWith({ list }));

    const result = await agentsHandler.handleCall('timezest_agents_list', {
      pageSize: 25,
      filter: 'active:true',
    });

    expect(list).toHaveBeenCalledWith({ pageSize: 25, filter: 'active:true' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify([{ id: 'a1', name: 'Alice' }], null, 2),
    });
  });

  it('timezest_agents_get forwards the agentId and returns the JSON-stringified agent', async () => {
    const get = vi.fn().mockResolvedValue({ id: 'a1', name: 'Alice' });
    mockedGetClient.mockResolvedValue(clientWith({ get }));

    const result = await agentsHandler.handleCall('timezest_agents_get', { agentId: 'a1' });

    expect(get).toHaveBeenCalledWith('a1');
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify({ id: 'a1', name: 'Alice' }, null, 2),
    });
  });

  it('timezest_back returns a navigation message without touching the client', async () => {
    const list = vi.fn();
    const get = vi.fn();
    mockedGetClient.mockResolvedValue(clientWith({ list, get }));

    const result = await agentsHandler.handleCall('timezest_back', {});

    expect(list).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(result.content[0].text).toMatch(/Returned to main navigation/);
  });

  it('returns isError for an unknown tool name', async () => {
    mockedGetClient.mockResolvedValue(clientWith({}));

    const result = await agentsHandler.handleCall('timezest_agents_delete', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Unknown tool: timezest_agents_delete');
  });

  it('maps a thrown client error into an isError result instead of throwing', async () => {
    const get = vi.fn().mockRejectedValue(new Error('agent not found'));
    mockedGetClient.mockResolvedValue(clientWith({ get }));

    const result = await agentsHandler.handleCall('timezest_agents_get', { agentId: 'missing' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: agent not found');
  });

  it('maps a non-Error rejection to a generic error message', async () => {
    const get = vi.fn().mockRejectedValue('boom');
    mockedGetClient.mockResolvedValue(clientWith({ get }));

    const result = await agentsHandler.handleCall('timezest_agents_get', { agentId: 'a1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: Unknown error occurred');
  });

  it('propagates getClient rejection (e.g. no credentials configured) as isError', async () => {
    mockedGetClient.mockRejectedValue(new Error('No TimeZest API credentials configured.'));

    const result = await agentsHandler.handleCall('timezest_agents_list', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: No TimeZest API credentials configured.');
  });
});
