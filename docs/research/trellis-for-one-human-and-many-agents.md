# Trellis for one human and many agents

The proposal Navid accepted on 2026-09-20 ("Love it."). A panel produced it from the brief below and from nothing else. The mockups are the local page `trellis-proposal-v2.html`; the research and the three competing designs stayed in the session scratchpad. This file holds the brief and the verdict verbatim.

---

# Brief: a fresh proposal for Trellis, the tool for one person who ships with many agents

Read this whole file before you work. You start from zero. Do not look for an earlier proposal, mock, or design in this machine's scratch folders. Everything you need to know from earlier work is in this file.

## The product

Trellis is a local, single-user work tracker for software built by AI coding agents. It runs on the person's Mac (a server on PGlite, a React web app, an Electron desktop shell, a CLI named `trellis`). It has projects, tickets with statuses (categories todo, started, done, canceled; statuses carry a reviewer of `human` or `agent`), sub-tickets, labels, comments, attachments, and pull requests linked to tickets. It launches agent runs (Claude Code, Codex, Muse) into their own worktrees, one runtime per agent, and records what each run does through the harness hooks. It has a review page per pull request (the diff, review threads, checks), flows (multi-step agent pipelines bound to a ticket, each step with its own harness and model), an epic record that groups tickets of one plan inside a project, and waves (a set of tickets of one epic the person intends to start together; a wave gates nothing). Tickets can depend on other tickets (planned: table `ticket_deps`, flag `--after`). Trellis owns review comments; GitHub comments are for humans.

The repository is at `/Users/navidkhan/.superset/worktrees/974494a1-2921-48f1-b1b1-9589e4a5f428/features`. Read it when a fact about what exists matters. Do not modify it.

## The user

One human, Navid. In his words:

"The user (me, a human) is trying to build software using AI agents at speed by using multiple agents at the same time, with tight control on quality and being completely aware of each pull request being merged and its contents. We do not want to be vibe coding. We are merging into a large enterprise codebase so we want strict quality controls. Since the human is not spending time writing code anymore and the AI agents do most of the implementation, the human only adds value by reviewing the code. He adds value by ensuring we merge small PRs that are not dangerous and he keeps track of the system architecture as it is built. The design decisions, the architecture is what matters."

He runs 5 to 10 agents at once on one epic (a real one: "Routines E2E" in project OP, 27 tickets, 6 waves; exports of every ticket are in `../OP-*.json` next to this file, each with its pull requests and checks). He starts every ticket himself. He reviews every pull request himself, with manual review and with flows. He wants to see dependency order and where everything stands without reading and parsing every line.

## His newest feedback, verbatim, 2026-09-20

"i like where we are going with evidence. When an agent works on a frontend implementation, the diff should always include screenshots and gifs of usage. However for code only / backend changes, review is harder. we could ask to include documents, charts, visualizations that help us understand what the pr includes. we could prioritize how we write the diff summary (using STE) as always, and improve how we present it."

"I think you need to redo the proposal document you're showing me from scratch so you're not influenced by the first version as much. Keep what we learnt so far, along with my new feedback."

"The ticket page can be rethought too. I think we added activity feed and comments, but we aren't collaborating with other humans and we already have an interface to interact with the agent, so those features make no sense at all. a ticket needs something else entirely."

## Freedom

Navid, 2026-09-20: "remember, we can rethink how software is made entirely."

Take this literally. Do not assume that the shape of work today (a ticket, a pull request, a review with line comments, a board, a sprint) is the shape it must have when one human directs many agents into an enterprise codebase. Question each artifact: what it is for, who reads it, what it costs him. Keep only what earns its place, and invent what the loop needs. The one fixed boundary is the enterprise repository on GitHub: code enters it through a pull request that passes its checks, and a human is accountable for the merge. Everything between the person's intent and that merge is open.

## What we learned, as rules

These came from his corrections over three days. Treat each as a hard constraint.

1. The human is the manager. There is no manager persona, no hold, no gate that blocks him. He starts every ticket himself. No wave start action, no queue, no capacity meter or limit. "I want dependency to be clear and I will start stuff myself."
2. Dependencies must be visible: what a ticket waits on, what it unblocks, and whether it is ready. A wave is what he intends to start together; a dependency is what finishes first; neither implies the other.
3. Every state of an agent run must come from a real harness signal, named. The harness exposes: the run starts, the agent works (with the current tool), the agent sends a message, the agent asks a question (Muse forwards the question text; Claude Code sends the question inside the tool input, which the server can forward; Codex sends only a title), the turn completes, the run fails with an error or a nonzero exit, the process exits, the process is lost. The server also records the last message and the last tool with their times, and whether the person has seen the latest completion. Do not invent states.
4. A live state moves; a static mark does not mean "in progress". Yellow means one thing: a human is needed. It is not "in progress".
5. No violet or purple anywhere, except the GitHub merged pull request glyph.
6. One glyph and one color per fact. Marks stay legible at their size. A ring of three arcs with a glyph inside fails. A failing check is one red mark, or words. Text like `1 failed · 6 pending · 47 passed` beat a dense icon.
7. The GitHub pull request glyph (open, draft, merged, closed in GitHub's shapes and colors) sits before the pull request number, not in a cluster of icons.
8. Every pull request of a ticket shows under its ticket, with pull request facts: size, files, tests, checks, unresolved review threads, flow runs, review state.
9. He does not want a separate labeled row that says "said:". The agent's last message or question shows under the ticket title, after the agent's name, on a second line, and only when there is one.
10. He does not want a "decide" word.
11. Agents are shown with the card Trellis already has: an 18 px round card with the provider logo of the run's harness (Anthropic, OpenAI, Meta). While the agent works, the card carries the product's glimmer: one sweep of light every 7 s, still in between (the tokens define `--animate-glimmer`; the film gradient loses its violet stop). No rainbow sweeps, no spinners on the row.
12. Too many tags fail. Icons that need decoding fail. He must get the whole picture of an epic without reading every line, and a click on a row gives more.
13. A chart that is "a lot" fails. Two bars on a header were too much.
14. Resources belong to an epic: documents (TipTap editor), links (in-app browser), images, files. He must reach the design document, plans, and assets from the epic.
15. Prose follows ASD-STE100: short sentences, one instruction per sentence, active voice, present tense, no em dashes anywhere. Quoted material stays verbatim.
16. The web app draws with the tokens in `packages/ui/src/tokens.css` (dark theme default; light exists). Canonical UI elements are listed in `docs/UI_PATTERNS.md`; a new element or interaction needs his approval, so a proposal must name each new element and say why an existing one does not cover it.
17. Small pull requests that are not dangerous. He judges a PR by size, files, tests, risk (migrations, auth, dependencies, shared types, deleted tests), the areas it touches, and the architecture decisions it makes.
18. Local renders. The proposal is an HTML page he opens on his machine, in the Trellis look, with his real epic data. Mockups, not prose alone.

## Facts about the code that a design may lean on

- Agent run observation reaches the web at a 2 s tick: process status, activity (ready, working, idle, with a since time), outcome (completed, interrupted, failed), attention (open requests, latest completion with a sequence, latest failure), and a per-run seen marker the person's viewer posts. The last message and last tool exist in the runtime protocol and are not yet forwarded; forwarding is a small change.
- The GitHub poller stores per pull request: state, draft, url, title, head and base refs, merged and closed times, review decision, and each check with a bucket (fail, pending, pass) and a link. It does not yet fetch additions, deletions, or the changed files; adding them is one GraphQL selection change and a migration.
- Review threads live in Trellis tables (`review_threads`, with a resolved flag, per revision), and review submissions with a verdict. Flow executions link to a ticket and have steps. Ticket attachments are blobs with an actor.
- Trellis has a notion of "evidence" and "ready for review" on an attempt: an agent registers artifacts (files) and runs checks against them; a restart resets readiness. Look at the code under `apps/server/src/services` and the CLI under `packages/cli/src/commands` for what exists before you design on top of it.
- The ticket table is a virtualized grid with fixed row heights per density, per-route column visibility, keyboard navigation, and multi-select. Rows can be grouped (by wave inside an epic). A `GroupHeader` takes one badge and a count slot.

## What to produce

A proposal for what the product looks like for this user, as a set of local HTML mockups plus short notes, covering at least:

1. The epic page, where he sees the whole epic: dependency order, who moves next on each ticket, each pull request and its facts, agents at work, and what he must do.
2. The pull request as the unit of review: how an agent proves a frontend change (screenshots and GIFs of usage, always) and a backend or code-only change (documents, charts, visualizations that explain what the PR contains), how the diff summary is written (STE) and presented, and how the reviewer gets to "small and not dangerous" fast.
3. The review flow: manual review plus flows, review threads, evidence, and the merge.
4. Dependencies: how he records them, sees them, and acts on them, with no automation that starts work for him.
5. Epic resources: documents, links, images, files.
6. The CLI and the agent's side: what an agent must attach to a PR, how the brief tells it, what the CLI prints.
7. The phone view of the epic page.
8. The ticket page, rethought from zero. No activity feed and no comment thread: one human works here, and the agent has its own session view. Decide what a ticket is for this user (the contract, the plan, the dependencies, the pull requests with their evidence, the run, the resources, the decision it asks) and design the page around that. Read the current ticket page in `apps/web/src/features/ticket` first so you know what exists.

Use his real epic data. Name every new UI element. Name the harness signal behind every state. Keep the number of colors, marks, and words small, and make each one earn its place. Write the notes in STE.


---

# Verdict: one proposal for Trellis

Judge's synthesis of design A (review first), design B (epic first) and design C (ticket first), scored against the brief and against the feedback of 2026-09-20.

## 0. The scores, and what I took from each design

### 0.1 Where each design breaks a rule

| Rule | A: review first | B: epic first | C: ticket first |
| --- | --- | --- | --- |
| 1. No gate blocks him | Holds. Merge stays live with a confirm line. | Breaks. `Approve and merge` is disabled on a failed check, an open thread or an unmerged stack. | Breaks. `Approve and merge` is disabled on an open thread or a failed check. |
| 2. Dependencies visible, ready derived | Holds. Landing order list, `ancestors` condition. Data errors: OP-34 unblocks OP-35 and OP-42, not OP-38 and OP-44; OP-44 waits on OP-43, not OP-32; OP-42 waits on OP-34, not OP-32. | Holds. `waits` and `unblocks` columns, derived edge from the branch graph. Data error: the wave 3 rows say OP-44 waits on OP-32. It waits on OP-43. | Holds. Release ranked list. Data error: the dependency table omits OP-35 from the tickets that wait on OP-34. |
| 3. Named harness signals | Holds. | Holds. | Holds. |
| 4. Yellow means a human is needed | Holds. | Holds. `▲` on `asks`. | Holds. `?` and yellow text. |
| 6. One glyph and one color per fact | Holds. | Holds. | Weak. `?`, `!` and `◐` on one row need decoding. |
| 9. No `said:` row | Holds. | Holds. | Holds. |
| 12. Whole picture without reading every line | Weak. The readiness line carries 8 facts per row. | Strong. Two short cells, `waits` and `unblocks`, plus a pull request row. | Strong. `Next move` phrase and the front line sentence. |
| 13. No chart that is a lot | Holds. | Holds. Wave list is text. | Holds. |
| 16. New elements named and justified | 12 elements. | 17 elements. Too many. Several are columns, not elements. | 7 elements. Tightest list. |
| Feedback: frontend evidence always pictures and clips | Holds. Pairs with a capture record. | Holds. Pairs with a manifest line. | Holds. Pairs with a manifest. |
| Feedback: backend evidence as documents, charts, visualizations | Holds. Verify record, test proof, one picture. | Strongest. The picture table by kind of change, the contract table, the migration plan. | Strong. Contract table inline. |
| Feedback: the ticket needs something else | Contract, order, changes, run. | Plan tab with contract and run. | Strongest. Five clauses, `Leave alone`, `Evidence owed`, an `Outcome` clause. |

### 0.2 What I take from each

From B, the skeleton. The epic page is the product. Every other screen is the same row grammar at a closer zoom. The `waits` and `unblocks` cells give the whole picture in two short columns. A pull request is its own row under its ticket. A dependency that the branch graph already writes is read, never typed again. `#57055` is based on `nk/operator-routine-execution`, which is the head of `#55569`. That edge is real and derived.

From C, the ticket and the ranking. A ticket is a contract with five clauses. The contract names the files to leave alone and the evidence owed before work starts. The ranking of acts by what one act releases decides the order of his day. Merge `#55569` releases four tickets. Nothing else on the board releases more than two.

From A, the review page. The conditions block computes every merge fact as one text line each. The review focus of the ticket becomes a list the reviewer marks on the review page. The ancestors condition names the pull request that must land first. The merge control stays live, and it prints the unmet conditions as one confirm line.

### 0.3 Facts that correct the brief and the designs

- Evidence does not exist in the code. `apps/server/drizzle/0066_remove_evidence.sql` drops `evidence_artifacts` and `evidence_checks`. Every evidence feature below is new work. The nearest model is `attachments`, keyed by sha256.
- Ticket dependencies do not exist. The exports write them as prose: `Depends on: step N`. Every description opens with `Step N of the routine runtime`, so the step map is in the data. I resolved every edge from it. The table in section 1 is the real graph.
- The poller stores no pull request size. Every `+a −d · n files` below is an example value and is marked so on the rendered page.
- The exports carry one agent name, `crisp-fjord`, and no live run state. Every run state on a mock is an example value.
- The word `brief` is taken. `trellis brief` and `apps/server/src/services/brief.ts` mean the markdown an agent starts from. The agent-written pull request text is the **summary**, never the brief.
- The `Agent Review` status carries the color `agent`, which is violet `#9D6AFB` in the dark theme. Rule 5 forbids it. The status glyph and the review segment of the epic bar (`epicBar.ts:13`) both move to `--accent`.

One word for one meaning through this document:

| Word | Meaning |
| --- | --- |
| ticket | One unit of work, a contract between him and one agent. |
| wave | The shipped `wave` record. What he intends to start together. |
| waits on | The tickets that must be done before this ticket starts. |
| releases | The tickets whose last unmet dependency this ticket is. |
| summary | The text an agent writes on a pull request: headline, why, watch. |
| evidence | The files and records that prove a pull request works. |
| condition | One computed merge fact on the review page. |
| turn | Who moves next: `you`, an agent, or `github`. |
| run | One agent attempt on a ticket. |

---

## 1. The loop of the person's day

### 1.1 The state of `Routines E2E` today, from the exports

27 tickets, 6 waves. Done: OP-29, OP-30, OP-31. Agent Review: OP-27, OP-32, OP-33, OP-35, OP-37, OP-39, OP-43. Human Review: OP-52, OP-53. Todo: 15.

The dependency graph, resolved from `Depends on: step N`:

| Ticket | Waits on | Releases |
| --- | --- | --- |
| OP-32 | OP-29, OP-30, OP-31, all done | OP-33, OP-34, OP-40, OP-50 |
| OP-33 | OP-32 | none |
| OP-34 | OP-32 | OP-35, OP-42 |
| OP-35 | OP-34 | OP-36 |
| OP-37 | OP-30, done | OP-38 |
| OP-39 | OP-31, done | none |
| OP-40 | OP-32 | OP-41 |
| OP-43 | none | OP-44 |
| OP-45 | none | OP-46 |
| OP-46 | OP-45 | OP-47 |
| OP-47 | OP-46 | OP-48, OP-49 |
| OP-50 | OP-32 | OP-51 |
| OP-54 | every ticket of wave 2 and wave 3, 11 tickets | none |

Two facts fall out of the graph, and no design saw both.

1. No Todo ticket is ready to start. The band prints `0 to start`. The board waits on him and on the agents, not on a free slot.
2. `#57057` of OP-35 is open, not a draft, and all its checks pass. Its ancestor OP-34 is Todo and has no pull request. The review page prints `ancestors  OP-34 not merged, no pull request`. He decides what that means.

Whose turn, per open pull request:

| Pull request | Ticket | State | Checks | Turn | Why |
| --- | --- | --- | --- | --- | --- |
| #56930 | OP-27 | open | 37 passed · 35 skipped | you | not a draft, no failed check, no open thread |
| #57057 | OP-35 | open | 42 passed · 57 skipped | you | the same |
| #57080 | OP-43 | open | 1 failed · 6 pending · 47 passed · 44 skipped | crisp-fjord | a check failed |
| #55569 | OP-32 | draft | 9 passed · 88 skipped | crisp-fjord | a draft |
| #57055 | OP-33 | draft | 9 passed · 91 skipped | crisp-fjord | a draft, stacked on #55569 |
| #57078 | OP-37 | draft | 1 failed · 8 passed · 85 skipped | crisp-fjord | a draft, a check failed |
| #57079 | OP-39 | draft | 1 failed · 8 passed · 85 skipped | crisp-fjord | a draft, a check failed |

The failing check on all three is `merge_gatekeeper` in the workflow `9.AUTO Merge gatekeeper`.

So the day holds 2 items for him: 2 reviews. It holds 5 items with agents. The lever of the day is `#55569`, which releases 4 tickets, and it is with an agent.

### 1.2 The loop

| Step | What he does | Where | Cost |
| --- | --- | --- | --- |
| 1 | He opens the epic. He reads the band: `Current: The run settles...`, `0 to start · 5 running · 2 wait for you`. | Epic page | 10 s |
| 2 | He switches the grouping to Turn. The `Your turn` group lists 2 rows, sorted by what each releases. | Epic page, group by turn | 5 s |
| 3 | He opens `#57057`. He reads the conditions. `ancestors  OP-34 not merged, no pull request`. He decides: review it now and hold the merge, or send it back with one thread. | Review page | 1 to 15 min |
| 4 | He opens `#56930`. Conditions read `READY TO MERGE  yes`. He plays the clip once, reads the two focus items, opens the one risk file, merges. | Review page | 5 to 10 min |
| 5 | He returns to the epic. `#55569` is still a draft. He opens the session of `crisp-fjord` on OP-32 and asks what holds it. | Session sheet | 2 min |
| 6 | When `#55569` merges, OP-34, OP-50 and OP-40 read `ready`. He starts each one himself. He picks the harness and the model per ticket. | Ticket page, `Start` | 10 s each |
| 7 | Through the day, a yellow line under a title means an agent asks. He answers in the session. | Epic page, then session | 3 min each |
| 8 | Once a day he opens the resources of the epic and reads `routine-runtime.md`. He notes what the day changed in the plan. | Epic resources | 30 min |

Review is 60 to 75 percent of the day. Every screen below cuts reading inside a review, or moves a review earlier in the release order.

---

## 2. The screens

Common rules. Dark theme by default, tokens from `packages/ui/src/tokens.css`. Body text 13 px in `--fg`. Secondary text 12 px in `--fg-muted`. Faint text in `--fg-faint`. Numbers are tabular. No violet anywhere except the GitHub merged glyph. The only motion on any screen is the glimmer on the agent card of a working run: `--animate-glimmer`, one sweep every 7 s, still in between, the film gradient without its `--film-violet` stop. `docs/UI_PATTERNS.md` forbids an animated count, sort or text change, and every screen obeys it.

Marks, the whole set:

| Mark | Meaning | Color |
| --- | --- | --- |
| `StatusIcon` | The status of the ticket. | Todo `--fg-muted`, Agent Review `--accent` (changed from `agent`), Human Review `--warning`, Done `--success` |
| GitHub pull request glyph | Open, draft, merged, closed. GitHub's shapes and colors. Sits before the number, nowhere else. | GitHub's own. Merged is the one violet. |
| 18 px agent card | The run's harness, by provider logo. Glimmer while it works. | The logo's own |
| 6 px filled dot | A human is needed. Before an `asks` line. | `--warning` |
| 6 px filled dot | A run failed or is lost. | `--danger` |
| The word `failed` | A failed check. | `--danger` |
| Every other fact | Words and numbers. | `--fg`, `--fg-muted`, `--fg-faint` |

### Screen 1. The epic page, grouped by wave

**Route.** `/epics/OP/routines-e2e`.

**Purpose.** The whole plan in one read: what waits on what, who moves next on each ticket, every pull request and its facts, every agent at work, what he must do.

**Top to bottom.**

**A. Topbar.** `PageTitle` `Routines E2E`. Right: `FilterBar` chips, the Display `IconButton`, the Add `IconButton`, the `Menu` with Edit and Delete. Unchanged.

**B. The band.** Three lines in the page padding, then the plan, at most half the card together.

```
Current: The run settles, and its state reaches the page
0 to start  ·  5 running  ·  2 wait for you
████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  3 of 27 done
done 3 · review 9 · todo 15
```

- Line 1: `Current: ` in `--fg-muted`, then the name of the first wave that is not done, in `--fg`.
- Line 2: `0 to start` links to the filter `category=todo, ready=true`. `5 running` is plain text, the filter grammar has no filter for a working agent. `2 wait for you` links to the filter `turn=you`. The count is pull requests whose turn is `you`: #56930, #57057.
- Line 3: the existing `StackedBar`, 6 px. Segments: done `--success`, review `--accent`, started `--warning`, todo `--fg-faint`. The review segment leaves the `agent` tone.
- Line 4: the legend, `--fg-faint`, zero buckets dropped.
- `StackedBarList` is removed from the band. Six bars plus one is a lot.

**C. Plan.** `SectionHeader` `Plan`, collapsed. It holds the epic description. Unchanged.

**D. Resources.** `SectionHeader` `Resources · 5`, collapsed. Screen 8 shows it open.

**E. The table.** The existing virtualized `TicketTable`, grouped by wave in position order. Three row kinds live in the flat item list, each with a fixed height: the ticket row at 36 px, the agent line at 24 px, the pull request row at 32 px. A ticket row is followed by its agent line only when the run has a message or a question, and by one pull request row per linked pull request.

Columns of a ticket row, left to right:

| Column | Width | Content |
| --- | --- | --- |
| select | 16 px | checkbox |
| priority | 16 px | `PriorityIcon` |
| status | 20 px | `StatusIcon` only. The status name comes out on this route. The `waits` cell and the row kind say more than the word. |
| id | 72 px | `TicketId` |
| title | `minmax(0,1fr)` | the title |
| waits | 110 px | see below |
| releases | 40 px | a count, or nothing |
| actor | 20 px | the agent card of the assigned run |
| updated | 48 px | relative time |

The `waits` cell prints one of three values:

- nothing, when the ticket has no unmet dependency and is not Todo;
- `ready` in `--fg-faint`, when the ticket is Todo and every ticket it waits on is done;
- the unmet identifiers, two at most, then `+n`: `OP-32 +10`.

The `releases` cell prints the count of tickets that wait on this one, or nothing. A click filters the table to those tickets.

The agent line, 24 px, indented to the title column, 12 px `--fg-muted`: the run name, a colon, the last message. When the run asks, the line starts with the yellow dot and the text is `--warning`. No label. Source: `RuntimeAgentMetadata.lastMessage` and `SessionAttention.requests[]`, section 3.

The pull request row, 32 px, indented 24 px under the title column:

```
⊙ #57080  open  ·  +311 −12 · 6 files  ·  1 failed · 6 pending · 47 passed  ·  0 threads  ·  no evidence  ·  crisp-fjord
```

Cells in order: the GitHub glyph, the number, `open` or `draft` or `merged`, the size (example value), the checks in words with zero buckets dropped and `failed` in `--danger`, the open thread count when above zero, the evidence word (`no evidence`, `evidence 3 of 5`, `evidence complete`), then the turn: `you` in `--fg`, or the run name in `--fg-muted`, or `github`. A stacked pull request adds `stacked on #55569` after the state. Flow runs, when one exists, add `flow: Code Reviewer passed` before the turn.

The rows of wave 2 and wave 3, in the real state. Sizes and run states are example values.

```
▾  Foundation: the run row and the named chat                                    3 of 3
   ● OP-29  Service: Let a service open a named chat, and remove one                            ⟨A⟩  2d
     ⧉ #55568  merged · 43 passed                                                          
   ● OP-30  Service: A routine run records its state                                           ⟨A⟩  2d
     ⧉ #57009  merged · 43 passed
   ● OP-31  Service: A chat records what opened it                                             ⟨A⟩  2d
     ⧉ #57030  merged · 44 passed

▾  A routine run opens a chat                                        0 of 5 · 1 for you
   ◐ OP-32  Service: A routine run opens a chat and queues the turn                      4      ⟨A⟩  4h
     crisp-fjord: I rebased onto master. post_message returns three values now.
     ⊙ #55569  draft · +402 −61 · 14 files · 9 passed · no evidence · crisp-fjord
   ◐ OP-27  Web: Bound the Operator message post, and end the wait on what the thread says      ⟨A⟩  1d
     ⊙ #56930  open · +186 −44 · 7 files · 37 passed · evidence 3 of 5 · you
   ◐ OP-37  API: A run's state on the API                                                1      ⟨A⟩  2h
     ⊙ #57078  draft · +98 −6 · 4 files · 1 failed · 8 passed · no evidence · crisp-fjord
   ◐ OP-43  Canary: A private Canary route that answers a user's properties              1      ⟨A⟩  2h
     ⊙ #57080  open · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · evidence 1 of 4 · crisp-fjord
   ◐ OP-39  Service: The chat list answers only the chats a person started                      ⟨A⟩  2h
     ⊙ #57079  draft · +64 −12 · 3 files · 1 failed · 8 passed · no evidence · crisp-fjord

▾  The run settles, and its state reaches the page   [Current]      0 of 6
   ◐ OP-33  Service: One routine's failure does not end the sweep pass   OP-32                  ⟨A⟩  3h
     ⊙ #57055  draft · stacked on #55569 · +73 −9 · 3 files · 9 passed · no evidence · crisp-fjord
   ○ OP-34  Service: The webhook settles the routine run                 OP-32           2            1d
   ○ OP-50  Agent: The agent creates, changes, pauses and runs a routine OP-32           1            1d
   ○ OP-38  Web: A run's state on the routines page                      OP-37                        1d
   ○ OP-44  Service: A run checks that the owner still holds each property  OP-43                     1d
```

Rows inside a group keep `epicRowRank`: what waits for him first, then what he can start, then the rest, and inside each rank the `releases` count descending.

The group header keeps the existing `GroupHeader`: the label, the `Current` badge on the first wave that is not done, and the count slot as text: `0 of 6 · 1 for you`. `1 for you` counts the rows of the group whose turn is `you`.

Yellow appears on this screen in two places only: the Human Review glyph and an `asks` line.

**What moves.** The glimmer on the agent card of a working run. Nothing else.

**What a click does.**

| Target | Result |
| --- | --- |
| a ticket row | opens the ticket page in a `PageSheet` |
| a pull request row | opens the review page in a second, wider `PageSheet` |
| an identifier in `waits` | filters the table to that ticket |
| a `releases` count | filters the table to the tickets that wait on this one |
| the agent card | opens the session of the run in a `PageSheet` |
| an agent line that asks | opens the session at the question |
| `0 to start`, `2 wait for you` | sets the table filters |
| a group label | collapses the group |
| `c` | creates a ticket in that wave |

### Screen 2. The epic page, grouped by turn

**Route.** The same page. The `DisplayPopover` gains `Group by: Wave · Turn`. Wave is the default.

**Purpose.** Answer "what do I do first" in one read. The groups are who moves next. Inside a group, rows sort by what they release, descending.

Five groups, fixed order. An empty group does not render.

```
▾  Your turn                                                                    2
   ◐ OP-35  Service: A run whose webhook never came is closed          OP-34      1      ⟨A⟩  3h
     ⊙ #57057  open · +140 −20 · 5 files · 42 passed · no evidence · you
   ◐ OP-27  Web: Bound the Operator message post, and end the wait on what the thread says  ⟨A⟩  1d
     ⊙ #56930  open · +186 −44 · 7 files · 37 passed · evidence 3 of 5 · you

▾  With an agent                                                                5
   ◐ OP-32  Service: A routine run opens a chat and queues the turn               4      ⟨A⟩  4h
     crisp-fjord: I rebased onto master. post_message returns three values now.
     ⊙ #55569  draft · +402 −61 · 14 files · 9 passed · no evidence · crisp-fjord
   ◐ OP-37  API: A run's state on the API                                         1      ⟨A⟩  2h
     ⊙ #57078  draft · +98 −6 · 4 files · 1 failed · 8 passed · no evidence · crisp-fjord
   ◐ OP-43  Canary: A private Canary route that answers a user's properties       1      ⟨A⟩  2h
     ⊙ #57080  open · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · evidence 1 of 4 · crisp-fjord
   ◐ OP-33  Service: One routine's failure does not end the sweep pass   OP-32           ⟨A⟩  3h
     ⊙ #57055  draft · stacked on #55569 · +73 −9 · 3 files · 9 passed · no evidence · crisp-fjord
   ◐ OP-39  Service: The chat list answers only the chats a person started               ⟨A⟩  2h
     ⊙ #57079  draft · +64 −12 · 3 files · 1 failed · 8 passed · no evidence · crisp-fjord

▾  Waits on a merge                                                            13
   ○ OP-34  Service: The webhook settles the routine run                 OP-32            2         1d
   ○ OP-47  API: Approve or reject a proposal                            OP-46            2         1d
   ○ OP-50  Agent: The agent creates, changes, pauses and runs a routine OP-32            1         1d
   ○ OP-36  Infra: The CronJob for the stale run sweep                   OP-35                      1d
   ○ OP-38  Web: A run's state on the routines page                      OP-37                      1d
   ○ OP-41  Service: A dry run says in the turn that it is a trial       OP-40                      1d
   ○ OP-42  Service: A routine run's token lives six hours, and settling revokes it  OP-34          1d
   ○ OP-44  Service: A run checks that the owner still holds each property  OP-43                   1d
   ○ OP-46  Agent: The agent records a proposal                          OP-45            1         1d
   ○ OP-48  Web: The briefing reads real rows                            OP-47                      1d
   ○ OP-49  Service: Tell the person when a run needs them               OP-47                      1d
   ○ OP-51  Service: System routines, and the seeded morning briefing    OP-50                      1d
   ○ OP-54  Integrate: the routine runtime                               OP-32 +10                  1d

▸  Done                                                                         3
```

The group `With GitHub` holds a pull request whose checks are pending and none failed. It is empty today, so it does not render.

The rules of the turn:

| Turn | Condition |
| --- | --- |
| you | an open pull request that is not a draft, has no failed check and no open thread |
| an agent | a draft; or a failed check; or an open thread; or a run of the ticket is working |
| github | not a draft, no failed check, one or more pending checks |
| waits on a merge | Todo, and one or more unmet dependencies |
| done | category done |

The same rows, the same columns, the same clicks as screen 1. No new element. A grouping is a function of the row.

### Screen 3. The review page, `#57080` of OP-43, a backend change that is not ready

**Route.** `/reviews/canary-technologies-corp/canary/57080`. It also opens in a wider `PageSheet` over a ticket.

**Purpose.** He reaches "small and not dangerous" before the diff opens. He reads down. At each region he merges, sends back, or reads on.

**Region A. Identity.**

```
⊙ #57080  open      OP-43: Filter hotels by user membership                         revision 2 of 2 ▾
trellis/op-43-01m2w7bmdftr3kvv155vp2pnak  →  master
OP-43  Canary: A private Canary route that answers a user's properties
waits on nothing  ·  releases OP-44
crisp-fjord's turn. 1 check failed.
```

The last line is the turn in words. Its forms: `Your turn.`, `crisp-fjord's turn. <reason>.`, `GitHub's turn. 6 checks pending.`, `Merged 2026-09-18.`

The revision selector, right, defaults to the whole change on a first read, and to `showing 1 → 2, the part you have not read` on a return.

**Region B. Conditions.** Trellis computes every value. The agent writes none.

```
READY TO MERGE                                                          not yet

size        +311 −12 · 6 files · band medium
risk        auth yes · migration no · dependency no · shared type no · deleted test no
tests       none registered
checks      1 failed · 6 pending · 47 passed · 44 skipped
evidence    1 of 4 for a backend change
threads     0 open
flows       none run
base        3 commits behind master
ancestors   none
```

- Nine lines, one condition each, text only. Labels 12 px `--fg-faint` at a fixed width. Values 13 px `--fg`. `failed` and `yes` under `risk` in `--danger`. Everything else stays `--fg`.
- The word after `READY TO MERGE` takes three values: `yes`, `not yet`, `merged`. `not yet` never disables the merge control.
- `risk` prints all five marks with an answer each. An all-clear reads as five `no` values, never as a green badge.
- Bands: `small` under 200 changed lines, `medium` 200 to 400, `large` over 400. A band is a word, never a color.
- `tests` is the test proof: each new test by name is in region E. The line prints the count and the two shas. It reads `none registered` until the agent adds the proof.
- `evidence` counts the required items of section 4 that are present.
- `ancestors` prints each unmerged ticket this ticket waits on, with its pull request or `no pull request`.

The same block for `#56930` is in screen 4.

**Region C. Summary.** The agent writes three fields. Section 4 gives the rules and the check.

```
Answer a user's properties on a private Canary route.

A scheduled run holds no session cookie. Canary answers /api/private/staff-hotels only for a cookie.
The new route answers for a user uuid and names no property the caller did not ask about.

Watch this: the new route file. It is a new trust boundary between Operator and Canary.
```

Headline 15 px `--fg`. Why 13 px `--fg`, three sentences at most. Watch line 13 px, the fixed words `Watch this: ` in `--fg-muted`. When the head sha moved after the summary was written, one line in `--warning` follows: `the summary is one revision behind`.

**Region D. Review focus.** The ticket wrote it before the work started. The review page prints it. He marks each item. OP-43 says, verbatim: "Review focus: the caller is an internal service identity, and the route names no property a caller did not ask about."

```
REVIEW FOCUS                                                            0 of 2 held

☐  the caller is an internal service identity
☐  the route names no property a caller did not ask about
```

A click marks an item held. A held mark survives a new revision unless a file the item names changed.

**Region E. Evidence.** A backend change carries records and at most one picture.

```
EVIDENCE                                                    1 of 4 required · summary present

 summary        present
 verify record  missing    run the ticket verify commands: trellis evidence add 57080 --kind verify ...
 test proof     missing    name each new test: trellis evidence add 57080 --kind test ...
 contract       missing    write the table, or the words "no contract changed"
 picture        not yet    the call path crosses from Operator into Canary, so one sequence picture is due
```

When the records exist, the strip renders them inline, in this order: the verify record, the test proof, the contract table, the migration plan when a schema changed, the one picture. Screen 6 shows a filled strip on OP-33.

**Region F. Checks, in words.**

```
CHECKS                                     1 failed · 6 pending · 47 passed · 44 skipped

 failed    merge_gatekeeper                        9.AUTO Merge gatekeeper                open ↗
 pending   Playwright Critical Tests               10.CAN.AUTO UI Critical Tests (PR)     open ↗
 pending   Backend linters                         9.CAN.AUTO Check Canary                open ↗
 pending   make check-migrations && make migrate   9.CAN.AUTO Check Canary                open ↗
 pending   make test-backend                       9.CAN.AUTO Check Canary Backend Tests  open ↗
 pending   OpenAPI staleness (canary)              9.OAS.AUTO OpenAPI specs               open ↗
 pending   Check backend translations are up to date   i18n Backend                       open ↗
 ▸ 47 passed
 ▸ 44 skipped
```

Failures first, then pending, then two collapsed groups. `failed` in `--danger`. `CheckRing` leaves this page.

**Region G. Files, by risk.** Example file list. The poller does not store files yet.

```
FILES                                                                    0 of 6 read

▾ RISK                                                      2 files · +118 −4
  ☐  backend/canary/api/private/staff_hotels.py             +94 −2     new route · auth
  ☐  backend/canary/api/private/urls.py                     +24 −2     route table

▾ BEHAVIOR                                                  2 files · +71 −6
  ☐  backend/canary/hotels/services/membership.py           +58 −4
  ☐  backend/canary/hotels/selectors.py                     +13 −2

▾ TESTS                                                     1 file · +122 −2
  ☐  backend/canary/api/private/tests/test_staff_hotels.py  +122 −2

▸ NOISE                                                     1 file · +0 −0
```

Four fixed groups: Risk, Behavior, Tests, Noise. Risk holds migrations, auth paths, dependency manifests, shared types, deleted tests, public API files, secret-like strings. Noise holds generated files, lock files, snapshots, and starts collapsed with its line count printed, so he can subtract it. A file row opens its diff. `j` and `k` move between files. `v` toggles the read mark. A new revision clears the mark only on the files it changed.

**Region H. Threads.** Open first, each bound to a file, a line and a revision. Resolved collapse. A thread is a Trellis row. Nothing goes to GitHub.

**Region I. The verdict bar.** Fixed at the bottom.

```
 0 drafts        [ Merge ]    [ Send back to crisp-fjord ]    [ Comment only ]
                 not yet: 1 check failed · 1 of 4 evidence · 3 commits behind master
```

- `Merge` stays live. When the readiness word is `not yet`, the line under the bar names each unmet condition. A click asks once: `Merge with 3 conditions unmet?` He is the manager.
- `Send back to crisp-fjord` publishes the threads and delivers them to the running run of the ticket through `review_deliveries`. When no run is live it starts one. The button names the run, because the next actor is one agent on one ticket.
- `Comment only` publishes the threads and changes no state.

**What moves.** Nothing. The check line updates on the 10 s poll with no animation.

### Screen 4. The review page, `#56930` of OP-27, a frontend change that is ready

The same regions. Only the content that differs is shown.

**Region A.**

```
⊙ #56930  open      OP-27 Bound Operator message posts                                revision 1 of 1
trellis/op-27-01m2s1scg7ppywezh4b5m8ez4y  →  master
OP-27  Web: Bound the Operator message post, and end the wait on what the thread says
waits on nothing  ·  releases nothing
Your turn.
```

**Region B.**

```
READY TO MERGE                                                          yes

size        +186 −44 · 7 files · band small
risk        auth no · migration no · dependency no · shared type no · deleted test no
tests       2 new · both fail on base 4c9a771 · both pass on head 8b21f0c
checks      37 passed · 35 skipped
evidence    5 of 5 for a frontend change
threads     0 open
flows       Code Reviewer passed · 0 findings
base        up to date with master
ancestors   none
```

**Region C.**

```
Give the Operator message post a timeout.

postMessage has no timeout, so a stalled post leaves the dialog with both buttons greyed and the close button dead.
An AbortError now reads as a refusal. The screen takes the mode from the thread, not from the dialog.

Watch this: ChatPage.vue. The end of the wait reads the thread, not the dialog.
```

**Region D.** OP-27 wrote no `Review focus:` line. The region prints one line: `The ticket names no review focus.` in `--fg-faint`.

**Region E.** The three real attachments of OP-27 bind to `#56930`. The capture record and the console list are the two items the agent adds.

```
EVIDENCE                                                     5 of 5 · captured on 8b21f0c

 /chat/:uuid  ·  1440×900  ·  dark  ·  seed: trellis seed op27-stall
 before                                              after
 [ op27-send-pending.png ]                           [ op27-send-timeout.png ]
 The dialog holds both buttons greyed                A post that gives up prints its words
 while the post stalls.                              and the dialog closes.

 clip   op27-send-timeout.gif  ·  9 s  ·  the post stalls, the dialog releases, the thread decides the mode   ▶

 console   0 errors · 1 request gave up, by design
 record    head 8b21f0c · base 4c9a771 · Chrome 141 · 2026-09-18 01:58
```

Images render inline at half width each, never as a link. The clip plays in place on a click and loops. The captions are the agent's, one sentence each.

**Region I.**

```
 0 drafts        [ Merge ]    [ Send back to crisp-fjord ]    [ Comment only ]
```

No condition line, because every condition is met.

### Screen 5. The ticket page, OP-34, Todo, blocked

Section 5 gives the reasoning. This screen is the page.

**Route.** `/tickets/OP-34`. It also opens in a `PageSheet` from the epic.

```
 Routines E2E  ·  The run settles, and its state reaches the page
 OP-34   Service: The webhook settles the routine run                        [ ○ Todo ▾ ]   [ high ]

 THE ASK
 Step 6 of the routine runtime. Design: backend/operator-service/docs/routine-runtime.md.
 AgentService.record_report emits a Django signal when a turn ends. A receiver in the routines
 app finds the RoutineRun that names the thread and writes status, error and finished_at.

 THE CONTRACT
 Result         The webhook settles the run row. The routines page reads the state.
 Files          backend/operator-service/agent/signals.py
                backend/operator-service/agent/services/agent/agent.py
                backend/operator-service/routines/apps.py
                backend/operator-service/routines/services/run/run.py
 Leave alone    routines/views/routine_run.py                                    OP-32 owns it
 Verify         cd backend/operator-service && direnv exec . make check-fix
                cd backend/operator-service && direnv exec . pytest routines threads agent
 Review focus   the import direction stays one way (routines imports agent, never the reverse)
                a chat run looks for no routine run
 Evidence owed  backend: summary · verify record · test proof · contract table · one picture,
                because the signal crosses from agent into routines

 THE CHAIN
 Waits on       OP-32  Service: A routine run opens a chat and queues the turn      ⊙ #55569 draft
 Ready          no. OP-32 is not merged.
 Releases       OP-35  Service: A run whose webhook never came is closed
                OP-42  Service: A routine run's token lives six hours, and settling revokes it

 THE EVIDENCE
 No pull request yet.

 THE RUN
 No run.                       Start with  [ Claude Code ▾ ]  [ Opus ▾ ]  [ high ▾ ]   [ Start ]

 THE OUTCOME
 Empty until a pull request merges.

 RESOURCES
 routine-runtime.md, step 6
```

Every word under THE ASK, Files, Verify and Review focus is from the export. `Result`, `Leave alone` and `Evidence owed` are the fields the contract adds. `Leave alone` comes from OP-54, which names the file both OP-32 and OP-34 write. `Evidence owed` is computed from the Files list: no file renders a route, so the change is backend.

`Start` is live although `Ready` reads `no`. He is the manager. The button prints one line under itself: `OP-32 is not merged. Start anyway?`

The right rail keeps `PickerRows` for status, priority, labels, project, parent, epic, wave, with the hotkeys `s`, `p`, `l`, `Shift+P`, `m`. `TicketMetrics` leaves the rail.

**What a click does.**

| Target | Result |
| --- | --- |
| a file path | copies the path |
| a verify command | copies the command |
| OP-32 under Waits on | opens OP-32 in a `PageSheet` |
| `#55569` | opens the review page in a wider `PageSheet` |
| a ticket under Releases | opens it in a `PageSheet` |
| `Start` | starts a run with the chosen harness, model and effort |
| `routine-runtime.md` | opens the doc in the TipTap editor, in a `PageSheet` |

### Screen 6. The ticket page, OP-33, Agent Review, a stacked pull request

```
 Routines E2E  ·  The run settles, and its state reaches the page
 OP-33   Service: One routine's failure does not end the sweep pass         [ ◐ Agent Review ▾ ]   [ high ]

 THE ASK
 Step 5 of the routine runtime. Design: backend/operator-service/docs/routine-runtime.md.
 Each routine's start runs inside its own try. A failure marks that RoutineRun failed, logs the
 reason, and the pass moves to the next routine. The claim row stays, so a person sees a failed run
 rather than nothing. A cap of 50 runs a pass keeps the CronJob inside its two minute tick.

 THE CONTRACT
 Result         One failed start does not end the sweep pass.
 Files          backend/operator-service/routines/services/run/run.py and its test
 Leave alone    routines/views/routine_run.py                                    OP-32 owns it
 Verify         cd backend/operator-service && direnv exec . pytest routines
 Review focus   the cap of 50 holds the CronJob inside its two minute tick
 Evidence owed  backend: summary · verify record · test proof · contract table. No picture: the
                change crosses no boundary.

 THE CHAIN
 Waits on       OP-32  Service: A routine run opens a chat and queues the turn      ⊙ #55569 draft
 Ready          no. OP-32 is not merged.
 Releases       nothing

 THE EVIDENCE
 ⊙ #57055   draft   Operator: continue the routine sweep after a failed start
            stacked on #55569 (OP-32)  ·  trellis/op-33-01m2v0v6m3f0ry0eg0k57jwdc5 → nk/operator-routine-execution
            +73 −9 · 3 files · band small · risk none · 9 passed · 91 skipped · 0 threads
            evidence 2 of 4:  summary ✓  test proof ✓  verify record missing  contract missing
            flows: none run
                                                                          [ Open the review ]

 THE RUN
 ⟨A⟩ crisp-fjord   Claude Code · Opus · works, tool Edit, 40 s                         [ Session ]
     crisp-fjord: The cap of 50 sits in settings. I named it ROUTINE_SWEEP_CAP.

 THE OUTCOME
 Empty until a pull request merges.

 RESOURCES
 routine-runtime.md, step 5
```

`stacked on #55569` is derived: the base ref of `#57055` is the head ref of `#55569`. Nobody typed it.

The run line is the `RunLine` of section 6. Its state words come from section 3. The agent card carries the glimmer because the state is `works`. The second line is the last message, after the name, only because one exists.

The pull request card here is the short form of the conditions. `Open the review` opens screen 3's layout for `#57055` in a wider `PageSheet`.

### Screen 8. Epic resources

The `Resources` section of screen 1, open. Rule 14.

```
▾ RESOURCES                                                                            5

 doc    The routine runtime                            routine-runtime.md · edited 2026-09-19 by crisp-fjord
 doc    Routines E2E plan                              the epic description · edited 2026-09-19 by you
 link   canary#55569                                   github.com · opens in the in-app browser
 image  op27-send-timeout.gif                          55 KB · also evidence on #56930
 file   settle-sequence.mmd                            the Mermaid source of the picture on #57055
                                                                    [ + Doc ]  [ + Link ]  [ + File ]
```

Four kinds, one list. `doc` opens the TipTap editor in a `PageSheet`. `link` opens the in-app browser in a `PageSheet`. `image` opens full size. `file` downloads. A resource that is also evidence prints the pull request after its size. The epic plan is the first doc, so the plan and the design document sit in one list. The agent writes a doc or a file with `trellis resource add`.

A ticket page prints, in its own `RESOURCES` block, only the resources its contract or its ask names. OP-34 names `routine-runtime.md`, so that doc shows there, with `step 6` after it.

Rows in this list are real paths and real files where marked: `routine-runtime.md` is named in nine descriptions, `op27-send-timeout.gif` is a real attachment. The link row and the `.mmd` row are example values.

### Screen 9. The CLI

What an agent and he read in the terminal. Output is JSON when stdout is not a terminal. These four transcripts render as one page of monospaced text.

`trellis ready OP --epic routines-e2e`:

```
0 ready to start

waits on a merge       13   OP-34 OP-50 OP-38 OP-44 OP-42 OP-36 OP-41 OP-46 OP-47 OP-48 OP-49 OP-51 OP-54
your turn               2   #57057 #56930
with an agent           5   #55569 #57078 #57080 #57055 #57079
```

`trellis deps OP-33`:

```
OP-33  Service: One routine's failure does not end the sweep pass
  waits on
    OP-32  Service: A routine run opens a chat and queues the turn      agent review   parsed from "Depends on: step 4."
  releases
    nothing
  derived
    #57055 is based on nk/operator-routine-execution, the head of #55569 (OP-32)
```

`trellis evidence check 57080`:

```
#57080  OP-43  Canary: A private Canary route that answers a user's properties
kind: backend            1 of 4 required present

  present  summary
  MISSING  verify record   run each Verify command of the ticket:  trellis evidence add 57080 --kind verify --cmd "..." --exit 0 --sha <head> --tail - < tail.txt
  MISSING  test proof      name each new test:                     trellis evidence add 57080 --kind test --name <test> --fails-on <base> --passes-on <head>
  MISSING  contract        write the before and after table, or:   trellis evidence add 57080 --kind contract --none
  due      picture         the call path crosses Operator into Canary. One sequence picture, in Mermaid.
  note     1 check failed: merge_gatekeeper

exit 1
```

`trellis summary write 57080 --headline "..." --why - --watch "..."`, on bad text:

```
refused  headline is 19 words. The limit is 12.
refused  why, sentence 2, holds an em dash. Use a comma, a period or a colon.
refused  why, sentence 1, is 31 words. The limit is 25.
warn     why, sentence 3, is passive: "is consumed by". Name the actor.
```

The verbs, complete:

```
trellis create -p OP -t "..." --wave OP/routines-e2e/run-settles --after OP-32
trellis edit OP-34 --after OP-32 | --not-after OP-32
trellis deps OP-33
trellis ready OP --epic routines-e2e

trellis contract set OP-34 --result "..." --file <path> --leave-alone <path> --verify "<cmd>" --focus "<sentence>"
trellis contract show OP-34

trellis summary write <pr> --headline "..." --why - --watch "..."
trellis evidence add <pr> --kind before|after|clip|console|verify|test|contract|migration|picture|equivalence ...
trellis evidence check <pr>
trellis evidence list <pr>

trellis resource add OP/routines-e2e --kind doc|link|image|file ...
trellis resource list OP/routines-e2e
```

`trellis pr`, `trellis review *`, `trellis attach` and `trellis brief` stay as they are. `trellis move <ticket> human-review` refuses while `trellis evidence check` exits 1, and prints the same missing list. It never refuses him. Decision 3 asks whether that refusal stands.

The block for `packages/cli/src/instructions.md`, after the ticket workflow:

```
Prove the change. A pull request without its evidence is not reviewable.

1. Read the contract:  trellis contract show KEY-42
   It names the files, the files to leave alone, the verify commands, the review focus and the evidence owed.
2. Record each dependency as an edge, never as prose:  trellis edit KEY-43 --after KEY-42
3. Write the summary:  trellis summary write <pr> --headline "..." --why - --watch "..."
   The headline is one instruction of 12 words or less. Start it with a verb.
   The why is three sentences or less: the problem, the approach, the limit. 25 words each, active voice, present tense.
   The watch line names one file and the reason to open it first, or says "nothing".
   Never write the size, the risk or the check counts. Trellis computes them and ignores yours.
   Rewrite the summary after every push.
4. When the change renders a screen, attach:
   the after image of each route, at 1440x900, dark; the before image of the same route from the merge base,
   same viewport, theme and seed; the capture record with both shas, the route, the viewport, the theme, the seed
   command and the browser; the console error list and the failed request list; a clip of 15 s or less when the
   change touches motion, a gesture, scroll, timing, or a task of more than one step.
   Capture in your own worktree, on your own port, with animations off. Register each file with
   trellis evidence add <pr> --kind before|after|clip|console.
5. When the change renders no screen, attach:
   the verify record of each Verify command, with the exit code, the tail and the head sha; each new test by name,
   with the base sha where it fails and the head sha where it passes; the contract table, before and after, or
   "no contract changed"; the migration plan when a schema changes; one picture, and one only, when the call path
   crosses a process, a service or a trust boundary, or when a state machine changes. Write it in Mermaid.
6. Bind every sentence to something checkable: a file and a line, a check result, a test name, or a number with
   its sha. Say when a sentence is a guess.
7. Check yourself:  trellis evidence check <pr>
   Hand over:        trellis move KEY-42 human-review
```

### Screen 10. The epic page on a phone

Width 390 px. Two-line rows of 56 px. Every touch target at least 44 px.

```
┌────────────────────────────────────────┐
│ ‹  Routines E2E                     ⋯  │
├────────────────────────────────────────┤
│ Current: The run settles, and its      │
│ state reaches the page                 │
│ 0 to start · 5 running · 2 for you     │
│ ████░░░░░░░░░░░░░░░░░░   3 of 27       │
├────────────────────────────────────────┤
│ ▾ Your turn                        2   │
│                                        │
│ ◐ OP-35  Service: A run whose webh…    │
│   ⊙ #57057 open · 42 passed · you      │
│                                        │
│ ◐ OP-27  Web: Bound the Operator me…   │
│   ⊙ #56930 open · 37 passed · you      │
├────────────────────────────────────────┤
│ ▾ With an agent                    5   │
│                                        │
│ ◐ OP-32  Service: A routine run op… ⟨A⟩│
│   crisp-fjord: I rebased onto master…  │
│                                        │
│ ◐ OP-37  API: A run's state on the… ⟨A⟩│
│   ⊙ #57078 draft · 1 failed            │
└────────────────────────────────────────┘
```

Rules on the phone:

- The phone defaults to the Turn grouping. The Display control still offers Wave.
- Line 1 holds the status glyph, the identifier, the title cut with an ellipsis, then the agent card.
- Line 2 holds one of: the agent's message, the pull request glyph and number with the checks in words and the turn, `waits on OP-32`, or `releases n`. Size, files and evidence counts drop first.
- The band keeps its three lines. The legend of the bar is hidden. A tap opens it.
- A tap on a row opens the ticket as a full page. A tap on a pull request line opens the review page as a full page with regions A, B, C, D and E, and one control named `Files` for the rest. He does not read a diff on a phone.
- The verdict bar on a phone holds `Send back` and `Comment only`. It holds no `Merge`. A merge into an enterprise repository needs the desk.

---

## 3. The states of an agent run

Every state comes from a named harness signal. Sources: `packages/runtime-protocol/src/index.ts:34-45` for `HarnessEvent.kind`, `packages/runtime-protocol/src/index.ts:63-81` for `RuntimeAgentMetadata`, `packages/api/src/schemas/sessionActivity.ts` for attention, `apps/server/src/services/agentRuns/liveState.ts:78-125` for the derivation. The web reads them on the 2 s tick.

| Words on screen | Mark | Moves | Harness signal | Where the server derives it |
| --- | --- | --- | --- | --- |
| `starts` | agent card, still | no | a launch record exists and no process exists yet | `liveState.ts:81-89`, `state: starting` |
| `works, tool Edit, 40 s` | agent card with the glimmer | yes, one sweep per 7 s | `working`, then `tool-start` and `tool-update` | `observation.activity.state = working`; the tool name from `RuntimeAgentMetadata.lastTool` |
| `works, 2 min` | agent card with the glimmer | yes | `working` with no tool | the same |
| `crisp-fjord: <text>` on the second line | none | no | `message` with `message.text` and `message.at` | `RuntimeAgentMetadata.lastMessage`. It stops at `liveState.ts:114-121` today. Forwarding it is two fields in the observation literal and in `AgentRunSchema`. |
| `● asks: <question>` on the second line | 6 px dot `--warning`, text `--warning` | no | `input-request`, kind `question` | `SessionAttention.requests[]`. Muse forwards the text. Claude Code sends it inside the tool input and `parseClaudeEvent.ts:90-102` lifts it. Codex sends a title only, so the line prints the title. |
| `● asks to run: <command>` | the same dot | no | `input-request`, kind `permission`, `blocking: true` | `parseClaudeEvent.ts:25-51` |
| `● asks: <field>` | the same dot | no | `input-request`, kind `elicitation` | `SessionAttention.requests[]` |
| `idle 4 min` | agent card, still | no | `idle` | `observation.activity.state = idle`, with `updatedAt` |
| `turn done 12 min ago` | agent card, still | no | `idle` with `outcome: completed` | `SessionAttention.completion.sequence` |
| `turn done · new` | agent card, still, one 4 px dot before the time in `--fg` | no | the completion sequence is above the seen sequence | `AgentRun.seenAttention` against `attention.completion.sequence` |
| `failed: <error>` | 6 px dot `--danger` | no | `error` with `outcome: failed`, or a nonzero exit code | `liveState.ts:99-108`, `state: failed` |
| `stopped` | agent card, still, dimmed | no | he stopped the run | `state: stopped` |
| `exited` | agent card, still, dimmed | no | the process exited with code 0 | `liveState.ts:99-108`, `state: exited` |
| `lost` | 6 px dot `--danger` | no | no live record of the attempt, or `processStatus: unknown` | `liveState.ts:90-98`, `state: interrupted`, error text "The execution service has no live record of this attempt." |

Four rules hold the table.

1. Only `works` moves. A still card never means in progress.
2. Yellow appears on the three `asks` rows and nowhere else on a run. Each one means a human is needed.
3. `failed` and `lost` share one red dot. The words beside it carry the difference.
4. The message and the question render under the ticket title, after the run's name, on a second line, only when one exists. No row says `said:`.

Derived states, not harness signals, named so nobody mistakes them for one: `ready` (every ticket this one waits on is done), `waits on OP-32` (an unmet dependency), `your turn` (section 2, screen 2), `READY TO MERGE yes` (every condition met). None of them starts anything.

---

## 4. The evidence rules and the summary

### 4.1 The kind of a pull request

Trellis reads the changed paths. The agent does not choose. `frontend`: one or more changed files render a route. In `canary` that is `frontend/**`. In Trellis that is `apps/web/**` and `packages/ui/**`. `backend`: no changed file renders a route. `mixed`: both, and it owes both sets.

### 4.2 A frontend pull request must carry

| # | Item | Required |
| --- | --- | --- |
| 1 | the summary: headline, why, watch | always |
| 2 | the after image of each changed route, 1440×900, dark theme | always |
| 3 | the before image of the same route from the merge base, same viewport, theme and seed | always |
| 4 | the capture record: head sha, base sha, route, viewport, theme, seed command, browser, time | always |
| 5 | the console error list and the failed request list of the capture run. An empty list is a result. | always |
| 6 | a clip of 15 s or less | when the change touches motion, a transition, a gesture, scroll, timing, or a task of more than one step |
| 7 | the empty, loading and error states | when the change adds or changes a data-driven screen |
| 8 | the 390 px viewport, and the light theme | when the change moves layout or adds a color |

Items 1 to 5 are the floor. OP-27 holds three real files: `op27-send-pending.png` is the before, `op27-send-timeout.png` is the after, `op27-send-timeout.gif` is the clip. The change touches a wait, so the clip is owed and present. The record and the console list are missing today, so the condition reads `evidence 3 of 5` on screen 1 and `5 of 5` on screen 4 after the agent adds them.

Capture rules that make a pair checkable: before from the merge base, after from the head; same route, viewport, theme, seed; animations off, caret hidden, fonts loaded; the seed command in the record. The agent captures in its own worktree on its own port with Aside, one flow per `aside repl` call inside its 120 s limit, and builds the clip with `ffmpeg` at `/opt/homebrew/bin/ffmpeg`.

### 4.3 A backend pull request must carry

| # | Item | Required |
| --- | --- | --- |
| 1 | the summary | always |
| 2 | the verify record: each Verify command of the contract, its exit code, the tail of its output, the head sha | always |
| 3 | the test proof: each new test by name, the base sha where it fails, the head sha where it passes | always, unless the change deletes code only |
| 4 | the contract table, before and after, one row per changed contract, or the words `no contract changed` | always |
| 5 | one picture, chosen by the kind of change | see the table |
| 6 | the migration plan: phase, two-way compatibility, lock cost on the largest table, backfill, rollback | when a schema changes |
| 7 | equivalence evidence: a shadow diff, a golden output, or a benchmark against the base | when the change is a refactor with no contract change |
| 8 | the search that proves zero callers, with its command and output | when the change deletes code or a test |

Contracts that earn a row in the table: a request or response shape, a column set and its nullability, an emitted event or signal, an error code, a configuration key and its default, a permission check, a query count per request.

The one picture:

| Change | Picture |
| --- | --- |
| a new endpoint or field | a sequence of calls, Mermaid |
| a new job, queue, timer or signal receiver | a sequence of calls, Mermaid |
| a state machine or status change | a state diagram, Mermaid |
| an auth, permission or tenancy change | the data flow across the trust boundary, Mermaid |
| a schema or data change | the migration plan as a table |
| performance work | a benchmark table against the base |
| a dependency upgrade | a table of behavior differences |
| a pure refactor | no picture. Equivalence evidence instead. |

OP-43 adds a route that Operator calls in Canary, so it owes a sequence picture. OP-33 changes one function inside one service, so it owes none. OP-34 adds a signal receiver across two Django apps, so it owes one.

Three rules bound every set. One item answers one question the diff cannot answer fast; when the diff answers it, the item comes out. Every item carries an anchor: a file and a line, a check result, a test name, or a number with its sha. One picture is the limit. Two bars on a header already failed.

### 4.4 The summary: how it is written

The agent writes three fields. Trellis computes everything else and ignores an agent's size, risk or check claim.

| Field | Rule | Limit |
| --- | --- | --- |
| headline | one instruction, starts with a verb, says what the change does | 12 words |
| why | the problem, the approach, the limit, in that order | 3 sentences, 25 words each |
| watch | one file and the reason to open it first, or `nothing` | 1 sentence |

The CLI holds the STE check, so bad text never reaches the page. It refuses an em dash, a sentence over 25 words, a headline over 12 words, a headline that does not start with a verb, and a noun cluster over 3 words. It warns on a passive form and on a gerund used as a noun. It leaves quoted material alone: an error string, a log line, a check name, a test name.

### 4.5 One worked example, `#56930` of OP-27

The export holds no pull request body, so the source text is the description of OP-27 as the agent wrote it. It is quoted verbatim:

> A mode switch posts a message and holds the dialog until the post settles. `postMessage` has no timeout, so a stalled post leaves the dialog with both buttons greyed, Escape refused and the close button dead. The person has to reload the tab.
>
> A timer that lifts the hold is wrong. The stalled post can still land, and the chat then switches to read and write after an explicit Keep.
>
> What to build:
> - An optional `signal` on `postMessage`, `sendMessage` and `deliver`. `operatorRequest` already spreads `init` into `fetch`, so nothing in `api/request.ts` moves and no other caller changes.
> - One branch that reads an `AbortError` as a refusal, with words for a request that gave up.
> - An end that reads the thread. A post the browser gave up on may already have reached the server, so the screen must decide on the mode the thread answers with, not on what the dialog assumed.

The summary the agent writes with `trellis summary write 56930`:

```
headline  Give the Operator message post a timeout.
why       postMessage has no timeout, so a stalled post leaves the dialog with both buttons greyed and the close button dead.
          An AbortError now reads as a refusal. The screen takes the mode from the thread, not from the dialog.
watch     ChatPage.vue. The end of the wait reads the thread, not the dialog.
```

The check passes: the headline is 7 words and starts with a verb; the why is three sentences of 20, 7 and 12 words; no em dash; `post` keeps one meaning; `ChatPage.vue` stays verbatim.

### 4.6 How the summary is shown

Region C of the review page, under the conditions, above the review focus. The headline is 15 px. The why and the watch are 13 px. The size line and the risk line are not part of the summary; they are conditions in region B, computed, in text.

The GitHub body of the pull request gets four lines: the headline, the size line, the risk line, and a link to the review page. The rest lives in Trellis. GitHub comments are for humans.

On the epic page, the pull request row prints the headline instead of the pull request title when the two differ by more than half their words. The agent rewrites the summary on each push. A summary older than the head sha reads `the summary is one revision behind` on the review page and counts as missing in the evidence condition.

---

## 5. The ticket page, rethought

### 5.1 What a ticket is here

A ticket in a team tool is a conversation about work. Here one human works, and the agent has its own session view. So a ticket is not a conversation. It is the contract for one unit of work, the order it lands in, and the place where the proof arrives.

Four questions decide the page. What does the agent owe me? What must finish before this starts? What did the agent produce, and what proves it? Is it safe to merge? The activity feed answers none of them. The comment thread answers none of them.

The real epic already writes the contract by hand, inside prose. OP-34 holds `Files:`, `Depends on: step 4.` and `Review focus:`. OP-54 holds `Verify:` with three commands and the sentence "The result the next wave reads". The structure exists. The page does not show it, and the server cannot read it. The rethought page shows it, and the server reads it.

### 5.2 The five clauses

| Clause | Content | Who writes it | Who reads it |
| --- | --- | --- | --- |
| The ask | one paragraph: what breaks, or what must exist | he, or the planning agent | the working agent |
| The contract | Result, Files, Leave alone, Verify, Review focus, Evidence owed | he, or the planning agent; `Evidence owed` is computed | the working agent, the review page, `trellis evidence check` |
| The chain | Waits on, Ready, Releases | `--after` edges, parsed prose, the branch graph | he, the epic page, the ancestors condition |
| The evidence | one card per pull request: the short conditions, the evidence count, the flow verdict, `Open the review` | Trellis | he |
| The outcome | what merged, and the sentence the next contract reads | the agent at merge, one sentence | the next ticket's brief, OP-54 |

Then two service blocks: the run, one line per attempt with the harness state and the `Start` controls; and the resources the contract names.

### 5.3 What leaves the page, and why

| Removed | Where it lives today | Why |
| --- | --- | --- |
| the activity feed | `Timeline`, `ActivityLine` in `apps/web/src/features/ticket/Timeline/` | one human makes every field change. The feed tells him what he did. |
| the comment thread and the composer | `CommentThread`, `CommentCard`, `Composer`, `MentionedThread` | no second human reads them. The session view holds the agent conversation. An agent's question belongs under the title. Together with the feed these hold 716 of the 3,104 TSX lines of the feature. |
| the four tabs | `TicketWorkArea`: Activity, Agent, Diffs, Flows | the page is one column read top to bottom. Agent becomes `Session` on the run line. Diffs becomes the evidence clause. Flows becomes one line inside each pull request card. |
| `TicketMetrics` | the right rail: Tokens burned, Time burned, Age | none of the three changes a merge decision. Spend belongs on the usage page. |
| the human reviewer picker | `ReviewerPicker` on the review page | there is one reviewer. |

Kept, against the instinct to cut: the `comments` table. `apps/server/src/services/brief.ts` reads the last 10 comments into every agent brief, and a mention in a comment starts a run. The rows stay as the transport. Only the interface comes out.

### 5.4 The reading order

The contract sits above the proof. The proof sits above the process. He reads down and stops when he can act. Screens 5 and 6 are the page for a blocked ticket and a ticket under review.

---

## 6. Every new UI element

`docs/UI_PATTERNS.md:13-15` requires that each new element names the canonical element it would replace and the reason that element fails. Thirteen elements. Two column additions and one row kind that reuse `Row` are listed separately.

| New element | Where | Nearest canonical element, and why it fails |
| --- | --- | --- |
| `PrRow` | epic table, under a ticket | `Row` with the `pr` column at 72 px. The column cannot hold the glyph, the number, the state, the size, the checks in words, the threads, the evidence word and the turn. A wider column would break every other route that shows the table. `PrRow` is a second row kind of 32 px in the same virtualized list. |
| `AgentLine` | epic table, under a ticket title | `Row` has one line at 36 px, and the table has fixed heights per density. The last message needs a second line only when one exists. `AgentLine` is a 24 px row kind that renders only then, so heights stay fixed per kind. |
| `ChecksLine` | `PrRow`, the pull request card, region F | `CheckRing` draws three arcs and a glyph for one rollup. Rule 6 rejects it. `ChecksLine` prints `1 failed · 6 pending · 47 passed` and names each failing and pending check with its workflow. |
| `ConditionsBlock` | review page region B, short form on the pull request card | `PropertyRow` holds one label and one value. Nine conditions as nine rows share no fixed order, no fixed label width and no readiness word. `ReviewSummary` mixes computed facts with GitHub text. The block fixes the nine labels, their order and the word after `READY TO MERGE`. |
| `ChangeSummary` | review page region C | `Description` renders free TipTap prose. The summary is three named fields with hard limits that the CLI checks. Free prose carries no limit and no `one revision behind` state. |
| `ReviewFocusList` | review page region D | `SubTickets` is a checklist of tickets with a progress bar. A focus item is a sentence the ticket wrote and the reviewer marks per revision. No element holds a per-revision mark on a sentence. |
| `EvidenceStrip` | review page region E, the pull request card | `AttachmentGrid` splits a ticket's files into thumbnails and rows. Evidence needs a before and after pair with one record line, a clip that plays in place, a verify record with an exit code, a contract table, and a missing list with the command that fills each gap. |
| `FileRiskGroups` | review page region G | `ReviewFiles` lists files by path with per-file comment counts. Nothing orders by risk, prints a line count per group, collapses noise, or keeps a per-file, per-revision read mark. |
| `ContractBlock` | ticket page | `PropertyRow` holds one label and one value. The contract holds lists of paths, commands and sentences, and the server reads the same fields for the brief, the review focus and `trellis evidence check`. Prose in `Description` cannot be read by the server. |
| `ChainBlock` | ticket page | `PropertyRow` holds one direction. The chain holds two directions with titles and states, and a derived `Ready` sentence. |
| `RunLine` | ticket page | `ActorAvatar` marks one actor on a row. The line prints one attempt: the card, the name, the harness, the model, the state words of section 3 with the tool and the time, the last message on a second line, and `Session`. |
| `StartControls` | ticket page, on the run block | `ModelPicker` picks a model. Starting a run needs the harness, the model and the effort in one row with one `Start`. It reuses `ModelPicker` inside. |
| `ResourceList` | epic page, ticket page | `AttachmentGrid` belongs to a ticket and holds files. A resource belongs to the epic and has four kinds. A doc opens an editor and a link opens the in-app browser, which no file row does. |

Changes to existing elements, no new element:

- `columns.tsx` gains `waits` at 110 px and `releases` at 40 px on the epic route, and drops the status name to the glyph on that route.
- `rowHeights.ts` gains heights for the two new row kinds.
- `DisplayPopover` gains `Group by: Wave · Turn` on the epic route.
- `GroupHeader` count slot takes `0 of 6 · 1 for you` as text.
- `epicBar.ts:13` moves the review segment from `agent` to `accent`. The `Agent Review` status glyph moves from `agent` to `accent`. Rule 5.
- The 18 px agent card keeps `--animate-glimmer` and drops the `--film-violet` stop from its gradient.

Reused without change: `Topbar`, `PageTitle`, `PageSheet`, `FilterBar`, `Chip`, `FilterPopover`, `DisplayPopover`, `GroupHeader`, `SectionHeader`, `PropertyRow`, `Row`, `TicketId`, `PriorityIcon`, `StatusIcon`, `ActorAvatar`, `Avatar`, `LineChanges`, `Menu`, `IconButton`, `Tooltip`, `StackedBar`, `ProviderIcon`, `ModelPicker`, `FlowRunSummary`, `FlowRunTree`, `Badge`, the agent card, the GitHub pull request glyph.

Server and CLI work behind the elements:

| Need | Change |
| --- | --- |
| size on a row | add `additions`, `deletions`, `changedFiles` at `apps/server/src/gh/graphql.ts:66`, in `PullRequestContent`, `pull_requests`, `PullRequestSchema` |
| the agent line | forward `lastMessage` and `lastTool` from `RuntimeAgentMetadata` into `observation` at `liveState.ts:114-121` and into `packages/api/src/schemas/agentRun.ts:28-37` |
| dependencies | table `ticket_deps` (ticket_id, depends_on_id, source: manual, parsed, derived, created_at); `--after`; a one-time parse of `Depends on: step N` through the `Step N` map; the branch graph rule; a cycle refused at write time with the path named |
| the contract | fields on the ticket, or a `ticket_contracts` row. Decision 1. |
| evidence | new tables bound to a pull request and a head sha, with kind, record and blob sha256. The store reuses the `attachments` blob store. |
| the summary | one row per pull request and head sha |
| epic resources | table `epic_resources` with four kinds, an optional ticket id, an actor |
| the outcome | one text field on the ticket, written by `trellis outcome set` at merge |

---

## 7. The dissent I overruled, and why

| Design | What it proposed | Ruling | Why |
| --- | --- | --- | --- |
| B, C | `Approve and merge` disabled on a failed check, an open thread or an unmerged stack | overruled | Rule 1. No gate blocks him. The button stays live and the unmet conditions print as one line. He reads them and decides. |
| C | `Next move` phrases replace the status column: `Review #57078`, `Fix checks`, `Blocked by OP-32` | overruled, half taken | Nine phrases is a vocabulary to learn, and a phrase per row is a lot to read across 27 rows. The Turn grouping carries the same fact once per group, and the `waits` cell carries the blocker. The status glyph stays. |
| B | a `▲` triangle as the human-needed mark | overruled | A 6 px dot is legible at row size and needs no decoding. The same dot marks an `asks` line. One glyph, one color, one meaning. |
| B | `Group by chain`, one group per path through the graph | overruled | A path is not unique in a graph with joins. OP-33 sits on two paths. The Turn grouping answers "what first" and the `waits` cell answers "after what" without a chain name to invent. |
| A | the landing order view: `LANDS NOW`, `LANDS AFTER ONE MERGE`, `LANDS LATER` | folded | Its facts live in the Turn grouping. `Waits on a merge` sorts by depth, and the `waits` cell shows the first blocker. |
| A | a 56 px `ChangeRow` with an eight-fact readiness line on every pull request ticket | overruled | Rule 12. The row grew past what a glance reads. The pull request becomes its own 32 px row with fewer facts, and the review page holds the rest. |
| A, B, C | the agent-written text is the `brief` | overruled | `trellis brief` and `brief.ts` already mean the markdown the agent starts from. One word, one meaning. The pull request text is the `summary`. |
| B, C | the ticket page keeps tabs: Plan and Agent, or Contract, Agent, Flows | overruled | One column, read top to bottom. The session opens from the run line in a `PageSheet`. A flow is one line on the pull request card. |
| A | `TicketMetrics` removed with no home | adjusted | Removed from the ticket. The elapsed time and the tokens move to a hover on the run line, so nothing is lost. |
| B | `1 running` stays plain text | kept | `docs/UI_PATTERNS.md:100-113`. The filter grammar has no filter for a working agent. |
| C | the epic page gains a tab strip: Board, Chain, Resources | overruled | A tab strip is a new element on a page that has a `DisplayPopover` and `SectionHeader`. Grouping goes in Display. Resources is a section. |

---

## 8. Decisions for you

1. **The contract: fields or prose?** Every ticket of this epic already writes `Files:`, `Verify:`, `Review focus:` and `Depends on:` by hand. Fields cost a migration and a CLI verb, and they let the review page and `trellis evidence check` read them exactly. Prose costs nothing and the server parses it, which breaks on the first reworded line. I recommend fields, with a one-time parser that imports the prose the agents already wrote.

2. **Who captures the before image?** The agent, in a second worktree at the merge base, which costs a second build per frontend pull request and gives the agent control of the seed. Or one capture service that Trellis runs per revision, which gives one fixed environment and costs a new service. I recommend the agent for now.

3. **May the CLI refuse the agent's hand-over?** `trellis move KEY-42 human-review` refuses while the evidence floor is missing. It never refuses you. A required field gets filled and an optional heading does not. The risk is an agent that loops on a refusal. I recommend the refusal, with the missing list printed each time.

4. **Which grouping is the default on the desktop?** Wave says what you intend to start together. Turn says what you do first. The design defaults to Wave on the desktop and Turn on the phone. Say if you want Turn on both.
