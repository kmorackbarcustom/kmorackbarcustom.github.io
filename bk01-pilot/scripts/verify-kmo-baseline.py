from pathlib import Path
import hashlib
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "supabase" / "kmo-baseline" / "KMO_BK01_BASELINE.sql"
ROLLBACK = ROOT / "supabase" / "kmo-baseline" / "KMO_BK01_ROLLBACK.sql"

baseline = BASELINE.read_text(encoding="utf-8")
rollback = ROLLBACK.read_text(encoding="utf-8")
errors: list[str] = []

def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()
required_schemas = ("local_service", "kmo_booking", "kmo_bridge")
for schema in required_schemas:
    require(f"CREATE SCHEMA {schema};" in baseline, f"missing schema {schema}")

for forbidden in (
    "stripe_webhook_events", "platform_admins", "ticket_timeline_entries",
    "local_service.tickets", "entitlement_usage", "apply_topup(",
    "trg_enforce_booking_quota", "audit_platform_admin_update",
):
    require(forbidden not in baseline, f"forbidden runtime surface present: {forbidden}")

require("VALUES('deposit-slips','deposit-slips',false,5242880" in baseline,
        "private deposit-slips bucket contract missing")
require("extensions.gen_random_bytes" in baseline,
        "link token generator is not schema-qualified")
require("GRANT USAGE ON SCHEMA kmo_booking, kmo_bridge TO service_role" in baseline,
        "bridge schemas are not service-role-only")
public_mutation = re.compile(
    r"(?im)^\s*(?:insert\s+into|update|delete\s+from|alter\s+table|drop\s+table|truncate\s+table|create\s+table)\s+public\."
)
require(public_mutation.search(baseline) is None, "baseline mutates existing public.*")
require(public_mutation.search(rollback) is None, "rollback mutates existing public.*")

require('FOR INSERT TO anon' not in baseline, "anonymous direct INSERT policy exists")
require('Public bookings insert' not in baseline, "legacy public bookings INSERT policy present")
require('Public customers insert' not in baseline, "legacy public customers INSERT policy present")

active_rpcs = {
    "approve_booking_deposit", "authorize_booking_recovery_attempt", "cancel_booking",
    "claim_due_line_notifications", "complete_line_notification", "create_booking_hold",
    "create_service", "create_shop_holiday", "create_staff", "customer_cancel_booking",
    "customer_reschedule_booking", "delete_shop_holiday", "export_core_business_data",
    "link_staff_user", "reject_deposit_slip", "request_account_closure",
    "set_booking_outcome", "set_service_active", "set_staff_active", "submit_deposit_slip",
    "update_service", "update_shop_settings", "upsert_staff_weekly_schedule",
}
created_functions = set(re.findall(
    r"(?i)CREATE\s+OR\s+REPLACE\s+FUNCTION\s+local_service\.([a-z0-9_]+)\s*\(", baseline
))
missing_rpcs = sorted(active_rpcs - created_functions)
require(not missing_rpcs, f"missing active RPCs: {missing_rpcs}")

created_tables = re.findall(
    r"(?i)CREATE\s+TABLE\s+((?:local_service|kmo_booking|kmo_bridge)\.[a-z0-9_]+)", baseline
)
for table in created_tables:
    require(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;" in baseline,
            f"RLS not enabled: {table}")

require(baseline.count("BEGIN;") == 1 and baseline.count("COMMIT;") == 1,
        "baseline must be one transaction")
require(rollback.count("BEGIN;") == 1 and rollback.count("COMMIT;") == 1,
        "rollback must be one transaction")
require("DROP SCHEMA" not in rollback.upper(), "rollback must preserve schemas/data")
print(f"BASELINE_SHA256={sha256(BASELINE)}")
print(f"ROLLBACK_SHA256={sha256(ROLLBACK)}")
print(f"TABLES={len(created_tables)} FUNCTIONS={len(created_functions)} ACTIVE_RPCS={len(active_rpcs)}")

if errors:
    for error in errors:
        print(f"FAIL: {error}", file=sys.stderr)
    raise SystemExit(1)

print("KMO_BASELINE_STATIC_CHECK=PASS")
