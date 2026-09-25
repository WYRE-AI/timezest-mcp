import type { HttpClient } from '../http.js';
import type { AppointmentType, AppointmentTypeListParams } from '../types/appointment-types.js';
import { unwrapResponse } from '../pagination.js';
import { findById, takePage } from '../list-page.js';

export class AppointmentTypesResource {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * List appointment types.
   * TimeZest pages are fixed at 20; pageSize truncates that page.
   */
  async list(params: AppointmentTypeListParams = {}): Promise<AppointmentType[]> {
    const response = await this.httpClient.request<AppointmentType[] | { data: AppointmentType[] }>('/v1/appointment_types', {
      params: {
        starting_after: params.startingAfter,
        ending_before: params.endingBefore,
        filter: params.filter,
      },
    });

    return takePage(unwrapResponse<AppointmentType>(response), params.pageSize);
  }

  /**
   * Get one appointment type by id.
   * There is no GET /v1/appointment_types/:id — that path 404s with HTML.
   * Walk the collection endpoint instead.
   */
  async get(id: string): Promise<AppointmentType> {
    return findById<AppointmentType>(
      id,
      (startingAfter) => this.httpClient.request('/v1/appointment_types', {
        params: startingAfter ? { starting_after: startingAfter } : undefined,
      }),
      `Appointment type not found: ${id}`,
    );
  }
}
