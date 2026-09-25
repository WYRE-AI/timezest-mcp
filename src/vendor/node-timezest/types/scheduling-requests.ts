import type { TriggerMode, DateTimeRange, PSAEntity, ContactInfo } from './common.js';

/**
 * Statuses TimeZest actually stores.
 * https://developer.timezest.com/scheduling_requests/
 *
 * - `new` — created, no email sent yet
 * - `sent` — at least one email sent to the end user
 * - `scheduled` — the end user picked a time
 * - `cancelled` — cancelled by the end user or an agent
 * - `closed` — closed by a workflow; can no longer be scheduled
 */
export const TIMEZEST_SCHEDULING_STATUSES = ['new', 'sent', 'scheduled', 'cancelled', 'closed'] as const;

export type TimeZestSchedulingStatus = (typeof TIMEZEST_SCHEDULING_STATUSES)[number];

/**
 * Legacy tool enum values, kept so existing callers keep working.
 * `completed` maps to `closed` (the terminal workflow state in the API).
 * `pending` maps to `sent` (a request already emailed, not yet booked).
 */
export const SCHEDULING_STATUS_ALIASES = {
  pending: 'sent',
  booked: 'scheduled',
  completed: 'closed',
} as const satisfies Record<string, TimeZestSchedulingStatus>;

export type SchedulingStatusFilter = TimeZestSchedulingStatus | keyof typeof SCHEDULING_STATUS_ALIASES;

export interface SchedulingRequest {
  /** Unique scheduling request identifier */
  id: string;
  /** Appointment type ID */
  appointmentTypeId: string;
  /** Trigger mode - determines if this fires PSA workflow or generates URL */
  triggerMode: TriggerMode;
  /** End user contact information */
  endUser: ContactInfo;
  /** Preferred date/time ranges */
  timeRange: DateTimeRange;
  /** Specific resource IDs to book with (agents or teams) */
  resourceIds?: string[];
  /** Additional notes or requirements */
  notes?: string;
  /** PSA entities this request is associated with */
  associatedEntities?: PSAEntity[];
  /** Booking URL (present when triggerMode = 'generate_url') */
  bookingUrl?: string;
  /** Request status. TimeZest values: new, sent, scheduled, cancelled, closed. */
  status: TimeZestSchedulingStatus;
  /** Scheduled date/time (when booked) */
  scheduledAt?: string;
  /** Assigned resource ID (when booked) */
  assignedResourceId?: string;
  /** Created timestamp */
  createdAt: string;
  /** Last updated timestamp */
  updatedAt: string;
}

export interface CreateSchedulingRequestData {
  /** Appointment type ID (required) */
  appointmentTypeId: string;
  /** Trigger mode (required) */
  triggerMode: TriggerMode;
  /** End user contact information */
  endUser: ContactInfo;
  /** Preferred date/time ranges */
  timeRange?: DateTimeRange;
  /** Specific resource IDs to book with */
  resourceIds?: string[];
  /** Additional notes or requirements */
  notes?: string;
  /** PSA entities this request is associated with */
  associatedEntities?: PSAEntity[];
}

export interface SchedulingRequestListParams {
  /** Page size (default 20) */
  pageSize?: number;
  /** Starting cursor for pagination */
  startingAfter?: string;
  /** Ending cursor for pagination */
  endingBefore?: string;
  /** TQL filter string */
  filter?: string;
  /**
   * Filter by status. Official TimeZest values (new, sent, scheduled,
   * cancelled, closed) or legacy aliases (pending→sent, booked→scheduled,
   * completed→closed). Wired as a TQL `filter`, not a `status` query param.
   */
  status?: SchedulingStatusFilter;
}

export interface CancelSchedulingRequestData {
  /** Reason for cancellation */
  reason?: string;
}