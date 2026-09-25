import { NotFoundError } from './errors.js';

/**
 * TimeZest list responses are `{ object: "list", data, next_page, previous_page }`.
 * Pages are fixed at 20 records. `page_size` is not a documented query parameter
 * (https://developer.timezest.com/pagination/) — callers' pageSize is applied
 * by truncating the page TimeZest already returned.
 */
export interface ListEnvelope<T> {
  data: T[];
  nextPage: string | null;
}

export function parseListEnvelope<T>(response: unknown): ListEnvelope<T> {
  if (Array.isArray(response)) {
    return { data: response as T[], nextPage: null };
  }

  if (typeof response === 'object' && response !== null) {
    const obj = response as Record<string, unknown>;
    const data = Array.isArray(obj.data) ? (obj.data as T[]) : [];
    const nextPage = typeof obj.next_page === 'string' && obj.next_page ? obj.next_page : null;
    return { data, nextPage };
  }

  return { data: [], nextPage: null };
}

/** Honor a caller pageSize against TimeZest's fixed-size page. */
export function takePage<T>(items: T[], pageSize?: number): T[] {
  if (typeof pageSize !== 'number' || !Number.isFinite(pageSize) || pageSize < 1) {
    return items;
  }
  const size = Math.floor(pageSize);
  return items.length > size ? items.slice(0, size) : items;
}

/**
 * Agents, teams, and appointment types have no retrieve-by-id route.
 * GET /v1/agents/:id (and the team / appointment_type equivalents) is not in
 * the TimeZest API — it returns the HTML 404 page. Scheduling requests are
 * the exception and keep GET /v1/scheduling_requests/:id.
 *
 * Resolve a single record by walking the collection endpoint that list uses.
 */
export async function findById<T extends { id: string }>(
  id: string,
  fetchPage: (startingAfter?: string) => Promise<unknown>,
  notFoundMessage: string,
): Promise<T> {
  let startingAfter: string | undefined;
  const seenCursors = new Set<string>();

  for (let page = 0; page < 100; page++) {
    const envelope = parseListEnvelope<T>(await fetchPage(startingAfter));
    const found = envelope.data.find((item) => item?.id === id);
    if (found) return found;

    const lastId = envelope.data.at(-1)?.id;
    if (!envelope.nextPage || !lastId || seenCursors.has(lastId)) break;
    seenCursors.add(lastId);
    startingAfter = lastId;
  }

  throw new NotFoundError(notFoundMessage, { id });
}

/** A resources-endpoint row TimeZest still offers for scheduling. */
export function isSchedulableTeam(resource: { id?: string; object?: string }): boolean {
  if (!resource.id) return false;
  if (resource.object === 'agent') return false;
  if (resource.object === 'team') return true;
  return resource.id.startsWith('team_');
}
