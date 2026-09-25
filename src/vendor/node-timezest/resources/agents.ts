import type { HttpClient } from '../http.js';
import type { Agent, AgentListParams } from '../types/agents.js';
import { unwrapResponse } from '../pagination.js';
import { findById, takePage } from '../list-page.js';

export class AgentsResource {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * List agents.
   * TimeZest pages are fixed at 20; pageSize truncates that page.
   */
  async list(params: AgentListParams = {}): Promise<Agent[]> {
    const response = await this.httpClient.request<Agent[] | { data: Agent[] }>('/v1/agents', {
      params: {
        starting_after: params.startingAfter,
        ending_before: params.endingBefore,
        filter: params.filter,
      },
    });

    return takePage(unwrapResponse<Agent>(response), params.pageSize);
  }

  /**
   * Get one agent by id.
   * There is no GET /v1/agents/:id — that path 404s with HTML. Walk the
   * collection endpoint instead (same path the working list call uses).
   */
  async get(id: string): Promise<Agent> {
    return findById<Agent>(
      id,
      (startingAfter) => this.httpClient.request('/v1/agents', {
        params: startingAfter ? { starting_after: startingAfter } : undefined,
      }),
      `Agent not found: ${id}`,
    );
  }
}
