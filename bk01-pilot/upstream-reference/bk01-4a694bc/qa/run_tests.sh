#!/usr/bin/env bash
# Runs the quota enforcement QA suite against booking_qa2 in the local
# Supabase container, then prints a greppable PASS/FAIL summary.
set -euo pipefail

CONTAINER="supabase_db_wife-disposal-evidence"
DB="booking_qa2"
USER="postgres"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="${SCRIPT_DIR}/quota_enforcement_test.sql"

if [[ ! -f "$SQL_FILE" ]]; then
    echo "ERROR: $SQL_FILE not found" >&2
    exit 1
fi

# Convert the Unix-style path (e.g. /d/AI-Workspace/...) that Git Bash uses
# into a Windows-style path (D:/AI-Workspace/...) that docker cp accepts.
# cygpath is available in Git Bash; fall back to manual stripping.
if command -v cygpath >/dev/null 2>&1; then
    SQL_FILE_WIN="$(cygpath -m "$SQL_FILE")"
else
    # /d/foo -> D:/foo
    SQL_FILE_WIN="${SQL_FILE}"
    case "$SQL_FILE_WIN" in
        /[a-zA-Z]/*) SQL_FILE_WIN="${SQL_FILE_WIN:1:1}:/${SQL_FILE_WIN:3}" ;;
    esac
fi

echo ">> Copying test SQL into container ($SQL_FILE_WIN)..."
# Disable MSYS path conversion so the Windows path is passed literally to
# docker cp without being rewritten to D:\d\...
MSYS_NO_PATHCONV=1 docker cp "$SQL_FILE_WIN" "${CONTAINER}:/tmp/quota_enforcement_test.sql"

echo ">> Running psql..."
set +e
docker exec "${CONTAINER}" \
    psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -f /tmp/quota_enforcement_test.sql 2>&1 | tee /tmp/qa_quota_output.txt
PSQL_EXIT=$?
set -e

echo ""
echo "================ RUN_TESTS SUMMARY ================"
if grep -q "QA_FAILED" /tmp/qa_quota_output.txt; then
    echo "OVERALL: FAIL (one or more test cases failed)"
else
    echo "OVERALL: PASS"
fi
echo "--------------------------------------------------"
echo "Per-case results (from NOTICE lines):"
grep -E "^(T[0-9]|T0)_" /tmp/qa_quota_output.txt || true
echo "--------------------------------------------------"
echo "Summary block:"
grep -E "PASS=|FAIL=|QA SUMMARY|PASS \| |FAIL \| " /tmp/qa_quota_output.txt || true
echo "=================================================="

exit $PSQL_EXIT