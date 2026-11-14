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
      create function cron.schedule(text, text, text)
        returns bigint language sql as 'select 1::bigint';
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
    `);

    const migration = await Deno.readTextFile(
      new URL(
        "../supabase/migrations/20261021120000_line_webhook_idempotency.sql",
        import.meta.url,
      ),
    );
    await db.exec(migration);

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
  } finally {
    await db.close();
  }
});
