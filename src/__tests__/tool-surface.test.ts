/**
 * The gateway-reachability contract for this server's tool surface.
 *
 * Conduit suppresses `_navigate`/`_back` tools from every vendor's
 * tools/list and refuses to execute them (a container-side menu cannot see
 * the caller's access tier — see discovery-tools.ts in the Conduit repo).
 * This server used to gate every domain tool behind `timezest_navigate`, so
 * through Conduit the whole vendor collapsed to a single reachable tool,
 * `timezest_status`. These tests lock the flat surface that fixed it: every
 * implemented tool is listed unconditionally, with no navigation gate and no
 * cross-request state to enter first.
 */
import { describe, it, expect } from 'vitest';
import { getAllTools, getHandlerForTool } from '../domains/index.js';

const EXPECTED_TOOLS = [
  'timezest_status',
  'timezest_agents_list',
  'timezest_agents_get',
  'timezest_teams_list',
  'timezest_teams_get',
  'timezest_appointment_types_list',
  'timezest_appointment_types_get',
  'timezest_resources_list',
  'timezest_scheduling_list',
  'timezest_scheduling_get',
  'timezest_scheduling_create_request',
  'timezest_scheduling_cancel',
] as const;

describe('flat tool surface', () => {
  it('lists every implemented tool without a navigate call first', () => {
    const names = getAllTools().map((t) => t.name);
    expect(names.sort()).toEqual([...EXPECTED_TOOLS].sort());
  });

  it('exposes no gateway-suppressed discovery tools', () => {
    // Conduit drops these by suffix, which is what made the old modal tool
    // list unreachable. Shipping one again would silently re-break whatever
    // hides behind it.
    const suppressed = getAllTools()
      .map((t) => t.name)
      .filter((n) => n.endsWith('_navigate') || n.endsWith('_back'));
    expect(suppressed).toEqual([]);
  });

  it('lists no duplicate tool names', () => {
    // timezest_back used to be re-declared by all five domain handlers;
    // flattening them into one list turns that into a duplicate-name bug.
    const names = getAllTools().map((t) => t.name);
    expect(names).toEqual([...new Set(names)]);
  });

  it('routes every listed tool to a handler that owns it', () => {
    for (const name of getAllTools().map((t) => t.name)) {
      expect(getHandlerForTool(name), `tool "${name}"`).not.toBeNull();
    }
  });

  it('returns null for a tool it does not implement', () => {
    expect(getHandlerForTool('timezest_teleport')).toBeNull();
  });

  it('gives every tool a description and an object input schema', () => {
    for (const tool of getAllTools()) {
      expect(tool.description, `tool "${tool.name}"`).toBeTruthy();
      expect(tool.inputSchema.type, `tool "${tool.name}"`).toBe('object');
    }
  });
});
