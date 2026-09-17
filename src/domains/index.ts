/**
 * Tool registry — every tool this server implements, always listed together.
 *
 * Earlier versions gated domain tools behind a `timezest_navigate` call:
 * tools/list returned only the navigation triad until the client "entered" a
 * domain, and a module-level `currentDomain` in server.ts decided what came
 * back. That decision-tree pattern does not survive the Conduit gateway.
 * Conduit suppresses `_navigate`/`_back` from every vendor's tools/list and
 * refuses to execute them — a container-side menu advertises tools without
 * knowing the caller's access tier (see discovery-tools.ts in the Conduit
 * repo) — so `timezest_navigate` was permanently unreachable and all eleven
 * domain tools were unreachable behind it. Only `timezest_status` survived,
 * which is exactly the "one tool exposed" symptom reported from production.
 *
 * Flattening the list is the same fix already applied across the fleet
 * (blackpoint-mcp#66, and scalepad/sherweb before it). Unlike those, this
 * server drops `timezest_navigate`/`timezest_back` outright rather than
 * keeping them for stdio users: they carried no behaviour of their own here
 * beyond flipping the gate this removes, and `timezest_back` was re-declared
 * by all five domain handlers, so keeping it would put a duplicate name in
 * the flat list. `timezest_status` stays (Conduit exempts it) and now
 * reports the tool surface instead of gating it — see ./status.ts.
 *
 * Dropping the gate also removes a multi-tenant hazard: `currentDomain` was
 * module-level state in a container that builds a fresh server per HTTP
 * request (src/http.ts), so one tenant's navigate call changed what the next
 * tenant's tools/list returned.
 */
import type { DomainHandler } from '../utils/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { statusHandler } from './status.js';
import { agentsHandler } from './agents.js';
import { teamsHandler } from './teams.js';
import { appointmentTypesHandler } from './appointment-types.js';
import { resourcesHandler } from './resources.js';
import { schedulingHandler } from './scheduling.js';

const HANDLERS: readonly DomainHandler[] = [
  statusHandler,
  agentsHandler,
  teamsHandler,
  appointmentTypesHandler,
  resourcesHandler,
  schedulingHandler,
];

/** Every tool this server serves, in one flat list. */
export function getAllTools(): Tool[] {
  return HANDLERS.flatMap((handler) => handler.getTools());
}

/** The handler that owns `toolName`, or null if nothing implements it. */
export function getHandlerForTool(toolName: string): DomainHandler | null {
  return (
    HANDLERS.find((handler) =>
      handler.getTools().some((tool) => tool.name === toolName)
    ) ?? null
  );
}

export { statusHandler };
