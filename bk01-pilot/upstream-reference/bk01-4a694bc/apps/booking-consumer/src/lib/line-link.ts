/**
 * Central LINE OA Link Utility
 * Format: https://line.me/R/oaMessage/@{central_oa_id}/?ผูกคิว%20{booking_code}-{link_token}
 */

export const CENTRAL_LINE_OA_ID = 'central_booking_oa'; // Central LINE OA Handle

export function generateLineBindingUrl(bookingCode: string, linkToken: string, centralOaId: string = CENTRAL_LINE_OA_ID): string {
  const cleanOaId = centralOaId.replace(/^@/, '');
  const encodedText = encodeURIComponent(`ผูกคิว ${bookingCode}-${linkToken}`);
  return `https://line.me/R/oaMessage/@${cleanOaId}/?${encodedText}`;
}
