import type { HttpClient } from '../http.js';
import type {
  SchedulingRequest,
  CreateSchedulingRequestData,
  SchedulingRequestListParams,
  CancelSchedulingRequestData,
} from '../types/scheduling-requests.js';
import { unwrapResponse } from '../pagination.js';
import { takePage } from '../list-page.js';
import { buildSchedulingRequestBody, schedulingListFilter } from '../scheduling-wire.js';

export class SchedulingRequestsResource {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * List all scheduling requests
   */
  async list(params: SchedulingRequestListParams = {}): Promise<SchedulingRequest[]> {
    // TimeZest ignores a `status` query param and has no `page_size` param
    // (pages are fixed at 20). Status is a TQL filter; pageSize truncates.
    const response = await this.httpClient.request<SchedulingRequest[] | { data: SchedulingRequest[] }>('/v1/scheduling_requests', {
      params: {
        starting_after: params.startingAfter,
        ending_before: params.endingBefore,
        filter: schedulingListFilter(params.filter, params.status),
      },
    });

    return takePage(unwrapResponse<SchedulingRequest>(response), params.pageSize);
  }

  /**
   * Get a specific scheduling request by ID
   */
  async get(id: string): Promise<SchedulingRequest> {
    return this.httpClient.request<SchedulingRequest>(`/v1/scheduling_requests/${id}`);
  }

  /**
   * Create a new scheduling request
   * This is the key write endpoint for TimeZest
   */
  async create(data: CreateSchedulingRequestData): Promise<SchedulingRequest> {
    return this.httpClient.request<SchedulingRequest>('/v1/scheduling_requests', {
      method: 'POST',
      body: buildSchedulingRequestBody(data),
    });
  }

  /**
   * Cancel a scheduling request
   */
  async cancel(id: string, data: CancelSchedulingRequestData = {}): Promise<SchedulingRequest> {
    return this.httpClient.request<SchedulingRequest>(`/v1/scheduling_requests/${id}/cancel`, {
      method: 'POST',
      body: data,
    });
  }
}