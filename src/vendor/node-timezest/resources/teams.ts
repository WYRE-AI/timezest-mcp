import type { HttpClient } from '../http.js';
import type { Team, TeamListParams } from '../types/teams.js';
import { unwrapResponse } from '../pagination.js';
import { findById, isSchedulableTeam, parseListEnvelope, takePage } from '../list-page.js';

export class TeamsResource {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * List teams that are still available for scheduling.
   *
   * GET /v1/teams includes deleted teams. GET /v1/resources is the live set
   * timezest_resources_list already returns (schedulable agents and teams
   * only). Keep teams whose ids appear there.
   * TimeZest pages are fixed at 20; pageSize truncates after that filter.
   */
  async list(params: TeamListParams = {}): Promise<Team[]> {
    const [response, liveTeamIds] = await Promise.all([
      this.httpClient.request<Team[] | { data: Team[] }>('/v1/teams', {
        params: {
          starting_after: params.startingAfter,
          ending_before: params.endingBefore,
          filter: params.filter,
        },
      }),
      this.liveTeamIds(),
    ]);

    const live = unwrapResponse<Team>(response).filter((team) => liveTeamIds.has(team.id));
    return takePage(live, params.pageSize);
  }

  /**
   * Get one team by id.
   * There is no GET /v1/teams/:id — that path 404s with HTML. Walk the
   * collection endpoint instead.
   */
  async get(id: string): Promise<Team> {
    return findById<Team>(
      id,
      (startingAfter) => this.httpClient.request('/v1/teams', {
        params: startingAfter ? { starting_after: startingAfter } : undefined,
      }),
      `Team not found: ${id}`,
    );
  }

  /** Ids of teams the resources endpoint still offers for scheduling. */
  private async liveTeamIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    let startingAfter: string | undefined;
    const seenCursors = new Set<string>();

    for (let page = 0; page < 100; page++) {
      const response = await this.httpClient.request('/v1/resources', {
        params: startingAfter ? { starting_after: startingAfter } : undefined,
      });
      const envelope = parseListEnvelope<{ id?: string; object?: string }>(response);
      for (const resource of envelope.data) {
        if (isSchedulableTeam(resource) && resource.id) ids.add(resource.id);
      }

      const lastId = envelope.data.at(-1)?.id;
      if (!envelope.nextPage || !lastId || seenCursors.has(lastId)) break;
      seenCursors.add(lastId);
      startingAfter = lastId;
    }

    return ids;
  }
}
