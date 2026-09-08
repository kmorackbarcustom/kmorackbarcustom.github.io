# Ticket & Case Management Migration Handoff

**Migration File**: `supabase/migrations/20260818000000_local_service_tickets.sql`  
**Schema**: `local_service`  
**Security Model**: RLS `FOR SELECT` only + `SECURITY DEFINER` RPCs with `search_path = pg_catalog, local_service` for all write operations. All `anon` write access revoked.

---

## 1. RPC Function Signatures & Specifications

### 1.1 `create_ticket`
Creates a new ticket, handles idempotency deduplication, and records an initial `Created` timeline event.

- **Signature**:
  ```sql
  local_service.create_ticket(
      p_shop_id UUID,
      p_booking_id UUID,
      p_service_id UUID,
      p_title TEXT,
      p_type TEXT,
      p_priority TEXT,
      p_customer_name TEXT,
      p_customer_phone TEXT,
      p_normalized_phone TEXT,
      p_contact_channel TEXT,
      p_description TEXT,
      p_issue_category TEXT,
      p_related_product_service TEXT,
      p_occurred_at TIMESTAMPTZ,
      p_received_at TIMESTAMPTZ,
      p_due_at TIMESTAMPTZ,
      p_idempotency_key UUID
  ) RETURNS UUID
  ```
- **Authorization**: `has_shop_role(p_shop_id, ARRAY['owner', 'admin', 'staff'])`
- **Validation**:
  - `p_idempotency_key` is required (`ERRCODE = '22023'`)
  - `p_title`, `p_description`, `p_customer_name`, `p_customer_phone` must not be blank (`ERRCODE = '22023'`)
  - `p_type` must be in `('ProductClaim', 'ServiceIssue', 'RecheckRequest', 'RefundRequest', 'Other')`
  - `p_priority` must be in `('Low', 'Medium', 'High')`
  - `p_due_at >= p_received_at`
- **Idempotency**: If a row with `(shop_id, creation_idempotency_key)` already exists, returns existing `id`.
- **Side Effects**: Automatically inserts `ticket_timeline_entries` row with `event_type = 'Created'`.

---

### 1.2 `update_ticket_status`
Validates transition matrix against `ALLOWED_TRANSITIONS`, updates status and `closed_at`, and appends a `StatusChanged` timeline event.

- **Signature**:
  ```sql
  local_service.update_ticket_status(
      p_ticket_id UUID,
      p_new_status TEXT,
      p_actor TEXT
  ) RETURNS VOID
  ```
- **Authorization**: `has_shop_role(ticket.shop_id, ARRAY['owner', 'admin', 'staff'])`
- **Validation**:
  - Validates `p_new_status` against `('New', 'Acknowledged', 'InReview', 'WaitingForCustomer', 'RecheckScheduled', 'Resolved', 'Closed', 'Reopened')`
  - Enforces `ALLOWED_TRANSITIONS` rules:
    - `New` -> `Acknowledged`, `InReview`, `WaitingForCustomer`, `Closed`
    - `Acknowledged` -> `InReview`, `WaitingForCustomer`, `Closed`
    - `InReview` -> `Acknowledged`, `WaitingForCustomer`, `RecheckScheduled`, `Resolved`, `Closed`
    - `WaitingForCustomer` -> `Acknowledged`, `InReview`, `Closed`
    - `RecheckScheduled` -> `InReview`, `Resolved`, `Closed`
    - `Resolved` -> `InReview`, `Closed`
    - `Closed` -> `Reopened` (only `Reopened` allowed from `Closed`)
    - `Reopened` -> `Acknowledged`, `InReview`, `WaitingForCustomer`, `Closed`
- **Side Effects**:
  - Sets `closed_at = NOW()` when entering `Closed`.
  - Sets `closed_at = NULL` when reopening from `Closed`.
  - Touches `updated_at = NOW()`.
  - Appends `ticket_timeline_entries` row with `event_type = 'StatusChanged'`.

---

### 1.3 `add_ticket_timeline_entry`
Appends a custom timeline event (e.g. comment, manual note) and touches `updated_at`.

- **Signature**:
  ```sql
  local_service.add_ticket_timeline_entry(
      p_ticket_id UUID,
      p_event_type TEXT,
      p_message TEXT,
      p_actor TEXT
  ) RETURNS UUID
  ```
- **Authorization**: `has_shop_role(ticket.shop_id, ARRAY['owner', 'admin', 'staff'])`
- **Validation**:
  - `p_message` must not be blank (`ERRCODE = '22023'`)
  - `p_event_type` must be in `('Created', 'StatusChanged', 'PriorityChanged', 'AssigneeChanged', 'CommentAdded', 'ResolutionSaved', 'Closed', 'Reopened')`
- **Side Effects**: Touches `tickets.updated_at = NOW()`.

---

### 1.4 `preview_ticket_retention`
Destructive-adjacent preview returning candidate closed tickets on or before the cutoff date.

- **Signature**:
  ```sql
  local_service.preview_ticket_retention(
      p_shop_id UUID,
      p_cutoff_date DATE
  ) RETURNS TABLE(
      id UUID,
      closed_at TIMESTAMPTZ,
      customer_name TEXT,
      title TEXT,
      attachment_count INT
  )
  ```
- **Authorization**: `has_shop_role(p_shop_id, ARRAY['owner', 'admin'])` (Owner / Admin only)
- **Filter**: `status = 'Closed' AND closed_at IS NOT NULL AND closed_at < (p_cutoff_date + INTERVAL '1 day')`

---

### 1.5 `delete_closed_tickets_before`
Manual retention execution deleting closed tickets on or before the cutoff date.

- **Signature**:
  ```sql
  local_service.delete_closed_tickets_before(
      p_shop_id UUID,
      p_cutoff_date DATE
  ) RETURNS INTEGER
  ```
- **Authorization**: `has_shop_role(p_shop_id, ARRAY['owner', 'admin'])` (Owner / Admin only)
- **Filter**: `status = 'Closed' AND closed_at IS NOT NULL AND closed_at < (p_cutoff_date + INTERVAL '1 day')`
- **Return**: Number of rows deleted.

---

## 2. Table Grants & RLS

- **`local_service.tickets`**:
  - RLS Policy: `"Members view shop tickets"` `FOR SELECT USING (local_service.is_shop_member(shop_id))`
  - Grants: `GRANT SELECT ON TABLE local_service.tickets TO authenticated;`
  - Revokes: `REVOKE INSERT, UPDATE, DELETE ON TABLE local_service.tickets FROM authenticated;`, `REVOKE ALL FROM anon;`
- **`local_service.ticket_timeline_entries`**:
  - RLS Policy: `"Members view shop ticket timeline"` `FOR SELECT USING (local_service.is_shop_member(shop_id))`
  - Grants: `GRANT SELECT ON TABLE local_service.ticket_timeline_entries TO authenticated;`
  - Revokes: `REVOKE INSERT, UPDATE, DELETE ON TABLE local_service.ticket_timeline_entries FROM authenticated;`, `REVOKE ALL FROM anon;`

---

## 3. Client Calling Pattern Example (Frontend / Service layer)

When updating `ticket-service.ts` to call these RPCs:

```typescript
// Example: create ticket via RPC
const { data: ticketId, error } = await supabase.rpc('create_ticket', {
  p_shop_id: shopId,
  p_booking_id: input.bookingId || null,
  p_service_id: input.serviceId || null,
  p_title: input.title,
  p_type: input.type,
  p_priority: input.priority,
  p_customer_name: input.customerName,
  p_customer_phone: input.customerPhone,
  p_normalized_phone: normalizedPhone,
  p_contact_channel: input.contactChannel || null,
  p_description: input.description,
  p_issue_category: input.issueCategory || '',
  p_related_product_service: input.relatedProductService || '',
  p_occurred_at: input.occurredAt || null,
  p_received_at: input.receivedAt,
  p_due_at: input.dueAt,
  p_idempotency_key: idempotencyKey,
});
```
