import type { HttpClient } from '../http.js';
import type { Resource, ResourceListParams } from '../types/resources.js';
import { unwrapResponse } from '../pagination.js';
import { takePage } from '../list-page.js';

export class ResourcesResource {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * List all resources (agents and teams)
   * This is a convenience endpoint that returns both agents and teams
   */
  async list(params: ResourceListParams = {}): Promise<Resource[]> {
    const response = await this.httpClient.request<Resource[] | { data: Resource[] }>('/v1/resources', {
      params: {
        starting_after: params.startingAfter,
        ending_before: params.endingBefore,
        filter: params.filter,
        type: params.type,
      },
    });

    // Resources is already the live (schedulable) set — do not filter further.
    // page_size is not a TimeZest query param; truncate the fixed page instead.
    return takePage(unwrapResponse<Resource>(response), params.pageSize);
  }
}