'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { Priority, Status, TicketType } from '@/lib/ticket-domain';

/**
 * Locale-aware label maps for ticket domain enums.
 * Replaces the Thai/English-bilingual constants from ticket-domain.ts so the
 * admin UI renders labels in the active locale (th-TH vs en-US).
 */

export function useTicketLabels() {
  const t = useTranslations('ticketDomain');

  const TICKET_TYPE_LABELS: Record<TicketType, string> = {
    ProductClaim: t('typeProductClaim'),
    ServiceIssue: t('typeServiceIssue'),
    RecheckRequest: t('typeRecheckRequest'),
    RefundRequest: t('typeRefundRequest'),
    Other: t('typeOther'),
  };

  const STATUS_LABELS: Record<Status, string> = {
    New: t('statusNew'),
    Acknowledged: t('statusAcknowledged'),
    InReview: t('statusInReview'),
    WaitingForCustomer: t('statusWaitingForCustomer'),
    RecheckScheduled: t('statusRecheckScheduled'),
    Resolved: t('statusResolved'),
    Closed: t('statusClosed'),
    Reopened: t('statusReopened'),
  };

  const PRIORITY_LABELS: Record<Priority, string> = {
    Low: t('priorityLow'),
    Medium: t('priorityMedium'),
    High: t('priorityHigh'),
  };

  return { TICKET_TYPE_LABELS, STATUS_LABELS, PRIORITY_LABELS };
}

/**
 * Formats a date/time in the active locale (th-TH vs en-US) in Bangkok time.
 * Mirrors the existing Intl.DateTimeFormat behaviour but is locale-driven.
 */
export function useFormatDateTime() {
  const activeLocale = useLocale();
  return (isoString: string | null | undefined): string => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat(activeLocale === 'th' ? 'th-TH' : 'en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };
}
