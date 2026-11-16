# cron job: ชื่อ + ตารางเวลา + active เท่านั้น (ไม่ดึง command เพราะมี JWT)

-- ==== cron appointment-reminder ====
schedule: 0 3 * * *
active: true

-- ==== cron customer-followup ====
schedule: 0 3 * * *
active: true

-- ==== cron daily-summary ====
schedule: 0 12 * * *
active: true

-- ==== cron followup-check ====
schedule: 0 2 * * *
active: true

-- ==== cron line-chat-sessions-cleanup ====
schedule: 0 * * * *
active: true

-- ==== cron line-image-batches-cleanup ====
schedule: */5 * * * *
active: true

-- ==== cron line-inbox-messages-cleanup ====
schedule: 17 3 * * *
active: true

-- ==== cron line-inbox-pending-reconciliation ====
schedule: */5 * * * *
active: true

-- ==== cron line-staff-auth-attempts-cleanup ====
schedule: 47 * * * *
active: true

-- ==== cron line-webhook-events-cleanup ====
schedule: 17 3 * * *
active: true

-- ==== cron pickup-reminder ====
schedule: 0 11 * * *
active: true
