# Booking RPC contract (T3)

Run offline tests from the KMO repository root with `node supabase/tests/booking-rpc/run.mjs`. The runner uses the portable PostgreSQL 17 binaries at `D:/AI-Workspace/tools/pg17/pgsql/bin`, binds only to `127.0.0.1:54329`, loads the selected live-baseline blocks, creates local `anon` / `authenticated` / `service_role` roles and `net.http_post` stub, then stops and removes the temporary data directory. It never connects to Supabase.

## RPCs

### `create_booking(p_payload jsonb, p_request_id uuid) returns jsonb`

Example payload follows `booking.html` fields. `queue_status` and `production_status` may be sent by the existing page but are ignored; the function sets them to `ยืนยัน` and `รอเริ่มงาน`.

```json
{
  "customer_name": "ชื่อผู้จอง",
  "phone": "เบอร์โทร",
  "source": "line",
  "line_uid": "LINE user id or null",
  "brand": "Honda",
  "model": "ADV350",
  "product": "รายการบริการ",
  "color": "ดำ",
  "appointment_date": "2026-11-16",
  "pickup_date": "2026-11-18",
  "cart_meta": {},
  "estimated_total": 0,
  "source_page": "booking.html"
}
```

Call with a client-generated UUID request ID and retain it for retries. The response is `{"job_id":"KLI-2611-0001","booking_id":123,"replay":false}`; repeating the same request ID returns the original row with `replay:true`.

Only `customer_name`, `phone`, `source`, `line_uid`, `brand`, `model`, `product`, `color`, `appointment_date`, `pickup_date`, `cart_meta`, `estimated_total`, and `source_page` are read from the JSON. Other keys are ignored. Required fields are customer name, phone, source, brand, product, appointment date, and pickup date.

`KMO_` errors are emitted as SQLSTATE `P0001` with the exact code as the message:

| Code | Meaning |
|---|---|
| `KMO_BAD_REQUEST` | Missing required input, null request ID, or invalid date/amount representation |
| `KMO_APPOINT_PAST` | Appointment is before `kmo_today()` in Asia/Bangkok |
| `KMO_APPOINT_CLOSED_WEEKDAY` | Appointment is Tuesday |
| `KMO_APPOINT_HOLIDAY` | Appointment date exists in `holidays` |
| `KMO_PICKUP_MISSING` | Pickup date is empty |
| `KMO_PICKUP_BEFORE_APPOINT` | Pickup precedes appointment |
| `KMO_MIN_WORKDAYS` | Fewer than two working days, excluding Tuesdays only |
| `KMO_DAY_FULL` | Three active bookings already use that appointment date |

### `attach_booking_images(p_request_id uuid, p_images text[]) returns void`

The request ID must belong to a booking whose `images` array is empty. Up to 10 URLs are accepted; each must be at most 500 characters and begin with `https://xfhpwxjywqgqefbncumm.supabase.co/storage/v1/object/public/booking-images/`. Errors: `KMO_BAD_REQUEST`, `KMO_TOO_MANY_IMAGES`, `KMO_IMAGE_URL_INVALID`, `KMO_REQUEST_NOT_FOUND`, `KMO_IMAGES_ALREADY_ATTACHED` (all SQLSTATE `P0001`).

### `get_booking_day_usage(p_start date, p_end date)`

Returns one row per date: `(day, used, cap, is_closed, closed_reason)`. `closed_reason` is `weekday`, `holiday`, or null; Tuesday takes precedence if a date matches both. Ranges longer than 366 dates or reversed/null ranges raise `KMO_BAD_RANGE` (`P0001`).

## Holiday conflict notification for T5

The `holidays` trigger calls the existing Telegram function URL with this JSON body; it sends no phone number or LINE UID:

```json
{
  "type": "HOLIDAY_CONFLICT",
  "table": "holidays",
  "record": { "id": 1, "date": "2026-11-19", "reason": "...", "created_at": "..." },
  "bookings": [
    {
      "job_id": "KLI-2611-0001",
      "customer_name": "ชื่อผู้จอง",
      "brand": "Honda",
      "model": "ADV350",
      "appointment_date": "2026-11-19",
      "pickup_date": "2026-11-21",
      "hit": "appointment"
    }
  ]
}
```

`hit` is `appointment`, `pickup`, or `both`. No overlapping active booking means no post. Notification errors are swallowed so the holiday write succeeds. `telegram-notify` does not yet handle this type; the receiver change belongs to T5.
