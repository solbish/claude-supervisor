# claude-supervisor

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A bash loop that drives [Claude Code](https://claude.com/claude-code) through a
markdown plan file until done, using a JSON status file as the handshake
between iterations. Drop it into any repo and run.

---

## Why

Long multi-step plans tend to drift when you babysit them by hand:

- Claude finishes some steps, you walk away, you come back and have to
  reconstruct what's done.
- Resumption is lossy — "where were we?" is its own task.
- Verification is the first thing to get skipped under fatigue.

`supervisor.sh` is the smallest piece of glue that makes this loop durable:
the plan is the contract, the status file is the cursor, and a final
`VALIDATE_CMD` gate refuses to call it done until your tests agree.

---

## Install

Quickest (single script, no clone):

```bash
curl -fsSL https://raw.githubusercontent.com/solbish/claude-supervisor/main/supervisor.sh -o supervisor.sh
chmod +x supervisor.sh
```

Or clone the full repo (you'll want this for `plan-template.md`, `claude-md-snippet.md`, and the examples):

```bash
git clone https://github.com/solbish/claude-supervisor.git
cd claude-supervisor
chmod +x supervisor.sh
```

Then symlink or copy `supervisor.sh` into the project you want to drive — or
just call it by absolute path.

**Prerequisites:**
- [`claude`](https://claude.com/claude-code) CLI installed and authenticated
  (`which claude` should resolve).
- `jq` is optional but recommended — without it the script falls back to a
  `grep`-based status parser that handles the schema fine but yields uglier
  error output.
- `bash` 4+ (macOS default is fine; `set -euo pipefail` and `((i++))` are the
  only modern constructs).

---

## Quickstart

1. **Write a plan file.** Three options:
   - Copy `plan-template.md` to your project as `PLAN.md` and fill in the
     `<…>` placeholders.
   - Read `examples/example-plan.md` for a worked end-to-end example.
   - Paste `PROMPT_FOR_PLAN_AUTHORING.md` into a fresh Claude Code session
     along with your task description and let it draft the plan for you.

2. **Tell your project's Claude how to behave.** Append the contents of
   `claude-md-snippet.md` to your project's `CLAUDE.md` (or create one). This
   gives Claude the multi-step plan conventions it needs to honor the loop —
   TodoWrite, verify-before-marking-done, treat the plan as the source of
   truth, and write the status file on every iteration.

3. **Run it.**
   ```bash
   bash supervisor.sh PLAN.md
   ```
   Add a validator if you have one:
   ```bash
   VALIDATE_CMD="npx tsx examples/validate-ui.ts" bash supervisor.sh PLAN.md
   ```

That's the whole thing. The loop runs until Claude reports `complete: true`
and (optionally) your `VALIDATE_CMD` exits zero.

---

## How it works

```
┌──────────────────────────────────────────────────────────┐
│  supervisor.sh                                           │
│                                                          │
│   read PLAN.md + .supervisor-status.json                 │
│           │                                              │
│           ▼                                              │
│   spawn `claude --print` ─────────► Claude reads plan,   │
│           │                          executes steps,     │
│           │                          writes status JSON  │
│           ▼                                              │
│   parse status:                                          │
│     • complete:true  → run VALIDATE_CMD (if set)         │
│         pass → exit 0                                    │
│         fail → mark incomplete, loop                     │
│     • blocked:true   → exit 1                            │
│     • else           → loop (until MAX_ITERS)            │
└──────────────────────────────────────────────────────────┘
```

The handshake between supervisor and Claude is just the JSON status file.
Claude is told (on every iteration) what shape to write; the supervisor
parses it and decides whether to call the loop done.

### Exit codes

| Code | Meaning |
|---:|---|
| 0 | All plan steps completed (and `VALIDATE_CMD` passed if set) |
| 1 | Claude wrote `blocked: true` — needs human input. See the `notes` field |
| 2 | Hit `MAX_ITERS` without completion. Inspect the status file and retry |
| 3 | Prerequisite missing (no `claude` in PATH, no plan file, etc.) |

---

## Status file schema

The supervisor seeds `.supervisor-status.json` on first run and Claude
overwrites it every iteration. Shape:

```json
{
  "complete": false,
  "blocked": false,
  "completed_steps": ["A.1", "A.2"],
  "current_step": "A.3",
  "notes": "Wired WindBar into Weathergram; build passes; A.3 next."
}
```

| Field | Type | Meaning |
|---|---|---|
| `complete` | bool | All plan steps finished. Triggers the validator gate, then exit 0 |
| `blocked` | bool | Cannot proceed without human input — supervisor exits 1 |
| `completed_steps` | string[] | Cumulative list of step labels (e.g. `"A.1"`) ever finished. Used to skip work on resume |
| `current_step` | string | Last step touched — diagnostic, not load-bearing |
| `notes` | string | One-line summary of the iteration, or the blocker reason |

The step labels are whatever your plan file uses. The example/template both
use `A.1`, `A.2`, …, `B.1`, … — short and stable. Keep them stable: Claude
diffs `completed_steps` against the plan to decide what's left.

---

## Customizing

All knobs are env vars:

| Var | Default | Purpose |
|---|---|---|
| `STATUS_FILE` | `.supervisor-status.json` | Where the status JSON lives. Useful if you run multiple supervised plans side-by-side |
| `MAX_ITERS` | `20` | Hard cap on Claude invocations. Each iteration costs API tokens — tune to your plan size |
| `VALIDATE_CMD` | _(unset)_ | Shell command run after Claude marks complete. Non-zero exit forces another iteration |

The `VALIDATE_CMD` gate is the project-agnostic seam. Plug in whatever your
project's "are we actually done?" check is:

```bash
# Playwright smoke test against a running dev server:
VALIDATE_CMD="npx tsx examples/validate-ui.ts" bash supervisor.sh

# Python project — unit tests + lint:
VALIDATE_CMD="pytest -q && ruff check ." bash supervisor.sh

# Rust project — tests + clippy:
VALIDATE_CMD="cargo test && cargo clippy -- -D warnings" bash supervisor.sh

# Or skip it entirely and trust the per-step Verify blocks in the plan:
bash supervisor.sh
```

The validator runs in the supervisor's working directory; cd into the right
subdir from inside `VALIDATE_CMD` if needed.

---

## Limitations / honesty

- **The script uses `--dangerously-skip-permissions`.** Claude will write
  files, run shell commands, and install dependencies without prompting.
  Only run this in repos you trust and ideally inside a sandbox/container
  if you're nervous. The flag is what makes the loop unattended — without
  it you'd be approving every tool call by hand.
- **Each iteration costs tokens.** A 20-step plan with retries can chew
  through real money. Tighten `MAX_ITERS` and write small focused plans
  rather than 50-step monoliths.
- **It is not magic.** A vague plan produces vague results. The Verify
  blocks in the plan are doing most of the heavy lifting — sparse or
  hand-wavy Verify sections will let half-done work slip through.
- **No state beyond the status file.** If Claude rewrites a file the
  supervisor can't undo it. Run on a clean git working tree so you can
  always `git diff` / `git restore` to inspect or back out.

---

## Files in this repo

| File | What it is |
|---|---|
| `supervisor.sh` | The script. ~150 lines of bash. Project-agnostic |
| `plan-template.md` | Fill-in-the-blanks skeleton for a new plan |
| `examples/example-plan.md` | Worked example: build a Node markdown word-counter CLI |
| `examples/validate-ui.ts` | Optional Playwright smoke validator (genericized) |
| `PROMPT_FOR_PLAN_AUTHORING.md` | Paste-into-Claude prompt to draft a plan from a task description |
| `claude-md-snippet.md` | Drop-in fragment for your project's `CLAUDE.md` |
| `LICENSE` | MIT license |

---

## License

MIT — see [`LICENSE`](LICENSE).
