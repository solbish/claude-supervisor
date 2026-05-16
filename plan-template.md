# <Plan Title — one short line>

> **What this plan delivers**
> <One-paragraph summary. Why this work, what the end state looks like.>
>
> Driven by `supervisor.sh`; status persisted in `.supervisor-status.json`.

---

## Execution Rules (MANDATORY)

1. **Read this file AND `.supervisor-status.json` first** — skip every step listed in `completed_steps`.
2. **Use TodoWrite** for the steps you intend to work on this iteration.
3. **One step at a time** — run the step's **Verify** block BEFORE marking it complete.
4. **Never skip a failing step.** Fix the root cause or set `blocked: true` in the status file with a real reason in `notes`.
5. **At end of iteration**, overwrite `.supervisor-status.json` per the schema at the bottom of this file.
6. <Add project-specific rules here — e.g. "Migrations require `prisma migrate dev` then a rebuild", "All UI changes must pass the Playwright validator".>

---

## Phase A — <theme of phase A>

### A.1 — <short step name>
**Why:** <one or two sentences — what problem this solves>
**Action:**
1. <Concrete move 1 — file path, command, function name>
2. <Concrete move 2>
3. <Concrete move 3>

**Verify:**
```bash
<command that prints PASS or non-empty output if the step is done>
```

---

### A.2 — <short step name>
**Why:** <…>
**Action:**
1. <…>

**Verify:**
```bash
<…>
```

---

### A.3 — <short step name>
**Why:** <…>
**Action:**
1. <…>

**Verify:**
```bash
<…>
```

---

## Phase B — <theme of phase B>   *(optional — delete if scope is single-phase)*

### B.1 — <short step name>
**Why:** <…>
**Action:**
1. <…>

**Verify:**
```bash
<…>
```

**Playwright:** *(optional, when UI is touched)* <one-line description of what to click and assert>
**Ref:** *(optional)* <screenshot filename or spec link>

---

## Done When

- [ ] `.supervisor-status.json` has `complete: true`
- [ ] All Phase A steps in `completed_steps`
- [ ] <Project-specific success signal — e.g. `npm run build` exits 0, `pytest` green, validator passes>
- [ ] <Any docs/reports refreshed>

---

## Status File Schema (`.supervisor-status.json`)

```json
{
  "complete": false,
  "blocked": false,
  "completed_steps": [],
  "current_step": "A.1",
  "notes": "Starting from A.1"
}
```

Step labels: `A.1`–`A.N`, `B.1`–`B.N`, …. Keep `completed_steps` cumulative across iterations.

---

## If Blocked

Set `blocked: true` in the status file and explain in `notes`. Legitimate blockers:
- <Credential or API key missing — name it>
- <Architectural decision that needs the user to pick — name it>
- <Destructive action that needs approval>

NOT blockers (work through them):
- "TypeScript error in unrelated file" → fix it
- "Test is flaky" → diagnose it
- "I'm not sure how X should look" → re-read the ref, then make the call

---

## Summary

| Phase | Steps | Theme |
|---|---:|---|
| A. <theme> | <N> | <one-line theme> |
| B. <theme> | <N> | <one-line theme> |
| **Total** | **<N>** | |
