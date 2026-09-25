/**
 * WYREAI-426 — Steadfast / Ian Brady TimeZest regressions.
 *
 * A. agents/teams/appointment-type get must not call the undocumented
 *    member URL (that path is the HTML 404). Scheduling get keeps
 *    GET /v1/scheduling_requests/:id.
 * B. scheduling create sends resource_ids as a JSON array.
 * C. scheduling list applies pageSize locally and status via TQL.
 * D. teams list drops teams that /v1/resources does not return.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TimeZestClient } from '../vendor/node-timezest/client.js';
import { NotFoundError } from '../vendor/node-timezest/errors.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Captured {
  url: URL;
  init: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function listBody(data: unknown[], nextPage: string | null = null) {
  return { object: 'list', data, next_page: nextPage, previous_page: null };
}

function installFetch(
  handler: (url: URL, init: RequestInit | undefined) => Response,
): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, init: init ?? {} });
      return handler(url, init);
    }),
  );
  return calls;
}

function client(): TimeZestClient {
  return new TimeZestClient({
    apiToken: 'test-token',
    baseUrl: 'https://api.timezest.com',
    maxRetries: 0,
    rateLimit: 1000,
  });
}

function assertCollectionGet(calls: Captured[], collection: string, id: string) {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.url.pathname).toBe(`/v1/${collection}/`);
    expect(call.url.pathname.split('/')).not.toContain(id);
  }
}

const AGENT_ID = 'agnt_JCofkxIn7bBEAdHjalNqI';
const TEAM_ID = 'team_1metqxXXO2Uh8b6ZlrFvSC';
const APPOINTMENT_TYPE_ID = 'apty_5PaeMtjEnUg3WEHmiBqDeA';

describe('A — single-record gets use the collection path', () => {
  it('resolves an agent from GET /v1/agents, not /v1/agents/:id', async () => {
    const agent = { id: AGENT_ID, object: 'agent', name: 'Ian Brady', email: 'ian@example.com' };
    const calls = installFetch(() => jsonResponse(listBody([agent])));

    const result = await client().agents.get(AGENT_ID);

    expect(result).toEqual(agent);
    assertCollectionGet(calls, 'agents', AGENT_ID);
  });

  it('resolves a team from GET /v1/teams, not /v1/teams/:id', async () => {
    const team = { id: TEAM_ID, object: 'team', internal_name: 'Onsite Support' };
    const calls = installFetch(() => jsonResponse(listBody([team])));

    const result = await client().teams.get(TEAM_ID);

    expect(result).toEqual(team);
    assertCollectionGet(calls, 'teams', TEAM_ID);
  });

  it('resolves an appointment type from GET /v1/appointment_types, not the member URL', async () => {
    const appointmentType = {
      id: APPOINTMENT_TYPE_ID,
      object: 'appointment_type',
      internal_name: 'Remote Support',
      duration_mins: 30,
    };
    const calls = installFetch(() => jsonResponse(listBody([appointmentType])));

    const result = await client().appointmentTypes.get(APPOINTMENT_TYPE_ID);

    expect(result).toEqual(appointmentType);
    assertCollectionGet(calls, 'appointment_types', APPOINTMENT_TYPE_ID);
  });

  it('follows next_page cursors without ever putting the id in the path', async () => {
    const target = { id: AGENT_ID, object: 'agent', name: 'Ian Brady' };
    const calls = installFetch((url) => {
      const after = url.searchParams.get('starting_after');
      if (!after) {
        return jsonResponse(listBody(
          [{ id: 'agnt_other', object: 'agent', name: 'Other' }],
          'https://api.timezest.com/v1/agents?starting_after=agnt_other',
        ));
      }
      return jsonResponse(listBody([target]));
    });

    const result = await client().agents.get(AGENT_ID);

    expect(result).toEqual(target);
    expect(calls).toHaveLength(2);
    assertCollectionGet(calls, 'agents', AGENT_ID);
    expect(calls[1]!.url.searchParams.get('starting_after')).toBe('agnt_other');
  });

  it('throws NotFoundError without requesting a member URL when the id is absent', async () => {
    const calls = installFetch(() => jsonResponse(listBody([{ id: 'agnt_other', object: 'agent' }])));

    await expect(client().agents.get(AGENT_ID)).rejects.toBeInstanceOf(NotFoundError);
    assertCollectionGet(calls, 'agents', AGENT_ID);
  });

  it('keeps scheduling_get on GET /v1/scheduling_requests/:id and passes Autotask entities through', async () => {
    const request = {
      id: 'sreq_live',
      object: 'scheduling_request',
      status: 'scheduled',
      associated_entities: [
        { type: 'autotask/ticket', id: 13281, number: 'T20230401.0001' },
        { type: 'autotask/company', id: 23149 },
        { type: 'autotask/contact', id: 1778 },
      ],
    };
    const calls = installFetch((url) => {
      expect(url.pathname).toBe('/v1/scheduling_requests/sreq_live/');
      return jsonResponse(request);
    });

    const result = await client().schedulingRequests.get('sreq_live');

    expect(result).toEqual(request);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.pathname).toBe('/v1/scheduling_requests/sreq_live/');
  });
});

describe('B — scheduling_create_request resource_ids JSON array', () => {
  async function captureCreate(data: Record<string, unknown>): Promise<{ url: URL; body: any; raw: string }> {
    const calls = installFetch(() => jsonResponse({ id: 'sreq_new', object: 'scheduling_request', status: 'new' }));
    await client().schedulingRequests.create(data as any);
    const call = calls[0]!;
    const raw = String(call.init.body);
    return { url: call.url, body: JSON.parse(raw), raw };
  }

  it('sends a one-element resourceIds array as resource_ids, not a string', async () => {
    const { url, body, raw } = await captureCreate({
      appointmentTypeId: 'apty_4B19EeIwgT3MlW4cfJaC0Z',
      triggerMode: 'generate_url',
      endUser: { name: 'Ian' },
      resourceIds: [TEAM_ID],
    });

    expect(url.pathname).toBe('/v1/scheduling_requests/');
    expect(url.searchParams.has('resource_ids')).toBe(false);
    expect(url.searchParams.has('resourceIds')).toBe(false);
    expect(Array.isArray(body.resource_ids)).toBe(true);
    expect(body.resource_ids).toEqual([TEAM_ID]);
    expect(raw).toContain(`"resource_ids":["${TEAM_ID}"]`);
    expect(body.resourceIds).toBeUndefined();
    expect(body.endUser).toBeUndefined();
    expect(body.appointment_type_id).toBe('apty_4B19EeIwgT3MlW4cfJaC0Z');
    expect(body.trigger_mode).toBe('generate_url');
    expect(body.end_user_name).toBe('Ian');
  });

  it('sends an empty JSON array when resourceIds is omitted', async () => {
    const { body, raw } = await captureCreate({
      appointmentTypeId: 'apty_4B19EeIwgT3MlW4cfJaC0Z',
      triggerMode: 'generate_url',
      endUser: { name: 'Ian' },
    });

    expect(body.resource_ids).toEqual([]);
    expect(Array.isArray(body.resource_ids)).toBe(true);
    expect(raw).toContain('"resource_ids":[]');
    expect(raw).not.toContain('"resource_ids":"');
  });

  it('unwraps a stringified JSON array and a comma-separated string', async () => {
    const stringified = await captureCreate({
      appointmentTypeId: 'apty_1',
      triggerMode: 'pod',
      endUser: { name: 'Ian' },
      resourceIds: `["${TEAM_ID}","agnt_abc"]`,
    });
    expect(stringified.body.resource_ids).toEqual([TEAM_ID, 'agnt_abc']);

    const comma = await captureCreate({
      appointmentTypeId: 'apty_1',
      triggerMode: 'pod',
      endUser: { name: 'Ian' },
      resourceIds: `${TEAM_ID},agnt_abc`,
    });
    expect(comma.body.resource_ids).toEqual([TEAM_ID, 'agnt_abc']);
  });

  it('flattens one extra nesting level and wraps a single id string', async () => {
    const nested = await captureCreate({
      appointmentTypeId: 'apty_1',
      triggerMode: 'pod',
      endUser: { name: 'Ian' },
      resourceIds: [[TEAM_ID]],
    });
    expect(nested.body.resource_ids).toEqual([TEAM_ID]);

    const single = await captureCreate({
      appointmentTypeId: 'apty_1',
      triggerMode: 'pod',
      endUser: { name: 'Ian' },
      resourceIds: TEAM_ID,
    });
    expect(single.body.resource_ids).toEqual([TEAM_ID]);
  });

  it('passes associated_entities through so Autotask links stay on the create body', async () => {
    const entities = [
      { type: 'autotask/ticket', id: 13281, number: 'T20230401.0001' },
      { type: 'autotask/company', id: 23149 },
    ];
    const { body } = await captureCreate({
      appointmentTypeId: 'apty_1',
      triggerMode: 'pod',
      endUser: { name: 'Ian' },
      resourceIds: [TEAM_ID],
      associatedEntities: entities,
    });

    expect(body.associated_entities).toEqual(entities);
    expect(body.associatedEntities).toBeUndefined();
  });
});

describe('C — scheduling_list pageSize and status', () => {
  const records = Array.from({ length: 20 }, (_, i) => ({
    id: `sreq_${i}`,
    object: 'scheduling_request',
    status: i % 2 === 0 ? 'scheduled' : 'sent',
  }));

  function installList() {
    return installFetch((url) => {
      expect(url.pathname).toBe('/v1/scheduling_requests/');
      expect(url.searchParams.has('page_size')).toBe(false);
      expect(url.searchParams.has('pageSize')).toBe(false);
      expect(url.searchParams.has('status')).toBe(false);
      return jsonResponse(listBody(records));
    });
  }

  it('pageSize 3 returns 3 records from the fixed 20-item page', async () => {
    installList();
    const result = await client().schedulingRequests.list({ pageSize: 3 });
    expect(result).toEqual(records.slice(0, 3));
  });

  it('pageSize 10 returns 10 records from the fixed 20-item page', async () => {
    installList();
    const result = await client().schedulingRequests.list({ pageSize: 10 });
    expect(result).toEqual(records.slice(0, 10));
  });

  it('omitted pageSize still returns the full TimeZest page', async () => {
    installList();
    const result = await client().schedulingRequests.list({});
    expect(result).toHaveLength(20);
  });

  it('maps status=booked onto scheduling_request.status EQ scheduled', async () => {
    const calls = installList();
    await client().schedulingRequests.list({ status: 'booked', pageSize: 3 });
    expect(calls[0]!.url.searchParams.get('filter')).toBe('scheduling_request.status~EQ~scheduled');
  });

  it('maps legacy aliases and keeps official TimeZest statuses', async () => {
    const cases: Array<[string, string]> = [
      ['pending', 'sent'],
      ['booked', 'scheduled'],
      ['completed', 'closed'],
      ['cancelled', 'cancelled'],
      ['new', 'new'],
      ['sent', 'sent'],
      ['scheduled', 'scheduled'],
      ['closed', 'closed'],
      ['Booked', 'scheduled'],
    ];

    for (const [input, expected] of cases) {
      const calls = installList();
      await client().schedulingRequests.list({ status: input as any });
      expect(calls[0]!.url.searchParams.get('filter')).toBe(`scheduling_request.status~EQ~${expected}`);
      vi.unstubAllGlobals();
    }
  });

  it('ANDs a caller filter with the status clause', async () => {
    const calls = installList();
    await client().schedulingRequests.list({
      status: 'sent',
      filter: 'scheduling_request.end_user_email~EQ~ian@example.com',
    });
    expect(calls[0]!.url.searchParams.get('filter')).toBe(
      'scheduling_request.end_user_email~EQ~ian@example.com AND scheduling_request.status~EQ~sent',
    );
  });
});

describe('D — teams_list excludes deleted teams', () => {
  const liveTeams = [
    { id: 'team_live_1', object: 'team', internal_name: 'Onsite Support' },
    { id: 'team_live_2', object: 'team', internal_name: 'Remote Support' },
    { id: 'team_live_3', object: 'team', internal_name: 'Projects' },
    { id: TEAM_ID, object: 'team', internal_name: 'Service Desk' },
  ];
  const deletedTeams = [
    { id: 'team_deleted_1', object: 'team', internal_name: 'OnsiteSupport-Vic' },
    { id: 'team_deleted_2', object: 'team', internal_name: 'OnsiteSupport-Vic (old)' },
    { id: 'team_deleted_3', object: 'team', internal_name: 'I&AM' },
  ];

  it('returns only teams that /v1/resources still lists', async () => {
    const calls = installFetch((url) => {
      if (url.pathname === '/v1/teams/') return jsonResponse(listBody([...liveTeams, ...deletedTeams]));
      if (url.pathname === '/v1/resources/') {
        return jsonResponse(listBody([
          { id: 'agnt_person', object: 'agent', name: 'Ian' },
          ...liveTeams,
        ]));
      }
      throw new Error(`unexpected path ${url.pathname}`);
    });

    const result = await client().teams.list();

    expect(result.map((team) => team.id)).toEqual(liveTeams.map((team) => team.id));
    expect(result).toHaveLength(4);
    expect(calls.some((call) => call.url.pathname === '/v1/teams/')).toBe(true);
    expect(calls.some((call) => call.url.pathname === '/v1/resources/')).toBe(true);
    expect(calls.some((call) => call.url.pathname.includes('team_deleted'))).toBe(false);
  });

  it('keeps a live team that is only on a later resources page', async () => {
    installFetch((url) => {
      if (url.pathname === '/v1/teams/') {
        return jsonResponse(listBody([
          liveTeams[0]!,
          deletedTeams[0]!,
          { id: 'team_later', object: 'team', internal_name: 'Later page' },
        ]));
      }
      if (url.pathname === '/v1/resources/') {
        const after = url.searchParams.get('starting_after');
        if (!after) {
          return jsonResponse(listBody(
            [{ id: 'agnt_person', object: 'agent', name: 'Ian' }, liveTeams[0]!],
            'https://api.timezest.com/v1/resources?starting_after=team_live_1',
          ));
        }
        return jsonResponse(listBody([{ id: 'team_later', object: 'team', internal_name: 'Later page' }]));
      }
      throw new Error(`unexpected path ${url.pathname}`);
    });

    const result = await client().teams.list();
    expect(result.map((team) => team.id)).toEqual(['team_live_1', 'team_later']);
  });

  it('applies pageSize after dropping deleted teams', async () => {
    installFetch((url) => {
      if (url.pathname === '/v1/teams/') return jsonResponse(listBody([...deletedTeams, ...liveTeams]));
      if (url.pathname === '/v1/resources/') return jsonResponse(listBody(liveTeams));
      throw new Error(`unexpected path ${url.pathname}`);
    });

    const result = await client().teams.list({ pageSize: 2 });
    expect(result.map((team) => team.id)).toEqual(['team_live_1', 'team_live_2']);
  });

  it('does not filter resources_list — that endpoint is already the live set', async () => {
    const resources = [
      { id: 'agnt_person', object: 'agent', name: 'Ian' },
      ...liveTeams,
    ];
    const calls = installFetch((url) => {
      expect(url.pathname).toBe('/v1/resources/');
      return jsonResponse(listBody(resources));
    });

    const result = await client().resources.list();
    expect(result).toEqual(resources);
    expect(calls).toHaveLength(1);
  });
});
