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
trellis evidence check 0x962/trellis#174
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
