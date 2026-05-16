# Markdown Word-Counter CLI

> **What this plan delivers**
> A small Node.js CLI (`bin/wc.js`) that counts words in a markdown file,
> ignoring fenced code blocks and HTML comments. Two phases: build the CLI,
> then add fixtures + verify.
>
> Driven by `supervisor.sh`; status persisted in `.supervisor-status.json`.

---

## Execution Rules (MANDATORY)

1. **Read this file AND `.supervisor-status.json` first** — skip every step listed in `completed_steps`.
2. **Use TodoWrite** for the steps you intend to work on this iteration.
3. **One step at a time** — run the step's **Verify** block BEFORE marking it complete.
4. **Never skip a failing step.** Fix the root cause or set `blocked: true` in the status file with a real reason.
5. **At end of iteration**, overwrite `.supervisor-status.json` per the schema at the bottom of this file.
6. Pure Node — no npm dependencies. Use only built-in modules (`fs`, `path`, `process`).

---

## Phase A — Build the CLI

### A.1 — Project skeleton
**Why:** Give the CLI a stable home and an executable entrypoint before writing logic.
**Action:**
1. Create `package.json` with `"type": "module"` and a `bin` entry mapping `wc` to `bin/wc.js`.
2. Create `bin/wc.js` with a shebang (`#!/usr/bin/env node`) and a placeholder that prints `usage: wc <file.md>` to stderr and exits 1 when called with no args.
3. `chmod +x bin/wc.js`.

**Verify:**
```bash
test -f package.json && echo PASS
test -x bin/wc.js && echo PASS
node bin/wc.js 2>&1 | grep -q "usage: wc" && echo PASS
```

---

### A.2 — Read the file and produce a raw token count
**Why:** Get end-to-end I/O working before adding the markdown-aware filtering.
**Action:**
1. In `bin/wc.js`, parse `process.argv[2]` as a file path. Exit 1 if the file doesn't exist (`fs.existsSync`).
2. Read the file with `fs.readFileSync(path, 'utf8')`.
3. Split on whitespace (`/\s+/`), drop empty tokens, print the count followed by a newline.

**Verify:**
```bash
printf "one two three\nfour five\n" > /tmp/wc-fix.md
node bin/wc.js /tmp/wc-fix.md
# Expected output: 5
[[ "$(node bin/wc.js /tmp/wc-fix.md)" == "5" ]] && echo PASS
```

---

### A.3 — Strip fenced code blocks and HTML comments
**Why:** A "word count" of a markdown file should describe the prose, not noise from code samples or `<!-- TODO -->` markers.
**Action:**
1. Before splitting, remove fenced code blocks: replace `/```[\s\S]*?```/g` with empty string.
2. Remove HTML comments: replace `/<!--[\s\S]*?-->/g` with empty string.
3. Keep the splitting/count logic from A.2 unchanged.

**Verify:**
````bash
cat > /tmp/wc-fix2.md <<'EOF'
hello world
<!-- ignore me -->
more text
```
ignored code
```
final words
EOF
node bin/wc.js /tmp/wc-fix2.md
# Expected: 5  (hello world more text final words)
[[ "$(node bin/wc.js /tmp/wc-fix2.md)" == "5" ]] && echo PASS
````

---

## Phase B — Fixtures + Verification

### B.1 — Add a fixture and a README
**Why:** Lock in expected behavior with a checked-in sample and document how to use the CLI.
**Action:**
1. Create `fixtures/sample.md` with at least: one paragraph of prose, one fenced code block, one HTML comment. Aim for a known prose word count (write it down in step B.2's Verify).
2. Create `README.md` with: install (`npm link` or absolute path), one usage example, one sentence on what gets ignored (code blocks, HTML comments).

**Verify:**
```bash
test -f fixtures/sample.md && echo PASS
test -f README.md && echo PASS
grep -q "code blocks" README.md && echo PASS
```

---

### B.2 — End-to-end check
**Why:** Prove the whole pipeline works on a real fixture, not just synthetic strings.
**Action:**
1. Count the prose words in `fixtures/sample.md` by hand and record the expected number in this step's Verify block.
2. Run the CLI and assert it matches.

**Verify:**
```bash
# Replace <N> with the hand-counted expected number from your fixture.
expected=<N>
actual=$(node bin/wc.js fixtures/sample.md)
[[ "$actual" == "$expected" ]] && echo "PASS ($actual)" || { echo "FAIL: expected $expected got $actual"; exit 1; }
```

---

## Done When

- [ ] `.supervisor-status.json` has `complete: true`
- [ ] `bin/wc.js` is executable and handles a missing-file argument gracefully
- [ ] `fixtures/sample.md` exists with prose, a code block, and an HTML comment
- [ ] B.2's end-to-end check passes
- [ ] `README.md` exists and documents what the CLI ignores

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

Step labels: `A.1`, `A.2`, `A.3`, `B.1`, `B.2`. Keep `completed_steps` cumulative across iterations.

---

## If Blocked

Set `blocked: true` and explain in `notes`. Legitimate blockers:
- Node not installed on PATH (need user to install Node 18+).

NOT blockers (work through them):
- "Not sure what the expected count in B.2 should be" → write a fixture you control and count it.
- "The regex feels fragile" → it's a small fixture; ship the simplest thing that passes B.2's Verify.

---

## Summary

| Phase | Steps | Theme |
|---|---:|---|
| A. Build the CLI | 3 | Project skeleton → I/O → markdown-aware filtering |
| B. Fixtures + verification | 2 | Lock in behavior with a real sample + README |
| **Total** | **5** | |
