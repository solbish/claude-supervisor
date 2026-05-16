#!/usr/bin/env bash
# supervisor.sh — drive Claude Code through a multi-step plan until done.
#
# Usage:
#   supervisor.sh [PLAN_FILE]
#
# Defaults:
#   PLAN_FILE = PLAN.md
#
# Behavior:
#   - Reads PLAN_FILE and a sibling STATUS_FILE on every iteration.
#   - Re-invokes `claude --print` until STATUS_FILE reports {"complete": true}
#     or {"blocked": true, ...}.
#   - Caps iterations (MAX_ITERS, default 20) so a runaway loop can't burn
#     forever.
#   - If VALIDATE_CMD is set, runs it after Claude marks complete:true as a
#     final verification gate. A failing validator forces another iteration.
#
# Env vars:
#   STATUS_FILE    sibling status JSON file (default .supervisor-status.json)
#   MAX_ITERS      cap on Claude invocations (default 20)
#   VALIDATE_CMD   optional shell command run after each "complete:true".
#                  Non-zero exit forces another supervisor iteration.
#                  Example: VALIDATE_CMD="npx tsx examples/validate-ui.ts"
#
# Exit codes:
#   0  all plan steps completed (and VALIDATE_CMD passed, if set)
#   1  blocked (Claude wrote blocked:true to STATUS_FILE)
#   2  exhausted MAX_ITERS without completion
#   3  prerequisite missing (claude CLI, plan file, etc.)

set -euo pipefail

PLAN_FILE="${1:-PLAN.md}"
STATUS_FILE="${STATUS_FILE:-.supervisor-status.json}"
MAX_ITERS="${MAX_ITERS:-20}"
VALIDATE_CMD="${VALIDATE_CMD:-}"

# --- prerequisites ----------------------------------------------------------

if ! command -v claude >/dev/null 2>&1; then
  echo "error: 'claude' CLI not found in PATH" >&2
  exit 3
fi

if [[ ! -f "$PLAN_FILE" ]]; then
  echo "error: plan file not found: $PLAN_FILE" >&2
  exit 3
fi

# Seed status file if missing.
if [[ ! -f "$STATUS_FILE" ]]; then
  echo '{"complete": false, "blocked": false, "completed_steps": [], "notes": ""}' > "$STATUS_FILE"
fi

echo "supervisor: plan=$PLAN_FILE  status=$STATUS_FILE  max_iters=$MAX_ITERS"
[[ -n "$VALIDATE_CMD" ]] && echo "supervisor: validate=$VALIDATE_CMD"

# --- loop -------------------------------------------------------------------

for ((i = 1; i <= MAX_ITERS; i++)); do
  echo
  echo "──── iteration $i / $MAX_ITERS ────"

  claude --print \
    --permission-mode acceptEdits \
    --dangerously-skip-permissions "
Read $PLAN_FILE and $STATUS_FILE.

You are resuming a multi-step plan. The status file lists which steps are
already completed; do NOT redo them. Pick up from the first incomplete step
and execute it (or as many sequential steps as you can confidently finish
in this turn).

Rules:
  - Use TodoWrite to track the steps you work on this iteration.
  - Run each step's **Verify** commands BEFORE marking it complete. \"Compiles\"
    is not verification — the Verify block in the plan is the contract.
  - When this iteration ends, OVERWRITE $STATUS_FILE with valid JSON matching:
      {
        \"complete\": <true if every plan step is done, else false>,
        \"blocked\": <true if you cannot proceed without user input>,
        \"completed_steps\": [<short step labels (e.g. \"A.1\", \"B.2\") finished so far, cumulative>],
        \"current_step\": \"<label of step you just finished or are on>\",
        \"notes\": \"<one-line summary of this iteration, or blocker reason>\"
      }
  - If blocked, set blocked:true AND describe the blocker in notes. Do NOT
    invent missing information or fabricate values to push past the blocker.
"

  if [[ ! -f "$STATUS_FILE" ]]; then
    echo "error: claude did not write $STATUS_FILE this iteration" >&2
    exit 2
  fi

  # Parse status with jq if available, else fall back to grep.
  if command -v jq >/dev/null 2>&1; then
    complete=$(jq -r '.complete // false' "$STATUS_FILE")
    blocked=$(jq -r '.blocked  // false' "$STATUS_FILE")
    notes=$(jq -r '.notes // ""' "$STATUS_FILE")
  else
    complete=$(grep -o '"complete"[[:space:]]*:[[:space:]]*true' "$STATUS_FILE" >/dev/null && echo true || echo false)
    blocked=$(grep -o '"blocked"[[:space:]]*:[[:space:]]*true'  "$STATUS_FILE" >/dev/null && echo true || echo false)
    notes=$(grep -o '"notes"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATUS_FILE" | sed 's/.*"notes"[[:space:]]*:[[:space:]]*"\(.*\)"/\1/')
  fi

  echo "status: complete=$complete  blocked=$blocked"
  [[ -n "$notes" ]] && echo "notes:  $notes"

  if [[ "$blocked" == "true" ]]; then
    echo "supervisor: blocked — see $STATUS_FILE" >&2
    exit 1
  fi

  if [[ "$complete" == "true" ]]; then
    # Final validation gate (optional).
    if [[ -n "$VALIDATE_CMD" ]]; then
      echo "supervisor: running validator: $VALIDATE_CMD"
      if bash -c "$VALIDATE_CMD"; then
        echo "supervisor: ✅ plan complete and validator passed"
        exit 0
      else
        echo "supervisor: validator failed — forcing another iteration"
        # Flip status so the next iteration knows to fix it.
        if command -v jq >/dev/null 2>&1; then
          tmp=$(mktemp)
          jq --arg cmd "$VALIDATE_CMD" \
             '.complete = false | .notes = ("validator failed: " + $cmd + " — investigate output above")' \
            "$STATUS_FILE" > "$tmp" && mv "$tmp" "$STATUS_FILE"
        fi
        continue
      fi
    fi
    echo "supervisor: ✅ plan complete (no validator configured)"
    exit 0
  fi
done

echo "supervisor: exhausted $MAX_ITERS iterations without completion" >&2
exit 2
