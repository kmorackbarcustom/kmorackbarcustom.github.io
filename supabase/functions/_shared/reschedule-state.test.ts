import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  processRescheduleMessage,
  type RescheduleContext,
} from "./reschedule-state.ts";

const empty: RescheduleContext = {};

Deno.test("incident flow stores old/new dates and ignores Sumo as a factual field", () => {
  const start = processRescheduleMessage(empty, "ผมรบกวนขอเลื่อนคิวนะครับ");
  assertEquals(start?.extractedData.pending_action, "reschedule");
  assertEquals(start?.extractedData.required_fields, [
    "original_date",
    "requested_date",
  ]);

  const follow = processRescheduleMessage(
    start?.extractedData ?? {},
    "Sumo\nวันเสาร์ เลื่อนเป็น\nวันจันทร์ ครับ",
  );
  assertEquals(follow?.completed, {
    originalDate: "วันเสาร์",
    requestedDate: "วันจันทร์",
  });
  assertEquals(follow?.extractedData.pending_action, null);
  assertEquals(JSON.stringify(follow).includes("vehicle"), false);
  assertEquals(JSON.stringify(follow).includes("Sumo"), false);
});

Deno.test("single ambiguous date asks clarification", () => {
  const start = processRescheduleMessage(empty, "ขอเลื่อนคิวครับ")!;
  const follow = processRescheduleMessage(start.extractedData, "วันจันทร์")!;
  assertStringIncludes(follow.reply, "วันนัดเดิม หรือวันที่ต้องการเลื่อนไป");
  assertEquals(follow.extractedData.original_date, null);
  assertEquals(follow.extractedData.requested_date, null);
});
Deno.test("two-step flow fills one required field at a time", () => {
  const start = processRescheduleMessage(empty, "ขอเปลี่ยนวันนัดครับ")!;
  const oldDate = processRescheduleMessage(
    start.extractedData,
    "วันเดิมวันเสาร์ครับ",
  )!;
  assertEquals(oldDate.extractedData.original_date, "วันเสาร์");
  assertEquals(oldDate.extractedData.required_fields, ["requested_date"]);

  const newDate = processRescheduleMessage(oldDate.extractedData, "ขอวันจันทร์")!;
  assertEquals(newDate.completed, {
    originalDate: "วันเสาร์",
    requestedDate: "วันจันทร์",
  });
  assertEquals(newDate.extractedData.pending_action, null);
});

Deno.test("cancel clears reschedule state", () => {
  const active: RescheduleContext = {
    pending_action: "reschedule",
    required_fields: ["requested_date"],
    original_date: "วันเสาร์",
    requested_date: null,
  };
  const result = processRescheduleMessage(active, "ไม่เลื่อนแล้วครับ")!;
  assertEquals(result.nextState, "IDLE");
  assertEquals(result.extractedData, {
    pending_action: null,
    required_fields: [],
    original_date: null,
    requested_date: null,
  });
});
Deno.test("completed flow does not capture later ordinary messages", () => {
  const complete = processRescheduleMessage({
    pending_action: "reschedule",
    required_fields: [],
    original_date: "วันเสาร์",
    requested_date: null,
  }, "ขอเป็นวันจันทร์")!;
  assertEquals(complete.extractedData.pending_action, null);
  assertEquals(
    processRescheduleMessage(complete.extractedData, "รถเสร็จหรือยังครับ"),
    null,
  );
});

Deno.test("independent user contexts do not contaminate each other", () => {
  const userA = processRescheduleMessage(empty, "ขอเลื่อนคิวครับ")!;
  const userB: RescheduleContext = {};
  assertEquals(userA.extractedData.pending_action, "reschedule");
  assertEquals(processRescheduleMessage(userB, "วันจันทร์"), null);
});
