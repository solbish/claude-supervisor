<!--
  Paste this section into your project's CLAUDE.md (under any "Working with
  Claude Code" or "Conventions" heading). It tells Claude how to behave when
  driven by `claude-supervisor` through a multi-step plan file.

  Adjust the bracketed placeholders for your project (e.g. swap "Playwright"
  for "pytest" or "cargo test" if that's your verification stack).
-->

## Working on Multi-Step Plans

When the user points to a plan file (e.g. `PLAN.md`) or asks you to execute a
multi-step task — including when invoked headless by `claude-supervisor`:

### 1. Always Track With TodoWrite

Before starting any plan with more than two steps:

- Read the full plan file first.
- Read `.supervisor-status.json` (or whatever the plan declares) — skip every
  step listed in `completed_steps`. Never redo finished work.
- Break the remaining plan into a `TodoWrite` checklist — one todo per
  discrete, verifiable step from the plan.
- Mark a todo `completed` ONLY after the work is actually done and the step's
  Verify block has passed. Never batch completions.
- If a step turns out to be larger than expected, split it into sub-todos
  rather than silently expanding scope.

### 2. Don't Stop Mid-Plan

- Continue working until every todo is `completed` or genuinely blocked.
- A blocker = missing credential, ambiguous requirement that needs a human
  decision, destructive action needing confirmation. Surface the blocker
  explicitly by setting `blocked: true` in the status file with a real reason.
- "I think the rest is straightforward" is not a stopping point.
- Do not end an iteration with pending todos unless you have logged a real
  blocker or finished all the work you can confidently complete this turn.

### 3. Verify Before Marking Done

After each step:

- Code change → confirm the edit applied (Edit/Write would have errored
  otherwise; don't re-read just to check).
- Command → check exit status and relevant output.
- The plan's **Verify** block is the contract. Run it and read the output.
  "It compiles" or "types pass" is not verification on its own — the Verify
  block decides.
- Never mark a todo complete based on "should work" — only on observed
  evidence.

### 3a. UI / Feature Validation

Any change touching user-facing surfaces (UI pages, components, API
contracts, CLI output) MUST be validated with whatever tool the plan's Verify
section names. Examples:

- Web UI → Playwright smoke test against the dev server. "It rendered" means
  loaded the page, exercised the golden path, screenshotted, and confirmed
  no console errors.
- Backend API → `curl`/`httpie` the endpoint and assert the response shape.
- CLI → run the binary against a fixture and diff against expected output.

If the validation tool can't reach the system under test, say so explicitly
in the status `notes` — do not silently skip validation and mark the todo
complete.

### 4. Status Updates

When running under `claude-supervisor`:

- One short sentence per meaningful transition (finished a step, hit a snag,
  changing approach).
- No running commentary, no per-tool narration.
- At the end of each iteration, overwrite the status JSON file per the
  schema in the plan. This is the supervisor's only signal that work
  happened — without it the loop will think nothing changed.

### 5. Persistent Plan Files

The plan file is the source of truth for scope.

- Update it as steps are completed (check off `## Done When` items, add
  discovered subtasks if scope grows).
- Don't silently deviate — if you need to change the plan, edit the file
  and note why in a one-line comment near the change.
