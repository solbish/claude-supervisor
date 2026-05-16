# Prompt: draft a PLAN.md for `claude-supervisor`

Paste this whole document into a Claude Code session, then replace
`<TASK DESCRIPTION>` with what you want done. Claude will draft a `PLAN.md`
that `supervisor.sh` can drive end-to-end.

---

You are drafting a `PLAN.md` for the `claude-supervisor` loop. The loop will
re-invoke Claude Code repeatedly with the plan + a JSON status file until the
plan reports `complete: true`. Your job is to produce a plan that survives
that loop: stable step labels, concrete verify commands, no hand-waving.

## Task description

<TASK DESCRIPTION — what should be built or done. Be specific about deliverables,
constraints, target files, and any external systems involved.>

## Required structure

Produce a single markdown file. Use exactly these headings, in this order:

```
# <Plan title — one short line>

## Execution Rules (MANDATORY)
## Phase A — <theme>
### A.1 — <step name>
### A.2 — <step name>
…
## Phase B — <theme>   (optional — only if scope warrants multiple phases)
### B.1 — <step name>
…
## Done When
## Status File Schema
## If Blocked
## Summary
```

### `## Execution Rules (MANDATORY)`

A numbered list of non-negotiables Claude must follow on every iteration.
Always include:

1. **Read this file AND `.supervisor-status.json` first** — skip every step
   listed in `completed_steps`.
2. **Use TodoWrite** for the steps you intend to work on this iteration.
3. **One step at a time** — run the listed Verify block BEFORE marking complete.
4. **Never skip a failing step.** Fix the root cause or set `blocked: true`
   in the status file with a real reason.
5. **At end of iteration**, overwrite `.supervisor-status.json` per the
   schema at the bottom of this file.

Add project-specific rules as needed (e.g. "Migrations require
`prisma migrate dev` then a rebuild", "All UI changes must pass the Playwright
validator").

### `### X.N — step name`

Every step MUST have three sub-fields, in this order:

- **Why:** one or two sentences. What problem this step solves or what user
  outcome it produces. Tells future-Claude whether to deviate or not.
- **Action:** numbered list of concrete moves. File paths, function names,
  CLI commands. Avoid "consider…" or "maybe…" — pick a path.
- **Verify:** a fenced bash block (or commands). The contract that decides
  whether this step is done. Each command should produce observable output
  that either passes or fails — `grep -q … && echo PASS`, `curl … | jq …`,
  `test -f …`, `npm run build 2>&1 | tail -3`, etc. Build success alone is
  not verification; assert the change is actually visible.

Optional sub-fields:

- **Playwright:** one-line description of what to click + assert, if the
  step has UI impact. The supervisor's `VALIDATE_CMD` is the gate, but the
  per-step note documents intent.
- **Ref:** filename of a screenshot, spec doc, or external link the step
  implements.

**Step labels MUST be short and stable** (`A.1`, `A.2`, … `B.1`, …). The
supervisor's `completed_steps` array uses these exact strings to decide
what's left. Don't rename them between iterations.

### `## Done When`

A markdown checklist Claude updates as it goes. Use `- [ ]` boxes, flipped
to `- [x]` as items complete. Example:

```
- [ ] `.supervisor-status.json` has `complete: true`
- [ ] `npm run build` exits 0
- [ ] All Phase A steps in `completed_steps`
- [ ] Validator passes
```

### `## Status File Schema`

Paste this verbatim so Claude has the schema right next to the plan:

```json
{
  "complete": false,
  "blocked": false,
  "completed_steps": [],
  "current_step": "A.1",
  "notes": "<one-line summary or blocker reason>"
}
```

Followed by: "Step labels: A.1–A.N, B.1–B.N, …. Keep `completed_steps`
cumulative across iterations."

### `## If Blocked`

Two lists:

- **Legitimate blockers** — missing credentials, ambiguous requirement that
  needs the user to pick a direction, destructive action that needs approval.
- **NOT blockers** — "TypeScript error in unrelated file" (fix it), "test is
  flaky" (diagnose it), "I'm unsure how the design looks" (re-read the ref).

This list is what saves you from Claude bailing early on something it
should've just powered through.

### `## Summary`

A small table. One row per phase, columns: phase, # steps, theme. Last row:
totals. This is for the human reading the plan, not for Claude.

## Style rules

- Write each step so it's executable cold by a fresh Claude with no
  conversation history. The plan is the only context.
- Concrete > clever. `grep -q "WindBar" src/components/Weathergram.tsx`
  beats "make sure WindBar is integrated".
- Verify commands should be _fast_ — under a few seconds where possible. The
  supervisor runs them every iteration.
- Don't include implementation hints that contradict the action steps. If
  you're unsure between two approaches, pick one in Action and note the
  alternative in a one-line "Considered:" comment.
- The plan is markdown only — no JSX, no template literals, no fenced
  code that contains backticks at the column-0 indentation of the file
  (it'll break the parse).

Once you have a draft, save it as `PLAN.md` in the project root and the user
will run `bash supervisor.sh PLAN.md` to kick off the loop.
