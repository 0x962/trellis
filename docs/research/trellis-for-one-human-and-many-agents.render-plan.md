# Render plan

One entry per screen. Two renderers build in parallel. Neither renderer talks to the other. Both read this file and `verdict.md` in this folder. Section 0 holds the rules that both obey. Sections 1 to 10 hold one screen each.

## 0. Rules for both renderers

### 0.1 Files

- Write each screen to `scratchpad/product2/screens/<slug>.html`. The slug is the heading of the entry.
- One HTML file per screen. Inline the CSS. Inline the SVG. No build step. No external script.
- Copy image bytes into `scratchpad/product2/screens/assets/` under the filename the entry names. Both renderers may copy the same file. The bytes are identical, so the second copy changes nothing.
- Do not open `scratchpad/product/`. It holds an earlier proposal. The brief forbids it.
- Do not modify the repository at `/Users/navidkhan/.superset/worktrees/974494a1-2921-48f1-b1b1-9589e4a5f428/features`. Read it only.

### 0.2 Data

- Ticket exports: `scratchpad/OP-27.json` to `scratchpad/OP-54.json`. Each file is one ticket: `identifier`, `title`, `status.name`, `priority`, `wave.name`, `description`, `prs[]` with `number`, `state`, `isDraft`, `headRef`, `baseRef`, `checks[]` with `name`, `workflow`, `bucket` (pass, fail, pending, skipping), `reviewState`, `mergedAt`; `attachments[]` with `filename`, `mime`, `size`, `sha256`.
- Wave counts: `scratchpad/ms.json`.
- The three real images of OP-27 are on this machine, keyed by sha256:
  - before: `~/.trellis/attachments/fa/fa629876f8c3a7ec361c05ba2c6d8f600a5ac19f70ef8b3123c474efa9e5013d`, copy to `assets/op27-send-pending.png`
  - after: `~/.trellis/attachments/ee/ee7278b0057fb46dd74472faea39ab33e6bb93bc18269b280f7c57ee1f1858eb`, copy to `assets/op27-send-timeout.png`
  - clip: `~/.trellis/attachments/a2/a218aac4f3fa3a1f6bc0b815ece1d9db78797b4acd84b872fc327a69f0a4567f`, copy to `assets/op27-send-timeout.gif`
- The dependency graph, what each pull request waits for, and the run states are in `verdict.md` section 1.1. Use those tables. Do not recompute.
- Example values. The exports carry no pull request size, no file list, no sha, no live run state and no summary. Every such value on a screen is an example value. Wrap each one in `<span class="ex" title="example value">`. Style `.ex` with `border-bottom: 1px dotted var(--fg-faint)`. Put one line at the foot of every page, 12 px `--fg-faint`: `Sizes, file lists, shas, run states and summaries are example values. Every identifier, title, status, wave, pull request, check and attachment is from the OP exports.`

### 0.3 Look

- Dark theme. Copy the dark token block of `packages/ui/src/tokens.css`, lines 140 to 180, into `:root`. The values that matter most: `--fg-muted #BBBBBF`, `--fg-faint #8E8E95`, `--accent #C4C4C4`, `--success #5ECC71`, `--warning #FFD452`, `--danger #FF6762`. Never use `--agent` (`#9D6AFB`) or `--film-violet`.
- Type: `--sans` is `"Inter Variable", ui-sans-serif, system-ui, sans-serif`. `--mono` is `"BerkeleyMono", "JetBrains Mono", ui-monospace, Menlo, monospace`. Body 13 px `--fg`. Secondary 12 px `--fg-muted`. Labels 12 px `--fg-faint`. Headline 15 px. Numbers `font-variant-numeric: tabular-nums`.
- Desktop frame 1280 px wide. Phone frame 390 px wide with a 1 px `--border` outline.
- Row heights: ticket row 36 px, agent line 24 px, pull request row 32 px, group header 32 px, phone row 56 px. Every touch target on the phone is at least 44 px.
- Marks. Use these and no others:

| Mark | Meaning | Color |
| --- | --- | --- |
| status glyph | the ticket status; shapes from `packages/ui/src/domain/StatusIcon/StatusIcon.tsx` | Todo `--fg-muted`, Agent Review `--accent`, Human Review `--warning`, Done `--success` |
| GitHub pull request glyph, 16 px | open, draft, merged, closed; octicons `git-pull-request`, `git-pull-request-draft`, `git-merge`, `git-pull-request-closed`; sits before the number | open `#3FB950`, draft `#8B949E`, merged `#A371F7` (the one violet), closed `#F85149` |
| agent card, 18 px round | the harness of the run; the Anthropic mark from `packages/ui/src/domain/ProviderIcon/ProviderIcon.tsx` | the mark's own |
| 6 px filled dot | a human is needed | `--warning` |
| 6 px filled dot | a run failed or is lost | `--danger` |
| the word `failed` | a failed check | `--danger` |
| the word `yes` under `risk` | a risk mark present | `--danger` |
| everything else | words and numbers | `--fg`, `--fg-muted`, `--fg-faint` |

- Motion. One thing moves on any screen: the agent card of a working run. Copy `@keyframes glimmer` from `packages/ui/src/tokens.css` lines 342 to 350 and the text technique from `packages/ui/src/base.css` lines 140 to 150. Apply the gradient to the card ring: `linear-gradient(110deg, transparent 15%, var(--film-pink) 32%, var(--film-blue) 50%, var(--film-mint) 58%, var(--film-gold) 68%, transparent 85%)`, no violet stop, `background-size: 250% 100%`, `animation: glimmer 7s ease-in-out infinite`. Nothing else animates. No hover transition. No spinner.
- Clicks. A static page. Give each clickable target `cursor: pointer` and a `title` that states the result from the verdict, for example `title="opens the review page in a wider sheet"`.
- Prose that a renderer adds (a footer, a caption) follows ASD-STE100. No em dash anywhere.

### 0.4 Split

| Renderer | Screens |
| --- | --- |
| Renderer 1 | `epic-wave`, `epic-waiting`, `epic-phone`, `epic-resources`, then `index` |
| Renderer 2 | `review-backend`, `review-frontend`, `ticket-blocked`, `ticket-review`, `cli` |

`index.html` links the nine files by slug, in the order of this plan, one line each: the slug, then the verdict screen number, then one sentence of purpose. Renderer 1 writes it from this plan. It does not wait for renderer 2.

---

## 1. `epic-wave`

Renderer 1. Desktop 1280 px. Verdict screen 1.

Sections, top to bottom:

1. Topbar: `Routines E2E` left; right: three `FilterBar` chips (`Epic: Routines E2E`, `Status: any`, `Group: Wave`), a Display icon button, an Add icon button, a `⋯` menu button.
2. Band, in the page padding:
   - `Current: ` in `--fg-muted` then `The run settles, and its state reaches the page` in `--fg`.
   - `0 to start  ·  5 running  ·  2 wait for you`. `0 to start` and `2 wait for you` look like links. `5 running` is plain text and an example value.
   - `StackedBar`, 6 px tall, segments done 3 `--success`, review 9 `--accent`, todo 15 `--fg-faint`. Right of it `3 of 27 done`.
   - Legend `done 3 · review 9 · todo 15` in `--fg-faint`.
3. `Plan` section header, collapsed, with `Show`.
4. `Resources · 5` section header, collapsed, with `Show`.
5. The table, grouped by wave, seven groups in this order. Group header: chevron, wave name, `Current` badge on wave 3 only, count text right.

| Group | Count text | State |
| --- | --- | --- |
| Foundation: the run row and the named chat | `3 of 3` | open |
| A routine run opens a chat | `0 of 5 · 1 for you` | open |
| The run settles, and its state reaches the page | `0 of 6` | open, `Current` |
| Integrate: the routine runtime | `0 of 1` | collapsed |
| An unattended run knows nobody is there | `0 of 5 · 2 for you` | collapsed |
| A trial run, and the stale sweep in production | `0 of 2` | collapsed |
| No wave | `0 of 5` | collapsed |

Rows of the three open groups: render the block in verdict screen 1 under "The rows of wave 2 and wave 3", plus the Foundation rows above it, line for line. Columns: select 16, priority 16, status glyph 20, id 72, title flex, waits 110, releases 40, actor 20, updated 48.

Data per row (real unless marked):

- Foundation: OP-29 `⧉ #55568 merged · 43 passed`; OP-30 `⧉ #57009 merged · 43 passed`; OP-31 `⧉ #57030 merged · 44 passed`. Done glyph. Updated `2d`.
- Wave 2, in this order: OP-32 (releases 4, agent line `crisp-fjord: I rebased onto master. post_message returns three values now.` example, pull request row `⊙ #55569 draft · +402 −61 · 14 files · 9 passed · no evidence · crisp-fjord`), OP-27 (`⊙ #56930 open · +186 −44 · 7 files · 37 passed · evidence 3 of 5 · you`), OP-37 (releases 1, `⊙ #57078 draft · +98 −6 · 4 files · 1 failed · 8 passed · no evidence · crisp-fjord`), OP-43 (releases 1, `⊙ #57080 open · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · evidence 1 of 4 · crisp-fjord`), OP-39 (`⊙ #57079 draft · +64 −12 · 3 files · 1 failed · 8 passed · no evidence · crisp-fjord`). Sizes are example values. Every `failed` is `--danger`.
- Wave 3, in this order: OP-33 (waits `OP-32`, pull request row `⊙ #57055 draft · stacked on #55569 · +73 −9 · 3 files · 9 passed · no evidence · crisp-fjord`), OP-34 (waits `OP-32`, releases 2), OP-50 (waits `OP-32`, releases 1), OP-38 (waits `OP-37`), OP-44 (waits `OP-43`).
- Actor column: the Anthropic card on every Agent Review row. The card on OP-32 and OP-33 carries the glimmer (example: those runs work). Todo rows have no card, and the column width stays reserved.
- Updated column: `2d` on Foundation, `4h` on OP-32, `1d` on OP-27, `2h` on OP-37, OP-43, OP-39, `3h` on OP-33, `1d` on the Todo rows. Example values.

Clicks (as `title`): ticket row opens the ticket page in a sheet; pull request row opens the review page in a wider sheet; a waits identifier filters to that ticket; a releases count filters to the tickets that wait on this one; the agent card opens the session; `0 to start` and `2 wait for you` set the filters.

Footer: the example-value line of 0.2.

## 2. `epic-waiting`

Renderer 1. Desktop 1280 px. Verdict screen 2.

The same topbar, band, `Plan` and `Resources` as `epic-wave`. The Group chip reads `Group: Waiting`. The table renders the block in verdict screen 2, line for line, four groups: `Waits for you 2`, `With an agent 5`, `Waits on a merge 13`, `Done 3` collapsed. `With GitHub` does not render.

Same columns, same row kinds, same marks, same clicks as `epic-wave`. Inside a group the rows sit in the order the verdict prints them.

## 3. `review-backend`

Renderer 2. Desktop 1280 px, rendered as a page, not a sheet. Verdict screen 3. Pull request `#57080` of OP-43.

Regions, top to bottom, each as a labelled block with a 12 px `--fg-faint` label:

- A. Identity, four lines: `⊙ #57080  open      OP-43: Filter hotels by user membership` with `revision 2 of 2 ▾` right; `trellis/op-43-01m2w7bmdftr3kvv155vp2pnak  →  master`; `OP-43  Canary: A private Canary route that answers a user's properties`; `waits on nothing  ·  releases OP-44`
- B. `READY TO MERGE` with `not yet` right, then nine label and value lines exactly as verdict screen 3 region B. Labels 12 px `--fg-faint` at a fixed 96 px width, mono. Values 13 px `--fg`. `failed`, and `yes` after `auth`, in `--danger`. Size, tests, base are example values.
- C. Summary: headline 15 px, why 13 px two lines, `Watch this: ` in `--fg-muted` then the sentence. Text from verdict screen 3 region C. Example value (the agent has not written it).
- D. `REVIEW FOCUS` with `0 of 2 held` right, two checkbox lines with the two sentences from OP-43's description.
- E. `EVIDENCE` with `1 of 4 required · summary present` right, five lines: `summary present`, `verify record missing ...`, `test proof missing ...`, `contract missing ...`, `picture not yet ...`, with the command hints from the verdict in `--fg-muted` mono.
- F. `CHECKS` with `1 failed · 6 pending · 47 passed · 44 skipped` right. Seven rows from the verdict: `failed merge_gatekeeper 9.AUTO Merge gatekeeper open ↗`, then six `pending` rows, then two collapsed lines `▸ 47 passed`, `▸ 44 skipped`. Real names from `OP-43.json`.
- G. `FILES` with `0 of 6 read` right. Four groups RISK, BEHAVIOR, TESTS open, NOISE collapsed, with the example file rows from the verdict. Each open file row has an empty checkbox.
- H. `THREADS` with `0 open` right, one line `No thread yet.` in `--fg-faint`.
- I. Verdict bar fixed at the bottom of the frame: `0 drafts` left; buttons `Merge` (primary, live), `Send back to crisp-fjord`, `Comment only`; under them one line `not yet: 1 check failed · 1 of 4 evidence · 3 commits behind master` in `--fg-muted`.

Nothing moves. No agent card on this page.

## 4. `review-frontend`

Renderer 2. Desktop 1280 px. Verdict screen 4. Pull request `#56930` of OP-27. Same regions as `review-backend`. Content that differs:

- A. `⊙ #56930  open      OP-27 Bound Operator message posts` with `revision 1 of 1`; `trellis/op-27-01m2s1scg7ppywezh4b5m8ez4y  →  master`; `OP-27  Web: Bound the Operator message post, and end the wait on what the thread says`; `waits on nothing  ·  releases nothing`
- B. `READY TO MERGE  yes`, nine lines from verdict screen 4 region B. Every `no` under `risk` stays `--fg`.
- C. The three-field summary from verdict screen 4 region C.
- D. One line `The ticket names no review focus.` in `--fg-faint`.
- E. `EVIDENCE` with `5 of 5 · captured on 8b21f0c` right. Record line `/chat/:uuid  ·  1440×900  ·  dark  ·  seed: trellis seed op27-stall`. Two real images side by side at half width each, labelled `before` and `after`, files `assets/op27-send-pending.png` and `assets/op27-send-timeout.png`, with the two captions from the verdict under them. Then `clip  op27-send-timeout.gif · 9 s · the post stalls, the dialog releases, the thread decides the mode  ▶`, and render the real GIF inline under that line at half width. Then `console  0 errors · 1 request gave up, by design` and `record  head 8b21f0c · base 4c9a771 · Chrome 141 · 2026-09-18 01:58`. The shas, the seed, the browser and the console line are example values. The images, the filenames and the time `2026-09-18 01:58` are real (`attachments[].createdAt`).
- F. `CHECKS  37 passed · 35 skipped`, two collapsed lines only.
- G. `FILES  0 of 7 read`, example rows: BEHAVIOR 3 files (`frontend/src/views/ChatPage.vue +71 −18`, `frontend/src/api/operator.ts +44 −6`, `frontend/src/components/ModeDialog.vue +29 −12`), TESTS 3 files, NOISE 1 file collapsed. RISK `none`.
- H. `THREADS  0 open`.
- I. Verdict bar with the three buttons and no condition line.

## 5. `ticket-blocked`

Renderer 2. Desktop 1280 px with a right rail. Verdict screen 5. OP-34.

Main column, top to bottom, from the block in verdict screen 5:

1. Trail `Routines E2E  ·  The run settles, and its state reaches the page` 12 px `--fg-muted`.
2. `OP-34   Service: The webhook settles the routine run`, status chip `○ Todo ▾`, priority chip `high`.
3. `THE ASK`: the first two paragraphs of `OP-34.json` description, verbatim, code spans kept.
4. `THE CONTRACT`: label and value rows `Result`, `Files` (four paths from the export), `Leave alone` (`routines/views/routine_run.py` with `OP-32 owns it` right, from OP-54), `Verify` (two commands, real, from OP-54), `Review focus` (two sentences from the export), `Evidence owed` (the sentence from the verdict). `Result` and `Evidence owed` are example values.
5. `THE CHAIN`: `Waits on  OP-32  Service: A routine run opens a chat and queues the turn  ⊙ #55569 draft`; `Ready  no. OP-32 is not merged.`; `Releases  OP-35 ...`, `OP-42 ...` with the real titles.
6. `THE EVIDENCE`: `No pull request yet.`
7. `THE RUN`: `No run.` left; right: three pickers `Claude Code ▾`, `Opus ▾`, `high ▾` and a `Start` button. Under `Start`, one line `OP-32 is not merged. Start anyway?` in `--fg-muted`.
8. `THE OUTCOME`: `Empty until a pull request merges.`
9. `RESOURCES`: `routine-runtime.md, step 6`.

Right rail: `PropertyRow` list for Status `Todo`, Priority `high`, Labels `none`, Project `OP`, Parent `none`, Epic `Routines E2E`, Wave `The run settles, and its state reaches the page`. No metrics rows.

No card, no yellow, nothing moves.

## 6. `ticket-review`

Renderer 2. Desktop 1280 px with a right rail. Verdict screen 6. OP-33.

Same layout as `ticket-blocked`. Content from the block in verdict screen 6:

- Status chip `◐ Agent Review ▾` in `--accent`.
- `THE ASK`: the description of `OP-33.json`, verbatim.
- `THE CONTRACT`: `Files  backend/operator-service/routines/services/run/run.py and its test` (real), `Leave alone`, `Verify  cd backend/operator-service && direnv exec . pytest routines` (example, from the pattern of OP-54), `Review focus  the cap of 50 holds the CronJob inside its two minute tick`, `Evidence owed  backend: summary · verify record · test proof · contract table. No picture: the change crosses no boundary.`
- `THE CHAIN`: `Waits on` OP-32 with `⊙ #55569 draft`; `Ready  no. OP-32 is not merged.`; `Releases  nothing`.
- `THE EVIDENCE`: the pull request card. Line 1 `⊙ #57055   draft   Operator: continue the routine sweep after a failed start`. Line 2 `stacked on #55569 (OP-32)  ·  trellis/op-33-01m2v0v6m3f0ry0eg0k57jwdc5 → nk/operator-routine-execution` (real refs). Line 3 `+73 −9 · 3 files · band small · risk none · 9 passed · 91 skipped · 0 threads` (size example, checks real). Line 4 `evidence 2 of 4:  summary ✓  test proof ✓  verify record missing  contract missing` (example). Line 5 `flows: none run`. Button `Open the review` right.
- `THE RUN`: agent card with the glimmer, `crisp-fjord   Claude Code · Opus · works, tool Edit, 40 s`, button `Session` right; second line `crisp-fjord: The cap of 50 sits in settings. I named it ROUTINE_SWEEP_CAP.` in `--fg-muted`. Example values.
- `THE OUTCOME`: `Empty until a pull request merges.`
- `RESOURCES`: `routine-runtime.md, step 5`.

Motion: the glimmer on the run's card.

## 8. `epic-resources`

Renderer 1. Desktop 1280 px. Verdict screen 8.

The `epic-wave` page with the `Resources` section open and the table cut to the first group, so the section is the subject. Under the `▾ RESOURCES  5` header, five rows: kind word 12 px `--fg-faint` at 48 px, title, then the note in `--fg-muted` right:

```
doc    The routine runtime        routine-runtime.md · edited 2026-09-19 by crisp-fjord
doc    Routines E2E plan          the epic description · edited 2026-09-19 by you
link   canary#55569               github.com · opens in the in-app browser
image  op27-send-timeout.gif      55 KB · also evidence on #56930
file   settle-sequence.mmd        the Mermaid source of the picture on #57055
```

Under the rows, right: three buttons `+ Doc`, `+ Link`, `+ File`. The `image` row shows a 24 px thumbnail of `assets/op27-send-timeout.gif` before the title. The two doc rows, the link row and the `.mmd` row are example values; the GIF row is real. Copy the GIF from the path in 0.2.

Clicks: `doc` opens the editor in a sheet; `link` opens the in-app browser in a sheet; `image` opens full size; `file` downloads.

## 9. `cli`

Renderer 2. Desktop 1280 px, one mono column, 13 px, on `--bg`. Verdict screen 9.

Four transcripts, each with the command as a prompt line `$ trellis ...` in `--fg` and the output in `--fg-muted`, in this order:

1. `trellis ready OP --epic routines-e2e`
2. `trellis deps OP-33`
3. `trellis evidence check 57080`
4. `trellis summary write 57080 --headline "..." --why - --watch "..."` with the four refusal lines

Text exactly as the four blocks in verdict screen 9. `MISSING` and `refused` in `--danger`. `exit 1` in `--fg-faint`. Under the transcripts, the verb list from the verdict as a fifth block with the label `verbs`. Nothing moves.

## 10. `epic-phone`

Renderer 1. Phone frame 390 px, height 844 px, scrollable inside the frame. Verdict screen 10.

Top to bottom:

1. Header row: `‹`, `Routines E2E`, `⋯`. 44 px tall.
2. Band: `Current: The run settles, and its state reaches the page` on two lines; `0 to start · 5 running · 2 for you`; the 6 px bar with `3 of 27` right. No legend.
3. The table grouped by what each row waits for. Group header `▾ Waits for you  2`, then two two-line rows of 56 px; group header `▾ With an agent  5`, then five rows; `▸ Waits on a merge  13`, `▸ Done  3` collapsed.

Rows, line 1: status glyph, identifier, title cut with an ellipsis, then the agent card at the right edge. Line 2, 12 px `--fg-muted`, one of: the pull request glyph and number with `open` or `draft`, the checks in words and what it waits for; the agent's message; `waits on OP-32`; `releases n`.

| Row | Line 1 | Line 2 |
| --- | --- | --- |
| OP-35 | `◐ OP-35  Service: A run whose webh…  ⟨A⟩` | `⊙ #57057 open · 42 passed · you` |
| OP-27 | `◐ OP-27  Web: Bound the Operator me…  ⟨A⟩` | `⊙ #56930 open · 37 passed · you` |
| OP-32 | `◐ OP-32  Service: A routine run op…  ⟨A⟩` | `crisp-fjord: I rebased onto master. post_message…` |
| OP-37 | `◐ OP-37  API: A run's state on the…  ⟨A⟩` | `⊙ #57078 draft · 1 failed · crisp-fjord` |
| OP-43 | `◐ OP-43  Canary: A private Canary r…  ⟨A⟩` | `⊙ #57080 open · 1 failed · 6 pending · crisp-fjord` |
| OP-33 | `◐ OP-33  Service: One routine's fai…  ⟨A⟩` | `⊙ #57055 draft · 9 passed · crisp-fjord` |
| OP-39 | `◐ OP-39  Service: The chat list ans…  ⟨A⟩` | `⊙ #57079 draft · 1 failed · crisp-fjord` |

The card on OP-32 carries the glimmer. `failed` is `--danger`. Every row is a 44 px or taller touch target.

Footer: the example-value line of 0.2, inside the frame.
