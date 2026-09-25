import type { ContactInfo, DateTimeRange } from './types/common.js';
import {
  SCHEDULING_STATUS_ALIASES,
  type CreateSchedulingRequestData,
} from './types/scheduling-requests.js';

/**
 * TimeZest create requires `resource_ids` to be a JSON array
 * (https://developer.timezest.com/scheduling_requests/). A missing key, a
 * string, or a stringified array fails with
 * "The resource IDs parameter must be an array."
 *
 * Accept the shapes callers actually send: a real array, one id string,
 * a JSON-encoded array, a comma-separated string (what String(array)
 * produces), or one extra level of nesting.
 */
export function coerceResourceIds(value: unknown): string[] {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => coerceResourceIds(item));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return coerceResourceIds(parsed);
      } catch {
        // Not JSON — fall through and treat it as an id.
      }
    }

    if (trimmed.includes(',')) {
      return trimmed.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
    }

    return [trimmed];
  }

  return [];
}

export type SchedulingCreateInput = CreateSchedulingRequestData & {
  appointment_type_id?: string;
  trigger_mode?: CreateSchedulingRequestData['triggerMode'];
  resource_ids?: unknown;
  associated_entities?: CreateSchedulingRequestData['associatedEntities'];
  end_user_name?: string;
  end_user_email?: string;
  end_user_company?: string;
  earliest_date?: string;
  earliest_time?: string;
  latest_date?: string;
  latest_time?: string;
};

/**
 * Build the POST body TimeZest documents: snake_case fields, with
 * `resource_ids` always a real array (empty when the caller omitted it —
 * nil is what triggers the "must be an array" validation error).
 */
export function buildSchedulingRequestBody(input: SchedulingCreateInput): Record<string, unknown> {
  const endUser: ContactInfo = input.endUser ?? {};
  const timeRange: DateTimeRange = input.timeRange ?? {};
  const rawResourceIds = input.resourceIds !== undefined ? input.resourceIds : input.resource_ids;

  const body: Record<string, unknown> = {
    appointment_type_id: input.appointmentTypeId ?? input.appointment_type_id,
    trigger_mode: input.triggerMode ?? input.trigger_mode,
    resource_ids: coerceResourceIds(rawResourceIds),
  };

  const endUserName = endUser.name ?? input.end_user_name;
  const endUserEmail = endUser.email ?? input.end_user_email;
  const endUserCompany = endUser.company ?? input.end_user_company;
  if (endUserName) body.end_user_name = endUserName;
  if (endUserEmail) body.end_user_email = endUserEmail;
  if (endUserCompany) body.end_user_company = endUserCompany;

  const earliestDate = timeRange.earliestDate ?? input.earliest_date;
  const earliestTime = timeRange.earliestTime ?? input.earliest_time;
  const latestDate = timeRange.latestDate ?? input.latest_date;
  const latestTime = timeRange.latestTime ?? input.latest_time;
  if (earliestDate) body.earliest_date = earliestDate;
  if (earliestTime) body.earliest_time = earliestTime;
  if (latestDate) body.latest_date = latestDate;
  if (latestTime) body.latest_time = latestTime;

  const entities = input.associatedEntities ?? input.associated_entities;
  if (Array.isArray(entities)) body.associated_entities = entities;

  return body;
}

/** Map a tool/status alias onto the value TimeZest stores. */
export function toTimeZestSchedulingStatus(status: string): string {
  const key = status.trim().toLowerCase();
  if (key in SCHEDULING_STATUS_ALIASES) {
    return SCHEDULING_STATUS_ALIASES[key as keyof typeof SCHEDULING_STATUS_ALIASES];
  }
  return key;
}

/**
 * TimeZest does not filter scheduling requests with a `status` query param.
 * Status is a TQL attribute: `scheduling_request.status EQ <value>`
 * (tilde-separated form matches the documented request examples).
 * Official values: new, sent, scheduled, cancelled, closed.
 */
export function schedulingListFilter(filter: string | undefined, status: string | undefined): string | undefined {
  const userFilter = filter?.trim() ? filter.trim() : undefined;
  const statusClause = status?.trim()
    ? `scheduling_request.status~EQ~${toTimeZestSchedulingStatus(status)}`
    : undefined;

  if (userFilter && statusClause) return `${userFilter} AND ${statusClause}`;
  return statusClause ?? userFilter;
}
