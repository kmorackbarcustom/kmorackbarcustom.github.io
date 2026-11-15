import { PGlite } from "npm:@electric-sql/pglite@0.5.8";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("LINE webhook migration behavior on isolated PGlite", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema cron;
      create table cron.jobs (
        jobid bigint generated always as identity primary key,
        jobname text,
        schedule text,
        command text
      );
      create function cron.schedule(text, text, text)
        returns bigint language sql as $$
          insert into cron.jobs (jobname, schedule, command)
          values ($1, $2, $3)
          returning jobid
        $$;
      create table public.line_chat_sessions (
        user_id text primary key,
        history jsonb not null default '[]'::jsonb,
        last_interaction timestamptz
      );
      create table public.line_image_batches (
        line_uid text primary key,
        items jsonb not null default '[]'::jsonb,
        created_at timestamptz not null default clock_timestamp(),
        updated_at timestamptz not null default clock_timestamp()
      );
      create table public.customers (
        id uuid primary key,
        line_uid text,
        name text,
        line_display_name text,
        phone text,
        paused_until timestamptz
      );
      create table public.audit_logs (
        id uuid primary key,
        actor_id text,
        actor_type text not null,
        action text not null,
        entity_type text not null,
        entity_id text not null,
        before jsonb,
        after jsonb,
        metadata jsonb,
        timestamp timestamptz not null default now()
      );
    `);

    const migration = await Deno.readTextFile(
      new URL(
        "../supabase/migrations/20261021120000_line_webhook_idempotency.sql",
        import.meta.url,
      ),
    );
    await db.exec(migration);
    const inboxMigration = await Deno.readTextFile(
      new URL(
        "../supabase/migrations/20261114120000_line_inbox_dashboard.sql",
        import.meta.url,
      ),
    );
    await db.exec(inboxMigration);

    const queryOne = async (sql: string) =>
      (await db.query(sql)).rows[0] as Record<string, unknown>;

    // PGlite accepts these in parallel but serializes work inside one engine;
    // this checks the RPC contract, not a real two-session PostgreSQL race.
    const parallelClaims = await Promise.all([
      queryOne(
        "select public.line_webhook_event_claim('parallel-event','message:text')->>'claimed' claimed",
      ),
      queryOne(
        "select public.line_webhook_event_claim('parallel-event','message:text')->>'claimed' claimed",
      ),
    ]);
    assert(
      parallelClaims.filter((row) => row.claimed === "true").length === 1,
      "parallel claim attempts must produce one winner",
    );

    const otherEvent = await queryOne(
      "select public.line_webhook_event_claim('other-event','message:text')->>'claimed' claimed",
    );
    assert(
      otherEvent.claimed === "true",
      "distinct event IDs stay independent",
    );

    const duplicate = await queryOne(
      "select public.line_webhook_event_claim('parallel-event','message:text')->>'claimed' claimed",
    );
    assert(
      duplicate.claimed === "false",
      "completed claim cannot be claimed twice",
    );

    await db.exec(
      "update public.line_webhook_events set status='failed_retryable' where event_id='other-event'",
    );
    const retryable = await queryOne(
      "select public.line_webhook_event_claim('other-event','message:text')->>'claimed' claimed",
    );
    assert(
      retryable.claimed === "true",
      "pre-send retryable event can be reclaimed",
    );

    await db.exec(`
      update public.line_webhook_events
      set status='delivery_uncertain', delivery_status='reply_uncertain'
      where event_id='other-event'
    `);
    const uncertain = await queryOne(
      "select public.line_webhook_event_claim('other-event','message:text')->>'claimed' claimed",
    );
    assert(
      uncertain.claimed === "false",
      "uncertain delivery is terminal to automatic reclaim",
    );

    for (const role of ["user", "user", "assistant", "assistant"]) {
      await db.query(
        "select public.line_append_chat_history('user-1',$$" +
          JSON.stringify({ role, content: "synthetic" }) +
          "$$::jsonb,40,array['history-event'])",
      );
    }
    await db.query(
      'select public.line_append_chat_history(\'user-1\',$${"role":"user","content":"synthetic"}$$::jsonb,40,array[\'history-event-2\'])',
    );
    const historyLength = await queryOne(
      "select jsonb_array_length(history) length from public.line_chat_sessions where user_id='user-1'",
    );
    assert(
      Number(historyLength.length) === 3,
      "history dedup is per role and event ID",
    );

    await db.query(
      "select public.line_image_batch_append('user-2','message-1','dummy-reply-token',1,'line','image-event')",
    );
    await db.query(
      "select public.line_image_batch_append('user-2','message-1','dummy-reply-token',1,'line','image-event')",
    );
    await db.query(
      "select public.line_image_batch_append('user-2','message-2','dummy-reply-token',2,'line','image-event')",
    );
    const batch = await queryOne(
      "select cardinality(event_ids) event_count, jsonb_array_length(items) item_count from public.line_image_batches where line_uid='user-2'",
    );
    assert(
      Number(batch.event_count) === 1,
      "image event ID is stored only once",
    );
    assert(
      Number(batch.item_count) === 1,
      "redelivered image event is not appended twice",
    );

    const claimedBatch = await queryOne(
      "select public.line_image_batch_claim('user-2',clock_timestamp()+interval '10 sec')->0->>'webhook_event_id' event_id",
    );
    assert(
      claimedBatch.event_id === "image-event",
      "image claim returns its event ID",
    );

    const access = await queryOne(`
      select
        (select relrowsecurity from pg_class where oid='public.line_webhook_events'::regclass) rls,
        has_table_privilege('anon','public.line_webhook_events','select') anon_read,
        has_table_privilege('service_role','public.line_webhook_events','select') service_read,
        has_function_privilege('anon','public.line_webhook_event_claim(text,text,integer)','execute') anon_execute,
        has_function_privilege('service_role','public.line_webhook_event_claim(text,text,integer)','execute') service_execute
    `);
    assert(access.rls === true, "event table must have RLS enabled");
    assert(access.anon_read === false, "anon must not read event table");
    assert(access.service_read === true, "service_role must read event table");
    assert(access.anon_execute === false, "anon must not execute claim RPC");
    assert(
      access.service_execute === true,
      "service_role must execute claim RPC",
    );

    const customerA = "11111111-1111-4111-8111-111111111111";
    const customerB = "22222222-2222-4222-8222-222222222222";
    await db.query(
      "insert into public.customers(id,line_uid,name,phone) values ($1,'line-a','Alpha','0800'),($2,'line-b','Bravo','0900')",
      [customerA, customerB],
    );
    const deliveryClaim = await queryOne(
      `select public.line_delivery_claim('${customerA}','event-one','ai') result`,
    );
    assert(
      /^claimed:[0-9a-f-]{36}$/i.test(String(deliveryClaim.result)),
      "AI claim returns a unique release token",
    );
    const deliveryToken = String(deliveryClaim.result).slice("claimed:".length);
    const deliveryRenewal = await queryOne(
      `select public.line_delivery_renew('${customerA}','${deliveryToken}') result`,
    );
    assert(deliveryRenewal.result === true, "claim owner can renew its lease");
    const busyClaim = await queryOne(
      `select public.line_delivery_claim('${customerA}','event-two','ai') result`,
    );
    assert(
      busyClaim.result === "busy",
      "a customer has at most one active delivery",
    );
    const takeoverWhileSending = await queryOne(
      `select public.line_customer_set_human_mode('${customerA}',true) result`,
    );
    assert(
      takeoverWhileSending.result === "active_delivery",
      "takeover waits for an active send",
    );
    const release = await queryOne(
      `select public.line_delivery_release('${customerA}','${deliveryToken}') result`,
    );
    assert(release.result === true, "claim owner can release its delivery");

    await db.exec(`
      create function public.reject_audit_insert() returns trigger
        language plpgsql as $$ begin raise exception 'audit unavailable'; end $$;
      create trigger reject_audit_insert before insert on public.audit_logs
        for each row execute function public.reject_audit_insert();
    `);
    let auditFailureObserved = false;
    try {
      await db.query(
        `select public.line_customer_set_human_mode('${customerA}',true)`,
      );
    } catch {
      auditFailureObserved = true;
    }
    assert(auditFailureObserved, "audit failure aborts the mode update");
    const modeAfterAuditFailure = await queryOne(
      `select human_takeover from public.customers where id='${customerA}'`,
    );
    assert(
      modeAfterAuditFailure.human_takeover === false,
      "failed audit leaves the customer mode unchanged",
    );
    await db.exec(`
      drop trigger reject_audit_insert on public.audit_logs;
      drop function public.reject_audit_insert();
    `);

    const takeover = await queryOne(
      `select public.line_customer_set_human_mode('${customerA}',true) result`,
    );
    assert(
      takeover.result === "updated",
      "takeover becomes persistent after delivery ends",
    );
    const takeoverAudit = await queryOne(`
      select action, before->>'humanTakeover' before_mode,
        after->>'humanTakeover' after_mode, metadata->>'channel' channel
      from public.audit_logs where entity_id='${customerA}'
    `);
    assert(
      takeoverAudit.action === "customer.human_takeover" &&
        takeoverAudit.before_mode === "false" &&
        takeoverAudit.after_mode === "true" &&
        takeoverAudit.channel === "staff-reply",
      "takeover writes its matching audit event atomically",
    );
    const blockedAi = await queryOne(
      `select public.line_delivery_claim('${customerA}','event-three','ai') result`,
    );
    assert(
      blockedAi.result === "human_takeover",
      "AI delivery is blocked in human mode",
    );
    const humanClaim = await queryOne(
      `select public.line_delivery_claim('${customerA}','staff-one','human') result`,
    );
    assert(
      /^claimed:[0-9a-f-]{36}$/i.test(String(humanClaim.result)),
      "staff claim returns a unique release token",
    );
    const humanToken = String(humanClaim.result).slice("claimed:".length);
    const resumeWhileSending = await queryOne(
      `select public.line_customer_set_human_mode('${customerA}',false) result`,
    );
    assert(
      resumeWhileSending.result === "active_delivery",
      "resume waits for staff delivery",
    );
    await db.query(
      `select public.line_delivery_release('${customerA}','${humanToken}')`,
    );
    const resumed = await queryOne(
      `select public.line_customer_set_human_mode('${customerA}',false) result`,
    );
    assert(resumed.result === "updated", "AI mode can be restored explicitly");
    const resumeAudit = await queryOne(`
      select action, before->>'humanTakeover' before_mode,
        after->>'humanTakeover' after_mode
      from public.audit_logs where entity_id='${customerA}'
      order by timestamp desc limit 1
    `);
    assert(
      resumeAudit.action === "customer.ai_resumed" &&
        resumeAudit.before_mode === "true" &&
        resumeAudit.after_mode === "false",
      "resume writes its matching audit event atomically",
    );
    const unchangedMode = await queryOne(
      `select public.line_customer_set_human_mode('${customerA}',false) result`,
    );
    assert(
      unchangedMode.result === "unchanged",
      "unchanged mode is idempotent",
    );
    const customerAuditCount = await queryOne(
      `select count(*)::int count from public.audit_logs where entity_id='${customerA}'`,
    );
    assert(
      customerAuditCount.count === 2,
      "idempotent mode changes do not add duplicate audit events",
    );
    await db.query(
      `update public.customers set paused_until=clock_timestamp()+interval '1 hour' where id='${customerA}'`,
    );
    const timedPause = await queryOne(
      `select public.line_delivery_claim('${customerA}','event-four','ai') result`,
    );
    assert(
      timedPause.result === "timed_pause",
      "Telegram timed pause still blocks AI delivery",
    );

    const staleClaim = await queryOne(
      `select public.line_delivery_claim('${customerB}','same-event','ai') result`,
    );
    assert(
      /^claimed:[0-9a-f-]{36}$/i.test(String(staleClaim.result)),
      "first attempt owns a unique lease token",
    );
    const staleToken = String(staleClaim.result).slice("claimed:".length);
    await db.query(
      `update public.customers set line_delivery_started_at=clock_timestamp()-interval '31 seconds' where id='${customerB}'`,
    );
    const retryClaim = await queryOne(
      `select public.line_delivery_claim('${customerB}','same-event','ai') result`,
    );
    assert(
      /^claimed:[0-9a-f-]{36}$/i.test(String(retryClaim.result)),
      "retry can claim after the previous lease expires",
    );
    const retryToken = String(retryClaim.result).slice("claimed:".length);
    assert(staleToken !== retryToken, "each claim has a fresh owner token");
    const staleRelease = await queryOne(
      `select public.line_delivery_release('${customerB}','${staleToken}') result`,
    );
    assert(staleRelease.result === false, "stale owner cannot release retry");
    const staleRenewal = await queryOne(
      `select public.line_delivery_renew('${customerB}','${staleToken}') result`,
    );
    assert(staleRenewal.result === false, "stale owner cannot renew retry");
    await db.query(
      `update public.customers set line_delivery_started_at=clock_timestamp()-interval '31 seconds' where id='${customerB}'`,
    );
    const retryRenewal = await queryOne(
      `select public.line_delivery_renew('${customerB}','${retryToken}') result`,
    );
    assert(retryRenewal.result === true, "current owner can renew retry");
    const busyAfterRenewal = await queryOne(
      `select public.line_delivery_claim('${customerB}','after-renewal','ai') result`,
    );
    assert(busyAfterRenewal.result === "busy", "renewal keeps retry locked");
    const currentToken = await queryOne(
      `select line_delivery_event_id from public.customers where id='${customerB}'`,
    );
    assert(
      currentToken.line_delivery_event_id === retryToken,
      "retry lease remains owned after stale release",
    );
    const retryRelease = await queryOne(
      `select public.line_delivery_release('${customerB}','${retryToken}') result`,
    );
    assert(retryRelease.result === true, "current owner can release retry");

    await db.query(`
      insert into public.line_inbox_messages(customer_id,event_id,line_message_id,role,message_type,content,created_at)
      values ('${customerA}','event:a','message:a','customer','text','hello','2026-11-13T00:00:00Z'),
             ('${customerB}','event:b','message:b','customer','text','hello','2026-11-14T00:00:00Z')
    `);
    const duplicateMessage = await db.query(`
      insert into public.line_inbox_messages(customer_id,event_id,line_message_id,role,message_type,content)
      values ('${customerA}','event:a','message:a','customer','text','hello again')
      on conflict do nothing
      returning id
    `);
    assert(
      duplicateMessage.rows.length === 0,
      "duplicate event and LINE message IDs are ignored",
    );
    await db.query(`
      insert into public.line_inbox_messages(customer_id,role,message_type,content,request_id)
      values ('${customerA}','staff','text','reply','33333333-3333-4333-8333-333333333333')
    `);
    const duplicateRequest = await db.query(`
      insert into public.line_inbox_messages(customer_id,role,message_type,content,request_id)
      values ('${customerA}','staff','text','reply','33333333-3333-4333-8333-333333333333')
      on conflict do nothing
      returning id
    `);
    assert(
      duplicateRequest.rows.length === 0,
      "a staff request ID can create only one inbox message",
    );
    const filteredList = await queryOne(`
      select id::text, name, last_activity_at::text
      from public.line_inbox_list('alpha','ai',0,10)
      limit 1
    `);
    assert(
      filteredList.id === customerA,
      "server list searches customer names and AI mode",
    );
    const humanCustomer = await queryOne(
      `select public.line_customer_set_human_mode('${customerB}',true) result`,
    );
    assert(
      humanCustomer.result === "updated",
      "second customer can be assigned independently",
    );
    const filteredHumanList = await queryOne(`
      select id::text from public.line_inbox_list('', 'human', 0, 10) limit 1
    `);
    assert(
      filteredHumanList.id === customerB,
      "server list filters persistent takeovers",
    );

    const inboxAccess = await queryOne(`
      select
        (select relrowsecurity from pg_class where oid='public.line_inbox_messages'::regclass) rls,
        (select relrowsecurity from pg_class where oid='public.line_staff_auth_attempts'::regclass) auth_rls,
        has_table_privilege('anon','public.line_inbox_messages','select') anon_read,
        has_table_privilege('service_role','public.line_inbox_messages','select') service_read,
        has_function_privilege('anon','public.line_inbox_list(text,text,integer,integer)','execute') anon_list,
        has_function_privilege('service_role','public.line_inbox_list(text,text,integer,integer)','execute') service_list,
        has_function_privilege('anon','public.line_delivery_claim(uuid,text,text)','execute') anon_claim,
        has_function_privilege('service_role','public.line_delivery_claim(uuid,text,text)','execute') service_claim,
        has_function_privilege('anon','public.line_delivery_release(uuid,text)','execute') anon_release,
        has_function_privilege('service_role','public.line_delivery_release(uuid,text)','execute') service_release,
        has_function_privilege('anon','public.line_delivery_renew(uuid,text)','execute') anon_renew,
        has_function_privilege('service_role','public.line_delivery_renew(uuid,text)','execute') service_renew,
        has_table_privilege('anon','public.line_staff_auth_attempts','select') anon_auth_read,
        has_table_privilege('service_role','public.line_staff_auth_attempts','select') service_auth_read,
        has_function_privilege('anon','public.line_customer_set_human_mode(uuid,boolean)','execute') anon_mode,
        has_function_privilege('service_role','public.line_customer_set_human_mode(uuid,boolean)','execute') service_mode,
        has_function_privilege('anon','public.line_staff_auth_attempt(text,boolean)','execute') anon_auth_check,
        has_function_privilege('service_role','public.line_staff_auth_attempt(text,boolean)','execute') service_auth_check
    `);
    assert(inboxAccess.rls === true, "inbox messages require RLS");
    assert(inboxAccess.anon_read === false, "anon cannot read inbox messages");
    assert(
      inboxAccess.service_read === true,
      "service role can read inbox messages",
    );
    assert(inboxAccess.anon_list === false, "anon cannot list inbox customers");
    assert(
      inboxAccess.service_list === true,
      "service role can list inbox customers",
    );
    assert(
      inboxAccess.anon_claim === false,
      "anon cannot change delivery state",
    );
    assert(
      inboxAccess.service_claim === true,
      "service role can change delivery state",
    );
    assert(
      inboxAccess.anon_release === false,
      "anon cannot release delivery lease",
    );
    assert(
      inboxAccess.service_release === true,
      "service role can release delivery lease",
    );
    assert(
      inboxAccess.anon_renew === false,
      "anon cannot renew delivery lease",
    );
    assert(
      inboxAccess.service_renew === true,
      "service role can renew delivery lease",
    );
    assert(inboxAccess.auth_rls === true, "staff auth attempts require RLS");
    assert(
      inboxAccess.anon_auth_read === false,
      "anon cannot read auth attempts",
    );
    assert(
      inboxAccess.service_auth_read === true,
      "service role can read auth attempts",
    );
    assert(
      inboxAccess.anon_mode === false,
      "anon cannot change human mode",
    );
    assert(
      inboxAccess.service_mode === true,
      "service role can change human mode",
    );
    assert(
      inboxAccess.anon_auth_check === false,
      "anon cannot check staff auth",
    );
    assert(
      inboxAccess.service_auth_check === true,
      "service role can check staff auth",
    );

    const staffIpHash = "a".repeat(64);
    for (let attempt = 1; attempt < 10; attempt++) {
      const result = await queryOne(
        `select public.line_staff_auth_attempt('${staffIpHash}',false) result`,
      );
      assert(result.result === "denied", "attempt below limit is denied");
    }
    const blockedAttempt = await queryOne(
      `select public.line_staff_auth_attempt('${staffIpHash}',false) result`,
    );
    assert(
      blockedAttempt.result === "blocked",
      "tenth failure starts cooldown",
    );
    const stillBlocked = await queryOne(
      `select public.line_staff_auth_attempt('${staffIpHash}',false) result`,
    );
    assert(
      stillBlocked.result === "blocked",
      "cooldown blocks further attempts",
    );
    const validPasscode = await queryOne(
      `select public.line_staff_auth_attempt('${staffIpHash}',true) result`,
    );
    assert(
      validPasscode.result === "blocked",
      "valid passcode cannot bypass an active cooldown",
    );
    const cooldownAfterValidPasscode = await queryOne(
      `select coalesce(max(failed_attempts),0)::int failed_attempts,
        coalesce(bool_or(blocked_until > clock_timestamp()),false) active_block
       from public.line_staff_auth_attempts where ip_hash='${staffIpHash}'`,
    );
    assert(
      Number(cooldownAfterValidPasscode.failed_attempts) === 10 &&
        cooldownAfterValidPasscode.active_block === true,
      "a correct passcode leaves the active cooldown untouched",
    );
    const stillBlockedAfterValidPasscode = await queryOne(
      `select public.line_staff_auth_attempt('${staffIpHash}',true) result`,
    );
    assert(
      stillBlockedAfterValidPasscode.result === "blocked",
      "cooldown rejects repeated correct passcodes",
    );
    const freshStaffIpHash = "b".repeat(64);
    const freshValidPasscode = await queryOne(
      `select public.line_staff_auth_attempt('${freshStaffIpHash}',true) result`,
    );
    assert(
      freshValidPasscode.result === "allowed",
      "valid passcode is allowed without an active cooldown",
    );
    const clearedAfterSuccess = await queryOne(
      `select count(*)::int count from public.line_staff_auth_attempts where ip_hash='${freshStaffIpHash}'`,
    );
    assert(
      clearedAfterSuccess.count === 0,
      "success clears the failure row when not blocked",
    );
    const postSuccessFailure = await queryOne(
      `select public.line_staff_auth_attempt('${freshStaffIpHash}',false) result`,
    );
    assert(
      postSuccessFailure.result === "denied",
      "successful auth resets limit",
    );
    const resetStaffIpHash = "c".repeat(64);
    await db.query(
      `select public.line_staff_auth_attempt('${resetStaffIpHash}',false)`,
    );
    await db.query(
      `select public.line_staff_auth_attempt('${resetStaffIpHash}',false)`,
    );
    const accumulatedFailures = await queryOne(
      `select coalesce(max(failed_attempts),0)::int failed_attempts
       from public.line_staff_auth_attempts where ip_hash='${resetStaffIpHash}'`,
    );
    assert(
      Number(accumulatedFailures.failed_attempts) === 2,
      "failures accumulate below the cooldown limit",
    );
    const resetBySuccess = await queryOne(
      `select public.line_staff_auth_attempt('${resetStaffIpHash}',true) result`,
    );
    assert(
      resetBySuccess.result === "allowed",
      "success is allowed below the cooldown limit",
    );
    const failureAfterReset = await queryOne(
      `select public.line_staff_auth_attempt('${resetStaffIpHash}',false) result`,
    );
    const failuresAfterReset = await queryOne(
      `select coalesce(max(failed_attempts),0)::int failed_attempts
       from public.line_staff_auth_attempts where ip_hash='${resetStaffIpHash}'`,
    );
    assert(
      failureAfterReset.result === "denied" &&
        Number(failuresAfterReset.failed_attempts) === 1,
      "success clears accumulated failures instead of carrying them forward",
    );
    await db.exec(`
      insert into public.line_inbox_messages (
        customer_id, role, message_type, content, request_id, delivery_status, created_at
      ) values (
        '${customerA}', 'staff', 'text', 'pending test',
        '11111111-1111-4111-8111-111111111111', 'pending', now() - interval '6 minutes'
      )
    `);
    const reconcileJob = await queryOne(`
      select command from cron.jobs
      where jobname = 'line-inbox-pending-reconciliation'
    `);
    assert(
      typeof reconcileJob.command === "string",
      "reconciliation cron job is scheduled",
    );
    await db.exec(reconcileJob.command as string);
    const staleDelivery = await queryOne(`
      select delivery_status from public.line_inbox_messages
      where request_id = '11111111-1111-4111-8111-111111111111'
    `);
    assert(
      staleDelivery.delivery_status === "uncertain",
      "stale pending deliveries become uncertain rather than blocking retries forever",
    );
    assert(
      inboxMigration.includes("interval '90 days'") &&
        inboxMigration.includes("line-inbox-messages-cleanup"),
      "inbox transcript cleanup must retain messages for 90 days",
    );
  } finally {
    await db.close();
  }
});
