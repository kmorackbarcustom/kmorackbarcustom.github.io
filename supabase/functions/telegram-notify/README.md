# telegram-notify

`HOLIDAY_CONFLICT` returns `500` with `{"ok":false,"error":"telegram_send_failed"}` when Telegram returns a non-OK response. A successful Telegram response still returns `200` with `{"ok":true}`. A thrown `fetch` error keeps the existing `500` handler behavior. The `bookings` and `orders` `INSERT` path intentionally ignores Telegram's non-OK response and keeps its existing `200` behavior.

The database trigger calls this function through `net.http_post`. That caller does not retry on its own. The `500` makes the failed send visible in Edge Function invocations and logs; it does not ask the database to retry.

This function does not write failures to `notifications_log`: one `HOLIDAY_CONFLICT` message can cover multiple bookings, and the table's `booking_id` and `notification_type` types have not been checked against the live database.
