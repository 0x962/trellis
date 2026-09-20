# Pull request evidence

Evidence lets a reviewer check a pull request without a second investigation. Trellis binds each evidence record to the current head SHA.

## Pull request kind

Trellis reads the changed paths and sets the kind. The agent does not set it.

| Kind | Rule |
| --- | --- |
| `frontend` | One or more changed files render a route. |
| `backend` | No changed file renders a route. |
| `mixed` | Some changed files render a route and some do not. |

In Trellis, `apps/web/**` and `packages/ui/**` render routes. A mixed pull request owes the frontend floor and the backend floor.

Evidence records use these kinds:

```text
before after capture clip console verify test contract migration picture equivalence
```

Run this command to see the kind, the floor, and each missing item:

```sh
trellis evidence check <pr>
```

## Frontend floor

A frontend pull request always carries these five items:

1. A summary with the headline, the reason, and the file to review first.
2. An after image of each changed route at 1440x900 in the dark theme.
3. A before image of the same route from the merge base.
4. A capture record with both SHAs and all capture settings.
5. A console error list and a failed request list. An empty list is a result.

Add a clip of 15 seconds or less for motion, a gesture, scroll, a timed action, or a multi-step task.

Show the empty, loading, and error states when the change affects a screen that reads data. Add a 390 px capture and a light-theme capture when the change affects layout or color.

## Backend floor

A backend pull request always carries these four items:

1. A summary.
2. A verify record for each command in the ticket contract.
3. Test proof for each new test, or a `test` record with `--none --reason`.
4. A contract table, or a `contract` record with `--none`.

A verify record contains the command, its exit code, its output tail, and the head SHA. Test proof names the test, the base SHA where it fails, and the head SHA where it passes.

Add a migration plan when a schema changes. State the phase, two-way compatibility, lock cost, backfill, and rollback.

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

## Capture recipe

Use your assigned worktree for the head. Use a second worktree for the merge base. Give each worktree its own API port and web port.

### 1. Set the capture values

Set these values for the pull request and route. Use an exact seed command that produces the same data in both homes.

```sh
export EVIDENCE_PR='<owner>/<repo>#<number>'
export EVIDENCE_ROUTE='/route'
export EVIDENCE_SEED_COMMAND='<seed command>'
export EVIDENCE_HEAD_API_PORT=4531
export EVIDENCE_HEAD_WEB_PORT=5181
export EVIDENCE_BASE_API_PORT=4532
export EVIDENCE_BASE_WEB_PORT=5182
export EVIDENCE_BROWSER='Aside'
```

Confirm that the four ports are free. If a command prints a process, choose another port.

```sh
lsof -nP -iTCP:"$EVIDENCE_HEAD_API_PORT" -sTCP:LISTEN
lsof -nP -iTCP:"$EVIDENCE_HEAD_WEB_PORT" -sTCP:LISTEN
lsof -nP -iTCP:"$EVIDENCE_BASE_API_PORT" -sTCP:LISTEN
lsof -nP -iTCP:"$EVIDENCE_BASE_WEB_PORT" -sTCP:LISTEN
```

### 2. Prepare the head and base

Record the two SHAs before the first capture. Create the base worktree under `$TMPDIR`.

```sh
export EVIDENCE_HEAD_DIR="$(git rev-parse --show-toplevel)"
export EVIDENCE_HEAD_SHA="$(git rev-parse HEAD)"
export EVIDENCE_BASE_SHA="$(git merge-base origin/main HEAD)"
export EVIDENCE_BASE_DIR="$(mktemp -d "$TMPDIR/trellis-evidence-base.XXXXXX")"
rmdir "$EVIDENCE_BASE_DIR"
git worktree add --detach "$EVIDENCE_BASE_DIR" "$EVIDENCE_BASE_SHA"
```

Install the locked dependencies in the base worktree.

```sh
bun install --cwd "$EVIDENCE_BASE_DIR" --frozen-lockfile
```

Create separate data homes for the two servers.

```sh
export EVIDENCE_HEAD_HOME="$(mktemp -d "$TMPDIR/trellis-evidence-head-home.XXXXXX")"
export EVIDENCE_BASE_HOME="$(mktemp -d "$TMPDIR/trellis-evidence-base-home.XXXXXX")"
```

### 3. Start and seed the head

Start the API and web servers from the head worktree. Keep both process identifiers.

```sh
cd "$EVIDENCE_HEAD_DIR/apps/server"
bun run build:harnesses
env -u TRELLIS_AUTH_TOKEN TRELLIS_HOME="$EVIDENCE_HEAD_HOME" TRELLIS_PORT="$EVIDENCE_HEAD_API_PORT" bun src/index.ts </dev/null >"$EVIDENCE_HEAD_HOME/api.log" 2>&1 & export EVIDENCE_HEAD_API_PID=$!
cd "$EVIDENCE_HEAD_DIR/apps/web"
env -u TRELLIS_AUTH_TOKEN TRELLIS_API_URL="http://127.0.0.1:$EVIDENCE_HEAD_API_PORT" ../../node_modules/.bin/vite --port "$EVIDENCE_HEAD_WEB_PORT" </dev/null >"$EVIDENCE_HEAD_HOME/web.log" 2>&1 & export EVIDENCE_HEAD_WEB_PID=$!
```

Run the seed command before you open Aside. Save the command and its output.

```sh
printf '%s\n' "$EVIDENCE_SEED_COMMAND" >"$EVIDENCE_HEAD_HOME/seed-command.txt"
TRELLIS_URL="http://127.0.0.1:$EVIDENCE_HEAD_API_PORT" zsh -lc "$EVIDENCE_SEED_COMMAND" >"$EVIDENCE_HEAD_HOME/seed-output.txt" 2>&1
```

### 4. Capture the after image

Use one `aside repl` call for this flow. Aside limits one call to 120 seconds.

```sh
aside repl "const url1 = 'http://127.0.0.1:$EVIDENCE_HEAD_WEB_PORT$EVIDENCE_ROUTE'; const errors1 = []; const failed1 = []; const page1 = await openTab('about:blank'); page1.on('console', message => { if (message.type() === 'error') errors1.push(message.text()); }); page1.on('requestfailed', request => failed1.push({ url: request.url(), error: request.failure()?.errorText ?? 'unknown' })); const viewport1 = await page1.viewportSize(); if (viewport1?.width !== 1440 || viewport1?.height !== 900) throw new Error('Aside viewport must be 1440x900'); await page1.goto(url1); await page1.evaluate(() => { localStorage.setItem('trellis-theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); const style = document.createElement('style'); style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.append(style); }); await page1.evaluate(() => document.fonts.ready); const after1 = path.join(pwd, 'after.png'); const console1 = path.join(pwd, 'console.json'); await page1.screenshot({ path: after1 }); await fs.writeFile(console1, JSON.stringify({ consoleErrors: errors1, failedRequests: failed1 }, null, 2)); console.log(JSON.stringify({ after: after1, console: console1 }));"
```

Set `EVIDENCE_AFTER_FILE` and `EVIDENCE_CONSOLE_FILE` to the two paths that Aside prints.

The command checks a 1440x900 CSS viewport. A high-density display can store more device pixels in the PNG.

### 5. Start and seed the base

Start the API and web servers from the base worktree on the second port pair.

```sh
cd "$EVIDENCE_BASE_DIR/apps/server"
bun run build:harnesses
env -u TRELLIS_AUTH_TOKEN TRELLIS_HOME="$EVIDENCE_BASE_HOME" TRELLIS_PORT="$EVIDENCE_BASE_API_PORT" bun src/index.ts </dev/null >"$EVIDENCE_BASE_HOME/api.log" 2>&1 & export EVIDENCE_BASE_API_PID=$!
cd "$EVIDENCE_BASE_DIR/apps/web"
env -u TRELLIS_AUTH_TOKEN TRELLIS_API_URL="http://127.0.0.1:$EVIDENCE_BASE_API_PORT" ../../node_modules/.bin/vite --port "$EVIDENCE_BASE_WEB_PORT" </dev/null >"$EVIDENCE_BASE_HOME/web.log" 2>&1 & export EVIDENCE_BASE_WEB_PID=$!
```

Run the same seed command. Save the command and its output again.

```sh
printf '%s\n' "$EVIDENCE_SEED_COMMAND" >"$EVIDENCE_BASE_HOME/seed-command.txt"
TRELLIS_URL="http://127.0.0.1:$EVIDENCE_BASE_API_PORT" zsh -lc "$EVIDENCE_SEED_COMMAND" >"$EVIDENCE_BASE_HOME/seed-output.txt" 2>&1
cmp "$EVIDENCE_HEAD_HOME/seed-command.txt" "$EVIDENCE_BASE_HOME/seed-command.txt"
```

### 6. Capture the before image

Use one new `aside repl` call for this flow.

```sh
aside repl "const url2 = 'http://127.0.0.1:$EVIDENCE_BASE_WEB_PORT$EVIDENCE_ROUTE'; const page2 = await openTab('about:blank'); const viewport2 = await page2.viewportSize(); if (viewport2?.width !== 1440 || viewport2?.height !== 900) throw new Error('Aside viewport must be 1440x900'); await page2.goto(url2); await page2.evaluate(() => { localStorage.setItem('trellis-theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); const style = document.createElement('style'); style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.append(style); }); await page2.evaluate(() => document.fonts.ready); const before2 = path.join(pwd, 'before.png'); await page2.screenshot({ path: before2 }); console.log(JSON.stringify({ before: before2 }));"
```

Set `EVIDENCE_BEFORE_FILE` to the path that Aside prints.

### 7. Make the clip

Use one new `aside repl` call for the changed interaction. Save numbered PNG frames in that Aside session.

```sh
aside repl "const url3 = 'http://127.0.0.1:$EVIDENCE_HEAD_WEB_PORT$EVIDENCE_ROUTE'; const page3 = await openTab('about:blank'); const viewport3 = await page3.viewportSize(); if (viewport3?.width !== 1440 || viewport3?.height !== 900) throw new Error('Aside viewport must be 1440x900'); await page3.goto(url3); await page3.evaluate(() => { localStorage.setItem('trellis-theme', 'dark'); document.documentElement.setAttribute('data-theme', 'dark'); const style = document.createElement('style'); style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'; document.head.append(style); }); await page3.evaluate(() => document.fonts.ready); for (let frame3 = 0; frame3 < 45; frame3 += 1) { await page3.screenshot({ path: path.join(pwd, 'clip-' + String(frame3).padStart(3, '0') + '.png') }); await sleep(100); } console.log(JSON.stringify({ frames: path.join(pwd, 'clip-%03d.png') }));"
```

Set `EVIDENCE_CLIP_FRAMES` to the frame pattern that Aside prints. Encode no more than 15 seconds.

```sh
export EVIDENCE_CLIP_FILE="${EVIDENCE_CLIP_FRAMES%clip-%03d.png}clip.mp4"
/opt/homebrew/bin/ffmpeg -y -framerate 10 -i "$EVIDENCE_CLIP_FRAMES" -t 15 -c:v libx264 -pix_fmt yuv420p "$EVIDENCE_CLIP_FILE"
/opt/homebrew/bin/ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$EVIDENCE_CLIP_FILE"
```

### 8. Register the evidence

Register one file with each file kind. Add the separate capture record with both SHAs.
Trellis reads the capture head SHA from the current pull request head.

```sh
trellis evidence add "$EVIDENCE_PR" --kind after --file "$EVIDENCE_AFTER_FILE" --route "$EVIDENCE_ROUTE" --viewport 1440x900 --theme dark --seed "$EVIDENCE_SEED_COMMAND" --browser "$EVIDENCE_BROWSER" --sha "$EVIDENCE_HEAD_SHA"
trellis evidence add "$EVIDENCE_PR" --kind before --file "$EVIDENCE_BEFORE_FILE" --route "$EVIDENCE_ROUTE" --viewport 1440x900 --theme dark --seed "$EVIDENCE_SEED_COMMAND" --browser "$EVIDENCE_BROWSER" --base "$EVIDENCE_BASE_SHA"
trellis evidence add "$EVIDENCE_PR" --kind capture --base "$EVIDENCE_BASE_SHA" --route "$EVIDENCE_ROUTE" --viewport 1440x900 --theme dark --seed "$EVIDENCE_SEED_COMMAND" --browser "$EVIDENCE_BROWSER" --time "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
trellis evidence add "$EVIDENCE_PR" --kind clip --file "$EVIDENCE_CLIP_FILE" --route "$EVIDENCE_ROUTE" --caption '<what the clip proves>'
trellis evidence add "$EVIDENCE_PR" --kind console --file "$EVIDENCE_CONSOLE_FILE"
trellis evidence list "$EVIDENCE_PR"
trellis evidence check "$EVIDENCE_PR"
```

### 9. Stop and remove the scratch state

Stop the four servers before you remove their data homes and the base worktree.

```sh
kill "$EVIDENCE_HEAD_WEB_PID" "$EVIDENCE_HEAD_API_PID" "$EVIDENCE_BASE_WEB_PID" "$EVIDENCE_BASE_API_PID"
wait "$EVIDENCE_HEAD_WEB_PID" "$EVIDENCE_HEAD_API_PID" "$EVIDENCE_BASE_WEB_PID" "$EVIDENCE_BASE_API_PID" 2>/dev/null
git -C "$EVIDENCE_HEAD_DIR" worktree remove --force "$EVIDENCE_BASE_DIR"
rm -r "$EVIDENCE_HEAD_HOME" "$EVIDENCE_BASE_HOME"
```
