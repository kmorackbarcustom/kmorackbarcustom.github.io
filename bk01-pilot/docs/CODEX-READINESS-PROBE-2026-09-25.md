# CODEX READINESS + PROVENANCE RE-PROBE — Owner ruling 2026-09-25

Date: 2026-09-25 (Asia/Bangkok)
Authority: Owner ruling 2026-09-25 (this session), step 2
Executor: `agent-codex` · method: canonical Relay rail, read-only probe
Runtime touched: **NONE** (no skill, no config, no model_pins edit)
Result: **`STOP_CODEX_MODEL_PROVENANCE_MISMATCH`**

## 1. Live re-probe result (persisted evidence)

```text
executor_identity        = agent-codex
declared_agent_identity  = agent-codex
executor_registration    = codex-wrapper
execution_backend        = direct_external_process
transport_model          = none
version                  = codex-cli 0.156.1
executable               = D:\AI-Workspace\runtime\npm-global\npm\codex.cmd
wrapper                  = …/kanban-external-agent-dispatch/scripts/invoke-codex-worker.ps1
wrapper_sha256           = sha256:d106f2a78210c9384291e31dcad383bf34ea15b9c7dae4e48d813c0a614fe6a9

executable_health        = PASS   (codex-cli 0.156.1)
auth_readiness           = PASS   (method codex_login_status, detail text_authenticated)
invocation_probe         = PASS   (method codex_isolated_probe_session1, detail READY)
provenance_session       = 1
session_route_code       = CODEX_SESSION_1_SELECTED
executor_ready           = true
EXECUTOR_READY           = PASS
```

Windows Session-1 route is confirmed by the probe itself: `provenance_session=1` and
`session_route_code=CODEX_SESSION_1_SELECTED`, which is the admissibility condition the Relay
contract requires on Windows (Session 0 is the measured unsupported boundary).

Items required by the Owner that are **SATISFIED**: executable readiness ✔ · auth readiness ✔ ·
session route = Session-1 ✔ · evidence persisted (this file) ✔.

## 2. The item that CANNOT be satisfied — exact effective model

Owner requirement: *"model ต้องตรง authorized pin `gpt-5.6-luna`; ถ้าพิสูจน์ provenance ไม่ได้ ให้ STOP ห้าม assume"*.

**Measured effective pin on this host is `gpt-6-luna`, not `gpt-5.6-luna`.** Two independent measurements:

### (a) The canonical pin matrix the wrapper enforces

```text
model_pins.py  PIN_CODEX = {"provider": "openai", "model": "gpt-6-luna", "reasoning_effort": "medium"}
               (module header: "Source of authority: …S4-IMPLEMENTATION-CONTRACT.md",
                "Owner ruling: an explicit provider + model pin is required … no fallback branch")

SKILL.md:19    "Codex is pinned by Relay to `openai / gpt-6-luna / reasoning_effort=medium`."
SKILL.md:403   "The canonical Codex pin is `openai / gpt-6-luna / reasoning_effort=medium`;
                wrappers must read and enforce PIN_CODEX … Any mismatch blocks the dispatch."

grep -rn "gpt-5.6-luna" <Relay skill runtime>   -> 0 matches
```

### (b) Actual invocation of the AUTHORIZED pin is REFUSED (the decisive test)

The Owner's authorized pin was passed to the canonical wrapper in an isolated context:

```text
powershell -File invoke-codex-worker.ps1 -PromptFile <b1 prompt> \
  -Workdir <kmo worktree> -Model "gpt-5.6-luna" -ReasoningEffort medium -ContextMode isolated
```

Observed:

```text
CODEX_PIN_MISMATCH: expected model=gpt-6-luna reasoning_effort=medium;
                    observed model=gpt-5.6-luna reasoning_effort=medium
  at invoke-codex-worker.ps1:39
```

So the authorized pin `gpt-5.6-luna` **cannot be obtained through the canonical rail**. The wrapper
reads `PIN_CODEX` from `model_pins.py` and refuses any other value. There is no override and no fallback
by design.

### (c) Both models are live-capable — so this is a PIN/DECLARATION conflict, not a model outage

Direct read-only probes, same host, same workdir:

```text
gpt-5.6-luna   rc=0   "READY"  … model: gpt-5.6-luna | provider: openai | reasoning effort: medium
gpt-6-luna     rc=0   "READY"  … model: gpt-6-luna   | provider: openai | reasoning effort: medium
```

Both work. The blocker is purely that the **reviewed canonical runtime pins `gpt-6-luna`** while the
**brief/plan/Manifest pin, and the Owner's ruling, say `gpt-5.6-luna`**.

## 3. Why this stops rather than proceeds

This is a genuine Source-of-Truth conflict between two authority-bearing documents:

| Source | Pin |
|---|---|
| Owner ruling 2026-09-25 (step 2) | `gpt-5.6-luna` |
| Run Manifest `codex_model_pin` | `gpt-5.6-luna` |
| Brief / Plan | `gpt-5.6-luna` |
| Workflow registry `c8f41ac` | `gpt-5.6-luna` |
| **Installed reviewed Relay runtime `v2.5.5` (canonical, enforced)** | **`gpt-6-luna`** |

The Run Manifest already recorded this exact divergence at activation (2026-09-24), in the section
*"Model-pin divergence recorded (not repaired here)"*, with the same conclusion: both models are live,
the installed runtime enforces `gpt-6-luna`, and *"this Task must not repair global Codex configuration,
so the divergence is recorded as provenance and is not resolved by this run."*

Resolving it inside KMO would require editing `model_pins.py` — a protected Relay runtime file — which is
explicitly forbidden here: the Owner's step 3 says the Claude non-BUILD rail must be handled as
**separate Relay/runtime hardening work later, not during this KMO D1A run**, and the brief forbids
global model routing / executor-config edits from this task.

Per the Owner's own instruction — *"ถ้าพิสูจน์ provenance ไม่ได้ ให้ STOP ห้าม assume"* — this is a STOP,
not an assumption. **No Codex B1 review is claimed, and none was run.**

## 4. Bounded options for a ruling (none taken)

| Option | Effect | Cost / risk |
|---|---|---|
| **A. Authorize `gpt-6-luna` for this run** | Unblocks the Codex B1 review immediately on the installed reviewed runtime; `gpt-6-luna` is the canonical enforced pin and is live-proven | Changes the pin value for this run only; must be recorded as a second bounded deviation (D-3) alongside D-1/D-2 |
| **B. Keep `gpt-5.6-luna` and repair `model_pins.py`** | Makes the authorized pin obtainable | Edits a protected Relay runtime file from inside a product run — forbidden by the brief and by the Owner's step 3 |
| **C. Keep `agent-claude` as reviewer** | Needs no pin change | Contradicts the Owner's step 3 override; the Claude rail is plan-only for non-BUILD and cannot write its report (already documented) |
| **D. Separate Relay/runtime hardening first** | Correct long-term home for both the Claude rail and the pin reconciliation | Defers B1 and therefore LR-03 again |

**Recommendation (not a decision):** **Option A** is the only path that produces a real independent B1
verdict without touching protected runtime from a product run. It is a one-line scope decision for the
Owner and changes nothing on disk.
