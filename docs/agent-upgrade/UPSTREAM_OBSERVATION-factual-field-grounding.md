# Upstream Observation — Factual field grounding in generic LINE AI conversations

**Date:** 2026-08-29
**Status:** UPSTREAM CANDIDATE ONLY
**Implementation status:** Not implemented in modules-hub

## Production observation

KMO production incident showed that a generic conversational agent can assign the wrong semantic meaning to ambiguous customer text when authoritative business fields are not available in tool context. In the observed case, `Sumo` was a real `customer_name`, while the real vehicle was `Suzuki V Strom 800 de`, but the model answered as if `Sumo` were the vehicle model.

The incident also confirmed that factual correctness cannot rely on free-text inference alone. Even when the source database is correct, a tool that exposes only partial order fields leaves the model without enough business truth to ground its answer.

## Candidate upstream concepts

A future generic LINE AI module should consider these reusable concepts:

- **Authoritative business facts:** factual customer/order fields should come from trusted business data sources.
- **Explicit semantic field labels:** tool output should preserve field meaning such as customer name, vehicle, work items, status, and dates.
- **Ambiguous-text non-inference:** isolated words or unclear phrases should not be promoted into factual fields without explicit meaning.
- **Optional validation hooks:** future integrations may add response/output validation for high-risk factual fields.

## Boundary

This observation records a reusable design lesson only. It does not authorize changes to `modules-hub`, migrations, schemas, write paths, or rollout behavior. Any upstream implementation requires a separate review and brief.
## Phase 2 observation — structured follow-up state

The same incident also showed a second reusable failure mode: follow-up messages become unsafe when the agent must infer what field it is currently waiting for from free-form chat history alone. A generic LINE agent should consider a typed pending-action contract for multi-turn business requests instead of relying only on LLM memory.

Candidate reusable concepts:

- **Typed pending action:** persist the active business action, such as `reschedule`.
- **Required-fields state:** explicitly record which slots are still missing.
- **Follow-up slot resolution:** interpret the next message against the known missing field(s), not arbitrary factual fields.
- **Ambiguous-input clarification:** when one value could map to more than one missing field, ask instead of guessing.
- **State cleanup:** clear pending action and slot values on completion or cancellation so later messages are not captured by stale state.

**Status:** UPSTREAM CANDIDATE ONLY
**Implementation status:** Not implemented in modules-hub
