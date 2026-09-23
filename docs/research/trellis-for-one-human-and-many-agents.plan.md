# Build plan: Trellis for one human and many agents

The merged plan of `plan-server.md`, `plan-web.md` and `plan-cli.md` for the proposal in `docs/research/trellis-for-one-human-and-many-agents.md`. Every path is relative to `/Users/navidkhan/.superset/worktrees/974494a1-2921-48f1-b1b1-9589e4a5f428/features`.

One ticket is one pull request that one agent builds in one run. A wave is a set of tickets one person can start together on separate agents with no file conflict. A dependency says what must merge first. A wave gates nothing.

## 0. What the merge changed

The three plans left eleven conflicts. This section names each one and the ruling.

| Conflict | Ruling |
| --- | --- |
| The STE check had two owners. `plan-server.md` S13 imported it from the CLI plan's ticket 1. `plan-cli.md` folded ticket 1 into S13. Both pointed at the other. | One ticket, T04, builds `packages/api/src/steCheck/**` in wave 1 with no dependency. T30 (S13), T44 (CLI-5) and T33 (CLI-9) import it. |
| The risk classifier had two copies: S7 in `packages/api/src/prPaths` and WEB-06 in the web. | T05 builds `packages/api/src/prPaths/**` in wave 1 as a pure module. T16 (WEB-06) and T25 (S7) import it. The module also answers the file group (Risk, Behavior, Tests, Noise) per path. |
| The run state words had three copies: S4 `runLine`, WEB-10 `agentLineText`, WEB-20 `runStateWords`. | T11 (S4) owns the words. T29 (WEB-10) and T39 (WEB-20) import `runLine` from `@trellis/api` and build no text module. |
| S14 depended on WEB-12 and WEB-12 depended on S14. | T27 (S14) lands first and edits the two `epicNext` files. T41 (WEB-12) lands after it. |
| The rename: S17 claimed 129 files, CLI ticket 2 claimed the nine CLI files, WEB-09 claimed the web labels. | T07 (WEB-09) renames the eight web labels in wave 1, so the person reads `Wave` on day one. T73 (S17) renames every identifier, the CLI files and the docs in wave 13, alone. CLI ticket 2 is folded into T73. |
| `SRV-WAITING` had no ticket in two plans. | `plan-server.md` added S18. It is T26. |
| `SRV-RESOURCE` and `SRV-OUTCOME` had no ticket in any plan. | The outcome column joins T24 (S11), which already adds columns to `tickets`. A new ticket T51 builds `epic_resources`. Both are marked **added by the merge**. |
| S11 and CLI ticket 13 both printed the contract in `brief.ts`. | T24 (S11) adds the fields and the write path only. T50 (CLI-13) owns every brief section. T24 drops `brief.ts` and `brief.test.ts`. |
| S7 and S11 both edit `packages/api/src/schemas/ticket.ts` in one wave. | T10 (S6) puts the pull request row schema in its own file `packages/api/src/schemas/ticketPr.ts` and the lateral in `apps/server/src/db/queries/ticketPrs.ts`. T25 edits `ticketPr.ts`; T24 edits `ticket.ts`. |
| `TicketSummary.prs` collides with `Ticket.prs`, which `TicketSchema` declares at `packages/api/src/schemas/ticket.ts:104`. | The summary field is named `prRows`. `Ticket.prs` stays. |
| S10 wrote `releases` as a count; WEB-19 needs the list. | T19 writes `releases[]` with the identifier and the title. A count is the length. |
| The review page loads no ticket (`ReviewPage.tsx` and `useReviewData.ts` name none), so the conditions block has no source for the row facts. | T28 makes `reviews.status` return the linked ticket identifier and its `prRows` entry. |

Rules that hold for every ticket:

- Target under 300 changed lines and under 15 files. A generated migration snapshot (`apps/server/drizzle/meta/*_snapshot.json`, about 4,500 lines) does not count. Three tickets exceed the target and say so: T06 (a file split), T65 (a deletion sweep), T73 (a rename).
- `bun test <directory>` on the unit directory, never bare `bun test`. `bun scripts/check.ts` runs `turbo run lint typecheck typecheck:repo`. A component test is an SSR string assertion with `renderToStaticMarkup`. No e2e suite exists.
- A frontend ticket owes the floor: the summary, the after image at 1440x900 dark, the before image from the merge base, the capture record, the console list. Each frontend ticket names only its extra evidence. A backend ticket owes the summary, the verify record, the test proof and the contract table, plus the picture its kind asks for.
- The gallery visual check is `bun run --filter @trellis/ui gallery` and the route `/_gallery`. The route visual check is a scratch server: `TRELLIS_HOME=$TMPDIR/trellis-<ticket> TRELLIS_PORT=0 bun run dev`, seeded with the CLI, captured with Aside in the agent's own worktree.
- Append files take one row per ticket and merge clean with no dependency: `packages/api/src/index.ts`, `apps/server/src/services/registry.ts`, `packages/api/src/contract/tickets.ts`, `packages/api/src/contract/pullRequests.ts`, `packages/api/src/contract/index.ts`, `packages/cli/src/verbs.ts`, `packages/ui/src/gallery/components/DomainSections/sections/index.ts`, `packages/ui/src/index.ts`.
- `AGENTS.md` applies: STE prose, no em dashes, happy-path code, a file over 300 lines splits.
- The four decisions of section 8 of the verdict take the judge's recommendation. Section 6 lists every ticket that changes if one goes the other way.

## 1. The waves

| Wave | Tickets | What lands | Migration |
| --- | --- | --- | --- |
| 1. Marks, motion, the first facts | T01 T02 T03 T04 T05 T06 T07 T08 | The size of every pull request in the store. The agent's last message on the wire. The Claude question text. The STE check and the path rules as pure modules. No violet. The word `Wave` on every label. The gallery ready for fourteen new sections. | 0082 (T01) |
| 2. The review blocks and the epic band | T09 T10 T11 T12 T13 T14 T15 T16 T17 | The dependency table with its cycle check. Pull request rows on every ticket row. The run state words. The glimmer. The GitHub glyph. The band as three lines. In the gallery: the checks in words, the files by risk, the review focus list. | 0083 (T09) |
| 3. Dependencies on the row, the conditions block | T18 T19 T20 T21 T22 T23 | `waitsOn[]`, `releases[]`, `ready` and `stackedOn` on every row. The real edges of Routines E2E imported. `trellis edit --after` and `trellis deps`. The pull request row under a ticket on the epic page. The conditions block in the gallery. | 0084 (T18) |
| 4. What a row waits for, the contract fields, the band counts | T24 T25 T26 T27 T28 T29 | The contract and the outcome on a ticket. The kind and the risk of every pull request. What a row waits for. The band counts from dependencies. The review status names its ticket. The agent line under a title on the epic page. | 0085 (T24) |
| 5. The chain on the row and the ticket, the contract verbs | T30 T31 T32 T33 T34 T35 T36 T37 T38 T39 | The summary store with the STE refusal. The contracts of Routines E2E imported. `trellis contract`, `trellis outcome`, `trellis ready`. The `waits` and `releases` columns. The pull request row filled with size, checks, stack, flow and what it waits for. The contract block, the chain block and the run line in the gallery. | 0086 (T30) |
| 6. Group by waiting, the evidence store, the epic in the terminal | T40 T41 T42 T43 T44 T45 | The evidence records and the floor. `Group by: Wave · Waiting`. The change summary block. The start controls. `trellis summary write`. `trellis epics show` in the words of the epic page. | 0087 (T40) |
| 7. Evidence on the page | T46 T47 T48 T49 T50 | The review that reaches a live run. The frontend evidence strip. The evidence word on the pull request row. `trellis evidence add`. The contract and the evidence owed in the brief. | none |
| 8. The review page in one column, the resources store | T51 T52 T54 T55 T57 | The review page with nine regions. The backend evidence strip. `epic_resources`. `trellis evidence list`. The chain in the brief. | 0088 (T51) |
| 9. The ticket page in one column, the verdict bar | T58 T59 T60 T61 T62 | The verdict bar with a live `Merge`. The ticket page as five clauses. The resource list in the gallery. `trellis evidence check`. `trellis resource`. | none |
| 10. Deletions, the hand-over rule, the capture recipe | T63 T64 T65 T66 T67 | The old review summary, the reviewer picker, the feed, the threads, the tabs and the metrics are gone. `docs/UI_PATTERNS.md` updated once. The CLI refuses an agent hand-over with a missing floor. `docs/EVIDENCE.md`. | none |
| 11. Resources on the epic page, the agent's duty | T68 T69 | The resources section on the epic page and on a ticket. The evidence duty and the planner guidance in `trellis instructions`. | none |
| 12. The in-app browser and the phone | T70 T71 T72 | A doc opens in the editor, a link opens in the in-app browser. The epic page, the review page and the ticket page at 390 px. | none |
| 13. The word wave | T73 | Every identifier, column, route and ref says `wave`. Lands alone. | 0089 (T73) |
| 14. The architecture doc | T74 | `docs/ARCHITECTURE.md` describes the loop as the code does it. | none |

The review page is 60 to 75 percent of his day. Waves 2 and 3 put every review block in the gallery. Wave 3 puts the dependency cells and the pull request rows on the epic page. Wave 8 assembles the review page. The migration chain (eight migrations, one per wave) sets the floor of fourteen waves.

## 2. The dependency edges

Migration-order edges carry the mark (m): they exist so two migrations never generate in one wave, and they carry no code dependency.

```
T09 after T01 (m)
T10 after T01
T11 after T02, T03
T12 after T06, T08
T13 after T06
T14 after T07
T15 after T06
T16 after T05, T06
T17 after T06
T18 after T01, T09 (m)
T19 after T09, T10
T20 after T09
T21 after T09
T22 after T13
T23 after T05, T06, T10
T24 after T09, T18 (m), T19
T25 after T05, T10, T18
T26 after T10, T19
T27 after T19
T28 after T10
T29 after T02, T03, T11, T22
T30 after T04, T24
T31 after T24
T32 after T24
T33 after T04, T24
T34 after T19, T21, T26
T35 after T07, T09, T19, T29
T36 after T01, T10, T19, T22, T26
T37 after T06, T24
T38 after T06, T09, T19, T29
T39 after T02, T06, T11, T12, T29
T40 after T19, T24, T25, T30
T41 after T14, T26, T27, T35
T42 after T06, T30
T43 after T06, T19, T39
T44 after T01, T30
T45 after T01, T21, T26, T34
T46 after T19, T24, T40
T47 after T06, T25, T40
T48 after T36, T40
T49 after T40
T50 after T05, T24, T32, T40
T52 after T25, T40, T47
T54 after T15, T16, T17, T23, T26, T28, T42, T47
T55 after T49
T57 after T19, T21, T24, T50
T58 after T46, T54
T59 after T24, T37, T38, T39, T43
T60 after T06, T51
T61 after T25, T40, T49, T55
T62 after T51
T63 after T54, T58
T64 after T58
T65 after T59
T66 after T61
T67 after T44, T49, T55, T61
T68 after T35, T59, T60, T65
T69 after T44, T45, T49, T61, T66, T67
T70 after T68
T71 after T29, T36, T41, T48, T68
T72 after T54, T58, T59, T63, T64, T65, T68
T73 after every ticket T01 to T72
T74 after T73
```

## 3. Every ticket

Field order in each block: Result. Touches. Creates. Leave alone. Verify. Review focus. Evidence. Depends on. Estimate. Risk. New UI element. Decision mark. Source names the plan ticket it comes from.

### Wave 1. Marks, motion, the first facts

#### T01. Store the size of a pull request

Source: S3.

**Result.** The poller stores `additions`, `deletions` and `changed_files` for every pull request, and `PullRequest` carries the three numbers.

**Touches.** `apps/server/src/gh/graphql.ts` (the `selection` string at lines 65-72, `RawPullRequest`, `PullRequestContent`, `toRow`), `apps/server/src/db/tables/pullRequests.ts`, `packages/api/src/schemas/pullRequest.ts`, `apps/server/src/gh/pollerWrite.ts` (`PR_COLUMNS` at lines 27-30, `prValues`, the upsert), `apps/server/src/services/pullRequests.ts` (the column list at lines 65-79, `writeUnfetched`), `apps/server/src/services/pullRequestRows.ts`.

**Creates.** `apps/server/src/gh/graphql.test.ts`. One migration under `apps/server/drizzle/` with `bun run db:generate` after `0081_spooky_giant_girl`, and its snapshot.

**Leave alone.** `apps/server/src/services/reviews/revision.ts` (the review page reads its own `gh pr view` fields at line 22). `apps/server/src/gh/parse.ts`.

**Verify.** `bun test apps/server/src/gh` · `bun test apps/server/src/services` · `bun scripts/check.ts`.

**Review focus.** `contentHash` covers every field of `PullRequestContent`, so every stored row rewrites once on the next poll. A row written before the migration holds the default and must read as `0`, not crash. `writeUnfetched` inserts a partial row and needs the default too.

**Evidence.** Backend: summary, verify record, test proof, contract table of `PullRequestSchema`, migration plan (phase, two-way compatibility, lock cost on `pull_requests`, backfill, rollback). Picture: the migration plan table.

**Depends on.** Nothing.

**Estimate.** 110 lines, 9 files.

**Risk.** migration, shared type.

**New UI element.** None.

#### T02. Forward the last message and the last tool into the run observation

Source: S1.

**Result.** `AgentRun.observation` carries `lastMessage` and `lastTool`, and the session monitor sends an event when either one changes.

**Touches.** `apps/server/src/services/agentRuns/liveState.ts` (the observation literal at lines 114-121), `packages/api/src/schemas/agentRun.ts` (the `observation` object at lines 28-37), `apps/server/src/agents/sessionMonitor/sessionMonitor.ts` (`fingerprint` at lines 6-17), `apps/server/src/agents/sessionMonitor/sessionMonitor.test.ts`.

**Creates.** `apps/server/src/services/agentRuns/liveState.test.ts`.

**Leave alone.** `packages/runtime-protocol/src/index.ts` (`RuntimeAgentMetadata` already holds both at lines 63-81; the protocol version stays 11). `packages/api/src/sessionStatus/sessionStatus.ts`. `apps/server/src/agents/harnesses/**`.

**Verify.** `bun test apps/server/src/services/agentRuns` · `bun test apps/server/src/agents/sessionMonitor` · `bun scripts/check.ts`.

**Review focus.** `HarnessTool` carries `input` and `output`, which can hold a whole file. Forward the tool name, the status and the two times only. The fingerprint uses the two times, never the message text.

**Evidence.** Backend: summary, verify record, test proof, contract table of `AgentRun.observation`. No picture.

**Depends on.** Nothing.

**Estimate.** 110 lines, 5 files.

**Risk.** shared type.

**New UI element.** None.

#### T03. Read the Claude question text from the tool input

Source: S2.

**Result.** A Claude Code `AskUserQuestion` hook writes the question text and its options into `inputRequest.questions[]`.

**Touches.** `apps/server/src/agents/harnesses/claude/parseClaudeEvent.ts` (the `AskUserQuestion` branch at lines 86-99).

**Creates.** `apps/server/src/agents/harnesses/claude/parseClaudeEvent.test.ts`.

**Leave alone.** `packages/runtime-protocol/src/index.ts`. `apps/server/src/agents/harnesses/muse/museQuestions.ts`. `apps/server/src/agents/harnesses/codex/**`. `apps/server/src/services/agentRuns/answerQuestion.ts`.

**Verify.** `bun test apps/server/src/agents/harnesses` · `bun scripts/check.ts`.

**Review focus.** The parser runs on every `PreToolUse` hook. Parse `tool_input` with a zod schema that takes the fields it needs and ignores the rest. Keep the title `The agent has a question in the terminal` when the input holds no question.

**Evidence.** Backend: summary, verify record, test proof with one test per harness shape, contract table of the `input-request` event of kind `question`. No picture.

**Depends on.** Nothing.

**Estimate.** 110 lines, 2 files.

**Risk.** none.

**New UI element.** None.

#### T04. Build the STE check for a summary

Source: CLI ticket 1, unfolded. The server and the CLI import one module.

**Result.** `steCheck(text, {headline})` returns `{refusals, warnings}` for the seven rules of section 4.4 of the verdict, and it leaves quoted material alone.

**Touches.** `packages/api/src/index.ts` (one appended export line).

**Creates.** `packages/api/src/steCheck/steCheck.ts`, `packages/api/src/steCheck/quoted.ts`, `packages/api/src/steCheck/steCheck.test.ts`, `packages/api/src/steCheck/quoted.test.ts`, `packages/api/src/steCheck/index.ts`.

**The rules.** Refuse: an em dash; a sentence over 25 words; a headline over 12 words; a headline that does not start with a verb; a noun cluster over 3 words. Warn: a passive form; a gerund used as a noun. Quoted material stays untouched: a backtick span, a quoted string, an error line, a check name, a test name, a path.

**Leave alone.** `packages/cli/**`, `apps/server/**`. The readers land in T30, T33 and T44.

**Verify.** `bun test packages/api/src/steCheck` · `bun scripts/check.ts`.

**Review focus.** The check reports and never rewrites. One test asserts the worked example of section 4.5 passes. One test per refusal asserts the four transcript lines of screen 9 fire with their exact rule text. The verb list for the headline rule is a table in the module, not a guess.

**Evidence.** Backend: summary, verify record, test proof, contract table of the exported function and its return shape. No picture.

**Depends on.** Nothing.

**Estimate.** 300 lines, 6 files. At the target. If the rule set grows, `quoted.ts` and its test become their own ticket.

**Risk.** shared type (a new export of `packages/api`).

**New UI element.** None.

#### T05. Read the kind, the risk classes and the file group of a pull request from its paths

Source: S7, the pure half. WEB-06 imports it.

**Result.** `prPaths(repo, paths[])` returns the kind (`frontend`, `backend`, `mixed`), the five risk answers, and one group per path (`risk`, `behavior`, `tests`, `noise`).

**Touches.** `packages/api/src/index.ts` (one appended export line).

**Creates.** `packages/api/src/prPaths/prPaths.ts`, `packages/api/src/prPaths/prPaths.test.ts`, `packages/api/src/prPaths/index.ts`.

**The rules.** Section 4.1: a file that renders a route makes the kind `frontend` (`frontend/**` in `canary`; `apps/web/**` and `packages/ui/**` in Trellis). Risk answers: `auth`, `migration`, `dependency`, `sharedType`, `deletedTest`, each `yes` or `no`. Groups: `risk` holds migrations, auth paths, dependency manifests, shared types, deleted tests, public API files, secret-like strings; `tests` holds test files; `noise` holds generated files, lock files, snapshots; `behavior` holds the rest. The rules are one table keyed by repository name with a default.

**Leave alone.** `apps/server/**`, `apps/web/**`. T25 binds the server, T16 binds the web.

**Verify.** `bun test packages/api/src/prPaths` · `bun scripts/check.ts`.

**Review focus.** A wrong `frontend` asks for screenshots of a change that renders nothing. A wrong `noise` hides a file from the reviewer. One test per risk class, one per kind, one per group.

**Evidence.** Backend: summary, verify record, test proof, contract table of the exported function. No picture.

**Depends on.** Nothing.

**Estimate.** 150 lines, 4 files.

**Risk.** shared type.

**New UI element.** None.

#### T06. Split the gallery domain sections into one file per section

Source: WEB-00.

**Result.** `DomainSections.tsx` holds no section body, each of its eleven sections lives in its own file under `sections/`, and the gallery draws the same page as before.

**Touches.** `packages/ui/src/gallery/components/DomainSections/DomainSections.tsx` (303 lines today).

**Creates.** `packages/ui/src/gallery/components/DomainSections/sections/<Name>.tsx`, eleven files. `packages/ui/src/gallery/components/DomainSections/sections/index.ts`, an append file.

**Leave alone.** `packages/ui/src/gallery/components/Section`, `DisplaySections`, `ControlSections`, `OverlaySections`, `CompositionSection`.

**Verify.** `bun scripts/check.ts` · the gallery; the before and after images must be identical.

**Review focus.** The move changes no markup. The section order, the names and the notes match line for line.

**Evidence.** Frontend floor. No extra.

**Depends on.** Nothing.

**Estimate.** 330 lines, 13 files. A mechanical file split, so it passes the line target for that reason.

**Risk.** none.

**New UI element.** None.

#### T07. Rename the wave label to Wave in the web app

Source: WEB-09.

**Result.** Every word a person reads in the web app says `Wave`, and every identifier in the code still says `wave`.

**Touches.** `apps/web/src/features/table/columns.tsx:55`, `apps/web/src/features/table/DisplayPopover/DisplayPopover.tsx:36`, `apps/web/src/features/filters/fields.ts:63`, `apps/web/src/features/filters/FilterBar/components/FilterPicker/FilterPicker.tsx:214`, `apps/web/src/features/command/utils/submenuRows/submenuRows.tsx:65`, `apps/web/src/features/composer/CreateTicketDialog/components/ChipRow/ChipRow.tsx:184,187`, `apps/web/src/features/epics/EpicPage/components/EpicProgress/EpicProgress.tsx:65`, `apps/web/src/features/ticket/PropertiesRail/components/WaveRow/WaveRow.tsx`, `apps/web/src/features/epics/EpicSheet/components/WavesSection/WavesSection.tsx`.

**Leave alone.** `packages/api/**`, `apps/server/**`, `packages/cli/**`, the URL search key `wave`, every type name, every `Group` value. T73 renames the identifiers.

**Verify.** `bun test apps/web/src/features/table` · `bun test apps/web/src/features/filters` · `bun scripts/check.ts` · the epic route and the Display popover.

**Review focus.** A filter string in the URL and in `Copy as CLI` is a contract with the CLI and keeps the word `wave`. Only the rendered label changes.

**Evidence.** Frontend floor. No extra.

**Depends on.** Nothing. T14 and T35 wait on it because they edit `EpicProgress.tsx` and `columns.tsx`.

**Estimate.** 20 lines, 10 files.

**Risk.** none.

**New UI element.** None.

#### T08. Remove the violet from every product mark

Source: WEB-01.

**Result.** No screen draws `--agent` or `--film-violet` except the GitHub merged pull request glyph, and the gallery shows the same pages with no purple.

**Touches.** `packages/ui/src/domain/StatusIcon/StatusIcon.tsx:36`, `packages/ui/src/primitives/Badge/Badge.tsx:20`, `packages/ui/src/domain/chartTones.ts:11,33`, `packages/ui/src/tokens.css:51` (drop the `--film-violet` stop from `--film-gradient`; keep the variable), `packages/ui/src/agent-mark.css:24`, `packages/ui/src/ticket-glimmer.css:109,129,146,175`, `packages/ui/src/primitives/AgentMark/AgentMark.tsx:8`, `apps/web/src/features/epics/epicBar/epicBar.ts:13`, `apps/web/src/features/epics/epicBar/epicBar.test.ts`, `apps/web/src/features/project-settings/StatusRow/StatusRow.tsx:29`.

**Leave alone.** `PrStateIcon.tsx:18` and `PrCell.tsx:13` (the merged glyph keeps `text-agent`). `ActivityLine.tsx:28` (T65 deletes the file).

**Verify.** `bun test packages/ui/src/domain` · `bun test apps/web/src/features/epics` · `bun scripts/check.ts` · the gallery in both themes.

**Review focus.** The `agent` tone stays in the `Badge` and `chartTones` unions and points at the accent color. Five callers pass it: `SystemUsage.tsx:90`, `UsageTotals.tsx:51`, `NotesSettings.tsx:102`, `epicBar.ts:13`, `DisplaySections.tsx:41`. Open each screen. The light theme `accent` must stay one visible step from `faint`.

**Evidence.** Frontend floor. Extra: the 390 px viewport and the light theme, because the change moves colors.

**Depends on.** Nothing.

**Estimate.** 30 lines, 10 files.

**Risk.** shared type (no type changes; the union keeps its member).

**New UI element.** None.

### Wave 2. The review blocks and the epic band

#### T09. Add the ticket dependency table and the cycle check

Source: S8.

**Result.** A ticket depends on another ticket through the table `ticket_deps`, and a write that would close a cycle fails and names the path.

**Touches.** `apps/server/src/db/schema.ts` (the export), `packages/api/src/schemas/ticketWrite.ts` (`after`, `notAfter`), `packages/api/src/contract/tickets.ts` (one appended block), `apps/server/src/services/tickets/**` (the write path), `apps/server/src/procedures/tickets.ts`, `apps/server/src/services/registry.ts` (one appended import and row).

**Creates.** `apps/server/src/db/tables/ticketDeps.ts` (ticket_id, depends_on_id, source in `manual | parsed | derived`, created_at; primary key the pair; both foreign keys cascade). `apps/server/src/services/tickets/ticketDeps.test.ts`. One migration with `bun run db:generate` after the newest tag on `main`, and its snapshot.

**Leave alone.** `packages/cli/**` (T21). `apps/server/src/db/tables/waves.ts`. `apps/server/src/db/queries/ticketSummary.ts` (T19).

**Verify.** `bun test apps/server/src/services/tickets` · `bun test apps/server/src/db` · `bun scripts/check.ts`.

**Review focus.** The cycle check runs inside the write transaction with a recursive walk from `depends_on_id` and names every identifier of the path. A self edge is refused by a `CHECK`, as `tickets_parent_not_self` does at `apps/server/src/db/schema.ts:103`.

**Evidence.** Backend: summary, verify record, test proof with a refused cycle of three tickets, contract table of the ticket write input, migration plan. Picture: a Mermaid sequence of the write and the cycle walk.

**Depends on.** T01 (m).

**Estimate.** 240 lines, 9 files.

**Risk.** migration, shared type.

**New UI element.** None.

#### T10. Add the pull request rows to a ticket row

Source: S6.

**Result.** `TicketSummary` carries `prRows[]`, one entry per linked pull request, with the facts of the pull request row.

**Touches.** `apps/server/src/db/queries/ticketSummary.ts` (`SummaryRow`, `summaryColumns`, `toSummary`; the pull request lateral at lines 108-128 moves out), `packages/api/src/schemas/ticket.ts` (`prRows` on `TicketSummarySchema`), `apps/server/src/db/queries/support.ts` if a rank helper is needed.

**Creates.** `apps/server/src/db/queries/ticketPrs.ts` (the lateral), `packages/api/src/schemas/ticketPr.ts` (`TicketPrSchema`), `apps/server/src/db/ticketPrs.test.ts`.

**The entry.** `number`, `owner`, `repo`, `url`, `state`, `isDraft`, `additions`, `deletions`, `changedFiles`, `sizeBand` (`small` under 200, `medium` 200 to 400, `large` above), `pass`, `fail`, `pending`, `skipped`, `failedChecks[]` (name, workflow), `openThreads`, `flowRuns[]` (state), `baseRef`, `headRef`. Checks fold as `bucketCount` does at `ticketSummary.ts:56`; `cancel` counts as a fail. Open threads reuse the clause at `apps/server/src/services/reviews/prs.ts:37`. Flow runs read `flow_executions` by `ticket_id`; a ticket with two pull requests shows the same flow runs on both, and the summary says so.

**Leave alone.** The `pr` badge (`PrBadgeSchema` at `ticket.ts:45-56`, the field at line 90). `apps/server/src/db/queries/ticketGet.ts`. `apps/server/src/services/pullRequestRows.ts`.

**Verify.** `bun test apps/server/src/db` · `bun scripts/check.ts`.

**Review focus.** `prRows[]` carries the failed check names only, never the passed names. Measure one epic payload of 27 tickets before and after, and write both numbers with the head sha. `ticketSummary.ts` is 210 lines and four tickets add to it, so the lateral moves out here.

**Evidence.** Backend: summary, verify record, test proof, contract table of `TicketSummarySchema` one row per field, the payload size with its sha. No picture.

**Depends on.** T01.

**Estimate.** 260 lines, 6 files.

**Risk.** shared type.

**New UI element.** None.

#### T11. Turn a run into the state words of a row

Source: S4.

**Result.** One pure function `runLine(run)` in `packages/api` turns an `AgentRun` into the words of section 3 of the verdict.

**Touches.** `packages/api/src/index.ts` (one appended export line).

**Creates.** `packages/api/src/runLine/runLine.ts`, `packages/api/src/runLine/runLine.test.ts`, `packages/api/src/runLine/index.ts`.

**Leave alone.** `packages/api/src/sessionStatus/sessionStatus.ts` (the session sheet keeps its words; `runLine` reads it). `apps/web/**`.

**Verify.** `bun test packages/api/src/runLine` · `bun test packages/api/src` · `bun scripts/check.ts`.

**Review focus.** `turn done, new` holds only while `observation.attention.completion.sequence` is above `seenAttention.sequence` and `seenAttention.attemptId` equals `terminalId`. A marker from an earlier attempt counts as zero, as `sessionStatus.ts:23` reads it. One test per row of the fourteen-row table.

**Evidence.** Backend: summary, verify record, test proof one per row, contract table that maps each harness signal to its words. Picture: a Mermaid state diagram.

**Depends on.** T02, T03.

**Estimate.** 190 lines, 4 files.

**Risk.** shared type.

**New UI element.** None.

#### T12. Draw the glimmer on the agent card while the run works

Source: WEB-02.

**Result.** An 18 px agent card whose run is working sweeps one band of light every 7 seconds and stays still in between, and a card whose run is not working never moves.

**Touches.** `packages/ui/src/primitives/Avatar/components/AgentProfileMark/AgentProfileMark.tsx`, `packages/ui/src/primitives/Avatar/Avatar.tsx:44`, `packages/ui/src/agent-mark.css`.

**Creates.** `packages/ui/src/primitives/Avatar/components/AgentProfileMark/AgentProfileMark.test.tsx`, `packages/ui/src/gallery/components/DomainSections/sections/AgentCard.tsx` and its line in `sections/index.ts`.

**Leave alone.** `packages/ui/src/primitives/AgentMark/AgentMark.tsx`, `useAgentMotion.ts`. `apps/web/src/features/agents/ActorAvatar/ActorAvatar.tsx` passes `working` for a run that works.

**Verify.** `bun test packages/ui/src/primitives/Avatar` · `bun scripts/check.ts` · the gallery, one card watched for 15 seconds.

**Review focus.** `prefers-reduced-motion: reduce` stops the sweep, as `agent-mark.css:80-90` does for the 32 px mark. The sweep does not run while the tab is hidden or the card is off screen; `useAgentMotion.ts:29-38` is the pattern.

**Evidence.** Frontend floor. Extra: a clip of 15 s or less.

**Depends on.** T06, T08.

**Estimate.** 120 lines, 6 files.

**Risk.** none.

**New UI element.** None. The card exists; it gains a state.

#### T13. Draw the GitHub pull request glyph in its four states

Source: WEB-03.

**Result.** A pull request draws one glyph in GitHub's shape and color for open, draft, merged and closed, and the glyph carries no check result.

**Touches.** `packages/ui/src/index.ts` (the export), `apps/web/src/features/prs/PullRequests/components/PullRequestRow/components/PrStateIcon/PrStateIcon.tsx` (drop the `blocked` look), `apps/web/src/features/table/Row/components/PrCell/PrCell.tsx`.

**Creates.** `packages/ui/src/domain/PrGlyph/PrGlyph.tsx`, `PrGlyph.test.tsx`, `index.ts`. `packages/ui/src/gallery/components/DomainSections/sections/PrGlyph.tsx` and its line in `sections/index.ts`.

**Leave alone.** `packages/ui/src/domain/CheckRing` (other routes keep it).

**Verify.** `bun test packages/ui/src/domain/PrGlyph` · `bun scripts/check.ts` · the gallery in both themes.

**Review focus.** The `blocked` look disappears, so a failed check no longer turns the glyph red on the ticket page and the board. `PrCell` keeps its ribbon and its dot, so the check result still reads there.

**Evidence.** Frontend floor. Extra: the 390 px viewport and the light theme (a color is added).

**Depends on.** T06.

**Estimate.** 135 lines, 8 files.

**Risk.** shared type (`PrStateIcon` loses one member of an internal map; no caller reads it).

**New UI element.** `PrGlyph`.

#### T14. Rewrite the epic band as three lines, one bar and a word legend

Source: WEB-04.

**Result.** The epic band prints the current wave line, the three counts, one 6 px stacked bar and one word legend with no bucket dropped, and it draws no bar per wave.

**Touches.** `apps/web/src/features/epics/EpicPage/components/EpicProgress/EpicProgress.tsx` (78 lines, rewritten).

**Creates.** `apps/web/src/features/epics/EpicPage/components/EpicProgress/bandLegend/bandLegend.ts`, `bandLegend.test.ts`, `index.ts`.

**Leave alone.** `apps/web/src/features/epics/epicNext/epicNext.ts` (T27 and T41). `packages/ui/src/domain/StackedBarList`. `docs/UI_PATTERNS.md` (T65 updates it once).

**Verify.** `bun test apps/web/src/features/epics` · `bun scripts/check.ts` · the epic route on the scratch server.

**Review focus.** The band plus the plan stay under half the page card (`EpicPage.tsx:224-228`). The `Badge` line and the `n of n done` line fold into lines 3 and 4, so the band loses a row.

**Evidence.** Frontend floor. Extra: the 390 px viewport and the light theme.

**Depends on.** T07.

**Estimate.** 150 lines, 4 files.

**Risk.** none.

**New UI element.** None.

#### T15. Build the checks list in words

Source: WEB-05.

**Result.** The review page names every failed and pending check with its workflow and a link, prints `1 failed · 6 pending · 47 passed · 44 skipped` as the heading, collapses the passed and skipped groups, and draws no check ring.

**Touches.** `apps/web/src/features/reviews/ReviewChecks/ReviewChecks.tsx` (36 lines; becomes a shell).

**Creates.** `apps/web/src/features/reviews/ChecksLine/ChecksLine.tsx`, `ChecksLine.test.tsx`, `index.ts`, `checkWords/checkWords.ts`, `checkWords/checkWords.test.ts`. `packages/ui/src/gallery/components/DomainSections/sections/ChecksLine.tsx` and its line in `sections/index.ts`.

**Leave alone.** `apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx` (T54). `packages/ui/src/domain/CheckRing`.

**Verify.** `bun test apps/web/src/features/reviews/ChecksLine` · `bun scripts/check.ts` · the gallery.

**Review focus.** The bucket set is `pass`, `fail`, `pending`, `cancel`, `skipping` (`apps/server/src/gh/parse.ts:32-50`). `cancel` reads as a word. A zero bucket drops; a nonzero bucket never drops. The data comes from `revision.meta.statusCheckRollup`, which `ReviewChecks.tsx:10` reads today, so no server ticket is needed.

**Evidence.** Frontend floor. Extra: the empty, loading and error states.

**Depends on.** T06.

**Estimate.** 190 lines, 8 files.

**Risk.** none.

**New UI element.** `ChecksLine`.

#### T16. Build the file list grouped by risk

Source: WEB-06.

**Result.** The changed files of a pull request read in four groups, Risk, Behavior, Tests and Noise, each with its file count and line count, Noise collapsed, and each file carries a read mark that survives a revision unless that file changed.

**Touches.** Nothing that exists.

**Creates.** `apps/web/src/features/reviews/FileRiskGroups/FileRiskGroups.tsx`, `FileRiskGroups.test.tsx`, `index.ts`, `readMarks/readMarks.ts`, `readMarks/readMarks.test.ts`. `packages/ui/src/gallery/components/DomainSections/sections/FileRiskGroups.tsx` and its line in `sections/index.ts`.

**Leave alone.** `packages/ui/src/review/ReviewFiles` (the diff pane keeps it until T54). `packages/api/src/prPaths/**` (T05 owns the rules; this ticket imports `prPaths` and writes no classifier).

**Verify.** `bun test apps/web/src/features/reviews/FileRiskGroups` · `bun scripts/check.ts` · the gallery.

**Review focus.** The group per path comes from `prPaths` and from nowhere else. The read mark lives in `localStorage`, keyed by pull request, revision and path, as the diff mode does at `ReviewPage.tsx:34-35`. The file list arrives from `ReviewDiff` `onFiles` (`ReviewPage.tsx:37`, `:240`) until T18 stores it.

**Evidence.** Frontend floor. Extra: a clip (marking a file read and collapsing Noise is a task of more than one step).

**Depends on.** T05, T06.

**Estimate.** 240 lines, 7 files.

**Risk.** none.

**New UI element.** `FileRiskGroups`.

#### T17. Build the review focus checklist

Source: WEB-07.

**Result.** The review page prints each `Review focus` sentence of the ticket as an item the reviewer marks, prints `0 of 2 held` in the heading, and prints one faint line when the ticket names no focus.

**Touches.** Nothing that exists.

**Creates.** `apps/web/src/features/reviews/ReviewFocusList/ReviewFocusList.tsx`, `ReviewFocusList.test.tsx`, `index.ts`, `holdMarks/holdMarks.ts`, `holdMarks/holdMarks.test.ts`. `packages/ui/src/gallery/components/DomainSections/sections/ReviewFocusList.tsx` and its line in `sections/index.ts`.

**Leave alone.** `apps/web/src/features/ticket/SubTickets` (one counts tickets, one counts sentences; no shared component).

**Verify.** `bun test apps/web/src/features/reviews/ReviewFocusList` · `bun scripts/check.ts` · the gallery.

**Review focus.** A held mark survives a new revision unless a file the item names changed. Until T18 stores the file list, the mark clears on every revision and one faint line says so. The block takes the sentences as a prop; T54 wires `Ticket.contract.reviewFocus` after T24.

**Evidence.** Frontend floor. Extra: a clip.

**Depends on.** T06.

**Estimate.** 180 lines, 7 files.

**Risk.** none.

**New UI element.** `ReviewFocusList`.

**Decision 1 sensitive.** Prose instead of fields makes the sentences a parse result, and the block must show a sentence it failed to parse.

### Wave 3. Dependencies on the row, the conditions block

#### T18. Store the changed file list of a pull request

Source: S5.

**Result.** The poller stores the changed paths of a pull request with the added and deleted lines of each path, up to 300 paths.

**Touches.** `apps/server/src/gh/graphql.ts`, `apps/server/src/gh/parse.ts` (a `normalizeFiles` beside `normalizeChecks`), `apps/server/src/db/tables/pullRequests.ts` (a `files` jsonb column with a `jsonb_typeof` check, as line 40 has), `packages/api/src/schemas/pullRequest.ts` (`ChangedFileSchema`, `files[]`), `apps/server/src/gh/pollerWrite.ts`, `apps/server/src/services/pullRequests.ts`, `apps/server/src/services/pullRequestRows.ts`.

**Creates.** `apps/server/src/gh/parse.test.ts`. One migration and its snapshot.

**Leave alone.** `apps/server/src/gh/poller.ts` (the 10 s tick, the batch of 10, the 100 check contexts).

**Verify.** `bun test apps/server/src/gh` · `bun test apps/server/src/services` · `bun scripts/check.ts`.

**Review focus.** Ten pull requests with `files(first: 300)` each is up to 3,000 nodes in one GraphQL request, which can hit the GitHub node limit. Measure one real batch. Cut the page size until it passes. Write the number with its response in the summary.

**Evidence.** Backend: summary, verify record, test proof, contract table of `PullRequestSchema` with the row limit, migration plan. Picture: the migration plan table.

**Depends on.** T01, T09 (m).

**Estimate.** 180 lines, 10 files.

**Risk.** migration, shared type, dependency (the GitHub node budget).

**New UI element.** None.

#### T19. Add the waits, the releases and the ready fields to a ticket row

Source: S10, with `releases[]` as a list.

**Result.** `TicketSummary` carries `waitsOn[]`, `releases[]` and `ready`, and each pull request row carries `stackedOn`.

**Touches.** `apps/server/src/db/queries/ticketSummary.ts` (two laterals, the mapper), `apps/server/src/db/queries/ticketPrs.ts` (`stackedOn`), `packages/api/src/schemas/ticket.ts`, `packages/api/src/schemas/ticketPr.ts`.

**Creates.** `apps/server/src/db/ticketDepsSummary.test.ts`.

**The rules.** `waitsOn[]`: identifier, title, status category of each ticket this one waits on that is not done. `releases[]`: identifier and title of each ticket that waits on this one; a count is the length. `ready`: the category is `todo` and every ticket this one waits on is done. `stackedOn`: the base ref of a pull request equals the head ref of another pull request of the same epic.

**Leave alone.** `apps/server/src/services/waves/rows.ts` (T27). `apps/web/**`.

**Verify.** `bun test apps/server/src/db` · `bun scripts/check.ts`.

**Review focus.** The laterals run per page row, as the label lateral does. One level only: `waits` prints direct blockers. Compare the request time of an epic of 27 tickets with `Server-Timing db;dur` before and after, and write both numbers with the head sha.

**Evidence.** Backend: summary, verify record, test proof, contract table of `TicketSummarySchema` and `TicketPrSchema`, the two request times with their shas. No picture.

**Depends on.** T09, T10.

**Estimate.** 250 lines, 5 files.

**Risk.** shared type.

**New UI element.** None.

#### T20. Import the dependency edges from the ticket descriptions, once

Source: S9.

**Result.** One command reads `Depends on: step N` from the ticket descriptions of an epic and writes the edges with source `parsed`.

**Touches.** `apps/server/src/services/registry.ts` (append), `packages/api/src/contract/tickets.ts` (append), `packages/api/src/schemas/ticketWrite.ts`.

**Creates.** `apps/server/src/services/tickets/importDeps.ts`, `importDeps.test.ts`.

**The rules.** Every description of the real epic opens with `Step N of the routine runtime`, so the step map keys the edges. An edge is written only when both tickets sit in one epic and the map holds the step. A `manual` edge is never overwritten. The command is safe to run twice.

**Leave alone.** `packages/cli/**`. The descriptions. The branch graph (T19).

**Verify.** `bun test apps/server/src/services/tickets` · `bun scripts/check.ts`.

**Review focus.** A step the map does not hold is reported with its ticket identifier, never guessed.

**Evidence.** Backend: summary, verify record, test proof, `no contract changed` if no field is added, the output of one real run on the Routines E2E export with the edge count and the unresolved list. No picture.

**Depends on.** T09.

**Estimate.** 170 lines, 5 files.

**Risk.** none.

**New UI element.** None.

#### T21. Record a ticket dependency with --after and print it with trellis deps

Source: CLI ticket 3.

**Result.** `trellis edit OP-33 --after OP-32` writes one edge, `--not-after OP-32` removes it, and `trellis deps OP-33` prints the `waits on` list with each title and status, the `releases` list and the derived branch edge in the layout of screen 9.

**Touches.** `packages/cli/src/commands/create.ts` (`--after`, 52 lines today), `packages/cli/src/commands/edit.ts` (`--after`, `--not-after`, 46 lines), `packages/cli/src/verbs.ts` (one row, `deps`).

**Creates.** `packages/cli/src/commands/deps/deps.ts`, `depsText.ts`, `depsText.test.ts`.

**Leave alone.** `packages/cli/src/flags.ts` (`repeatedFlag` at line 17 already reads a repeated flag). `packages/cli/src/instructions.md`, `packages/api/src/instructions.ts`, `docs/**`, `apps/server/**`.

**Verify.** `bun test packages/cli/src/commands/deps` · `bun scripts/check.ts` · `trellis deps OP-33` and `trellis deps OP-33 --json` against a scratch server seeded with the OP epic; record both transcripts.

**Review focus.** A cycle fails at write time with the path named. The CLI prints the server sentence, exits 4, and does not retry. `trellis move` already declares `--after` as "Place after this ticket in the column" (`move.ts:11`); the summary states that one word now carries two meanings across two verbs.

**Evidence.** Backend: summary, verify record, test proof for `depsText.test.ts`, contract table of `--after`, `--not-after`, the `deps` verb, its JSON shape and exit codes. No picture.

**Depends on.** T09.

**Estimate.** 240 lines, 6 files.

**Risk.** none.

**New UI element.** None.

#### T22. Add the pull request row kind to the ticket table

Source: WEB-08.

**Result.** A ticket row of the epic table is followed by one 32 px row per linked pull request with the GitHub glyph, the number, the state and the checks in words, and the virtual list keeps a fixed height per row kind.

**Touches.** `apps/web/src/features/table/utils/flattenGroups/flattenGroups.ts` (`TableItem` gains `{kind: "pr"}`), `apps/web/src/features/table/rowHeights.ts` (`prRowHeight = 32`), `apps/web/src/features/table/TicketTable/components/TableBody/TableBody.tsx` (`heightOf` at line 54, the render branch), `apps/web/src/features/epics/EpicPage/EpicPage.tsx` (rows on for this route only).

**Creates.** `apps/web/src/features/table/utils/flattenGroups/flattenGroups.test.ts`, `apps/web/src/features/table/PrRow/PrRow.tsx`, `PrRow.test.tsx`, `index.ts`.

**Leave alone.** `apps/web/src/features/table/Row/Row.tsx`, `columns.tsx`. Every other route keeps the flat list.

**Verify.** `bun test apps/web/src/features/table` · `bun scripts/check.ts` · the epic route scrolled through 27 rows.

**Review focus.** `estimateSize` at `TableBody.tsx:101` calls `heightOf`; a mismatched height makes the scroll jump. `rangeExtractor` keeps group headers mounted; a pull request row must not join that set. The row reads `prRows[]` from T10.

**Evidence.** Frontend floor. Extra: the 390 px viewport.

**Depends on.** T13. Data: T10.

**Estimate.** 150 lines, 8 files.

**Risk.** shared type (`TableItem`).

**New UI element.** `PrRow`.

#### T23. Build the conditions block

Source: WEB-14.

**Result.** The block prints `READY TO MERGE` with one of `yes`, `not yet` and `merged`, then nine condition lines in fixed order with a fixed label width, and it disables nothing.

**Touches.** Nothing that exists.

**Creates.** `apps/web/src/features/reviews/ConditionsBlock/ConditionsBlock.tsx`, `ConditionsBlock.test.tsx`, `index.ts`, `conditionLines/conditionLines.ts`, `conditionLines/conditionLines.test.ts`, `ShortConditions/ShortConditions.tsx` (the four-line form of the ticket page). `packages/ui/src/gallery/components/DomainSections/sections/ConditionsBlock.tsx` and its line in `sections/index.ts`.

**The input.** One `Conditions` props object: `size` and `sizeBand` and `risk` from the `TicketPr` entry (T10, T25); `tests` and `evidence` from the floor answer (T40, optional until then); `checks` from the entry; `threads`, `flows` from the entry; `base` from `liveBranchState` in `ReviewLive/liveBranch.ts`; `ancestors` from `waitsOn[]` (T19) joined with their `prRows`. T54 builds the object; this ticket types it and renders it.

**Leave alone.** `apps/web/src/features/reviews/ReviewSummary/ReviewSummary.tsx` (T63 deletes it).

**Verify.** `bun test apps/web/src/features/reviews/ConditionsBlock` · `bun scripts/check.ts` · the gallery with `#57080` and `#56930` as fixtures.

**Review focus.** `risk` prints five answers; an all clear is five `no` values, never a green badge. A band is a word. The readiness word disables nothing. A missing `tests` or `evidence` value prints `none registered`, never a zero.

**Evidence.** Frontend floor. Extra: the loading and error states, the light theme.

**Depends on.** T05, T06, T10.

**Estimate.** 240 lines, 8 files.

**Risk.** none.

**New UI element.** `ConditionsBlock`.

**Decision 1 sensitive.** Prose leaves `tests` and `ancestors` with no exact source; each reads `unknown`.

### Wave 4. What a row waits for, the contract fields, the band counts

#### T24. Add the contract fields and the outcome to a ticket

Source: S11, plus the outcome column (added by the merge; `SRV-OUTCOME` had no ticket).

**Result.** A ticket carries `result`, `files[]`, `leaveAlone[]`, `verify[]`, `reviewFocus[]` and `outcome`, and `tickets.contract` and `tickets.outcome` write them.

**Touches.** `apps/server/src/db/schema.ts` (the `tickets` table), `packages/api/src/schemas/ticket.ts` (`contract` and `outcome` on `TicketSchema`, not on the summary), `packages/api/src/schemas/ticketWrite.ts`, `packages/api/src/contract/tickets.ts` (two appended blocks), `apps/server/src/procedures/tickets.ts`, `apps/server/src/services/registry.ts` (append).

**Creates.** `apps/server/src/services/tickets/contract.ts`, `contract.test.ts`, `apps/server/src/services/tickets/outcome.ts`, `outcome.test.ts`. One migration and its snapshot.

**Leave alone.** `packages/cli/**` (T32, T33). `apps/server/src/services/brief.ts` and `brief.test.ts` (T50 prints the contract). `tickets.description` (the ask stays there). `packages/cli/src/instructions.md`.

**Verify.** `bun test apps/server/src/services/tickets` · `bun test apps/server/src/db` · `bun scripts/check.ts`.

**Review focus.** Three readers read the contract: the brief, the review page, the evidence check. Put it on `Ticket`, not `TicketSummary`; a list of 50 rows does not need the paths. The outcome is one sentence; the write refuses a second sentence. `outcome` is text, so the CLI runs the STE check (T33) and the server stores what passes.

**Evidence.** Backend: summary, verify record, test proof, contract table of `TicketSchema` and the two write inputs, migration plan. Picture: the migration plan table.

**Depends on.** T09, T18 (m), T19 (both write `schemas/ticket.ts`).

**Estimate.** 260 lines, 12 files.

**Risk.** migration, shared type.

**New UI element.** None.

**Decision 1 sensitive.** If Navid chooses prose, the contract half of this ticket and T31 disappear, and the review page and `trellis evidence check` parse the description at read time. The outcome column stays.

#### T25. Bind the kind and the risk into the pull request row

Source: S7, the binding half.

**Result.** Each `prRows[]` entry carries `kind` and `risk`, computed by `prPaths` from the stored file list.

**Touches.** `packages/api/src/schemas/ticketPr.ts` (`kind`, `risk`), `apps/server/src/db/queries/ticketPrs.ts` (the mapper calls `prPaths`), `apps/server/src/db/ticketPrs.test.ts`.

**Creates.** Nothing.

**Leave alone.** `packages/api/src/prPaths/**` (T05 owns the rules). `apps/server/src/gh/**`.

**Verify.** `bun test apps/server/src/db` · `bun scripts/check.ts`.

**Review focus.** The kind comes from the stored paths, never from the poller and never from the agent. A pull request with no stored file list yet (a row written before T18) reads `kind: unknown`, and the floor in T40 treats `unknown` as `backend` and says so.

**Evidence.** Backend: summary, verify record, test proof, contract table of `TicketPrSchema`. No picture.

**Depends on.** T05, T10, T18.

**Estimate.** 90 lines, 3 files.

**Risk.** shared type.

**New UI element.** None.

#### T26. Read what a ticket row waits for

Source: S18.

**Result.** One pure function `waitingFor(row, workingRun)` in `packages/api` turns a `TicketSummary` into one of the five groups of screen 2 of the verdict.

**Touches.** `packages/api/src/index.ts` (one appended export line).

**Creates.** `packages/api/src/waiting/waiting.ts`, `waiting.test.ts`, `index.ts`.

**The rules.** `you`: an open pull request that is not a draft, has no failed check and no open thread. `agent`: a draft, a failed check, an open thread, or a working run. `github`: not a draft, no failed check, one or more pending checks. `merge`: Todo and one or more unmet dependencies. `done`: category done. The function also answers for one pull request row.

**Leave alone.** `apps/server/**` (the reader computes this, and nothing stores it). `packages/cli/**`, `apps/web/**`.

**Verify.** `bun test packages/api/src/waiting` · `bun scripts/check.ts`.

**Review focus.** The five answers are exclusive and the order of the tests decides a row that matches two. Fix the order in the module. One test per answer plus one test for a row that matches `you` and `agent` at once.

**Evidence.** Backend: summary, verify record, test proof one per answer, contract table of the exported function. No picture.

**Depends on.** T10, T19.

**Estimate.** 150 lines, 4 files.

**Risk.** shared type.

**New UI element.** None.

#### T27. Replace the wave next counts with dependency counts

Source: S14. Lands before T41, which reads the new counts.

**Result.** `toStart` counts the tickets that are ready by their dependencies, `waitsForYou` counts the rows that wait for `you`, and `running` leaves the wire.

**Touches.** `apps/server/src/services/waves/rows.ts` (`running` at line 20, `hasOpenRun` at 31-35, `nextCounts` at 37-42, the column list at 47, `toWaveSummary` at 71), `packages/api/src/schemas/wave.ts` (the comment at 25-31, `running` at 42), `apps/server/src/db/waveNext.test.ts`, `apps/server/src/services/brief.test.ts` (the fixture at lines 130-131), `packages/cli/src/commands/waves.ts:26` (the count line; the file keeps its name until T73), `apps/web/src/features/epics/epicNext/epicNext.ts` (lines 6, 23, 48-52), `apps/web/src/features/epics/epicNext/epicNext.test.ts`.

**Creates.** Nothing.

**Leave alone.** `apps/server/src/services/epics/rows.ts`. Every other file under `apps/web` and `packages/cli`.

**Verify.** `bun test apps/server/src/db` · `bun test apps/server/src/services` · `bun test apps/web/src/features/epics` · `bun scripts/check.ts`.

**Review focus.** Removing `running` breaks every reader at once, so one pull request carries the server, the CLI line and the two web files. Five readers are known; a repository-wide search must prove no sixth, and the command and its output go in the verify record. The web counts working runs itself from the agent runs it already loads.

**Evidence.** Backend: summary, verify record, test proof, contract table of `WaveSummarySchema` with the removed field named, the search output that proves zero other callers. No picture.

**Depends on.** T19.

**Estimate.** 170 lines, 7 files.

**Risk.** shared type.

**New UI element.** None.

#### T28. Answer the linked ticket on the review status

Added by the merge. `ReviewPage.tsx` and `useReviewData.ts` load no ticket, and the conditions block needs the row facts.

**Result.** `reviews.status` returns `ticket: {identifier, title} | null` and `prRow: TicketPr | null` for the pull request.

**Touches.** `packages/api/src/schemas/review.ts` (the status output), `apps/server/src/services/reviews/queries.ts` or the status service that answers `POST /reviews/status` (`packages/api/src/contract/reviews.ts:31-33`), its test.

**Creates.** Nothing new beyond a test beside the service if none exists.

**Leave alone.** `apps/web/**` (T54 reads it). `apps/server/src/services/reviews/revision.ts`.

**Verify.** `bun test apps/server/src/services/reviews` · `bun scripts/check.ts`.

**Review focus.** A pull request linked to two tickets returns the first by ticket number and says so in the summary. A pull request linked to no ticket returns null for both, and the review page renders without the row facts.

**Evidence.** Backend: summary, verify record, test proof, contract table of the status output. No picture.

**Depends on.** T10.

**Estimate.** 60 lines, 3 files.

**Risk.** shared type.

**New UI element.** None.

#### T29. Add the agent line row kind to the ticket table

Source: WEB-10, minus the text module (T11 owns the words).

**Result.** A ticket row whose run has a last message or an open question is followed by one 24 px line, indented to the title, with the run name, a colon and the text; a question turns the line yellow with a 6 px dot before it; no line says `said:`.

**Touches.** `apps/web/src/features/table/utils/flattenGroups/flattenGroups.ts` (`{kind: "agent"}`), `apps/web/src/features/table/rowHeights.ts` (`agentLineHeight = 24`), `apps/web/src/features/table/TicketTable/components/TableBody/TableBody.tsx`, `packages/ui/src/index.ts`.

**Creates.** `apps/web/src/features/table/AgentLine/AgentLine.tsx`, `AgentLine.test.tsx`, `index.ts`. `packages/ui/src/primitives/AttentionDot/AttentionDot.tsx`, `AttentionDot.test.tsx`, `index.ts`. `packages/ui/src/gallery/components/DomainSections/sections/AttentionDot.tsx` and its line in `sections/index.ts`.

**Leave alone.** `apps/web/src/features/agents/isAgentWorking`. `packages/api/src/runLine/**` (imported, not changed).

**Verify.** `bun test apps/web/src/features/table/AgentLine` · `bun test packages/ui/src/primitives/AttentionDot` · `bun scripts/check.ts` · the epic route with a live run and with a question.

**Review focus.** The words come from `runLine` (T11). `asks` reads `SessionAttention.requests[]`; Codex sends a title only, so the line prints the title. The message reads `observation.lastMessage` (T02). The line renders only when one of the two exists.

**Evidence.** Frontend floor. Extra: the 390 px viewport.

**Depends on.** T02, T03, T11, T22.

**Estimate.** 200 lines, 12 files.

**Risk.** shared type (`TableItem`).

**New UI element.** `AgentLine`, `AttentionDot`.

### Wave 5. The chain on the row and the ticket, the contract verbs

#### T30. Store the summary of a pull request, and refuse text that breaks an STE rule

Source: S13.

**Result.** The server stores `headline`, `why` and `watch` per head sha, and refuses a write that carries any refusal of `steCheck`.

**Touches.** `apps/server/src/db/schema.ts` (the export), `packages/api/src/schemas/pullRequest.ts`, `packages/api/src/contract/pullRequests.ts` (append), `apps/server/src/procedures/pullRequests.ts`, `apps/server/src/services/registry.ts` (append).

**Creates.** `apps/server/src/db/tables/prSummaries.ts` (keyed by pull request and head sha), `apps/server/src/services/prSummary.ts`, `prSummary.test.ts`. One migration and its snapshot.

**Leave alone.** `packages/api/src/steCheck/**` (T04). `packages/cli/**` (T44). `review_submissions`. `meta.body` of `review_revisions`.

**Verify.** `bun test apps/server/src/services` · `bun scripts/check.ts`.

**Review focus.** The server reports and refuses, never rewrites. One test asserts the worked example of section 4.5 stores. One test asserts a text with one refusal stores nothing.

**Evidence.** Backend: summary, verify record, test proof, contract table of the write and the read, migration plan. Picture: a Mermaid sequence of the write, the check and the refusal.

**Depends on.** T04, T24.

**Estimate.** 150 lines, 9 files.

**Risk.** migration, shared type.

**New UI element.** None.

#### T31. Import the contract from the ticket descriptions, once

Source: S12.

**Result.** One command reads `Files:`, `Verify:` and `Review focus:` out of every ticket description of an epic and writes the contract fields once.

**Touches.** `apps/server/src/services/registry.ts` (append), `packages/api/src/contract/tickets.ts` (append).

**Creates.** `apps/server/src/services/tickets/importContract.ts`, `importContract.test.ts`.

**The rules.** A field that holds a value is never overwritten. Each line the importer cannot read is reported with its ticket identifier. The command is safe to run twice. The prose stays in the description.

**Leave alone.** `packages/cli/**`. The descriptions.

**Verify.** `bun test apps/server/src/services/tickets` · `bun scripts/check.ts`.

**Review focus.** The real descriptions write `Files:` as a list on following lines and `Verify:` one command per line. Read the 27 exports and state how many fields the importer filled and how many it could not read.

**Evidence.** Backend: summary, verify record, test proof, `no contract changed`, the run output on the real epic with the filled count and the unresolved list. No picture.

**Depends on.** T24.

**Estimate.** 170 lines, 4 files.

**Risk.** none.

**New UI element.** None.

**Decision 1 sensitive.** This ticket exists only while the contract is fields.

#### T32. Set and show the contract of a ticket

Source: CLI ticket 4.

**Result.** `trellis contract set OP-34 --result "..." --file <path> --leave-alone <path> --verify "<cmd>" --focus "<sentence>"` stores the clauses, and `trellis contract show OP-34` prints them with the computed `Evidence owed` line in the layout of screen 5.

**Touches.** `packages/cli/src/verbs.ts` (one row, `contract`).

**Creates.** `packages/cli/src/commands/contract/contract.ts`, `contractText.ts`, `contractText.test.ts`.

**Leave alone.** `apps/server/src/services/brief.ts`, `packages/cli/src/instructions.md`, `packages/cli/src/flags.ts`, `docs/**`.

**Verify.** `bun test packages/cli/src/commands/contract` · `bun scripts/check.ts` · `trellis contract set` and `show` on OP-34 against a scratch server; record both transcripts.

**Review focus.** A repeated flag accumulates: `--file a --file b` records two files. Call `repeatedFlag(context.rawArgs, "file")` from `flags.ts:17`, as `labelRefs` does at line 33. `Evidence owed` is computed with `prPaths` from the file list, so `show` imports T05 and derives nothing itself.

**Evidence.** Backend: summary, verify record, test proof, contract table of each flag, the stored field names and the `show` output. No picture.

**Depends on.** T24.

**Estimate.** 260 lines, 4 files.

**Risk.** none.

**New UI element.** None.

**Decision 1 sensitive.** Prose keeps only `contract show` as a parser of the description.

#### T33. Record the outcome sentence of a ticket

Source: CLI ticket 9.

**Result.** `trellis outcome set OP-32 --text "..."` stores one sentence, `trellis outcome show OP-32` prints it, and a sentence that breaks an STE rule is refused with the lines of T44.

**Touches.** `packages/cli/src/verbs.ts` (one row, `outcome`).

**Creates.** `packages/cli/src/commands/outcome/outcome.ts`, `outcome.test.ts`.

**Leave alone.** `packages/api/src/steCheck/**`, `packages/cli/src/commands/summary/**`.

**Verify.** `bun test packages/cli/src/commands/outcome` · `bun scripts/check.ts` · `trellis outcome set OP-32 --text "..."` against a scratch server; record the transcript.

**Review focus.** The limit of 25 words comes from `steCheck`; this ticket copies no rule.

**Evidence.** Backend: summary, verify record, test proof, contract table of the flag, the stored field and the refusal lines. No picture.

**Depends on.** T04, T24.

**Estimate.** 110 lines, 3 files.

**Risk.** none.

**New UI element.** None.

#### T34. Print the groups with trellis ready

Source: CLI ticket 12.

**Result.** `trellis ready OP --epic routines-e2e` prints the count line `0 ready to start`, then one line per group that holds a ticket, with the group name, its count and its identifiers, in the fixed order.

**Touches.** `packages/cli/src/verbs.ts` (one row, `ready`).

**Creates.** `packages/cli/src/commands/ready/ready.ts`, `readyText.ts`, `readyText.test.ts`.

**Leave alone.** `packages/cli/src/commands/list.ts`, `packages/cli/src/commands/epics.ts`.

**Verify.** `bun test packages/cli/src/commands/ready` · `bun scripts/check.ts` · `trellis ready OP --epic routines-e2e` against a scratch server seeded with the OP epic; compare each count with section 1.1 of the verdict.

**Review focus.** The group comes from `waitingFor` (T26). An empty group does not render: feed a set with an empty `with GitHub` group and confirm five lines, not six.

**Evidence.** Backend: summary, verify record, test proof, contract table of the verb, its flags, the group order and the JSON shape. No picture.

**Depends on.** T19, T21, T26.

**Estimate.** 210 lines, 4 files.

**Risk.** none.

**New UI element.** None.

#### T35. Add the waits and the releases columns to the epic route

Source: WEB-11.

**Result.** The epic table prints a `waits` cell of 110 px and a `releases` cell of 40 px, the status cell narrows to the glyph alone on this route, and a click on an identifier or a count filters the table.

**Touches.** `apps/web/src/features/table/columns.tsx` (two ids at line 19, two widths at 76, two labels at 55), `apps/web/src/features/table/Row/Row.tsx` (255 lines, two cells), `apps/web/src/features/table/Row/components/StatusCell/StatusCell.tsx` (the glyph-only variant), `apps/web/src/features/table/utils/columnVisibility/columnVisibility.ts` (a per-route default map), `columnVisibility.test.ts`, `apps/web/src/features/epics/EpicPage/EpicPage.tsx` (the route key).

**Creates.** `apps/web/src/features/table/Row/components/WaitsCell/WaitsCell.tsx`, `WaitsCell.test.tsx`, `index.ts`, `apps/web/src/features/table/Row/components/ReleasesCell/ReleasesCell.tsx`, `index.ts`.

**Leave alone.** `hiddenByDefault` at `columns.tsx:84`.

**Verify.** `bun test apps/web/src/features/table` · `bun scripts/check.ts` · the epic route, then every other table route to confirm the two columns stay hidden.

**Review focus.** The `waits` cell prints one of three values: nothing, `ready`, up to two identifiers with `+n`. `autoHide` (`columnVisibility.ts:30-45`) must not hide a column that repeats no grouping.

**Evidence.** Frontend floor. Extra: the 390 px viewport, the light theme, the empty state.

**Depends on.** T07, T09, T19, T29.

**Estimate.** 220 lines, 11 files.

**Risk.** shared type (`ColumnId` gains two members).

**New UI element.** None. Two columns on `Row`.

#### T36. Fill the pull request row with the size, the stack, the flow and what it waits for

Source: WEB-13, minus the evidence word (T48).

**Result.** A pull request row reads `⊙ #57080 open · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · 0 threads · crisp-fjord`, a stacked pull request adds `stacked on #55569` after the state, and a flow adds `flow: Code Reviewer passed` before the last fact.

**Touches.** `apps/web/src/features/table/PrRow/PrRow.tsx`, `PrRow.test.tsx`.

**Creates.** `apps/web/src/features/table/PrRow/prRowText/prRowText.ts`, `prRowText.test.ts`, `index.ts`.

**Leave alone.** `flattenGroups.ts`, `rowHeights.ts`, `TableBody.tsx`.

**Verify.** `bun test apps/web/src/features/table/PrRow` · `bun scripts/check.ts` · the epic route with the seven real pull requests of the epic.

**Review focus.** The last fact prints `you` in `--fg`, the run name in `--fg-muted`, or `github`, from `waitingFor` (T26). A cell whose data is missing drops out; it never prints a zero or a dash. `prRowText` leaves one slot for the evidence word that T48 fills.

**Evidence.** Frontend floor. Extra: the 390 px viewport.

**Depends on.** T01, T10, T19, T22, T26.

**Estimate.** 190 lines, 5 files.

**Risk.** none.

**New UI element.** None.

#### T37. Build the contract block

Source: WEB-18.

**Result.** The ticket page prints Result, Files, Leave alone, Verify, Review focus and Evidence owed; a click on a path copies the path; a click on a command copies the command.

**Touches.** Nothing that exists.

**Creates.** `apps/web/src/features/ticket/ContractBlock/ContractBlock.tsx`, `ContractBlock.test.tsx`, `index.ts`, `evidenceOwedText/evidenceOwedText.ts`, `evidenceOwedText.test.ts`. `packages/ui/src/gallery/components/DomainSections/sections/ContractBlock.tsx` and its line in `sections/index.ts`.

**Leave alone.** `apps/web/src/features/ticket/Description/Description.tsx` (the ask stays there).

**Verify.** `bun test apps/web/src/features/ticket/ContractBlock` · `bun scripts/check.ts` · the gallery with OP-34 and OP-33 as fixtures.

**Review focus.** `Leave alone` names a path and the ticket that owns it, and never truncates. `Evidence owed` comes from `prPaths` (T05) applied to `files[]`; the block derives nothing else.

**Evidence.** Frontend floor. Extra: the empty state.

**Depends on.** T06, T24.

**Estimate.** 230 lines, 7 files.

**Risk.** none.

**New UI element.** `ContractBlock`.

**Decision 1 sensitive.** Prose makes the block read a parse result.

#### T38. Build the chain block

Source: WEB-19.

**Result.** The ticket page prints Waits on with each ticket's title, status and pull request, a derived `Ready` sentence, and Releases with each title.

**Touches.** Nothing that exists.

**Creates.** `apps/web/src/features/ticket/ChainBlock/ChainBlock.tsx`, `ChainBlock.test.tsx`, `index.ts`, `readyLine/readyLine.ts`, `readyLine.test.ts`. `packages/ui/src/gallery/components/DomainSections/sections/ChainBlock.tsx` and its line in `sections/index.ts`.

**Leave alone.** `apps/web/src/features/ticket/SubTickets`.

**Verify.** `bun test apps/web/src/features/ticket/ChainBlock` · `bun scripts/check.ts` · the gallery with OP-33 as the fixture.

**Review focus.** `Ready` is derived and starts nothing.

**Evidence.** Frontend floor. Extra: the empty state.

**Depends on.** T06, T09, T19, T29 (for `AttentionDot`).

**Estimate.** 230 lines, 7 files.

**Risk.** none.

**New UI element.** `ChainBlock`.

#### T39. Build the run line

Source: WEB-20, minus the words module (T11 owns the words).

**Result.** The run line prints the agent card, the name, the harness, the model, the state words with the tool and the time, the last message on a second line when one exists, and a `Session` control.

**Touches.** Nothing that exists.

**Creates.** `apps/web/src/features/ticket/RunLine/RunLine.tsx`, `RunLine.test.tsx`, `index.ts`. `packages/ui/src/gallery/components/DomainSections/sections/RunLine.tsx` and its line in `sections/index.ts`.

**Leave alone.** `apps/web/src/features/sessions/**` (`Session` opens the sheet that exists). `apps/web/src/features/agents/ModelPicker`. `packages/api/src/runLine/**`.

**Verify.** `bun test apps/web/src/features/ticket/RunLine` · `bun scripts/check.ts` · the gallery for each of the fourteen states.

**Review focus.** Only `works` moves. `failed` and `lost` share one red dot; the words carry the difference. The elapsed time and the token count arrive on a hover of the line, so nothing from `TicketMetrics` is lost.

**Evidence.** Frontend floor. Extra: a clip, the empty state.

**Depends on.** T02, T06, T11, T12, T29.

**Estimate.** 160 lines, 5 files.

**Risk.** none.

**New UI element.** `RunLine`.

### Wave 6. Group by waiting, the evidence store, the epic in the terminal

#### T40. Add the evidence records of a pull request, and the evidence floor

Source: S15.

**Result.** An agent registers an evidence record per head sha, and the server counts the required items each pull request holds.

**Touches.** `apps/server/src/db/schema.ts` (the export), `packages/api/src/contract/pullRequests.ts` (append), `apps/server/src/procedures/pullRequests.ts`, `apps/server/src/services/registry.ts` (append), `apps/server/src/db/queries/ticketPrs.ts` (the `evidence` count on the row), `packages/api/src/schemas/ticketPr.ts`, `packages/api/src/index.ts` (append).

**Creates.** `apps/server/src/db/tables/prEvidence.ts` (pull request, head sha, kind, record jsonb, optional blob sha256), `packages/api/src/schemas/evidence.ts`, `apps/server/src/services/evidence/evidence.ts`, `evidence.test.ts`, `packages/api/src/evidenceFloor/evidenceFloor.ts`, `evidenceFloor.test.ts`, `index.ts`. One migration and its snapshot.

**The kinds.** `before`, `after`, `clip`, `console`, `verify`, `test`, `contract`, `migration`, `picture`, `equivalence`. The blob store is `apps/server/src/storage/blobs.ts`, keyed by sha256. The floor takes the kind (T25), the risk answers and the records present, and returns the required list, the present list and the missing list with the fill command per gap. A `test --none` record with a reason counts as present.

**Leave alone.** `packages/cli/**` (T49, T55, T61). The `attachments` table. `apps/server/drizzle/0032_workspace_evidence.sql`, `0066_remove_evidence.sql`. `apps/server/src/openapiText.ts:116-122` (two dead routes; removing them is its own ticket).

**Verify.** `bun test apps/server/src/services/evidence` · `bun test packages/api/src/evidenceFloor` · `bun test apps/server/src/db` · `bun scripts/check.ts`.

**Review focus.** A record binds to a head sha. A push moves the head, so the count drops. The count on the row reads records of the current head only, and an old record stays in the table. The blob route carries the three headers `reviewImage.ts` sets: `content-security-policy: sandbox`, `x-content-type-options: nosniff`, `cache-control: private, max-age=300`.

**Evidence.** Backend: summary, verify record, test proof one per floor of each kind, contract table of the write and the read, migration plan. Picture: a Mermaid sequence of the register, the store and the count.

**Depends on.** T19, T24, T25, T30.

**Estimate.** 270 lines, 14 files.

**Risk.** migration, shared type.

**New UI element.** None.

**Decision 2 sensitive.** A capture service gives the `before` kind an actor of `service` and a service caller on the route. **Decision 3 sensitive.** This ticket owns the floor the refusal (T66) reads; the floor itself does not change.

#### T41. Group the epic table by what each row waits for

Source: WEB-12.

**Result.** The Display popover offers `Group by: Wave · Waiting`, Wave is the default on the desktop, the Waiting grouping draws the six groups in fixed order with no empty group, and a group header prints `0 of 6 · 1 for you`.

**Touches.** `apps/web/src/features/filters/grammar.ts` (`Group` gains `waiting`), `grammar.test.ts`, `apps/web/src/features/table/DisplayPopover/DisplayPopover.tsx`, `apps/web/src/features/table/utils/groupRows/groupRows.ts` (196 lines, one key), `groupRows.test.ts`, `apps/web/src/features/epics/EpicPage/components/EpicProgress/EpicProgress.tsx` (`2 wait for you` reads it), `apps/web/src/features/epics/epicNext/epicNext.ts`, `epicNext.test.ts`.

**Creates.** `apps/web/src/features/table/utils/waitingGroups/waitingGroups.ts`, `waitingGroups.test.ts`, `index.ts`.

**Leave alone.** `apps/web/src/features/table/utils/waveGroups`.

**Verify.** `bun test apps/web/src/features/table` · `bun test apps/web/src/features/epics` · `bun test apps/web/src/features/filters` · `bun scripts/check.ts` · the epic route in both groupings.

**Review focus.** A grouping is a function of the row (`waitingFor`, T26), so it adds no row and no column. An empty group does not render. `2 wait for you` counts pull requests that wait for `you`; the band and the group header must agree. An old bookmark with `group=waiting` on a non-epic route falls back to the route default.

**Evidence.** Frontend floor. Extra: the empty group case, the 390 px viewport.

**Depends on.** T14, T26, T27, T35.

**Estimate.** 220 lines, 11 files.

**Risk.** shared type (`Group` is a URL value).

**New UI element.** None. `DisplayPopover` gains two entries.

**Decision 4 sensitive.** This ticket sets the desktop default.

#### T42. Build the change summary block

Source: WEB-15.

**Result.** The block prints the headline at 15 px, the why at 13 px, the watch line with its fixed `Watch this: ` words, and one yellow line when the head sha moved after the summary was written.

**Touches.** Nothing that exists.

**Creates.** `apps/web/src/features/reviews/ChangeSummary/ChangeSummary.tsx`, `ChangeSummary.test.tsx`, `index.ts`. `packages/ui/src/gallery/components/DomainSections/sections/ChangeSummary.tsx` and its line in `sections/index.ts`.

**Leave alone.** `apps/web/src/features/reviews/ReviewBody/ReviewBody.tsx`.

**Verify.** `bun test apps/web/src/features/reviews/ChangeSummary` · `bun scripts/check.ts` · the gallery.

**Review focus.** Three named fields and nothing else. No markdown. A missing summary reads as one faint line and counts as missing in the evidence condition.

**Evidence.** Frontend floor. Extra: the empty state.

**Depends on.** T06, T30.

**Estimate.** 120 lines, 5 files.

**Risk.** none.

**New UI element.** `ChangeSummary`.

#### T43. Build the start controls

Source: WEB-20b.

**Result.** A ticket with no run prints the harness picker, the model picker and the effort picker in one row with one live `Start`, and one line under `Start` names each unmet dependency.

**Touches.** Nothing that exists.

**Creates.** `apps/web/src/features/ticket/StartControls/StartControls.tsx`, `StartControls.test.tsx`, `index.ts`. `packages/ui/src/gallery/components/DomainSections/sections/StartControls.tsx` and its line in `sections/index.ts`.

**Leave alone.** `apps/web/src/features/agents/ModelPicker` (reused, not forked). `apps/web/src/features/ticket/RunLine/**`.

**Verify.** `bun test apps/web/src/features/ticket/StartControls` · `bun scripts/check.ts` · the gallery.

**Review focus.** `Start` stays live when the ticket is not ready. Rule 1. The line names the unmet dependency by identifier and title and never disables the control.

**Evidence.** Frontend floor. Extra: a clip, the empty state.

**Depends on.** T06, T19, T39.

**Estimate.** 130 lines, 5 files.

**Risk.** none.

**New UI element.** `StartControls`.

#### T44. Write the pull request summary and print the GitHub body

Source: CLI ticket 5.

**Result.** `trellis summary write 57080 --headline "..." --why - --watch "..."` refuses bad text with the four lines of screen 9, and a text that passes stores the summary and prints the four-line GitHub body.

**Touches.** `packages/cli/src/verbs.ts` (one row, `summary`).

**Creates.** `packages/cli/src/commands/summary/summary.ts` (`write`, `show`, `body`), `refusalText.ts`, `refusalText.test.ts`, `githubBody.ts`, `githubBody.test.ts`.

**Leave alone.** `packages/api/src/steCheck/**`.

**Verify.** `bun test packages/cli/src/commands/summary` · `bun scripts/check.ts` · `trellis summary write 56930` with the worked text of section 4.5, then with the bad text of screen 9; record both transcripts.

**Review focus.** A refusal exits non zero and stores nothing. A warning exits zero and stores the text. The body's size line and risk line read the stored values, never the agent's.

**Evidence.** Backend: summary (written with the new command), verify record, test proof, contract table of the three flags, the refusal and warning formats, the four body lines and the exit codes. No picture.

**Depends on.** T01, T30.

**Estimate.** 300 lines, 6 files. At the target. If the refusal format grows, `githubBody.ts` and its test become their own ticket.

**Risk.** none.

**New UI element.** None.

#### T45. Print the epic in the words of the epic page

Source: CLI ticket 14.

**Result.** `trellis epics show OP/routines-e2e` prints the band line, the count line, one group header per wave with `0 of 6 · 1 for you`, the `waits` and `releases` cells on each ticket row, one pull request row per linked pull request, and what it waits for.

**Touches.** `packages/api/src/index.ts` (append), `packages/cli/src/commands/epics.ts` (`renderEpic` at line 111, `renderTickets` at line 95), `packages/cli/src/commands/output.ts` (`ticketList.columns` at lines 146-156).

**Creates.** `packages/api/src/epicText/epicText.ts`, `epicText.test.ts`.

**Leave alone.** `apps/web/**`, `docs/UI_PATTERNS.md`. The module serves the CLI today; a later web ticket may adopt it.

**Verify.** `bun test packages/api/src/epicText` · `bun scripts/check.ts` · `trellis epics show OP/routines-e2e` against a scratch server; compare line by line with screen 1.

**Review focus.** The `waits` cell has four forms and a terminal with no color must tell them apart; the yellow dot is a word here.

**Evidence.** Backend: summary, verify record, test proof, contract table of each string builder and the two columns. No picture.

**Depends on.** T01, T21, T26, T34.

**Estimate.** 305 lines, 5 files. At the target; the split to take is the pull request row text into its own ticket.

**Risk.** shared type.

**New UI element.** None.

**Decision 4 sensitive.** Waiting on both puts the wave group behind a flag.

### Wave 7. Evidence on the page

#### T46. Send a review to the live run

Source: S16.

**Result.** A review reaches the running agent of its ticket through a delivery row.

**Touches.** `packages/api/src/schemas/review.ts`, `apps/server/src/services/registry.ts` (append).

**Creates.** `apps/server/src/services/reviews/dispatchDeliveries.ts`, `dispatchDeliveries.test.ts`, `apps/server/src/agents/reviewDeliveryLoop.ts`.

**The facts.** `review_deliveries` has one reader (`submissions.ts:11`) and no writer. This ticket builds the writer and the loop on the model of `apps/server/src/agents/commentDeliveryLoop.ts` and `apps/server/src/services/commentMentions/dispatch.ts`.

**Leave alone.** `packages/cli/**`. `apps/server/src/services/commentMentions/**`. `apps/server/src/services/agentRuns/answerQuestion.ts`. `apps/server/src/services/reviews/remote.ts`.

**Verify.** `bun test apps/server/src/services/reviews` · `bun test apps/server/src/agents` · `bun scripts/check.ts`.

**Review focus.** A delivery to a closed run fails with a named reason; copy the guard at `dispatch.ts:36-40`.

**Evidence.** Backend: summary, verify record, test proof for a live run and a closed run, contract table of `review_deliveries`. Picture: a Mermaid sequence of the review, the delivery row and the send.

**Depends on.** T19, T24, T40.

**Estimate.** 290 lines, 14 files.

**Risk.** shared type.

**New UI element.** None.

#### T47. Build the evidence strip for a frontend pull request

Source: WEB-16.

**Result.** The strip prints the capture record line, the before and after images side by side at half width with their captions, the clip that plays in place on a click and loops, the console line, and the record line with both shas.

**Touches.** Nothing that exists.

**Creates.** `apps/web/src/features/reviews/EvidenceStrip/EvidenceStrip.tsx` (the shell and the missing list), `EvidenceStrip.test.tsx`, `index.ts`, `components/FrontendEvidence/FrontendEvidence.tsx`, `FrontendEvidence.test.tsx`, `index.ts`. `packages/ui/src/gallery/components/DomainSections/sections/EvidenceStrip.tsx` and its line in `sections/index.ts`.

**Leave alone.** `apps/web/src/features/attachments/AttachmentGrid`.

**Verify.** `bun test apps/web/src/features/reviews/EvidenceStrip` · `bun scripts/check.ts` · the gallery with the three real files of OP-27 as the fixture.

**Review focus.** An image renders inline, never as a link. The clip does not autoplay and does not load its bytes before the click.

**Evidence.** Frontend floor. Extra: a clip, the empty and loading states.

**Depends on.** T06, T25, T40.

**Estimate.** 280 lines, 8 files.

**Risk.** none.

**New UI element.** `EvidenceStrip`.

**Decision 2 sensitive.** A capture service adds a `captured by Trellis` line and a re-capture control.

#### T48. Add the evidence word to the pull request row

Source: WEB-13, the evidence cell.

**Result.** A pull request row prints `no evidence`, `evidence 3 of 5` or `evidence complete` in the slot T36 left.

**Touches.** `apps/web/src/features/table/PrRow/prRowText/prRowText.ts`, `prRowText.test.ts`.

**Creates.** Nothing.

**Leave alone.** `PrRow.tsx`.

**Verify.** `bun test apps/web/src/features/table/PrRow` · `bun scripts/check.ts` · the epic route.

**Review focus.** The three forms and nothing else. A row with `kind: unknown` reads `no evidence`.

**Evidence.** Frontend floor. No extra.

**Depends on.** T36, T40.

**Estimate.** 40 lines, 2 files.

**Risk.** none.

**New UI element.** None.

#### T49. Add the evidence of a pull request

Source: CLI ticket 6.

**Result.** `trellis evidence add 57080 --kind verify --cmd "..." --exit 0 --sha <head> --tail -` stores one record against the head sha, and each of the ten kinds takes its own flags and refuses a flag its kind does not take.

**Touches.** `packages/cli/src/verbs.ts` (one row, `evidence`).

**Creates.** `packages/cli/src/commands/evidence/evidence.ts` (the verb and `add`), `kinds.ts` (the flag set per kind), `kinds.test.ts`.

**The kinds and flags.** `before`: `--file --route --viewport --theme --seed --browser --base`. `after`: the same with `--sha`. `clip`: `--file --route --caption`. `console`: `--file`. `verify`: `--cmd --exit --sha --tail -`. `test`: `--name --fails-on --passes-on`, or `--none --reason`. `contract`: `--before - --after -`, or `--none`. `migration`: `--file`, or `--table -`. `picture`: `--file --why`. `equivalence`: `--cmd --exit --sha --tail -`.

**Leave alone.** `packages/cli/src/commands/attach.ts`.

**Verify.** `bun test packages/cli/src/commands/evidence` · `bun scripts/check.ts` · one `evidence add` per kind against a scratch server; record the transcript.

**Review focus.** A file flag is a file system boundary. Follow `fileAt` in `attach.ts:24`: catch `ENOENT`, raise `fileNotFound`, end with one line and no request.

**Evidence.** Backend: summary, verify record, test proof, contract table of each kind, its flags, the record shape and the exit codes. Picture: a Mermaid sequence of one `evidence add --kind after`.

**Depends on.** T40.

**Estimate.** 300 lines, 4 files. At the target.

**Risk.** none.

**New UI element.** None.

**Decision 2 sensitive.** A capture service removes `--base` from `before`.

#### T50. Print the contract and the evidence owed in the brief

Source: CLI ticket 13.

**Result.** `trellis brief OP-34` prints a `## Contract` section with the clauses and an `## Evidence owed` section with the required items of the pull request kind, and `bun test apps/server/src/services` passes.

**Touches.** `apps/server/src/services/brief.ts` (two entries in `sections([...])` at line 235), `apps/server/src/services/brief.test.ts`.

**Creates.** `apps/server/src/services/brief/contractLines.ts`, `contractLines.test.ts`, `evidenceLines.ts`, `evidenceLines.test.ts`.

**Leave alone.** `apps/server/src/services/epics/text.ts`, `packages/cli/src/commands/brief.ts`, `packages/cli/src/instructions.md`.

**Verify.** `bun test apps/server/src/services` · `bun scripts/check.ts` · `trellis brief OP-34` and `trellis brief OP-33` against a scratch server; record both transcripts.

**Review focus.** The brief is a fixed layout: two reads of one state give the same bytes. The contract prints above the comments, so the agent reads the files to leave alone first. Every list sorts by ticket number. `## Evidence owed` reads `evidenceFloor` (T40) with the kind from `prPaths` (T05).

**Evidence.** Backend: summary, verify record, test proof, contract table of each heading, its line formats and its order. Picture: a Mermaid sequence of `trellis brief`, because the brief reads the contract store and the floor in one call.

**Depends on.** T05, T24, T32, T40.

**Estimate.** 250 lines, 6 files.

**Risk.** none.

**New UI element.** None.

**Decision 1 sensitive.** Prose makes `## Contract` print parsed clauses and name what the parse missed.

### Wave 8. The review page in one column, the resources store

#### T51. Add the resources of an epic

Added by the merge. `SRV-RESOURCE` had no ticket in any plan; T60, T62, T68 and T70 wait on it.

**Result.** An epic carries resources of four kinds, `doc`, `link`, `image` and `file`, and `resources.add`, `resources.list` and `resources.remove` write and read them.

**Touches.** `apps/server/src/db/schema.ts` (the export), `packages/api/src/contract/index.ts` (one router line), `packages/api/src/index.ts` (append), `apps/server/src/services/registry.ts` (append), `packages/api/src/schemas/epic.ts` (`resourceCount` on the summary, nothing else).

**Creates.** `apps/server/src/db/tables/epicResources.ts` (id, epic_id, kind, name, body text for a doc, url for a link, blob sha256 for an image or a file, optional ticket_id, actor columns, created_at, updated_at), `packages/api/src/schemas/resource.ts`, `packages/api/src/contract/resources.ts`, `apps/server/src/services/resources/resources.ts`, `resources.test.ts`, `apps/server/src/procedures/resources.ts`. One migration and its snapshot.

**Leave alone.** `apps/server/src/services/attachments.ts` (282 lines; the blob helpers it calls in `storage/blobs.ts` are reused, the service is not). The `attachments` table. `packages/cli/**` (T62).

**Verify.** `bun test apps/server/src/services/resources` · `bun test apps/server/src/db` · `bun scripts/check.ts`.

**Review focus.** A `doc` and a `link` carry no blob. A `doc` body has the same limit as `epic.description` (200,000). A resource that is also evidence is found by its blob sha256 in `pr_evidence`, so `list` returns the pull request number with the row. The blob route carries the three headers of `reviewImage.ts`.

**Evidence.** Backend: summary, verify record, test proof one per kind, contract table of the three procedures, migration plan. Picture: the migration plan table.

**Depends on.** Nothing.

**Estimate.** 280 lines, 12 files.

**Risk.** migration, shared type.

**New UI element.** None.

#### T52. Build the evidence strip for a backend pull request

Source: WEB-17.

**Result.** The strip prints the verify record with its exit code and tail, the test proof with each test name and its two shas, the contract table, the migration plan when a schema changed, and the one picture, and it prints the missing list with the command that fills each gap.

**Touches.** `apps/web/src/features/reviews/EvidenceStrip/EvidenceStrip.tsx` (the backend branch).

**Creates.** `apps/web/src/features/reviews/EvidenceStrip/components/BackendEvidence/BackendEvidence.tsx`, `BackendEvidence.test.tsx`, `index.ts`, `components/MissingList/MissingList.tsx`, `index.ts`. `packages/ui/src/gallery/components/DomainSections/sections/BackendEvidence.tsx` and its line in `sections/index.ts`.

**Leave alone.** `FrontendEvidence` (a mixed pull request renders both children).

**Verify.** `bun test apps/web/src/features/reviews/EvidenceStrip` · `bun scripts/check.ts` · the gallery with `#57080` as the fixture.

**Review focus.** One picture, and one only; the strip refuses a second. The missing list prints the exact `trellis evidence add` command per gap, copied with one click.

**Evidence.** Frontend floor. Extra: the empty state, the light theme.

**Depends on.** T25, T40, T47.

**Estimate.** 260 lines, 8 files.

**Risk.** none.

**New UI element.** None. Part of `EvidenceStrip`.

#### T54. Lay the review page out as one column with nine regions

Source: WEB-23.

**Result.** `/reviews/$owner/$repo/$number` reads top to bottom: identity, conditions, summary, review focus, evidence, checks, files by risk, threads, and the verdict bar; the tab strip leaves this page.

**Touches.** `apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx` (300 lines; the region bodies move into `ReviewPage/components/`), `apps/web/src/features/reviews/ReviewPage/hooks/useReviewNavigation/useReviewNavigation.ts` (the tab state leaves), `apps/web/src/features/reviews/ReviewPage/hooks/useReviewData/useReviewData.ts` (reads `ticket` and `prRow` from `reviews.status`, T28), `apps/web/src/features/reviews/ReviewHeader/ReviewHeader.tsx` (60 lines), `packages/ui/src/review/review.css`.

**Creates.** `apps/web/src/features/reviews/ReviewPage/conditionsOf/conditionsOf.ts` (builds the `Conditions` object of T23), `conditionsOf.test.ts`.

**Leave alone.** `packages/ui/src/review/ReviewDiff`. `apps/web/src/features/reviews/ReviewSummary/**` and `ReviewDiscussion/**` (T63). `packages/ui/src/review/ReviewTabs` (T63 proves no caller remains).

**Verify.** `bun test apps/web/src/features/reviews` · `bun scripts/check.ts` · both review routes on the scratch server with `#57080` and `#56930`.

**Review focus.** The page stops rendering `ReviewTabs` (`ReviewPage.tsx:4`, `:173`, `:267`), so `j` and `k` between files, `v` on the read mark and the hash sync need a home. A thread deep link still opens its file. The summary counts as missing in the evidence condition when its head sha is behind.

**Evidence.** Frontend floor. Extra: a clip of one read top to bottom, the 390 px viewport and the light theme.

**Depends on.** T15, T16, T17, T23, T26, T28, T42, T47.

**Estimate.** 290 lines, 11 files.

**Risk.** none.

**New UI element.** None.

#### T55. List the evidence of a pull request

Source: CLI ticket 6b.

**Result.** `trellis evidence list 57080` prints every record of the pull request with its kind, its head sha, its file and its caption, newest sha first.

**Touches.** `packages/cli/src/commands/evidence/evidence.ts` (one line, the subcommand).

**Creates.** `packages/cli/src/commands/evidence/evidenceText.ts`, `evidenceText.test.ts`.

**Leave alone.** `packages/cli/src/commands/evidence/kinds.ts`.

**Verify.** `bun test packages/cli/src/commands/evidence` · `bun scripts/check.ts` · `trellis evidence list 57080` and `--json` against a scratch server with one record per kind; record both transcripts.

**Review focus.** A record of an older head sha still prints with its sha.

**Evidence.** Backend: summary, verify record, test proof, contract table of the output fields and the JSON shape. No picture.

**Depends on.** T49.

**Estimate.** 135 lines, 3 files.

**Risk.** none.

**New UI element.** None.

#### T57. Print the chain in the brief

Source: CLI ticket 13b.

**Result.** `trellis brief OP-33` prints a `## Chain` section with `Waits on`, `Ready` and `Releases`, and the outcome sentence of each finished ticket this one waits on.

**Touches.** `apps/server/src/services/brief.ts` (one entry in `sections([...])`), `apps/server/src/services/brief.test.ts`.

**Creates.** `apps/server/src/services/brief/chainLines.ts`, `chainLines.test.ts`.

**Leave alone.** `apps/server/src/services/brief/contractLines.ts`, `evidenceLines.ts`.

**Verify.** `bun test apps/server/src/services` · `bun scripts/check.ts` · `trellis brief OP-33` against a scratch server; record the transcript.

**Evidence.** Backend: summary, verify record, test proof, contract table of the heading, its three line formats and its order. No picture.

**Depends on.** T19, T21, T24, T50.

**Estimate.** 185 lines, 4 files.

**Risk.** none.

**New UI element.** None.

### Wave 9. The ticket page in one column, the verdict bar

#### T58. Rebuild the verdict bar

Source: WEB-24.

**Result.** The bar prints the draft count, `Merge`, `Send back to <run>` and `Comment only`; `Merge` stays live; a click on `Merge` prints each unmet condition on one line under the bar and asks once.

**Touches.** `apps/web/src/features/reviews/ReviewSummary/components/ReviewHeaderActions/components/MergeControl/MergeControl.tsx` (92 lines; it moves under the bar), `apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx`.

**Creates.** `apps/web/src/features/reviews/VerdictBar/VerdictBar.tsx`, `VerdictBar.test.tsx`, `index.ts`, `unmetLine/unmetLine.ts`, `unmetLine.test.ts`.

**Leave alone.** `apps/web/src/features/reviews/ReviewApply/**` (the suggestion batch keeps its bar). The reviewer picker and `namedReviewRequests` (T64).

**Verify.** `bun test apps/web/src/features/reviews` · `bun scripts/check.ts` · the review route with a merge that has three unmet conditions.

**Review focus.** `Merge` is never disabled. Rule 1. The confirm sentence names the count and lists the conditions. `Send back` names the run, delivers through `review_deliveries` (T46), and starts a run when none is live.

**Evidence.** Frontend floor. Extra: a clip of the merge confirm, the error state of a failed send back.

**Depends on.** T46, T54.

**Estimate.** 250 lines, 7 files.

**Risk.** none.

**New UI element.** None claimed. The bar reuses the shape of `ReviewBatchBar` and the controls of `MergeControl` and `ReviewSubmit`. Section 7 lists it as a question for Navid.

#### T59. Lay the ticket page out as one column

Source: WEB-25.

**Result.** `/t/$identifier` reads top to bottom: the ask, the contract, the chain, the evidence, the outcome and the run; the page renders none of the four tabs, the activity feed, the comment thread, the composer, the mentioned thread or the ticket metrics.

**Touches.** `apps/web/src/features/ticket/TicketView/TicketView.tsx` (165 lines; the region order, the tab props at lines 32, 33, 50, 51, 154), `apps/web/src/features/ticket/PropertiesRail/PropertiesRail.tsx` (drop `TicketMetrics`), `apps/web/src/features/ticket/TicketWorkArea/TicketWorkArea.tsx` (the tab strip at lines 26, 27, 77; `FlowRuns` moves into the pull request card; `SessionConversation` moves behind `Session`; `LocalChanges` keeps its place).

**Creates.** `apps/web/src/features/ticket/OutcomeBlock/OutcomeBlock.tsx` (reads `Ticket.outcome` from T24), `OutcomeBlock.test.tsx`, `index.ts`.

**Leave alone.** Every folder T65 deletes: `Timeline/**`, `hooks/useTimeline/**`, `PropertiesRail/components/TicketMetrics/**` (they stay on disk, unmounted, for one wave). `apps/server/src/services/brief.ts` and the `comments` table. `apps/web/src/features/ticket/Description/**`.

**Verify.** `bun test apps/web/src/features/ticket` · `bun scripts/check.ts` · the ticket route for OP-34 and OP-33, and the same two in a `PageSheet` from the epic page.

**Review focus.** The elapsed time and the token count arrive on a hover of the run line, so nothing is lost. A mention in a comment still starts a run; that path must read no unmounted component. The pull request card is `ShortConditions` (T23) with `Open the review`.

**Evidence.** Frontend floor. Extra: a clip of one read top to bottom, the 390 px viewport and the light theme, the empty state.

**Depends on.** T24, T37, T38, T39, T43.

**Estimate.** 250 lines, 6 files.

**Risk.** none.

**New UI element.** None.

#### T60. Build the epic resource list

Source: WEB-22.

**Result.** The list prints one row per resource in one list of four kinds, with the kind word, the name, the detail line, and the pull request when the resource is also evidence; three controls add a doc, a link and a file.

**Touches.** Nothing that exists.

**Creates.** `apps/web/src/features/epics/ResourceList/ResourceList.tsx`, `ResourceList.test.tsx`, `index.ts`, `components/ResourceRow/ResourceRow.tsx`, `index.ts`. `packages/ui/src/gallery/components/DomainSections/sections/ResourceList.tsx` and its line in `sections/index.ts`.

**Leave alone.** `apps/web/src/features/attachments/**`.

**Verify.** `bun test apps/web/src/features/epics/ResourceList` · `bun scripts/check.ts` · the gallery.

**Review focus.** The kind word is the only thing that sorts four kinds in one list. A resource that is also evidence prints its pull request after its size.

**Evidence.** Frontend floor. Extra: the empty, loading and error states.

**Depends on.** T06, T51.

**Estimate.** 210 lines, 7 files.

**Risk.** none.

**New UI element.** `ResourceList`.

#### T61. Print the missing evidence list with trellis evidence check

Source: CLI ticket 10.

**Result.** `trellis evidence check 57080` prints the block of screen 9: the pull request, the ticket, the kind, `1 of 4 required present`, one line per item with `present`, `MISSING` or `due`, the fill command per gap, the check note, and exit 1 while an item is missing.

**Touches.** `packages/cli/src/commands/evidence/evidence.ts` (one line, the subcommand).

**Creates.** `packages/cli/src/commands/evidence/check.ts`, `checkText.ts`, `checkText.test.ts`.

**Leave alone.** `packages/cli/src/commands/evidence/kinds.ts`, `evidenceText.ts`, `packages/cli/src/commands/move.ts`.

**Verify.** `bun test packages/cli/src/commands/evidence` · `bun scripts/check.ts` · `trellis evidence check 57080` on a backend pull request with one item present and on a frontend pull request with the full floor; record both transcripts.

**Review focus.** Each `MISSING` line prints the exact command of T49 with the pull request number, the kind word and the head sha already in it. Compare word for word with `kinds.ts`.

**Evidence.** Backend: summary, verify record, test proof, contract table of the output block, the exit codes and the JSON shape. No picture.

**Depends on.** T25, T40, T49, T55.

**Estimate.** 230 lines, 4 files.

**Risk.** none.

**New UI element.** None.

**Decision 1 sensitive.** Prose makes the `verify record` line name parsed commands and warn when the parse finds none.

#### T62. Add, list, and remove the resources of an epic

Source: CLI ticket 8.

**Result.** `trellis resource add OP/routines-e2e --kind doc|link|image|file ...` stores one resource, and `trellis resource list OP/routines-e2e` prints the rows of screen 8 with the kind, the name, the source, and the pull request when the resource is also evidence.

**Touches.** `packages/cli/src/verbs.ts` (one row, `resource`).

**Creates.** `packages/cli/src/commands/resource/resource.ts` (`add`, `list`, `rm`), `resourceText.ts`, `resourceText.test.ts`.

**Leave alone.** `packages/cli/src/commands/attach.ts`, `packages/cli/src/commands/epics.ts`.

**Verify.** `bun test packages/cli/src/commands/resource` · `bun scripts/check.ts` · one `resource add` per kind, then `list`; record the transcript.

**Review focus.** The file read runs only for `image` and `file`; a `link` never touches the file system.

**Evidence.** Backend: summary, verify record, test proof, contract table of the four kinds, their flags and the list output. No picture.

**Depends on.** T51.

**Estimate.** 220 lines, 4 files.

**Risk.** none.

**New UI element.** None.

### Wave 10. Deletions, the hand-over rule, the capture recipe

#### T63. Delete the review summary block and reorder the discussion

Source: WEB-23b.

**Result.** `ReviewSummary` is gone, `ConditionsBlock` and `ChangeSummary` hold what it held, the discussion lists open threads first with the resolved ones collapsed, and no file imports `ReviewTabs`.

**Touches.** `apps/web/src/features/reviews/ReviewSummary/ReviewSummary.tsx` (deleted, 90 lines), `apps/web/src/features/reviews/ReviewDiscussion/ReviewDiscussion.tsx` (109 lines; the order), `apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx` (the import at line 18, the render at line 146), `packages/ui/src/review/index.ts` and `packages/ui/src/review/ReviewTabs/**` (deleted when the search proves no caller).

**Creates.** Nothing.

**Leave alone.** `ReviewSummary/components/ReviewHeaderActions/**` (T58 and T64 own that tree; it outlives its parent folder).

**Verify.** `bun test apps/web/src/features/reviews` · `bun scripts/check.ts` · both review routes.

**Review focus.** `ReviewSummary` has two callers, both in `ReviewPage.tsx`. Prove no third with a search. `ReviewHeaderActions` still resolves after its parent folder loses its component.

**Evidence.** Frontend floor. Extra: the search that proves zero callers, with its command and output.

**Depends on.** T54, T58.

**Estimate.** 180 lines, 6 files.

**Risk.** shared type (`ReviewTabStatus` leaves `packages/ui/src/review/index.ts:9`).

**New UI element.** None.

#### T64. Remove the reviewer picker

Source: WEB-24b.

**Result.** No screen offers a reviewer picker, `namedReviewRequests` is gone, and a search proves no caller remains.

**Touches.** `apps/web/src/features/reviews/ReviewSummary/components/ReviewHeaderActions/components/ReviewerPicker/ReviewerPicker.tsx` (deleted, 109 lines), its `index.ts` (deleted), `ReviewHeaderActions.tsx` (the import at line 8, the render at line 61), `reviewActions.ts` (`namedReviewRequests` at line 61 and its type), `reviewActions.test.ts` (the block at lines 61-69).

**Creates.** Nothing.

**Leave alone.** `ReviewSubmit/**`, `MergeControl/**`.

**Verify.** `bun test apps/web/src/features/reviews` · `bun scripts/check.ts` · the review route; the header keeps its other two controls.

**Review focus.** `ReviewerPicker` has one caller, `ReviewHeaderActions.tsx:61`. `namedReviewRequests` has two, the picker and the test. Prove both before the delete.

**Evidence.** Frontend floor. Extra: the search that proves zero callers; each deleted test case named in the summary.

**Depends on.** T58.

**Estimate.** 140 lines, 5 files.

**Risk.** deleted test (the `namedReviewRequests` cases).

**New UI element.** None.

#### T65. Delete the ticket feed, the threads, the tabs and the metrics, and update the pattern list

Source: WEB-25b, plus the one-time `docs/UI_PATTERNS.md` update of `plan-web.md` section 10.

**Result.** The three unmounted folders are gone, the `tab` search key leaves the ticket URL and the review URL, a search proves no caller remains, and `docs/UI_PATTERNS.md` lists the approved elements of section 7.

**Touches.** `apps/web/src/features/ticket/Timeline/**` (deleted: 17 files, 959 lines), `apps/web/src/features/ticket/hooks/useTimeline/**` (deleted: 2 files), `apps/web/src/features/ticket/PropertiesRail/components/TicketMetrics/**` (deleted: 4 files), `apps/web/src/lib/ticketSearch/ticketSearch.ts` (`TicketTabSchema`, `tab`, `ticketTab` leave), `ticketSearch.test.ts` (four cases leave), `apps/web/src/routes/t/$identifier/route.tsx` (lines 8, 35), `apps/web/src/routes/reviews_.$owner.$repo.$number.tsx` (lines 5, 15, 30), `apps/web/src/features/ticket/TicketWorkArea/TicketWorkArea.tsx` (the import at line 7), `apps/web/src/features/ticket/TicketView/TicketView.tsx` (line 9, line 62), `docs/UI_PATTERNS.md` (the element table at lines 17-45, the epic page rules at lines 100-114).

**Creates.** Nothing.

**Leave alone.** `apps/server/src/services/brief.ts`, the `comments` table. `TicketWorkArea/**` beyond the one import.

**Verify.** `bun test apps/web/src/features/ticket` · `bun test apps/web/src/lib/ticketSearch` · `bun scripts/check.ts` · the ticket route, the review route, and an old link with `?tab=activity`.

**Review focus.** `TicketTab` has four consumers, two of them route files. Miss either and the tree does not typecheck. An old link with `tab` must not break either route. The pattern list edit waits for Navid's approval of section 7; if approval is not in hand, the doc file leaves this ticket.

**Evidence.** Frontend floor. Extra: the search that proves zero callers; `describeActivity.test.ts` and each deleted `ticketTab` case named in the summary.

**Depends on.** T59.

**Estimate.** 1,100 deleted lines and 60 added lines, 29 files. A deletion sweep; it passes both targets for that reason.

**Risk.** deleted test (`describeActivity.test.ts`, four `ticketTab` cases), shared type (`TicketTab` leaves `apps/web/src/lib/ticketSearch`).

**New UI element.** None.

#### T66. Refuse an agent's hand-over while the evidence floor is missing

Source: CLI ticket 11.

**Result.** `trellis move KEY-42 human-review` run by an agent actor prints the missing list of T61 and exits 1 while an item is missing; the same command run by a human actor moves the ticket.

**Touches.** `packages/cli/src/commands/move.ts` (29 lines; the guard call), `packages/cli/src/errors.ts` (one failure builder `evidenceFloorMissing` beside `fileNotFound` at line 79; no `exitCodes` row).

**Creates.** `packages/cli/src/commands/move/handOverGuard.ts`, `handOverGuard.test.ts`.

**Leave alone.** `packages/cli/src/commands/evidence/**`. `packages/cli/src/actor.ts` (`ActorKind` at line 3 is read).

**Verify.** `bun test packages/cli/src/commands/move` · `bun scripts/check.ts` · `TRELLIS_ACTOR=agent:probe trellis move OP-43 human-review` with a missing floor, then as a human actor; record both transcripts.

**Review focus.** A ticket with no linked pull request moves. The guard applies only to a ticket with a pull request and only to the `human-review` target. The HTTP API still moves the ticket; the summary states that limit.

**Evidence.** Backend: summary, verify record, test proof, contract table of the new exit code, the refusal text and the two actor kinds. Picture: a Mermaid state diagram of the hand-over.

**Depends on.** T61.

**Estimate.** 125 lines, 4 files.

**Risk.** none.

**New UI element.** None.

**Decision 3 sensitive.** The whole ticket rests on the answer. A no makes it a warning on stderr and exit 0.

#### T67. Write the capture recipe and the evidence rules for the agent

Source: CLI ticket 15.

**Result.** `docs/EVIDENCE.md` states the kind rule, the frontend floor, the backend floor, the picture table, the three bounding rules and the capture recipe, and a reader who follows the recipe makes a before and after pair a reviewer can check.

**Touches.** Nothing that exists.

**Creates.** `docs/EVIDENCE.md`.

**The recipe.** Own worktree, own port. Aside, one flow per `aside repl` call inside 120 s. 1440x900, dark, animations off, caret hidden, fonts loaded. The seed command first, recorded. The after image from the head. A second worktree at the merge base on a second port, the same seed, the before image. The clip with `/opt/homebrew/bin/ffmpeg`, 15 s or less. One `trellis evidence add` per kind: `before`, `after`, `clip`, `console`.

**Leave alone.** `docs/ARCHITECTURE.md`, `docs/UI_PATTERNS.md`, `packages/cli/src/instructions.md`, `packages/api/src/instructions.ts`.

**Verify.** `bun scripts/check.ts` · follow the recipe once on a real frontend change in a scratch worktree; record the two images and the clip.

**Review focus.** Every command runs as written. Each kind word matches `kinds.ts` of T49.

**Evidence.** Backend: summary, verify record, `--kind test --none` with the reason, `--kind contract --none`. No picture.

**Depends on.** T44, T49, T55, T61.

**Estimate.** 260 added lines, 1 file.

**Risk.** none.

**New UI element.** None.

**Decision 2 sensitive.** A capture service replaces the second worktree step with a service call.

### Wave 11. Resources on the epic page, the agent's duty

#### T68. Open the resources section on the epic page and on a ticket

Source: WEB-26.

**Result.** The epic page carries a `Resources · 5` section that collapses like the Plan section and holds the resource list, and a ticket page prints the resources its contract or its ask names.

**Touches.** `apps/web/src/features/epics/EpicPage/EpicPage.tsx` (268 lines, one section), `apps/web/src/features/ticket/TicketView/TicketView.tsx` (the block).

**Creates.** `apps/web/src/features/epics/EpicPage/components/EpicResources/EpicResources.tsx`, `EpicResources.test.tsx`, `index.ts`, `apps/web/src/features/ticket/ResourcesBlock/ResourcesBlock.tsx`, `index.ts`.

**Leave alone.** `apps/web/src/features/epics/EpicPage/components/EpicPlan`.

**Verify.** `bun test apps/web/src/features/epics` · `bun scripts/check.ts` · the epic route collapsed and open.

**Review focus.** The band plus the plan plus the resources take at most half the page card, so the section starts collapsed. The ticket block shows only the named resources, with the step after the name.

**Evidence.** Frontend floor. Extra: the 390 px viewport, the empty state.

**Depends on.** T35, T59, T60, T65.

**Estimate.** 180 lines, 7 files.

**Risk.** none.

**New UI element.** None.

#### T69. Write the evidence duty and the planner guidance in the agent instructions

Source: CLI ticket 16.

**Result.** `trellis instructions --project OP` prints the workflow with the evidence duty, and `trellis epics guide` prints the planner guidance that says a wave gates nothing and what evidence each kind owes.

**Touches.** `packages/cli/src/instructions.md`, `packages/api/src/instructions.ts` (it holds no `Plan an epic.` block today, so the block is added whole), `packages/cli/src/commands/epics.ts` (`planGuide` at lines 138-141 cuts at the first blank line, so the guidance stays one block).

**Creates.** `packages/cli/src/commands/epics/planGuide.test.ts`.

**The text.** The seven steps of screen 9, from `trellis contract show` to `trellis move KEY-42 human-review`. The planner guidance in place of `instructions.md:29-42`: a wave holds the tickets you intend to start together and gates nothing; order comes from `--after`; each ticket states its files, the files to leave alone, the verify commands, the review focus and the evidence owed. One line per floor and a link to `docs/EVIDENCE.md`.

**Leave alone.** `docs/EVIDENCE.md`, `docs/ARCHITECTURE.md`.

**Verify.** `bun test packages/cli/src/commands/epics` · `bun scripts/check.ts` · `trellis instructions --project OP` and `trellis epics guide`; record both transcripts.

**Review focus.** The two instruction files differ today (the CLI copy holds the planning block, the api copy holds `trellis review apply`). Diff them after the edit and name every remaining difference. Keep both substitution mechanisms (`KEY` and the `key` template). The word `wave` stays in this file until T73; the new sentences say `wave` where they name the intent and `--wave` where they name the shipped flag.

**Evidence.** Backend: summary, verify record, test proof for `planGuide.test.ts`, contract table of the printed text of both verbs. No picture.

**Depends on.** T44, T45, T49, T61, T66, T67.

**Estimate.** 200 lines, 4 files.

**Risk.** none.

**New UI element.** None.

**Decision 3 sensitive.** Step 7 says the hand-over refuses.

### Wave 12. The in-app browser and the phone

#### T70. Open a document in the editor and a link in the in-app browser

Source: WEB-27.

**Result.** A `doc` row opens the TipTap editor in a `PageSheet`, a `link` row opens the in-app browser in a `PageSheet`, an `image` row opens full size, and a `file` row downloads.

**Touches.** `apps/web/src/features/epics/ResourceList/ResourceList.tsx` (the four click paths).

**Creates.** `apps/web/src/features/epics/ResourceList/components/DocSheet/DocSheet.tsx` (reuses `LazyEditor`), `index.ts`, `components/LinkBrowserSheet/LinkBrowserSheet.tsx`, `LinkBrowserSheet.test.tsx`, `index.ts`.

**Leave alone.** `apps/web/src/features/ticket/Description/components/LazyEditor/**`. `apps/web/src/lib/sanitizeHtml.ts`.

**Verify.** `bun test apps/web/src/features/epics/ResourceList` · `bun scripts/check.ts` · the epic route in the browser and in the desktop shell.

**Review focus.** The in-app browser runs remote code. Under the desktop shell it is a `<webview>` with node integration off and a fixed partition. In the browser the row opens a new tab. Name which of the two ran in the evidence. A new package is its own ticket; stop and ask.

**Evidence.** Frontend floor. Extra: a clip of opening a doc and a link, the error state of a link that does not load.

**Depends on.** T68.

**Estimate.** 230 lines, 6 files.

**Risk.** dependency (none expected; the webview is a shell tag).

**New UI element.** `LinkBrowserSheet`.

#### T71. Fit the epic page to the phone

Source: WEB-28.

**Result.** At 390 px the epic page defaults to the Waiting grouping, each row is two lines of 56 px, every touch target is at least 44 px, and the band keeps its three lines with the legend hidden behind a tap.

**Touches.** `apps/web/src/features/table/Row/components/PhoneRow/PhoneRow.tsx`, `apps/web/src/features/table/PrRow/PrRow.tsx`, `apps/web/src/features/table/AgentLine/AgentLine.tsx`, `apps/web/src/features/table/rowHeights.ts`, `apps/web/src/features/epics/EpicPage/EpicPage.tsx`, `apps/web/src/features/epics/EpicPage/components/EpicProgress/EpicProgress.tsx`, `apps/web/src/features/table/columns.tsx` (`narrowHidden` at line 103 gains `releases`).

**Creates.** Nothing.

**Leave alone.** The desktop defaults.

**Verify.** `bun test apps/web/src/features/table` · `bun scripts/check.ts` · the epic route at 390 px, dark and light.

**Review focus.** Line 2 of a phone row holds one of four things; size, files and the evidence count drop first. A row never wraps to a third line.

**Evidence.** Frontend floor at 390 px before and after, plus the 1440 px pair to prove the desktop did not move.

**Depends on.** T29, T36, T41, T48, T68.

**Estimate.** 200 lines, 7 files.

**Risk.** none.

**New UI element.** None.

**Decision 4 sensitive.** The phone default lives here.

#### T72. Fit the review page and the ticket page to the phone

Source: WEB-29.

**Result.** At 390 px the review page shows regions A, B, C, D and E with one `Files` control for the rest, the verdict bar holds `Send back` and `Comment only` and no `Merge`.

**Touches.** `apps/web/src/features/reviews/ReviewPage/ReviewPage.tsx`, `apps/web/src/features/reviews/VerdictBar/VerdictBar.tsx`, `apps/web/src/features/reviews/FileRiskGroups/FileRiskGroups.tsx`, `apps/web/src/features/ticket/TicketView/TicketView.tsx`, `packages/ui/src/review/review.css`.

**Creates.** Nothing.

**Leave alone.** The desktop layout of both pages.

**Verify.** `bun test apps/web/src/features/reviews` · `bun test apps/web/src/features/ticket` · `bun scripts/check.ts` · both routes at 390 px.

**Review focus.** `Merge` does not render on a phone, and the reason reads on screen in one line. A merge into an enterprise repository needs the desk.

**Evidence.** Frontend floor at 390 px and 1440 px.

**Depends on.** T54, T58, T59, T63, T64, T65, T68.

**Estimate.** 190 lines, 5 files.

**Risk.** none.

**New UI element.** None.

### Wave 13. The word wave

#### T73. Rename the wave record to the wave

Source: S17, plus the nine CLI files of CLI ticket 2.

**Result.** Every identifier, column, route, ref, flag and label that says `wave` says `wave`, and the tree builds.

**This ticket exceeds the budget and says so.** The word appears 1,461 times in 129 files: 29 under `apps/server`, 71 under `apps/web`, 13 under `packages/api`, 10 under `packages/cli`, 1 under `packages/ui`, 5 under `docs`. A wire rename breaks every reader in one commit, so it lands as one pull request, alone in its wave.

**Touches.** Every file that holds the word, with these anchors: `apps/server/src/db/tables/waves.ts`, `apps/server/src/db/schema.ts` (`tickets.wave_id`, the check `tickets_wave_needs_epic` at line 102), `apps/server/src/services/waves/**`, `packages/api/src/schemas/wave.ts`, `packages/api/src/contract/waves.ts`, `packages/cli/src/commands/waves.ts` (renamed to `waves.ts`), `packages/cli/src/verbs.ts`, `packages/cli/src/output.ts`, `packages/cli/src/commands/create.ts`, `edit.ts`, `sub.ts`, `list.ts`, `epics.ts`, `packages/cli/src/instructions.md`, `packages/cli/src/errors.ts` (`WAVE_OUTSIDE_EPIC`), `apps/web/src/features/table/**`, `apps/web/src/features/epics/**`, `docs/UI_PATTERNS.md`, `docs/ARCHITECTURE.md`.

**Creates.** One migration and its snapshot, with `ALTER TABLE ... RENAME` for the table, the column, the constraints and the indexes.

**Leave alone.** `packages/api/src/notificationSound/notificationSound.ts:14` (an audio header). Every landed migration. The web labels T07 already renamed.

**Verify.** `bun test apps/server/src` · `bun test packages/api/src` · `bun test apps/web/src` · `bun scripts/check.ts` · `trellis waves list OP/routines-e2e`, `trellis create -p OP -t "probe" --wave OP/routines-e2e/run-settles` against a scratch server.

**Review focus.** The diff holds renames only. A search proves no file holds `wave` outside the audio header and the landed migrations. The migration renames the constraints and the indexes, not the table alone. `--wave` replaces `--wave`; `--wave` stays only if Navid asks.

**Evidence.** Backend: summary, verify record of the four commands, the unchanged test count on the base sha and the head sha, contract table of every renamed wire field, migration plan. Picture: the migration plan table.

**Depends on.** Every ticket T01 to T72.

**Estimate.** About 1,500 lines, about 129 files. A mechanical rename.

**Risk.** migration, shared type.

**New UI element.** None.

**Decision 4 sensitive.** The word only; the default grouping lives in T41 and T71.

### Wave 14. The architecture doc

#### T74. Write the domain rules of the evidence loop in the architecture doc

Source: CLI ticket 17.

**Result.** `docs/ARCHITECTURE.md` holds one section each for ticket dependencies, the contract, the summary, evidence, epic resources and the outcome, and each section states the table, the API, the ref grammar, the CLI verb and the web route in the shape of the `### Epics` section.

**Touches.** `docs/ARCHITECTURE.md` (1,103 lines today; T73 renamed its 71 `wave` lines).

**Creates.** Nothing.

**Leave alone.** `docs/EVIDENCE.md`, `docs/UI_PATTERNS.md`, every source file.

**Verify.** `bun scripts/check.ts` · read each section against the merged code and confirm every table name, verb and route.

**Review focus.** Every sentence states what the code does today. A sentence no merged code supports is deleted. No new sentence reintroduces `wave`.

**Evidence.** Backend: summary, verify record, `--kind test --none`, `--kind contract --none`. No picture.

**Depends on.** T73.

**Estimate.** 190 added lines, 1 file.

**Risk.** none.

**New UI element.** None.

**Decision 1 and 3 sensitive.** The contract section and the hand-over sentence follow the answers.

## 4. The file ownership map

One line per ticket: the paths it writes. An append file (section 0) is listed once per wave as `+append` and never blocks. A folder the ticket creates is written as `<folder>/**`. Two tickets of one wave never share a path.

**Wave 1**
- T01: `apps/server/src/gh/graphql.ts`, `graphql.test.ts`, `pollerWrite.ts`, `apps/server/src/db/tables/pullRequests.ts`, `apps/server/src/services/pullRequests.ts`, `pullRequestRows.ts`, `packages/api/src/schemas/pullRequest.ts`, `apps/server/drizzle/0082_*`
- T02: `apps/server/src/services/agentRuns/liveState.ts`, `liveState.test.ts`, `apps/server/src/agents/sessionMonitor/sessionMonitor.ts`, `sessionMonitor.test.ts`, `packages/api/src/schemas/agentRun.ts`
- T03: `apps/server/src/agents/harnesses/claude/parseClaudeEvent.ts`, `parseClaudeEvent.test.ts`
- T04: `packages/api/src/steCheck/**`, +append `packages/api/src/index.ts`
- T05: `packages/api/src/prPaths/**`, +append `packages/api/src/index.ts`
- T06: `packages/ui/src/gallery/components/DomainSections/DomainSections.tsx`, `sections/**`
- T07: the eight label sites of `columns.tsx`, `DisplayPopover.tsx`, `fields.ts`, `FilterPicker.tsx`, `submenuRows.tsx`, `ChipRow.tsx`, `EpicProgress.tsx`, `WaveRow.tsx`, `WavesSection.tsx`
- T08: `StatusIcon.tsx`, `Badge.tsx`, `chartTones.ts`, `tokens.css`, `agent-mark.css`, `ticket-glimmer.css`, `AgentMark.tsx`, `epicBar.ts`, `epicBar.test.ts`, `StatusRow.tsx`

**Wave 2**
- T09: `apps/server/src/db/tables/ticketDeps.ts`, `apps/server/src/db/schema.ts` (export), `apps/server/src/services/tickets/**` (write path, `ticketDeps.test.ts`), `apps/server/src/procedures/tickets.ts`, `packages/api/src/schemas/ticketWrite.ts`, `apps/server/drizzle/0083_*`, +append `registry.ts`, `contract/tickets.ts`
- T10: `apps/server/src/db/queries/ticketSummary.ts`, `ticketPrs.ts`, `support.ts`, `apps/server/src/db/ticketPrs.test.ts`, `packages/api/src/schemas/ticket.ts`, `ticketPr.ts`
- T11: `packages/api/src/runLine/**`, +append `packages/api/src/index.ts`
- T12: `AgentProfileMark/**`, `Avatar.tsx`, `agent-mark.css`, `sections/AgentCard.tsx`, +append `sections/index.ts`
- T13: `packages/ui/src/domain/PrGlyph/**`, `PrStateIcon.tsx`, `PrCell.tsx`, `sections/PrGlyph.tsx`, +append `packages/ui/src/index.ts`, `sections/index.ts`
- T14: `EpicProgress.tsx`, `EpicProgress/bandLegend/**`
- T15: `apps/web/src/features/reviews/ChecksLine/**`, `ReviewChecks/ReviewChecks.tsx`, `sections/ChecksLine.tsx`, +append `sections/index.ts`
- T16: `apps/web/src/features/reviews/FileRiskGroups/**`, `sections/FileRiskGroups.tsx`, +append `sections/index.ts`
- T17: `apps/web/src/features/reviews/ReviewFocusList/**`, `sections/ReviewFocusList.tsx`, +append `sections/index.ts`

**Wave 3**
- T18: `apps/server/src/gh/graphql.ts`, `parse.ts`, `parse.test.ts`, `pollerWrite.ts`, `apps/server/src/db/tables/pullRequests.ts`, `apps/server/src/services/pullRequests.ts`, `pullRequestRows.ts`, `packages/api/src/schemas/pullRequest.ts`, `apps/server/drizzle/0084_*`
- T19: `apps/server/src/db/queries/ticketSummary.ts`, `ticketPrs.ts`, `apps/server/src/db/ticketDepsSummary.test.ts`, `packages/api/src/schemas/ticket.ts`, `ticketPr.ts`
- T20: `apps/server/src/services/tickets/importDeps.ts`, `importDeps.test.ts`, `packages/api/src/schemas/ticketWrite.ts`, +append `registry.ts`, `contract/tickets.ts`
- T21: `packages/cli/src/commands/create.ts`, `edit.ts`, `deps/**`, +append `verbs.ts`
- T22: `flattenGroups.ts`, `flattenGroups.test.ts`, `rowHeights.ts`, `TableBody.tsx`, `EpicPage.tsx`, `apps/web/src/features/table/PrRow/**`
- T23: `apps/web/src/features/reviews/ConditionsBlock/**`, `sections/ConditionsBlock.tsx`, +append `sections/index.ts`

**Wave 4**
- T24: `apps/server/src/db/schema.ts` (tickets), `apps/server/src/services/tickets/contract.ts`, `contract.test.ts`, `outcome.ts`, `outcome.test.ts`, `apps/server/src/procedures/tickets.ts`, `packages/api/src/schemas/ticket.ts`, `ticketWrite.ts`, `apps/server/drizzle/0085_*`, +append `registry.ts`, `contract/tickets.ts`
- T25: `packages/api/src/schemas/ticketPr.ts`, `apps/server/src/db/queries/ticketPrs.ts`, `apps/server/src/db/ticketPrs.test.ts`
- T26: `packages/api/src/waiting/**`, +append `packages/api/src/index.ts`
- T27: `apps/server/src/services/waves/rows.ts`, `packages/api/src/schemas/wave.ts`, `apps/server/src/db/waveNext.test.ts`, `apps/server/src/services/brief.test.ts` (fixture lines 130-131 only), `packages/cli/src/commands/waves.ts:26`, `apps/web/src/features/epics/epicNext/**`
- T28: `packages/api/src/schemas/review.ts`, the review status service under `apps/server/src/services/reviews/` and its test
- T29: `flattenGroups.ts`, `rowHeights.ts`, `TableBody.tsx`, `apps/web/src/features/table/AgentLine/**`, `packages/ui/src/primitives/AttentionDot/**`, `sections/AttentionDot.tsx`, +append `packages/ui/src/index.ts`, `sections/index.ts`

**Wave 5**
- T30: `apps/server/src/db/tables/prSummaries.ts`, `apps/server/src/db/schema.ts` (export), `apps/server/src/services/prSummary.ts`, `prSummary.test.ts`, `apps/server/src/procedures/pullRequests.ts`, `packages/api/src/schemas/pullRequest.ts`, `apps/server/drizzle/0086_*`, +append `registry.ts`, `contract/pullRequests.ts`
- T31: `apps/server/src/services/tickets/importContract.ts`, `importContract.test.ts`, +append `registry.ts`, `contract/tickets.ts`
- T32: `packages/cli/src/commands/contract/**`, +append `verbs.ts`
- T33: `packages/cli/src/commands/outcome/**`, +append `verbs.ts`
- T34: `packages/cli/src/commands/ready/**`, +append `verbs.ts`
- T35: `columns.tsx`, `Row.tsx`, `StatusCell.tsx`, `columnVisibility.ts`, `columnVisibility.test.ts`, `EpicPage.tsx`, `Row/components/WaitsCell/**`, `ReleasesCell/**`
- T36: `apps/web/src/features/table/PrRow/**`
- T37: `apps/web/src/features/ticket/ContractBlock/**`, `sections/ContractBlock.tsx`, +append `sections/index.ts`
- T38: `apps/web/src/features/ticket/ChainBlock/**`, `sections/ChainBlock.tsx`, +append `sections/index.ts`
- T39: `apps/web/src/features/ticket/RunLine/**`, `sections/RunLine.tsx`, +append `sections/index.ts`

**Wave 6**
- T40: `apps/server/src/db/tables/prEvidence.ts`, `apps/server/src/db/schema.ts` (export), `apps/server/src/services/evidence/**`, `apps/server/src/procedures/pullRequests.ts`, `apps/server/src/db/queries/ticketPrs.ts`, `packages/api/src/schemas/evidence.ts`, `ticketPr.ts`, `packages/api/src/evidenceFloor/**`, `apps/server/drizzle/0087_*`, +append `registry.ts`, `contract/pullRequests.ts`, `packages/api/src/index.ts`
- T41: `grammar.ts`, `grammar.test.ts`, `DisplayPopover.tsx`, `groupRows.ts`, `groupRows.test.ts`, `utils/waitingGroups/**`, `EpicProgress.tsx`, `epicNext/**`
- T42: `apps/web/src/features/reviews/ChangeSummary/**`, `sections/ChangeSummary.tsx`, +append `sections/index.ts`
- T43: `apps/web/src/features/ticket/StartControls/**`, `sections/StartControls.tsx`, +append `sections/index.ts`
- T44: `packages/cli/src/commands/summary/**`, +append `verbs.ts`
- T45: `packages/api/src/epicText/**`, `packages/cli/src/commands/epics.ts`, `packages/cli/src/output.ts`, +append `packages/api/src/index.ts`

**Wave 7**
- T46: `apps/server/src/services/reviews/dispatchDeliveries.ts`, `dispatchDeliveries.test.ts`, `apps/server/src/agents/reviewDeliveryLoop.ts`, `packages/api/src/schemas/review.ts`, +append `registry.ts`
- T47: `apps/web/src/features/reviews/EvidenceStrip/**`, `sections/EvidenceStrip.tsx`, +append `sections/index.ts`
- T48: `apps/web/src/features/table/PrRow/prRowText/**`
- T49: `packages/cli/src/commands/evidence/**`, +append `verbs.ts`
- T50: `apps/server/src/services/brief.ts`, `brief.test.ts`, `apps/server/src/services/brief/contractLines*`, `evidenceLines*`

**Wave 8**
- T51: `apps/server/src/db/tables/epicResources.ts`, `apps/server/src/db/schema.ts` (export), `apps/server/src/services/resources/**`, `apps/server/src/procedures/resources.ts`, `packages/api/src/schemas/resource.ts`, `epic.ts`, `packages/api/src/contract/resources.ts`, `apps/server/drizzle/0088_*`, +append `registry.ts`, `contract/index.ts`, `packages/api/src/index.ts`
- T52: `EvidenceStrip/EvidenceStrip.tsx`, `EvidenceStrip/components/BackendEvidence/**`, `MissingList/**`, `sections/BackendEvidence.tsx`, +append `sections/index.ts`
- T54: `ReviewPage/ReviewPage.tsx`, `ReviewPage/components/**`, `ReviewPage/conditionsOf/**`, `ReviewPage/hooks/**`, `ReviewHeader/ReviewHeader.tsx`, `packages/ui/src/review/review.css`
- T55: `packages/cli/src/commands/evidence/evidence.ts` (one line), `evidenceText.ts`, `evidenceText.test.ts`
- T57: `apps/server/src/services/brief.ts`, `brief.test.ts`, `apps/server/src/services/brief/chainLines*`

T49 (wave 7) and T55 (wave 8) both write `evidence.ts`; T55 waits on T49, so they never run together.

**Wave 9**
- T58: `apps/web/src/features/reviews/VerdictBar/**`, `MergeControl/MergeControl.tsx`, `ReviewPage/ReviewPage.tsx`
- T59: `TicketView/TicketView.tsx`, `PropertiesRail/PropertiesRail.tsx`, `TicketWorkArea/TicketWorkArea.tsx`, `apps/web/src/features/ticket/OutcomeBlock/**`
- T60: `apps/web/src/features/epics/ResourceList/**`, `sections/ResourceList.tsx`, +append `sections/index.ts`
- T61: `packages/cli/src/commands/evidence/evidence.ts` (one line), `check.ts`, `checkText.ts`, `checkText.test.ts`
- T62: `packages/cli/src/commands/resource/**`, +append `verbs.ts`

**Wave 10**
- T63: `ReviewSummary/ReviewSummary.tsx` (delete), `ReviewDiscussion/ReviewDiscussion.tsx`, `ReviewPage/ReviewPage.tsx`, `packages/ui/src/review/index.ts`, `packages/ui/src/review/ReviewTabs/**` (delete)
- T64: `ReviewHeaderActions/components/ReviewerPicker/**` (delete), `ReviewHeaderActions.tsx`, `reviewActions.ts`, `reviewActions.test.ts`
- T65: `ticket/Timeline/**` (delete), `ticket/hooks/useTimeline/**` (delete), `TicketMetrics/**` (delete), `lib/ticketSearch/**`, `routes/t/$identifier/route.tsx`, `routes/reviews_.$owner.$repo.$number.tsx`, `TicketWorkArea.tsx` (one import), `TicketView.tsx` (two lines), `docs/UI_PATTERNS.md`
- T66: `packages/cli/src/commands/move.ts`, `move/**`, `packages/cli/src/errors.ts`
- T67: `docs/EVIDENCE.md`

**Wave 11**
- T68: `EpicPage/EpicPage.tsx`, `EpicPage/components/EpicResources/**`, `apps/web/src/features/ticket/ResourcesBlock/**`, `TicketView/TicketView.tsx`
- T69: `packages/cli/src/instructions.md`, `packages/api/src/instructions.ts`, `packages/cli/src/commands/epics.ts`, `packages/cli/src/commands/epics/planGuide.test.ts`

**Wave 12**
- T70: `ResourceList/ResourceList.tsx`, `ResourceList/components/DocSheet/**`, `LinkBrowserSheet/**`
- T71: `PhoneRow.tsx`, `PrRow/PrRow.tsx`, `AgentLine/AgentLine.tsx`, `rowHeights.ts`, `EpicPage.tsx`, `EpicProgress.tsx`, `columns.tsx`
- T72: `ReviewPage/ReviewPage.tsx`, `VerdictBar/VerdictBar.tsx`, `FileRiskGroups/FileRiskGroups.tsx`, `TicketView/TicketView.tsx`, `packages/ui/src/review/review.css`

**Wave 13**
- T73: every file that holds `wave`; no other ticket runs.

**Wave 14**
- T74: `docs/ARCHITECTURE.md`.

The five files with the most traffic, in order of ownership: `ReviewPage.tsx`: T54, T58, T63, T72. `TicketView.tsx`: T59, T65, T68, T72. `EpicPage.tsx`: T22, T35, T68, T71. `flattenGroups.ts` and `TableBody.tsx`: T22, T29. `ticketPrs.ts`: T10, T19, T25, T40.

## 5. The migrations, in order

Each one is generated with `bun run db:generate` after the newest tag on `main` at that moment, and never renamed or edited after it lands. Drizzle picks the suffix; the number is what the chain fixes. A branch that generates before its parent merges gets the same number twice: regenerate, never rename.

| Number | Ticket | Wave | Follows | What it does |
| --- | --- | --- | --- | --- |
| 0082 | T01 | 1 | `0081_spooky_giant_girl` | `pull_requests` gains `additions`, `deletions`, `changed_files`, default 0 |
| 0083 | T09 | 2 | 0082 | new table `ticket_deps` |
| 0084 | T18 | 3 | 0083 | `pull_requests` gains `files` jsonb |
| 0085 | T24 | 4 | 0084 | `tickets` gains `result`, `files`, `leave_alone`, `verify`, `review_focus`, `outcome` |
| 0086 | T30 | 5 | 0085 | new table `pr_summaries` |
| 0087 | T40 | 6 | 0086 | new table `pr_evidence` |
| 0088 | T51 | 8 | 0087 | new table `epic_resources` |
| 0089 | T73 | 13 | 0088 | rename `waves` to `waves`, `tickets.wave_id` to `wave_id`, constraints and indexes |

Eight migrations. No wave holds two.

## 6. The tickets that change if a decision goes the other way

| Decision | Assumed | Tickets that change, and how |
| --- | --- | --- |
| 1. The contract: fields or prose | fields, with a one-time import | T24 loses its contract half. T31 disappears. T32 keeps `contract show` as a parser. T17 shows a sentence it failed to parse. T23 prints `unknown` for `tests` and `ancestors`. T37 reads a parse result. T50 names what the parse missed. T61 warns when the parse finds no verify command. T74 describes a parser. |
| 2. Who captures the before image | the agent | T40 gives the `before` kind an actor of `service`. T47 adds a `captured by Trellis` line and a re-capture control. T49 drops `--base`. T67 replaces the second worktree step with a service call. |
| 3. May the CLI refuse the hand-over | yes | T66 becomes a warning and exit 0. T69 step 7 becomes a warning. T74 drops the sentence. T40 does not change. |
| 4. Which grouping is the default on the desktop | Wave | T41 sets the desktop default. T71 sets the phone default; Waiting on both makes it a one-line change. T45 puts the wave group behind a flag. T73 owns the word only. |

## 7. The new UI elements that need approval

`docs/UI_PATTERNS.md:13-15` requires that each new element names the canonical element it would replace and the reason that element fails. Sixteen elements. Approve them before wave 2 starts; every one is built in the gallery first, so a no costs one ticket and nothing on a route.

| Element | Ticket | Nearest canonical element, and why it fails |
| --- | --- | --- |
| `PrGlyph` | T13 | `PrStateIcon` draws a fifth state, `blocked`, in red for a failed check: two facts on one glyph. |
| `ChecksLine` | T15 | `CheckRing` draws three arcs and a glyph for one rollup. Rule 6 rejects it. |
| `FileRiskGroups` | T16 | `ReviewFiles` lists by path with counts; nothing orders by risk, collapses noise or keeps a read mark. |
| `ReviewFocusList` | T17 | `SubTickets` counts tickets with a progress bar; a focus item is a sentence marked per revision. |
| `PrRow` | T22 | `Row` with the 72 px `pr` column cannot hold the glyph, number, state, size, checks, threads, evidence and what it waits for. |
| `ConditionsBlock` | T23 | `PropertyRow` holds one label and one value; nine conditions need one order, one label width and one readiness word. |
| `AgentLine` | T29 | `Row` is one line at a fixed height; the message needs a 24 px second line only when one exists. |
| `AttentionDot` | T29 | `Badge` carries a word; `StatusIcon` carries a status; neither is a 6 px dot that means a human is needed. |
| `ContractBlock` | T37 | `PropertyRow` holds one value; the contract holds lists the server also reads. |
| `ChainBlock` | T38 | `PropertyRow` holds one direction; the chain holds two and a derived `Ready`. |
| `RunLine` | T39 | `ActorAvatar` marks one actor; the line prints one attempt with its state words, tool, time and message. |
| `ChangeSummary` | T42 | `Description` renders free prose; the summary is three fields with limits and a `one revision behind` state. |
| `StartControls` | T43 | `ModelPicker` picks a model; a start needs harness, model and effort with one `Start`. |
| `EvidenceStrip` | T47, T52 | `AttachmentGrid` splits files into thumbnails and rows; evidence needs a pair, a record, a clip, a verify record, a table and a missing list. |
| `ResourceList` | T60 | `AttachmentGrid` belongs to a ticket; a resource belongs to the epic, has four kinds, and opens an editor or a browser. |
| `LinkBrowserSheet` | T70 | No in-app browser exists (`webview` and `iframe` return one hit, `sanitizeHtml.ts:40`). `PageSheet` holds no remote page. |

One question, not an element: T58 rebuilds the merge, send back and comment controls as one fixed bottom bar in the shape of `ReviewBatchBar`. If Navid reads it as a new element, it joins this list as `VerdictBar`.

Changes to existing elements, no approval needed: `columns.tsx` gains `waits` and `releases` (T35); `rowHeights.ts` and `flattenGroups.ts` gain two row kinds (T22, T29); `DisplayPopover` gains `Group by: Wave · Waiting` (T41); `GroupHeader` count slot takes text (T41); `epicBar.ts` and the Agent Review glyph move from `agent` to `accent` (T08); the agent card gains the glimmer and drops the violet stop (T12, T08).

## 8. Totals

| | Count |
| --- | --- |
| Tickets | 72 |
| Waves | 14 |
| Migrations | 8 |
| Estimated changed lines | about 16,700, of which about 2,600 are the rename (T73) and the deletion sweep (T65) |
| Tickets over the 300-line target, each with its reason | 3: T06 (file split), T65 (deletion sweep), T73 (rename) |
| Tickets added by the merge | 4: T04 (STE module unfolded), T05 (path rules unfolded), T28 (review status ticket link), T51 (epic resources); plus the outcome column inside T24 |
| Tickets folded by the merge | 2: CLI ticket 1 into T04, CLI ticket 2 into T73 |
| New UI elements for approval | 16, plus one question on T58 |
| Agents at once | 8 in wave 1, 9 in waves 2 and 5, 10 at most in any wave |
