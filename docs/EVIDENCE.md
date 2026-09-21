# Evidence

Navid, 2026-09-21: "diffs are diffs. they are not evidence. evidence shows me that the change was completed in the product."

Evidence shows the change working in the running product. Verification shows that the checks agree with the change. Trellis needs both. Trellis must not count one as the other.

This document is the design. The part of it that ships today is the "Evidence owed" text of the agent brief. Every other part waits on a decision below.

## Decisions for Navid

Each decision holds one recommendation. Answer with the number and yes or no.

**1. Split the records into proof and verification.** The floor counts only the records of the running product. The `verify`, `test` and `equivalence` records stay in the store and move to the checks region of the Facts tab. Recommendation: yes. Today a backend pull request meets the whole floor with a typecheck and a test count. Pull request 242 (TRL-263) carries four records: two screenshots and two `verify` records, `bun run typecheck` exit 0 and `bun test apps/web/src/features/reviews` exit 0. Pull request 224 (TRL-240) carries six records and not one of them touched the product.

**2. Add the `call` record.** It holds the method, the path, the request body, the status code, the response body, and the address of the server that answered. An API change owes one call that works and one call that fails. Recommendation: yes. No record today holds a request and a response. This is the gap that made a typecheck look like evidence.

**3. Add the `run` record.** It holds the command line, the exit code and the terminal output of a command that drives the product, and the server that it drove. A CLI change and a background job each owe one. Recommendation: yes. The `run` record has the same shape as the `verify` record. The difference is the thing the command drove, and that difference is the whole point of this ticket.

**4. Add the `docs` pull request kind.** A change of Markdown alone owes the summary and nothing else. Recommendation: yes. Today `prPaths` reads a docs change as backend, so it owes a verify record, a test proof and a contract table for a file that no program reads.

**5. What a refactor with no change of behaviour owes.** One product record at the head, plus the `equivalence` record. No before image and no before call, because the product does not change. Recommendation: yes, one product record and never none. A refactor that breaks the screen is the failure this record catches.

**6. When a clip is owed.** Keep the clip conditional: motion, a gesture, scroll, a timed action, or a task of more than one step. Recommendation: keep it conditional. No pull request from TRL-224 to TRL-263 carries one clip. A blanket rule would add 15 seconds of a still page to every review.

**7. The words that replace the count.** "0 of 5 evidence" becomes one of four sentences: "no proof yet", "needs the after image and the console list", "needs the after image, the console list and 3 more", and "proof complete". Recommendation: yes, these four forms, on the epic row, on the ticket card and on the Facts tab.

**8. The Facts tab shows the thing, not the name of the thing.** The before image and the after image sit side by side at full width. The clip plays in the page. Each call draws as a request block over a response block. Verification folds shut under them. Recommendation: yes.

**9. How the stored records map.** No record changes its kind. No record is deleted. The floor stops counting three kinds, so every merged pull request keeps its history and reads the same. Recommendation: yes.

## The rule

A record is proof when a person can read it and see the product do the thing.

| Proof | Verification |
| --- | --- |
| An image of the route that the change draws | A test count |
| A clip of the route that the change animates | A typecheck result |
| A request and the response that the server gave | A lint result |
| The terminal output of the real command | A diff |
| The state that a job left, read back | A pull request |

Verification stays important. A pull request that breaks the tests does not merge. Verification answers "did the checks agree". Evidence answers "did the product do it". The Facts tab holds both, in two regions, and the floor counts only the first.

## What each kind of change owes

| Kind of change | Product proof | Verification |
| --- | --- | --- |
| UI | The before image, the after image, the capture record, the console list. A clip under the clip rule. | A verify record for each Verify command. A test proof for each new test. |
| API | One `call` that works and one `call` that fails, both against a server that runs this branch. | The same. |
| CLI | One `run` of the real command against a local server, with its full output. | The same. |
| Background job | One `run` that fires the job. One `call` or `run` that reads the state the job left. | The same. |
| Migration | The migration plan. One `call` or `run` that reads the changed data on a database that ran the migration. | The same. |
| Refactor, no change of behaviour | One product record at the head. The `equivalence` record. | The same. |
| Docs | Nothing. | Nothing. |

A pull request of the kind `mixed` owes the UI row and the row of the service it changes.

## The records

These records prove the product. The floor counts them.

```text
before after capture clip console call run migration
```

These records verify the change. The checks region shows them. The floor does not count them.

```text
verify test equivalence
```

The `picture` record explains the change. It never proves it. One picture, and one only, and always optional.

The `contract` record holds the API contract before and after the change as text. Once the `call` record lands, the two calls hold the same fact as real responses, and the `contract` record becomes the fallback for a contract that no call can show.

Until decisions 2 and 3 land, an agent sends a call as a `verify` record whose command is the curl command or the trellis command, and puts the status and the response body in the tail. This is what the brief tells an agent to do today.

## What the brief says

`apps/server/src/services/brief/evidenceOwedLines.ts` writes the "Evidence owed" section of every agent brief. This is the text for a backend contract.

```text
## Evidence owed

Evidence shows this change working in the running product.
A diff, a test count, a typecheck and a lint run are verification. They are not evidence.
Send every record that the list names. Send the proof of the running product with them.

- Kind: backend
- summary: trellis summary write <pr> --headline "..." --why - --watch "..."
- verify record: trellis evidence add <pr> --kind verify --cmd "<command>" --exit <code> --sha <head> --tail -
- test proof: trellis evidence add <pr> --kind test --name <test> --fails-on <base> --passes-on <head>
- contract table: trellis evidence add <pr> --kind contract --before "<before>" --after "<after>"

Prove the service:

1. Start a server on this branch, on its own port and its own data home.
2. Call the change on that server with curl or with the trellis CLI. Call the error case as well.
3. Send each call as a verify record. The command is the curl command or the trellis command. A test command does not prove the product.
4. Put the status and the response body in the tail of that record.
5. Put the response of the merge base and the response of the head in the contract record.
6. Read the full recipe in docs/EVIDENCE.md.

Check the floor before you hand over: trellis evidence check <pr>
```

A frontend contract gets the same three sentences, the same item list for its own floor, and this block in place of the service block.

```text
Prove the screen:

1. Start a server on this branch. Start a second server on the merge base. Give each server its own port and its own data home.
2. Run the same seed command against both servers.
3. Capture the same route on both servers in Aside, at 1440x900, in the dark theme, with the animations off.
4. Add a clip when the change touches motion, a gesture, scroll, a timed action, or a task of more than one step. Keep the clip to 15 seconds or less.
5. Send the clip: trellis evidence add <pr> --kind clip --file <path> --route <route> --caption "..."
6. Read the full recipe in docs/EVIDENCE.md.
```

A mixed contract gets both blocks, the screen block first. A contract that names no file gets the three sentences and one line that says the floor is unknown.

Every item of the list carries the one command that submits it. The command comes from `evidenceFillCommands` in `packages/api/src/evidenceFloor/evidenceFloor.ts`, so the brief, `trellis evidence check` and the review page print the same command.

## What the person sees

### The Facts tab of the review sheet

The evidence region draws three parts in this order.

1. **The proof.** The before image and the after image side by side, each with its route and its viewport under it. A click opens the full file. The clip plays in the page. Each call draws as two blocks: the request with its method, its path and its body, then the response with its status and its body. The call that works comes first. The call that fails comes second.
2. **What is missing.** One sentence in the four forms of decision 7, with the fill command under each missing item.
3. **Verification.** One line for each verify record, test proof and equivalence record. The region folds shut. A click opens it.

### The ticket page

Each pull request card shows the newest after image as a thumbnail, the clip under it when there is one, and the missing sentence. No count.

### The epic row

The row prints one of the four sentences of decision 7 in place of "evidence 2 of 5". The sentence names at most two items and then says "and N more".

## What this pull request ships

1. The "Evidence owed" text of the brief, in `evidenceOwedLines.ts`, with its tests.
2. The export of `evidenceFillCommands`, so the brief prints the same command as the check.

Nothing else changes. The floor, the record kinds, the CLI and the pages wait on the decisions above.

## Recipe: a service

Use this recipe for a change that renders no screen. It uses one scratch server on this branch.

### 1. Start the server

```sh
set -e
EVIDENCE_RUN='trl-265-service'
EVIDENCE_API_PORT=4571
EVIDENCE_HOME="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-home"
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
! lsof -nP -iTCP:"$EVIDENCE_API_PORT" -sTCP:LISTEN
mkdir -p "$EVIDENCE_HOME" "$EVIDENCE_OUTPUT_DIR"
cd "$(git rev-parse --show-toplevel)/apps/server"
bun run build:harnesses
nohup env -u TRELLIS_AUTH_TOKEN TRELLIS_HOME="$EVIDENCE_HOME" TRELLIS_PORT="$EVIDENCE_API_PORT" bun src/index.ts </dev/null >"$EVIDENCE_HOME/api.log" 2>&1 &
printf '%s\n' "$!" >"$EVIDENCE_HOME/api.pid"
for EVIDENCE_TRY in {1..100}; do nc -z 127.0.0.1 "$EVIDENCE_API_PORT" && break; sleep 0.1; done
nc -z 127.0.0.1 "$EVIDENCE_API_PORT"
```

### 2. Call the change

Save the request body, the status and the response body. The status goes in its own file, because `curl` writes the body to the output file.

```sh
set -e
EVIDENCE_RUN='trl-265-service'
EVIDENCE_API_PORT=4571
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
EVIDENCE_METHOD='POST'
EVIDENCE_PATH='/api/tickets'
EVIDENCE_BODY='{"project":"EVD","title":"First"}'
printf '%s\n' "$EVIDENCE_BODY" >"$EVIDENCE_OUTPUT_DIR/request.json"
curl -sS -o "$EVIDENCE_OUTPUT_DIR/response.json" -w '%{http_code}\n' \
  -X "$EVIDENCE_METHOD" "http://127.0.0.1:$EVIDENCE_API_PORT$EVIDENCE_PATH" \
  -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' \
  -d "$EVIDENCE_BODY" >"$EVIDENCE_OUTPUT_DIR/status.txt"
cat "$EVIDENCE_OUTPUT_DIR/status.txt" "$EVIDENCE_OUTPUT_DIR/response.json"
```

### 3. Call the error case

Send the same call with the input that the change refuses. Save it under a second name.

```sh
set -e
EVIDENCE_RUN='trl-265-service'
EVIDENCE_API_PORT=4571
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
EVIDENCE_BAD_BODY='{"project":"EVD"}'
printf '%s\n' "$EVIDENCE_BAD_BODY" >"$EVIDENCE_OUTPUT_DIR/error-request.json"
curl -sS -o "$EVIDENCE_OUTPUT_DIR/error-response.json" -w '%{http_code}\n' \
  -X POST "http://127.0.0.1:$EVIDENCE_API_PORT/api/tickets" \
  -H 'x-trellis-actor: agent:claude-code' -H 'Content-Type: application/json' \
  -d "$EVIDENCE_BAD_BODY" >"$EVIDENCE_OUTPUT_DIR/error-status.txt"
cat "$EVIDENCE_OUTPUT_DIR/error-status.txt" "$EVIDENCE_OUTPUT_DIR/error-response.json"
```

### 4. Register each call

One command for one call. The tail holds the status and the response body.

```sh
set -e
EVIDENCE_RUN='trl-265-service'
EVIDENCE_PR='0x962/trellis#244'
EVIDENCE_API_PORT=4571
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
EVIDENCE_HEAD_SHA="$(git rev-parse HEAD)"
export PATH="$(git rev-parse --show-toplevel)/node_modules/.bin:$PATH"
{ printf 'status %s\n\n' "$(cat "$EVIDENCE_OUTPUT_DIR/status.txt")"; cat "$EVIDENCE_OUTPUT_DIR/response.json"; } |
  trellis evidence add "$EVIDENCE_PR" --kind verify \
    --cmd "curl -X POST http://127.0.0.1:$EVIDENCE_API_PORT/api/tickets -d '$(cat "$EVIDENCE_OUTPUT_DIR/request.json")'" \
    --exit 0 --sha "$EVIDENCE_HEAD_SHA" --tail -
{ printf 'status %s\n\n' "$(cat "$EVIDENCE_OUTPUT_DIR/error-status.txt")"; cat "$EVIDENCE_OUTPUT_DIR/error-response.json"; } |
  trellis evidence add "$EVIDENCE_PR" --kind verify \
    --cmd "curl -X POST http://127.0.0.1:$EVIDENCE_API_PORT/api/tickets -d '$(cat "$EVIDENCE_OUTPUT_DIR/error-request.json")'" \
    --exit 0 --sha "$EVIDENCE_HEAD_SHA" --tail -
```

The response of the merge base and the response of the head go in the contract record. Only one text flag reads standard input, so read both files with `cat`.

```sh
set -e
EVIDENCE_RUN='trl-265-service'
EVIDENCE_PR='0x962/trellis#244'
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
export PATH="$(git rev-parse --show-toplevel)/node_modules/.bin:$PATH"
trellis evidence add "$EVIDENCE_PR" --kind contract \
  --before "$(cat "$EVIDENCE_OUTPUT_DIR/base-response.json")" \
  --after "$(cat "$EVIDENCE_OUTPUT_DIR/response.json")"
trellis evidence check "$EVIDENCE_PR"
```

### 5. Stop the server

```sh
set -e
EVIDENCE_RUN='trl-265-service'
EVIDENCE_HOME="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-home"
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
kill "$(cat "$EVIDENCE_HOME/api.pid")"
rm -r "$EVIDENCE_HOME" "$EVIDENCE_OUTPUT_DIR"
```

## Pull request kind

Trellis reads the changed paths and sets the kind. The agent does not set it.

| Kind | Rule |
| --- | --- |
| `frontend` | One or more changed files render a route. |
| `backend` | No changed file renders a route. |
| `mixed` | Some changed files render a route and some do not. |

In Trellis, `apps/web/**` and `packages/ui/**` render routes. A mixed pull request owes the frontend floor and the backend floor.

Run this command to see the kind, the floor, and each missing item:

```sh
trellis evidence check 0x962/trellis#174
```

## The floor today

This is the floor that the code applies now. Decision 1 changes it.

A frontend pull request always carries these five items:

1. A summary with the headline, the reason, and the file to review first.
2. An after image of each changed route at 1440x900 in the dark theme.
3. A before image of the same route from the merge base.
4. A capture record with both SHAs and all capture settings.
5. A console error list and a failed request list. An empty list is a result.

A backend pull request always carries these four items:

1. A summary.
2. A verify record for each command in the ticket contract.
3. Test proof for each new test, or a `test` record with `--none --reason`.
4. A contract table, or a `contract` record with `--none`.

A verify record contains the command, its exit code, its output tail, and the head SHA. Test proof names the test, the base SHA where it fails, and the head SHA where it passes.

Add a migration plan when a schema changes. State the phase, two-way compatibility, lock cost, backfill, and rollback.

Show the empty, loading, and error states when the change affects a screen that reads data. Add a 390 px capture and a light-theme capture when the change affects layout or color.

## Picture rule

A backend pull request carries at most one picture. Choose it from this table.

| Change | Picture |
| --- | --- |
| A new endpoint or field | A Mermaid sequence of calls |
| A new job, queue, timer, or signal receiver | A Mermaid sequence of calls |
| A state machine or status change | A Mermaid state diagram |
| An auth, permission, or tenancy change | A Mermaid data flow across the trust boundary |
| A schema or data change | A migration plan table |
| Performance work | A benchmark table against the base |
| A dependency upgrade | A table of behavior differences |
| A pure refactor | No picture. Add equivalence evidence. |

## Bounds

Three rules bound every evidence set.

1. Add one item for one question that the diff cannot answer quickly. Remove the item when the diff answers the question.
2. Give each item an anchor: a file and line, a check result, a test name, or a number with its SHA.
3. Add no more than one picture.

## Recipe: a screen

Use your assigned worktree for the head. Use a second worktree for the merge base. Give each worktree its own API port and web port.

Run each shell block as a separate command. Each block sets every shell variable that it uses.

The example uses pull request 174 and route `/_gallery`. Replace those two values in each applicable block for another pull request.

### 1. Set the capture values

Choose a unique run name and four free ports. Use an exact seed command that produces the same data in both homes.

```sh
set -e
EVIDENCE_HEAD_API_PORT=4561
EVIDENCE_HEAD_WEB_PORT=5201
EVIDENCE_BASE_API_PORT=4562
EVIDENCE_BASE_WEB_PORT=5202
! lsof -nP -iTCP:"$EVIDENCE_HEAD_API_PORT" -sTCP:LISTEN
! lsof -nP -iTCP:"$EVIDENCE_HEAD_WEB_PORT" -sTCP:LISTEN
! lsof -nP -iTCP:"$EVIDENCE_BASE_API_PORT" -sTCP:LISTEN
! lsof -nP -iTCP:"$EVIDENCE_BASE_WEB_PORT" -sTCP:LISTEN
```

If this block exits nonzero, choose a different port for the listener that it prints.

### 2. Prepare the head and base

Record the two SHAs before the first capture. Create the base worktree and all shared output under `$TMPDIR`.

```sh
set -e
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_HEAD_DIR="$(git rev-parse --show-toplevel)"
EVIDENCE_BASE_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-base"
EVIDENCE_HEAD_HOME="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-head-home"
EVIDENCE_BASE_HOME="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-base-home"
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
EVIDENCE_HEAD_SHA="$(git rev-parse HEAD)"
EVIDENCE_BASE_SHA="$(git merge-base origin/main HEAD)"
mkdir -p "$EVIDENCE_HEAD_HOME" "$EVIDENCE_BASE_HOME" "$EVIDENCE_OUTPUT_DIR"
printf '%s\n' "$EVIDENCE_HEAD_SHA" >"$EVIDENCE_OUTPUT_DIR/head-sha.txt"
printf '%s\n' "$EVIDENCE_BASE_SHA" >"$EVIDENCE_OUTPUT_DIR/base-sha.txt"
git worktree add --detach "$EVIDENCE_BASE_DIR" "$EVIDENCE_BASE_SHA"
bun install --cwd "$EVIDENCE_BASE_DIR" --frozen-lockfile
```

### 3. Start and seed the head

Start the API and web servers from the head worktree. Save each process identifier in the head data home.

```sh
set -e
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_HEAD_API_PORT=4561
EVIDENCE_HEAD_WEB_PORT=5201
EVIDENCE_HEAD_DIR="$(git rev-parse --show-toplevel)"
EVIDENCE_HEAD_HOME="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-head-home"
cd "$EVIDENCE_HEAD_DIR/apps/server"
bun run build:harnesses
nohup env -u TRELLIS_AUTH_TOKEN TRELLIS_HOME="$EVIDENCE_HEAD_HOME" TRELLIS_PORT="$EVIDENCE_HEAD_API_PORT" bun src/index.ts </dev/null >"$EVIDENCE_HEAD_HOME/api.log" 2>&1 &
printf '%s\n' "$!" >"$EVIDENCE_HEAD_HOME/api.pid"
cd "$EVIDENCE_HEAD_DIR/apps/web"
nohup env -u TRELLIS_AUTH_TOKEN TRELLIS_API_URL="http://127.0.0.1:$EVIDENCE_HEAD_API_PORT" ../../node_modules/.bin/vite --port "$EVIDENCE_HEAD_WEB_PORT" </dev/null >"$EVIDENCE_HEAD_HOME/web.log" 2>&1 &
printf '%s\n' "$!" >"$EVIDENCE_HEAD_HOME/web.pid"
for EVIDENCE_TRY in {1..100}; do nc -z 127.0.0.1 "$EVIDENCE_HEAD_API_PORT" && break; sleep 0.1; done
for EVIDENCE_TRY in {1..100}; do nc -z 127.0.0.1 "$EVIDENCE_HEAD_WEB_PORT" && break; sleep 0.1; done
nc -z 127.0.0.1 "$EVIDENCE_HEAD_API_PORT"
nc -z 127.0.0.1 "$EVIDENCE_HEAD_WEB_PORT"
```

Run the seed command before you open Aside. Save the command and its output.

```sh
set -e
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_HEAD_API_PORT=4561
EVIDENCE_HEAD_HOME="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-head-home"
EVIDENCE_SEED_COMMAND='trellis projects create --key EVD --name "Evidence capture"'
printf '%s\n' "$EVIDENCE_SEED_COMMAND" >"$EVIDENCE_HEAD_HOME/seed-command.txt"
TRELLIS_URL="http://127.0.0.1:$EVIDENCE_HEAD_API_PORT" zsh -lc "$EVIDENCE_SEED_COMMAND" >"$EVIDENCE_HEAD_HOME/seed-output.txt" 2>&1
```

### 4. Capture the after image

The Aside window is 1440x900. Aside has no viewport setter, so a wide image needs no setup.

Use one `aside repl` call for the full after phase. Aside limits one call to 120 seconds.

Aside `fs` refuses a path outside its session root. Write files under `./artifacts/TRL-192/` in the Aside session.

Copy the files to the shared output directory after the call.

```sh
set -euo pipefail
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_ROUTE='/_gallery'
EVIDENCE_HEAD_WEB_PORT=5201
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
mkdir -p "$EVIDENCE_OUTPUT_DIR"
EVIDENCE_AFTER_SESSION="$(aside repl "const url1 = 'http://127.0.0.1:$EVIDENCE_HEAD_WEB_PORT$EVIDENCE_ROUTE'; const errors1 = []; const failed1 = []; const page1 = await openTab('about:blank'); page1.on('console', message => { if (message.type() === 'error') errors1.push(message.text()); }); page1.on('requestfailed', request => failed1.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' })); await page1.goto(url1); await page1.evaluate(() => { localStorage.setItem('trellis-theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); const style = document.createElement('style'); style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.append(style); }); await page1.evaluate(() => document.fonts.ready); await page1.evaluate(() => [...document.querySelectorAll('h2')].find(node => node.textContent?.trim() === 'ChangeSummary').scrollIntoView()); await fs.mkdir('./artifacts/TRL-192', { recursive: true }); await page1.screenshot({ path: './artifacts/TRL-192/after.png', clip: { x: 0, y: 0, width: 1440, height: 900 } }); await fs.writeFile('./artifacts/TRL-192/console.json', JSON.stringify({ consoleErrors: errors1, failedRequests: failed1 }, null, 2)); console.log('EVIDENCE_SESSION=' + pwd);" | sed -n 's/^EVIDENCE_SESSION=//p' | tail -n 1)"
cp "$EVIDENCE_AFTER_SESSION/artifacts/TRL-192/after.png" "$EVIDENCE_OUTPUT_DIR/after.png"
cp "$EVIDENCE_AFTER_SESSION/artifacts/TRL-192/console.json" "$EVIDENCE_OUTPUT_DIR/console.json"
/opt/homebrew/bin/magick identify -format '%wx%h\n' "$EVIDENCE_OUTPUT_DIR/after.png"
```

The 1440x900 clip returns a 2880x1800 file at the 2x device scale. That file meets the frontend floor.

### 5. Start and seed the base

Start the API and web servers from the base worktree on the second port pair.

```sh
set -e
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_BASE_API_PORT=4562
EVIDENCE_BASE_WEB_PORT=5202
EVIDENCE_BASE_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-base"
EVIDENCE_BASE_HOME="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-base-home"
cd "$EVIDENCE_BASE_DIR/apps/server"
bun run build:harnesses
nohup env -u TRELLIS_AUTH_TOKEN TRELLIS_HOME="$EVIDENCE_BASE_HOME" TRELLIS_PORT="$EVIDENCE_BASE_API_PORT" bun src/index.ts </dev/null >"$EVIDENCE_BASE_HOME/api.log" 2>&1 &
printf '%s\n' "$!" >"$EVIDENCE_BASE_HOME/api.pid"
cd "$EVIDENCE_BASE_DIR/apps/web"
nohup env -u TRELLIS_AUTH_TOKEN TRELLIS_API_URL="http://127.0.0.1:$EVIDENCE_BASE_API_PORT" ../../node_modules/.bin/vite --port "$EVIDENCE_BASE_WEB_PORT" </dev/null >"$EVIDENCE_BASE_HOME/web.log" 2>&1 &
printf '%s\n' "$!" >"$EVIDENCE_BASE_HOME/web.pid"
for EVIDENCE_TRY in {1..100}; do nc -z 127.0.0.1 "$EVIDENCE_BASE_API_PORT" && break; sleep 0.1; done
for EVIDENCE_TRY in {1..100}; do nc -z 127.0.0.1 "$EVIDENCE_BASE_WEB_PORT" && break; sleep 0.1; done
nc -z 127.0.0.1 "$EVIDENCE_BASE_API_PORT"
nc -z 127.0.0.1 "$EVIDENCE_BASE_WEB_PORT"
```

Run the same seed command. Save the command and its output again.

```sh
set -e
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_BASE_API_PORT=4562
EVIDENCE_HEAD_HOME="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-head-home"
EVIDENCE_BASE_HOME="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-base-home"
EVIDENCE_SEED_COMMAND='trellis projects create --key EVD --name "Evidence capture"'
printf '%s\n' "$EVIDENCE_SEED_COMMAND" >"$EVIDENCE_BASE_HOME/seed-command.txt"
TRELLIS_URL="http://127.0.0.1:$EVIDENCE_BASE_API_PORT" zsh -lc "$EVIDENCE_SEED_COMMAND" >"$EVIDENCE_BASE_HOME/seed-output.txt" 2>&1
cmp "$EVIDENCE_HEAD_HOME/seed-command.txt" "$EVIDENCE_BASE_HOME/seed-command.txt"
```

### 6. Capture the before image

Use one new `aside repl` call for the full before phase. Each call has a new Aside session directory.

```sh
set -euo pipefail
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_ROUTE='/_gallery'
EVIDENCE_BASE_WEB_PORT=5202
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
mkdir -p "$EVIDENCE_OUTPUT_DIR"
EVIDENCE_BEFORE_SESSION="$(aside repl "const url2 = 'http://127.0.0.1:$EVIDENCE_BASE_WEB_PORT$EVIDENCE_ROUTE'; const page2 = await openTab('about:blank'); await page2.goto(url2); await page2.evaluate(() => { localStorage.setItem('trellis-theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); const style = document.createElement('style'); style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.append(style); }); await page2.evaluate(() => document.fonts.ready); await page2.evaluate(() => [...document.querySelectorAll('h2')].find(node => node.textContent?.trim() === 'ChangeSummary').scrollIntoView()); await fs.mkdir('./artifacts/TRL-192', { recursive: true }); await page2.screenshot({ path: './artifacts/TRL-192/before.png', clip: { x: 0, y: 0, width: 1440, height: 900 } }); console.log('EVIDENCE_SESSION=' + pwd);" | sed -n 's/^EVIDENCE_SESSION=//p' | tail -n 1)"
cp "$EVIDENCE_BEFORE_SESSION/artifacts/TRL-192/before.png" "$EVIDENCE_OUTPUT_DIR/before.png"
/opt/homebrew/bin/magick identify -format '%wx%h\n' "$EVIDENCE_OUTPUT_DIR/before.png"
```

### 7. Make the clip

Use one new `aside repl` call for the full clip phase. Save numbered PNG frames in that Aside session.

```sh
set -euo pipefail
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_ROUTE='/_gallery'
EVIDENCE_HEAD_WEB_PORT=5201
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
EVIDENCE_FRAME_DIR="$EVIDENCE_OUTPUT_DIR/frames"
mkdir -p "$EVIDENCE_FRAME_DIR"
EVIDENCE_CLIP_SESSION="$(aside repl "const url3 = 'http://127.0.0.1:$EVIDENCE_HEAD_WEB_PORT$EVIDENCE_ROUTE'; const page3 = await openTab('about:blank'); await page3.goto(url3); await page3.evaluate(() => { localStorage.setItem('trellis-theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); const style = document.createElement('style'); style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.append(style); }); await page3.evaluate(() => document.fonts.ready); await page3.evaluate(() => [...document.querySelectorAll('h2')].find(node => node.textContent?.trim() === 'ChangeSummary').scrollIntoView()); await fs.mkdir('./artifacts/TRL-192', { recursive: true }); for (let frame3 = 0; frame3 < 45; frame3 += 1) { await page3.screenshot({ path: './artifacts/TRL-192/clip-' + String(frame3).padStart(3, '0') + '.png', clip: { x: 0, y: 0, width: 1440, height: 900 } }); await sleep(100); } console.log('EVIDENCE_SESSION=' + pwd);" | sed -n 's/^EVIDENCE_SESSION=//p' | tail -n 1)"
cp "$EVIDENCE_CLIP_SESSION"/artifacts/TRL-192/clip-*.png "$EVIDENCE_FRAME_DIR/"
/opt/homebrew/bin/ffmpeg -y -framerate 10 -i "$EVIDENCE_FRAME_DIR/clip-%03d.png" -t 15 -c:v libx264 -pix_fmt yuv420p "$EVIDENCE_OUTPUT_DIR/clip.mp4"
/opt/homebrew/bin/ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$EVIDENCE_OUTPUT_DIR/clip.mp4"
```

### 8. Capture a 390 px layout

Aside cannot resize its viewport. Load the route, then replace the document with a same-origin iframe that is 390x844.

The iframe width activates the `max-md` media queries. The iframe reads the same `trellis-theme` key because it shares the route origin.

```sh
set -euo pipefail
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_ROUTE='/_gallery'
EVIDENCE_HEAD_WEB_PORT=5201
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
mkdir -p "$EVIDENCE_OUTPUT_DIR"
EVIDENCE_PHONE_SESSION="$(aside repl "const url4 = 'http://127.0.0.1:$EVIDENCE_HEAD_WEB_PORT$EVIDENCE_ROUTE'; const page4 = await openTab('about:blank'); await page4.goto(url4); await page4.evaluate(route4 => { localStorage.setItem('trellis-theme', 'dark'); document.open(); document.write('<body style=\"margin:0\"><iframe src=\"' + route4 + '\" style=\"display:block;width:390px;height:844px;border:0\"></iframe></body>'); document.close(); }, '$EVIDENCE_ROUTE'); await sleep(1000); await page4.evaluate(async () => { const child4 = document.querySelector('iframe').contentDocument; const style4 = child4.createElement('style'); style4.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; child4.head.append(style4); await child4.fonts.ready; }); await fs.mkdir('./artifacts/TRL-192', { recursive: true }); await page4.screenshot({ path: './artifacts/TRL-192/phone.png', clip: { x: 0, y: 0, width: 390, height: 844 } }); console.log('EVIDENCE_SESSION=' + pwd);" | sed -n 's/^EVIDENCE_SESSION=//p' | tail -n 1)"
cp "$EVIDENCE_PHONE_SESSION/artifacts/TRL-192/phone.png" "$EVIDENCE_OUTPUT_DIR/phone.png"
/opt/homebrew/bin/magick identify -format '%wx%h\n' "$EVIDENCE_OUTPUT_DIR/phone.png"
```

The 390x844 clip returns a 780x1688 file at the 2x device scale.

### 9. Crop one element

Do not use `page.screenshot({ clip })` with an element rectangle. The element and screenshot coordinates do not use the same device scale.

In one Aside call, take the full viewport image and record the element rectangle with `devicePixelRatio`. Then crop the file on disk with `magick`.

```sh
set -euo pipefail
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_ROUTE='/_gallery'
EVIDENCE_HEAD_WEB_PORT=5201
EVIDENCE_ELEMENT_SELECTOR='h2'
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
mkdir -p "$EVIDENCE_OUTPUT_DIR"
EVIDENCE_ELEMENT_SESSION="$(aside repl "const url5 = 'http://127.0.0.1:$EVIDENCE_HEAD_WEB_PORT$EVIDENCE_ROUTE'; const page5 = await openTab('about:blank'); await page5.goto(url5); await page5.evaluate(() => { localStorage.setItem('trellis-theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); const style5 = document.createElement('style'); style5.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.append(style5); }); await page5.evaluate(() => document.fonts.ready); const crop5 = await page5.evaluate(selector5 => { const rect5 = document.querySelector(selector5).getBoundingClientRect(); return { x: rect5.x, y: rect5.y, width: rect5.width, height: rect5.height, devicePixelRatio: window.devicePixelRatio }; }, '$EVIDENCE_ELEMENT_SELECTOR'); await fs.mkdir('./artifacts/TRL-192', { recursive: true }); await page5.screenshot({ path: './artifacts/TRL-192/viewport.png', clip: { x: 0, y: 0, width: 1440, height: 900 } }); await fs.writeFile('./artifacts/TRL-192/element.json', JSON.stringify(crop5)); console.log('EVIDENCE_SESSION=' + pwd);" | sed -n 's/^EVIDENCE_SESSION=//p' | tail -n 1)"
cp "$EVIDENCE_ELEMENT_SESSION/artifacts/TRL-192/viewport.png" "$EVIDENCE_OUTPUT_DIR/viewport.png"
cp "$EVIDENCE_ELEMENT_SESSION/artifacts/TRL-192/element.json" "$EVIDENCE_OUTPUT_DIR/element.json"
EVIDENCE_CROP_X="$(jq '(.x * .devicePixelRatio) | round' "$EVIDENCE_OUTPUT_DIR/element.json")"
EVIDENCE_CROP_Y="$(jq '(.y * .devicePixelRatio) | round' "$EVIDENCE_OUTPUT_DIR/element.json")"
EVIDENCE_CROP_WIDTH="$(jq '(.width * .devicePixelRatio) | round' "$EVIDENCE_OUTPUT_DIR/element.json")"
EVIDENCE_CROP_HEIGHT="$(jq '(.height * .devicePixelRatio) | round' "$EVIDENCE_OUTPUT_DIR/element.json")"
/opt/homebrew/bin/magick "$EVIDENCE_OUTPUT_DIR/viewport.png" -crop "${EVIDENCE_CROP_WIDTH}x${EVIDENCE_CROP_HEIGHT}+${EVIDENCE_CROP_X}+${EVIDENCE_CROP_Y}" +repage "$EVIDENCE_OUTPUT_DIR/element.png"
```

### 10. Register the evidence

Register one file with each file kind. Add the separate capture record with both SHAs.
Trellis reads the capture head SHA from the current pull request head.

```sh
set -e
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_PR='0x962/trellis#174'
EVIDENCE_ROUTE='/_gallery'
EVIDENCE_SEED_COMMAND='trellis projects create --key EVD --name "Evidence capture"'
EVIDENCE_BROWSER='Aside'
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
EVIDENCE_HEAD_SHA="$(cat "$EVIDENCE_OUTPUT_DIR/head-sha.txt")"
EVIDENCE_BASE_SHA="$(cat "$EVIDENCE_OUTPUT_DIR/base-sha.txt")"
export PATH="$(git rev-parse --show-toplevel)/node_modules/.bin:$PATH"
trellis evidence add "$EVIDENCE_PR" --kind after --file "$EVIDENCE_OUTPUT_DIR/after.png" --route "$EVIDENCE_ROUTE" --viewport 1440x900 --theme dark --seed "$EVIDENCE_SEED_COMMAND" --browser "$EVIDENCE_BROWSER" --sha "$EVIDENCE_HEAD_SHA"
trellis evidence add "$EVIDENCE_PR" --kind before --file "$EVIDENCE_OUTPUT_DIR/before.png" --route "$EVIDENCE_ROUTE" --viewport 1440x900 --theme dark --seed "$EVIDENCE_SEED_COMMAND" --browser "$EVIDENCE_BROWSER" --base "$EVIDENCE_BASE_SHA"
trellis evidence add "$EVIDENCE_PR" --kind capture --base "$EVIDENCE_BASE_SHA" --route "$EVIDENCE_ROUTE" --viewport 1440x900 --theme dark --seed "$EVIDENCE_SEED_COMMAND" --browser "$EVIDENCE_BROWSER" --time "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
trellis evidence add "$EVIDENCE_PR" --kind clip --file "$EVIDENCE_OUTPUT_DIR/clip.mp4" --route "$EVIDENCE_ROUTE" --caption 'The EvidenceStrip appears between ChangeSummary and StartControls.'
trellis evidence add "$EVIDENCE_PR" --kind console --file "$EVIDENCE_OUTPUT_DIR/console.json"
trellis evidence list "$EVIDENCE_PR"
trellis evidence check "$EVIDENCE_PR"
```

### 11. Stop and remove the scratch state

Stop the four servers before you remove their data homes and the base worktree.

```sh
set -e
EVIDENCE_RUN='trl-192-pr-174-evidence-doc'
EVIDENCE_HEAD_DIR="$(git rev-parse --show-toplevel)"
EVIDENCE_BASE_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-base"
EVIDENCE_HEAD_HOME="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-head-home"
EVIDENCE_BASE_HOME="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-base-home"
EVIDENCE_OUTPUT_DIR="$TMPDIR/trellis-evidence-$EVIDENCE_RUN-output"
kill "$(cat "$EVIDENCE_HEAD_HOME/web.pid")" "$(cat "$EVIDENCE_HEAD_HOME/api.pid")" "$(cat "$EVIDENCE_BASE_HOME/web.pid")" "$(cat "$EVIDENCE_BASE_HOME/api.pid")"
git -C "$EVIDENCE_HEAD_DIR" worktree remove --force "$EVIDENCE_BASE_DIR"
rm -r "$EVIDENCE_HEAD_HOME" "$EVIDENCE_BASE_HOME" "$EVIDENCE_OUTPUT_DIR"
```
