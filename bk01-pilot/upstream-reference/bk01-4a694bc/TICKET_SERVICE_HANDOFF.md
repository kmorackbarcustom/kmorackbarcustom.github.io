# Ticket Service RPC & Mutation Functions Handoff

**Date:** 2026-08-18  
**Scope:** `products/booking` (Migration SQL & Ticket Service TypeScript)

---

## 1. New RPC Signatures Added to Migration

File: [`supabase/migrations/20260818000000_local_service_tickets.sql`](file:///D:/AI-Workspace/projects/saas-product-hub/products/booking/supabase/migrations/20260818000000_local_service_tickets.sql)

The following 3 `SECURITY DEFINER` RPC functions have been appended with `SET search_path = pg_catalog, local_service`, row-level locking (`FOR UPDATE`), role checks derived strictly from the ticket row's `shop_id` via `local_service.has_shop_role(v_ticket.shop_id, ARRAY['owner', 'admin', 'staff']::TEXT[])`, and matching `REVOKE ... FROM PUBLIC, anon, service_role` / `GRANT EXECUTE ... TO authenticated` pairs:

### 1.1 `update_ticket_priority`
```sql
CREATE OR REPLACE FUNCTION local_service.update_ticket_priority(
    p_ticket_id UUID,
    p_new_priority TEXT,
    p_actor TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service;
```
- **Validation:** Enforces `p_new_priority IN ('Low', 'Medium', 'High')` with ERRCODE `22023`.
- **Behavior:** Updates `tickets.priority` and `tickets.updated_at = NOW()`.
- **Audit:** Inserts a `ticket_timeline_entries` row with `event_type = 'PriorityChanged'` and message `Priority changed from <old> to <new>.`.

### 1.2 `update_ticket_assignee`
```sql
CREATE OR REPLACE FUNCTION local_service.update_ticket_assignee(
    p_ticket_id UUID,
    p_new_assignee TEXT,
    p_actor TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service;
```
- **Validation / Nullability:** Allows `p_new_assignee` to be `NULL` or empty (unassign).
- **Behavior:** Updates `tickets.assigned_to` and `tickets.updated_at = NOW()`.
- **Audit:** Inserts a `ticket_timeline_entries` row with `event_type = 'AssigneeChanged'` and message `Assignee changed from <prev> to <new/Unassigned>.`.

### 1.3 `save_ticket_resolution`
```sql
CREATE OR REPLACE FUNCTION local_service.save_ticket_resolution(
    p_ticket_id UUID,
    p_resolution TEXT,
    p_actor TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, local_service;
```
- **Validation:** Rejects empty or whitespace-only `p_resolution` with ERRCODE `22023` (`Resolution is required`).
- **Behavior:** Updates `tickets.resolution` and `tickets.updated_at = NOW()`.
- **Audit:** Inserts a `ticket_timeline_entries` row with `event_type = 'ResolutionSaved'` and message `Resolution recorded: <resolution>`.

---

## 2. Refactored Mutation Functions in Ticket Service

File: [`apps/booking-admin/src/lib/ticket-service.ts`](file:///D:/AI-Workspace/projects/saas-product-hub/products/booking/apps/booking-admin/src/lib/ticket-service.ts)

All 8 mutation functions were rewritten to invoke the corresponding PostgreSQL RPC functions via `supabase.rpc(...)`, eliminating direct `.from('tickets').insert(...)` and `.from('tickets').update(...)` calls while preserving all TypeScript input validations, error return formats (`{ ok: boolean; ticket?: Ticket; error?: string }`), and re-fetching via `fetchTicketById`:

| Function Name | RPC Function Called | Changes & Behavior |
| :--- | :--- | :--- |
| `createTicket` | `create_ticket` (+ `update_ticket_assignee` if `assignedTo` is provided) | Replaced direct table insert and timeline insert with `supabase.rpc('create_ticket', { ... })`. Timeline entry creation is handled inside the RPC. Preserved client-side validation (required fields, phone regex, deadline check). |
| `updateTicketStatus` | `update_ticket_status` | Replaced direct `tickets.update` and `ticket_timeline_entries.insert` with `supabase.rpc('update_ticket_status', { p_ticket_id, p_new_status, p_actor })`. Kept `getTransitionError` fast-path check in TS. |
| `appendTimelineEntry` | `add_ticket_timeline_entry` | Replaced direct insert and ticket touch with `supabase.rpc('add_ticket_timeline_entry', { p_ticket_id, p_event_type, p_message, p_actor })`. Returns generated `timelineEntry`. |
| `updateTicketPriority` | `update_ticket_priority` | Replaced direct table update and timeline insert with `supabase.rpc('update_ticket_priority', { p_ticket_id, p_new_priority, p_actor })`. |
| `updateTicketAssignee` | `update_ticket_assignee` | Replaced direct table update and timeline insert with `supabase.rpc('update_ticket_assignee', { p_ticket_id, p_new_assignee, p_actor })`. |
| `saveTicketResolution` | `save_ticket_resolution` | Replaced direct table update and timeline insert with `supabase.rpc('save_ticket_resolution', { p_ticket_id, p_resolution, p_actor })`. Preserved empty string validation. |
| `closeTicket` | `update_ticket_status` | Replaced direct table update with `supabase.rpc('update_ticket_status', { p_ticket_id, p_new_status: 'Closed', p_actor })`. Preserved resolution check and status check in TS. |
| `reopenTicket` | `update_ticket_status` | Replaced direct table update with `supabase.rpc('update_ticket_status', { p_ticket_id, p_new_status: 'Reopened', p_actor })`. Preserved Closed-status check in TS. |

---

## 3. Read-Only Functions Preserved (Untouched)

As instructed, the following functions continue to use direct `.from('tickets').select(...)` as SELECT operations remain permitted under RLS:
- `getCurrentShopMembership`
- `fetchTickets`
- `fetchTicketById`
- `fetchTicketsByPhone`

---

## 4. Observations & Notes

1. **`create_ticket` Assignee Handling:** The `create_ticket` RPC signature does not accept `p_assigned_to`. In `createTicket`, if `input.assignedTo?.trim()` is provided, `supabase.rpc('update_ticket_assignee')` is called immediately following creation before `fetchTicketById`.
2. **`deleteClosedTicketsBefore` Retention Method:** `deleteClosedTicketsBefore` in `ticket-service.ts` was not in the 8 ticket mutation functions list, and uses the candidate deletion flow. The migration already contains `delete_closed_tickets_before` RPC (section 4.5).
