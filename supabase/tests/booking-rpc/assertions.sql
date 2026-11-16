\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS test_support;
CREATE OR REPLACE FUNCTION test_support.assert(ok boolean, message text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF NOT coalesce(ok, false) THEN RAISE EXCEPTION 'ASSERTION_FAILED: %', message; END IF; END $f$;
CREATE OR REPLACE FUNCTION test_support.expect_error(statement text, code text)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_state text; v_message text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    IF v_state = 'P0001' AND v_message = code THEN RETURN; END IF;
    RAISE EXCEPTION 'ASSERTION_FAILED: expected %, got %/%', code, v_state, v_message;
  END;
  RAISE EXCEPTION 'ASSERTION_FAILED: expected %, call succeeded', code;
END $f$;
