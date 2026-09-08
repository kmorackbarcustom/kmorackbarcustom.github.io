/**
 * Pure, framework-agnostic domain logic for Ticket & Case Management.
 * Ported from products/booking-ticket-module/src/domain/{types, transitions, deadline, phone}.ts.
 * Zero I/O, zero Supabase dependencies.
 */

export type TicketType =
  | 'ProductClaim'
  | 'ServiceIssue'
  | 'RecheckRequest'
  | 'RefundRequest'
  | 'Other';

export type Priority = 'Low' | 'Medium' | 'High';

export type Status =
  | 'New'
  | 'Acknowledged'
  | 'InReview'
  | 'WaitingForCustomer'
  | 'RecheckScheduled'
  | 'Resolved'
  | 'Closed'
  | 'Reopened';

export type TimelineEventType =
  | 'Created'
  | 'StatusChanged'
  | 'PriorityChanged'
  | 'AssigneeChanged'
  | 'CommentAdded'
  | 'ResolutionSaved'
  | 'Closed'
  | 'Reopened';

export interface TimelineEntry {
  id: string;
  ticketId?: string;
  eventType: TimelineEventType;
  message: string;
  actor: string;
  timestamp: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  contactChannel: string;
}

export interface BookingReference {
  bookingId: string;
  serviceDate: string;
  serviceName: string;
  shopBranch: string;
  providerTechnician?: string;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface Ticket {
  id: string;
  shopId: string;
  bookingId: string | null;
  serviceId: string | null;
  title: string;
  type: TicketType;
  status: Status;
  priority: Priority;
  customerId: string;
  assignedTo: string | null;
  description: string;
  issueCategory: string;
  relatedProductService: string;
  occurredAt: string | null;
  receivedAt: string;
  dueAt: string;
  normalizedPhone: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  resolution: string | null;
  attachments: Attachment[];
  timeline: TimelineEntry[];
  customer: Customer;
  bookingRef: BookingReference | null;
}

export interface TicketSearchFilters {
  statuses?: Status[];
  types?: TicketType[];
  receivedFrom?: string;
  receivedTo?: string;
  overdueOnly?: boolean;
  query?: string;
  now?: string;
}

export interface RetentionCandidate {
  id: string;
  closedAt: string;
  customerName: string;
  title: string;
  attachmentCount: number;
}

export interface NewTicketInput {
  receivedAt: string;
  dueAt: string;
  customerPhone: string;
  customerName: string;
  contactChannel?: string;
  title: string;
  type: TicketType;
  description: string;
  priority: Priority;
  bookingId?: string | null;
  shopId?: string | null;
  serviceId?: string | null;
  occurredAt?: string | null;
  assignedTo?: string | null;
  issueCategory?: string;
  relatedProductService?: string;
  attachments?: Attachment[];
}

export interface RecheckPayload {
  source_ticket_id: string;
  customer_id: string;
  original_booking_id: string | null;
  shop_id: string | null;
  service_id: string | null;
  reason: string;
  preferred_date: string | null;
  notes: string;
  created_at: string;
}

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  ProductClaim: 'Product Claim (เคลมสินค้า)',
  ServiceIssue: 'Service Issue (ปัญหาบริการ)',
  RecheckRequest: 'Recheck Request (ขอนัดตรวจซ้ำ)',
  RefundRequest: 'Refund Request (ขอคืนเงิน)',
  Other: 'Other (อื่นๆ)',
};

export const STATUS_LABELS: Record<Status, string> = {
  New: 'New (รับเรื่องใหม่)',
  Acknowledged: 'Acknowledged (รับทราบแล้ว)',
  InReview: 'In Review (กำลังตรวจสอบ)',
  WaitingForCustomer: 'Waiting for Customer (รอลูกค้าตอบกลับ)',
  RecheckScheduled: 'Recheck Scheduled (นัดตรวจซ้ำแล้ว)',
  Resolved: 'Resolved (แก้ไขเรียบร้อย)',
  Closed: 'Closed (ปิดเคส)',
  Reopened: 'Reopened (เปิดเคสใหม่)',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  Low: 'Low (ต่ำ)',
  Medium: 'Medium (ปานกลาง)',
  High: 'High (สูง / เร่งด่วน)',
};

// --- PHONE UTILITIES ---

const MIN_PHONE_DIGITS = 9;
const MAX_PHONE_DIGITS = 15;

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidPhone(value: string): boolean {
  const normalized = normalizePhone(value);
  return normalized.length >= MIN_PHONE_DIGITS && normalized.length <= MAX_PHONE_DIGITS;
}

// --- DEADLINE & OVERDUE UTILITIES ---

export interface DeadlineValidationResult {
  valid: boolean;
  error?: 'INVALID_RECEIVED_AT' | 'INVALID_DUE_AT' | 'DUE_BEFORE_RECEIVED';
}

function parseTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function validateDeadline(receivedAt: string, dueAt: string): DeadlineValidationResult {
  const received = parseTimestamp(receivedAt);
  if (received === null) return { valid: false, error: 'INVALID_RECEIVED_AT' };
  const due = parseTimestamp(dueAt);
  if (due === null) return { valid: false, error: 'INVALID_DUE_AT' };
  if (due < received) return { valid: false, error: 'DUE_BEFORE_RECEIVED' };
  return { valid: true };
}

/**
 * Overdue calculation: due_at < now AND status != 'Closed'.
 * Crucial rule: Overdue status must NEVER auto-close or automatically mutate the ticket.
 */
export function isOverdue(
  ticket: Pick<Ticket, 'dueAt' | 'status'>,
  now: string = new Date().toISOString()
): boolean {
  if (ticket.status === 'Closed') return false;
  const due = parseTimestamp(ticket.dueAt);
  const reference = parseTimestamp(now);
  return due !== null && reference !== null && due < reference;
}

// --- STATUS TRANSITIONS ---

// Kept in sync with supabase/migrations/20260818000000_local_service_tickets.sql's
// update_ticket_status RPC, the actual enforcement point — any non-Closed status can
// transition directly to Closed, and Closed can only go to Reopened.
export const ALLOWED_TRANSITIONS: Record<Status, Status[]> = {
  New: ['Acknowledged', 'InReview', 'WaitingForCustomer', 'Closed'],
  Acknowledged: ['InReview', 'WaitingForCustomer', 'Closed'],
  InReview: ['Acknowledged', 'WaitingForCustomer', 'RecheckScheduled', 'Resolved', 'Closed'],
  WaitingForCustomer: ['Acknowledged', 'InReview', 'Closed'],
  RecheckScheduled: ['InReview', 'Resolved', 'Closed'],
  Resolved: ['InReview', 'Closed'],
  Closed: ['Reopened'],
  Reopened: ['Acknowledged', 'InReview', 'WaitingForCustomer', 'Closed'],
};

export function canTransition(from: Status, to: Status): boolean {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function getTransitionError(from: Status, to: Status): string | null {
  if (canTransition(from, to)) return null;
  if (from === 'Closed') {
    return 'Closed tickets must be reopened before changing status.';
  }
  return `Cannot transition from "${from}" to "${to}".`;
}

// --- RETENTION CUTOFF UTILITIES ---

/**
 * Returns the ISO date (YYYY-MM-DD) exactly twelve calendar months before the supplied time.
 */
export function defaultRetentionCutoff(now: Date = new Date()): string {
  const targetMonth = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const lastTargetDay = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0
  ).getDate();
  const targetDay = Math.min(now.getDate(), lastTargetDay);

  return [
    targetMonth.getFullYear(),
    String(targetMonth.getMonth() + 1).padStart(2, '0'),
    String(targetDay).padStart(2, '0'),
  ].join('-');
}

export function isEligibleForRetention(closedAt: string | null, cutoffDate: string): boolean {
  if (!closedAt) return false;
  const closedTime = parseTimestamp(closedAt);
  const cutoffTime = parseTimestamp(`${cutoffDate}T23:59:59.999Z`);
  return closedTime !== null && cutoffTime !== null && closedTime <= cutoffTime;
}
