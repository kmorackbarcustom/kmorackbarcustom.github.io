import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  IMAGE_READ_FALLBACK,
  type ImageFlowDeps,
  isLikelyPaymentProof,
  isSupportedLineImageProvider,
  processImageConversation,
  shouldHandleImage,
} from "./line-image-flow.ts";
import type { VisionObservation } from "./vision.ts";

const observation: VisionObservation = {
  summary: "เห็นมอเตอร์ไซค์กับแร็คท้าย",
  visible_text: [],
  vehicle_or_part_hints: [{ label: "rear rack", confidence: "medium" }],
  notable_details: [],
  uncertainties: ["ไม่ทราบรุ่นแน่ชัด"],
};

Deno.test("image eligibility respects source, main rollout, image rollout, owner and pause", () => {
  const base = {
    sourceType: "user",
    mainRollout: "all",
    imageRollout: "all",
    isOwner: false,
    isPaused: false,
  };
  assertEquals(shouldHandleImage(base), true);
  assertEquals(shouldHandleImage({ ...base, sourceType: "group" }), false);
  assertEquals(shouldHandleImage({ ...base, mainRollout: "off" }), false);
  assertEquals(shouldHandleImage({ ...base, imageRollout: "off" }), false);
  assertEquals(
    shouldHandleImage({ ...base, imageRollout: "owner_only" }),
    false,
  );
  assertEquals(
    shouldHandleImage({ ...base, imageRollout: "owner_only", isOwner: true }),
    true,
  );
  assertEquals(shouldHandleImage({ ...base, isPaused: true }), false);
});

Deno.test("external image provider is fail-closed", () => {
  assertEquals(isSupportedLineImageProvider(undefined), true);
  assertEquals(isSupportedLineImageProvider("line"), true);
  assertEquals(isSupportedLineImageProvider("external"), false);
});
function makeDeps(overrides: Partial<ImageFlowDeps> = {}) {
  const persisted: Array<{ role: string; content: string; timestamp: number }> =
    [];
  let pushed = 0;
  let notified = 0;
  let agentHistory: Array<{ role: string; content: string }> = [];
  const deps: ImageFlowDeps = {
    sessions: {
      getSession: async () => ({
        history: [{ role: "user", content: "รุ่นนี้ทำได้ไหม", timestamp: 1 }],
      }),
      appendHistory: async (_userId, message) => {
        persisted.push(message);
      },
    },
    downloadImage: async () => ({
      bytes: new Uint8Array([0xff, 0xd8, 0xff]),
      mimeType: "image/jpeg",
      byteLength: 3,
    }),
    analyzeImage: async () => observation,
    formatObservation: () => "[IMAGE_OBSERVATION] safe structured observation",
    generateReply: async ({ history }) => {
      agentHistory = history;
      return "ต้องเช็กรุ่นจากข้อมูลสินค้าก่อนครับ";
    },
    sendReply: async () => true,
    sendPush: async () => {
      pushed++;
      return true;
    },
    notifyImageFailure: async () => {
      notified++;
    },
    ...overrides,
  };
  return {
    deps,
    persisted,
    getPushed: () => pushed,
    getNotified: () => notified,
    getAgentHistory: () => agentHistory,
  };
}

Deno.test("valid image persists synthetic observation and reply, using prior history only for agent", async () => {
  const t = makeDeps();
  const result = await processImageConversation(t.deps, {
    userId: "U1",
    messageId: "M1",
    replyToken: "R1",
  });
  assertEquals(result.visionSuccess, true);
  assertEquals(result.replied, true);
  assertEquals(result.pushed, false);
  assertEquals(t.persisted.map((x) => x.role), ["user", "assistant"]);
  assert(t.persisted[0].content.startsWith("[IMAGE_OBSERVATION]"));
  assertEquals(t.persisted.some((x) => x.content.includes("base64")), false);
  assertEquals(t.getAgentHistory(), [{ role: "user", content: "รุ่นนี้ทำได้ไหม" }]);
});
Deno.test("reply failure pushes the same answer", async () => {
  const t = makeDeps({ sendReply: async () => false });
  const result = await processImageConversation(t.deps, {
    userId: "U1",
    messageId: "M1",
    replyToken: "R1",
  });
  assertEquals(result.replied, false);
  assertEquals(result.pushed, true);
  assertEquals(t.getPushed(), 1);
});

Deno.test("vision failure returns safe fallback, notifies staff and persists no raw image", async () => {
  const t = makeDeps({
    analyzeImage: async () => {
      throw new Error("vision exploded data:image/jpeg;base64,SECRET");
    },
  });
  const result = await processImageConversation(t.deps, {
    userId: "U1",
    messageId: "M1",
    replyToken: "R1",
  });
  assertEquals(result.visionSuccess, false);
  assertEquals(result.reply, IMAGE_READ_FALLBACK);
  assertEquals(t.getNotified(), 1);
  assertEquals(t.persisted.map((x) => x.role), ["user", "assistant"]);
  assertEquals(t.persisted.some((x) => x.content.includes("SECRET")), false);
});

Deno.test("payment proof detector recognizes bank slip observations", () => {
  assertEquals(isLikelyPaymentProof({ ...observation, summary: "โอนเงินสำเร็จ", visible_text: ["K+", "จำนวน 500.00 บาท"] }), true);
  assertEquals(isLikelyPaymentProof(observation), false);
});

Deno.test("payment proof notifies staff immediately after vision success", async () => {
  let paymentNotified = 0;
  const t = makeDeps({
    analyzeImage: async () => ({ ...observation, summary: "โอนเงินสำเร็จ", visible_text: ["K+", "จำนวน 500.00 บาท"] }),
    notifyPaymentProof: async () => { paymentNotified++; },
  });
  const result = await processImageConversation(t.deps, { userId: "U1", messageId: "SLIP1", replyToken: "R1" });
  assertEquals(result.visionSuccess, true);
  assertEquals(paymentNotified, 1);
});

Deno.test("ordinary image does not notify payment review", async () => {
  let paymentNotified = 0;
  const t = makeDeps({ notifyPaymentProof: async () => { paymentNotified++; } });
  await processImageConversation(t.deps, { userId: "U1", messageId: "M1", replyToken: "R1" });
  assertEquals(paymentNotified, 0);
});
