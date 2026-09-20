# Epics

Decided on 2026-09-18. An epic groups the tickets that deliver one plan inside a project: a name, a markdown description that holds the plan, and the tickets in ticket-number order. It is its own record, not a ticket. Its state derives from its tickets. A ticket belongs to at most one epic, and the epic shares the ticket's root project.

The live case: the session agent `routine-runtime-design` created OP-29 to OP-51 (23 tickets) from `backend/operator-service/docs/routine-runtime.md` in 35 s. Each description says "Step N of the routine runtime" and states dependencies in prose. Nothing joins the 23 tickets, and no member agent can read the document.

Out of scope, by decision: dependency edges, a ready list, an order column, phases as structure, an archive flag, a stored status, membership across roots, mobile surfaces, negation of the epic filter.

## Data model

Table `epics`, in `apps/server/src/db/tables/epics.ts`, exported from `apps/server/src/db/schema.ts`:

| column | type and constraint |
|---|---|
| id | text PK, ULID |
| project_id | text NOT NULL, FK projects(id) ON DELETE CASCADE |
| root_id | text NOT NULL; FK (project_id, root_id) → projects (id, root_id), the shape of `tickets_project_fk` |
| slug | text NOT NULL, CHECK `slugPattern` (`^[a-z0-9]+(-[a-z0-9]+)*$`), UNIQUE (root_id, slug) |
| name | text NOT NULL, CHECK trimmed and 1 to 120 |
| description | text NOT NULL DEFAULT '', CHECK length <= 200000 |
| actor columns | `actorColumns()` and `actorFk` from `tables/actors.ts`, the last writer, as `notes` |
| created_at, updated_at | `at()` NOT NULL |
| | UNIQUE (id, root_id); index (project_id) |

Tickets gain one column: `epic_id` text NULL, FK `tickets_epic_fk` (epic_id) → epics (id) ON DELETE SET NULL, index `tickets_epic_id_idx` (epic_id). The same-root rule is a service rule (`CROSS_ROOT_MOVE`), as for `parent_id`; a composite FK cannot SET NULL one column.

One migration, `0078_kind_jetstream`, generated with `bun run db:generate` after `0077_ticket_labels`. Keep the snapshot. The SQL holds only the `epics` table, the `tickets.epic_id` column, its FK, and its index. Never edit an earlier migration.

Derived, never stored:

- counts by status category of the epic's tickets: `todo`, `started`, `review`, `done`, `canceled`, and `total`
- `state`: `done` when `total > 0` and every ticket is done or canceled, else `open`
- progress as the reader wants it: `done / (total - canceled)`; a canceled ticket is never done and never in the denominator

Delete: an epic delete sets `epic_id` NULL on its tickets (the FK does it), raises their `version`, writes one activity row per ticket with field `epic`, and emits `ticket.updated` for each. An agent actor needs `force` (`AGENT_CANNOT_DELETE`), as for a ticket delete. A project delete cascades its epics. An archived project refuses every epic mutation (`PROJECT_ARCHIVED`).

## Refs and API

EpicRef, in `packages/api/src/refs.ts` beside `TicketRef`: a ULID, or `KEY/slug` such as `OP/routine-runtime`, case-insensitive on input, canonical form upper-case key and lower-case slug. The slash keeps it apart from a ProjectRef, which joins with dots. Export `EpicRefStringSchema`, `EpicRefSchema`, and `canonicalize` in the pattern of the ticket ref.

Schemas in `packages/api/src/schemas/epic.ts`. `EpicLinkSchema` lives in `packages/api/src/schemas/epicLink.ts` and `epic.ts` re-exports it, because `ticket.ts` reads the link and `epic.ts` reads `ticket.ts`; one file would form an import cycle.

```
EpicCountsSchema = { total, todo, started, review, done, canceled }   // CountSchema each
EpicStateSchema = z.enum(["open", "done"])
EpicSummarySchema = { id, projectId, projectPath, ref, slug, name, description, counts, state, actor, createdAt, updatedAt }
EpicSchema = EpicSummarySchema + { tickets: TicketSummary[] }         // number order
EpicLinkSchema = { id, ref, name }                                    // on a ticket
EpicListInputSchema = { project: ProjectRef }                         // the project and its sub-projects
EpicCreateInputSchema = { project, name, slug?, description? }        // slug derives from the name when absent
EpicUpdateInputSchema = { epic: EpicRef, name?, slug?, description? }
EpicRefInputSchema = { epic: EpicRef }
EpicDeleteInputSchema = { epic, force? }
EpicDeleteOutputSchema = { id }
```

Contract `packages/api/src/contract/epics.ts`, registered in the contract index and the OpenAPI tags in the pattern of `notes`. The paths use `{+epic}`, so `GET /api/epics/OP/routine-runtime` matches with its slash; the OpenAPI document prints `/epics/{epic}`.

| procedure | route |
|---|---|
| epics.list | GET /api/epics?project=OP → EpicSummary[], open first then done, then by updated desc |
| epics.get | GET /api/epics/{epic} → Epic |
| epics.create | POST /api/epics, 201 and `Location: /api/epics/{id}` |
| epics.update | PATCH /api/epics/{epic} |
| epics.delete | DELETE /api/epics/{epic} → { id } |

A slug taken in the root is `DUPLICATE` with field `slug`. `slug` derives from `name` with the helper in `apps/server/src/services/slug.ts`; a derived slug that collides gets a numeric suffix.

Ticket changes:

- `TicketSummarySchema` and `TicketSchema` gain `epic: EpicLinkSchema.nullable()`. `summaryColumns` joins `epics e ON e.id = t.epic_id` and prints `e.id, e.slug, e.name` plus `root.key`; `toSummary` builds `ref` as `${key}/${slug}`.
- `TicketCreateInputSchema` gains `epic: EpicRefStringSchema.optional()`. `TicketUpdateInputSchema` and `TicketUpdateManyInputSchema` gain `epic: EpicRefStringSchema.nullable().optional()`; `null` clears it. Resolve the ref, check the root (`CROSS_ROOT_MOVE`), and check `PROJECT_ARCHIVED` on the epic's project.
- `ListQuerySchema` gains `epic: z.union([z.literal("none"), EpicRefStringSchema]).optional()`. `ticketFilters.ts` adds the clause (`t.epic_id IS NULL` or `t.epic_id = <id>`) and the `filterKey` entry. `read.ts` resolves the ref to an id.
- Activity: a change of `epic` records field `epic` with the epic refs as `from_value` and `to_value`, and the ids in `meta.fromId` and `meta.toId`.
- Events: `epic` joins the `fields` list of `ticket.created` and `ticket.updated` when it changes. `packages/api/src/query-keys.ts`: `epic` joins `membershipFields`; a ticket event whose fields include `epic`, `status`, or `completedAt` invalidates the `epics` query family, because the epic's counts change and the epic row emits no event of its own. A new event `epics.changed` with payload `{ projectId, id }` fires on epic create, update, and delete; `bus.ts` scopes it to the project. The web invalidates the `epics` family, the `tickets` family, and `projects.list` on it, because every ticket row copies the epic name and ref and the projects list carries `openEpicCount`.
- `ProjectSummarySchema` gains `openEpicCount: CountSchema`, the count of epics of that project with state `open`, computed in the project list query. The sidebar prints it.

The server code lives in `apps/server/src/services/epics/`: `epics.ts` (list, get, create, update, remove), `resolve.ts` (`resolveEpic`, `resolveEpicForTicket`), `rows.ts` (the select with the counts lateral, `stateOf`, `epicOrder`, `toEpicSummary`), and `text.ts` (the brief lines). The procedures are in `apps/server/src/procedures/epics.ts`.

## Brief

`apps/server/src/services/brief.ts`: when the ticket has an epic, the header gains `- Epic: <name> (<ref>), <done> of <total - canceled> done`. After the description, a section `## Epic: <name>` prints the epic description in full, then `## Epic tickets` lists every ticket of the epic in number order as `- OP-29 Title (Done)`, with `(this ticket)` after the current one. The launch instruction stays title plus description; an agent reads the epic through `trellis brief`.

## CLI

`packages/cli/src/commands/epics.ts`, registered in `verbs.ts`, in the pattern of `notes.ts`:

```
trellis epics list --project OP
trellis epics show OP/routine-runtime            # record, then the tickets
trellis epics create --project OP --name "Routine runtime" [--slug s] [--description text | -]
trellis epics edit OP/routine-runtime [--name] [--slug] [--description text | -]
trellis epics add OP/routine-runtime OP-29 OP-30 ...     # tickets.updateMany with epic
trellis epics remove OP-29 OP-30 ...                     # tickets.updateMany with epic: null
trellis epics delete OP/routine-runtime [--force]
```

`--epic <ref>` joins `create`, `sub`, `edit` (`--epic none` clears), and `list` (`--epic <ref|none>`). `packages/cli/src/instructions.md` gains one paragraph: a plan that produces several tickets is an epic; create the epic with the plan as its description, then create each ticket with `--epic`; file a question for the person as a ticket of the epic in the human review status.

## Web

Filters, `apps/web/src/features/filters`:

- `View` gains `epic?: string`. `parseSearch`, `serializeSearch`, `toListQuery`, and `toCountsQuery` carry it. `apps/web/src/lib/searchParams.ts` puts `epic` after `parent` in `searchParamOrder`. A view key outside that order redirects on every load.
- `fields.ts`: field `epic`, label "Epic". The chip prints the epic name; `valueLabel` receives the project's epics (from `epics.list`) as it receives statuses. `none` prints "No epic".
- `FilterPicker`: the `epic` stage lists the project's epics from `epics.list`, and "No epic". Uses `FilterPopover` and `Command`, no new element.
- `Group` gains `"epic"`; `DisplayPopover` offers "Epic"; `groupRows.ts` labels the group with the epic name, `No epic` last.

Table, `apps/web/src/features/table`: column "Epic" (the name, a link to the epic page), hidden by default like Parent. `BulkBar`: "Set epic" with the epics of the project, in the shape of "Set parent".

Board card, `apps/web/src/features/board/components/CardContent/CardContent.tsx`: the top row prints the epic name before the trail when the ticket has an epic: `Routine runtime · OP-32`. The name is `text-xs text-fg-faint truncate` in the sans face, the separator is ` · `, and the identifier trail keeps `shrink-0`, so a long name gives way and the identifier stays. The drag preview draws the same content. This is the one card mark change; Navid approved it on 2026-09-18.

Ticket page, `apps/web/src/features/ticket/PropertiesRail/components/PickerRows/PickerRows.tsx`: a `PropertyRow` "Epic" after "Parent". The value is the epic name as a link to the epic page, or "None". The picker lists the project's epics and "None" with `FilterPopover` and `Command`, and writes `tickets.update { epic }`.

Routes, `apps/web/src/lib/projectPath.ts` and `apps/web/src/routes/p/$/route.tsx`: `epics` joins `reservedSlugs` (`packages/api/src/schemas/primitives.ts`) and `views`. The splat parser accepts `epics` as the last segment (view `epics`) and `epics/<slug>` as the last two segments after a project segment (view `epic` with the slug); a bare `epics/<sub>` is the sub-project of a root `EPICS`. `/p/OP/epics` lists the epics of the project; `/p/OP/epics/routine-runtime` is one epic. Regenerate `routeTree.gen.ts` under node when a route file changes.

Epics list page, `apps/web/src/features/epics/EpicsPage`: `Topbar` with `ProjectBreadcrumb` and `PageTitle` "Epics", a "New epic" action that opens a dialog (name, description) in the shape of the note dialog. Two `GroupHeader` groups, Open and Done, with counts. One dense `Row` per epic in the ticket table widths: name, `StackedBar` of the counts by category (done, review, started, todo; canceled as its own segment), `done/total` in tabular numbers, updated time, and a circular row `Menu` (Edit, Delete). Empty state: "No epics. An epic groups the tickets of one plan."

Epic page, `apps/web/src/features/epics/EpicPage`: `Topbar` with the breadcrumb `Operator / Epics / Routine runtime` and a `Menu` (Edit, Delete). Below: the `StackedBar` with a legend of the counts, the state, and the description rendered with the ticket markdown renderer (bare `KEY-n` autolinks). Then a `SectionHeader` "Tickets" with the count and an "Add" action; the action opens the `TicketPicker` scoped to the project and writes `tickets.updateMany { tickets: [ref], epic }`. One row per ticket in number order in the `ChildRow` shape of `SubTickets`: status icon, identifier, title, PR badge, actor; a row menu offers "Remove from epic". Edit opens the same dialog as New epic, filled.

Sidebar, `apps/web/src/features/sidebar/components/ProjectPages/ProjectPages.tsx`: a row "Epics" between Tickets and Diffs, `suffix: "/epics"`, active when the pathname ends in `/epics` or holds `/epics/`. The trailing slot prints `openEpicCount` when it is above zero, in `sidebar-trailing`. The Tickets row turns off on the epics pages.

Command palette, `apps/web/src/features/command/items.ts`: "Group by Epic" beside the other group items. Search stays unchanged.

Every UI element above is canonical (`docs/UI_PATTERNS.md`): `Topbar`, `PageTitle`, `FilterBar`, `Chip`, `FilterPopover`, `Command`, `DisplayPopover`, `GroupHeader`, `SectionHeader`, `Row`, `StackedBar`, `Menu`, `IconButton`, `Tooltip`. The card mark is the one approved exception.

## Milestones

Decided on 2026-09-18. A milestone groups the tickets of one epic into an ordered phase. The routine runtime plan has four phases; each becomes a milestone of the epic. A milestone belongs to one epic. A ticket belongs to at most one milestone, and that milestone belongs to the ticket's epic.

Table `milestones`, in `apps/server/src/db/tables/milestones.ts`, exported from `schema.ts`:

| column | type and constraint |
|---|---|
| id | text PK, ULID |
| epic_id | text NOT NULL, FK epics(id) ON DELETE CASCADE |
| root_id | text NOT NULL; FK (epic_id, root_id) → epics (id, root_id) |
| slug | text NOT NULL, CHECK `slugPattern`, UNIQUE (epic_id, slug) |
| name | text NOT NULL, CHECK trimmed and 1 to 120 |
| position | integer NOT NULL, CHECK >= 0; the order of the phases inside the epic |
| created_at, updated_at | `at()` NOT NULL |
| | UNIQUE (id, epic_id); index (epic_id, position) |

Tickets gain `milestone_id` text NULL, FK `tickets_milestone_fk` (milestone_id) → milestones (id) ON DELETE SET NULL, index (milestone_id), and CHECK `tickets_milestone_needs_epic`: `milestone_id IS NULL OR epic_id IS NOT NULL`. The rule that the milestone belongs to the ticket's epic is a service rule, `MILESTONE_OUTSIDE_EPIC` (400), a new error code in `packages/api/src/errors.ts`.

Service rules on a ticket write: a `milestone` value sets `epic_id` to the milestone's epic in the same write, so one call places a ticket. An `epic` value that differs from the current epic, or `epic: null`, sets `milestone_id` NULL. `updateMany` follows the same rules per ticket. Activity records field `milestone` with the refs as `from_value` and `to_value`. Events: `milestone` joins the `fields` of `ticket.created` and `ticket.updated`, and `membershipFields`; a change of `milestone`, `epic`, `status`, or `completedAt` invalidates the `epics` family. `epics.changed` covers milestone create, update, reorder, and delete (the payload names the epic).

Derived per milestone, never stored: the counts by status category and the state `open` or `done`, with the rules of the epic.

One migration, `0080_wild_legion`, generated after `0079_session_attention` with `bun run db:generate`. Never edit an earlier migration.

Refs and API. MilestoneRef: a ULID, or `KEY/epic-slug/milestone-slug` such as `OP/routine-runtime/phase-1`; three segments keep it apart from an EpicRef. Schemas in `packages/api/src/schemas/milestone.ts` (a `MilestoneLinkSchema` in `milestoneLink.ts` if an import cycle needs it):

```
MilestoneSummarySchema = { id, epicId, ref, slug, name, position, counts, state, createdAt, updatedAt }
MilestoneLinkSchema = { id, ref, name }                       // on a ticket
EpicSchema gains milestones: MilestoneSummary[] in position order
TicketSummarySchema and TicketSchema gain milestone: MilestoneLinkSchema.nullable()
TicketCreateInputSchema gains milestone?: MilestoneRef
TicketUpdateInputSchema and TicketUpdateManyInputSchema gain milestone?: MilestoneRef | null
ListQuerySchema gains milestone?: "none" | MilestoneRef        // clause, filterKey, read.ts resolve
```

Contract `packages/api/src/contract/milestones.ts`: `milestones.create POST /api/milestones` (body `epic`, name, slug?, appended last), `milestones.update PATCH /api/milestones/{+milestone}` (name, slug), `milestones.reorder PUT /api/milestones/order` (body `epic` and the full list of milestone refs; a list that is incomplete, repeated, or from another epic is `MILESTONE_OUTSIDE_EPIC`), `milestones.delete DELETE /api/milestones/{+milestone}` (sets `milestone_id` NULL on its tickets through the FK, one activity row and one `ticket.updated` per ticket; an agent needs `force`). The router reads `{+name}` as the rest of the path, so no route continues after an epic ref, and `create` and `reorder` take the epic in the body. A slug taken in the epic is `DUPLICATE` with field `slug`.

Brief: the header gains `- Milestone: <name> (<ref>), <done> of <total - canceled> done` when the ticket has one. `## Epic tickets` groups the lines under `### <milestone name>` headings in position order, then `### No milestone`.

CLI, `packages/cli/src/commands/milestones.ts`, registered in `verbs.ts`:

```
trellis milestones list OP/routine-runtime
trellis milestones create OP/routine-runtime --name "Phase 1" [--slug s]
trellis milestones edit OP/routine-runtime/phase-1 [--name] [--slug]
trellis milestones order OP/routine-runtime phase-1 phase-2 phase-3 phase-4
trellis milestones add OP/routine-runtime/phase-1 OP-29 OP-30 ...   # tickets.updateMany with milestone
trellis milestones remove OP-29 ...                                 # tickets.updateMany with milestone: null
trellis milestones delete OP/routine-runtime/phase-1 [--force]
```

`--milestone <ref>` joins `create`, `sub`, `edit` (`none` clears), and `list`. `epics show` prints the milestones with their counts, then the tickets grouped by milestone. `instructions.md`: a plan with phases makes one milestone per phase and creates each ticket with `--milestone`.

Web:

- Filters: `View.milestone`, parse and serialize, `searchParamOrder` after `epic`, field "Milestone" in the picker only when the route has a project (the stage lists the milestones of the epics of the project, grouped by epic name), chip prints the milestone name.
- `Group` gains `"milestone"`: groups in milestone position order, "No milestone" last; the `GroupHeader` count slot prints `done/total` of the milestone when the rows come from one epic. `DisplayPopover` offers "Milestone". Column "Milestone", hidden by default. `BulkBar`: "Set milestone" with the milestones of the tickets' epic.
- Ticket page rail: a `PropertyRow` "Milestone" after "Epic"; the picker lists the milestones of the ticket's epic and "None"; hidden when the ticket has no epic.
- Epic page: see the revision below. The Edit epic sheet gains a "Milestones" section: the list of milestones in order, each with a name field, a move up and a move down `IconButton`, a delete `IconButton`, and an "Add milestone" action. It writes through `milestones.create`, `update`, `reorder`, `delete`.

## Epic page revision

Decided on 2026-09-18: the epic page shows its tickets in the full-width ticket table, the same `TicketTable` as the project table view, with no page-specific row. Structure, top to bottom:

1. `Topbar` with the breadcrumb `Operator / Epics / Routine runtime`, the `FilterBar` chips of the page (every field except `epic`, which the page fixes), the Display `IconButton` (`DisplayPopover` with group, sort, density, columns, as the project table), an Add `IconButton` with a `Tooltip` "Add tickets" that opens the `TicketPicker` scoped to the project (no "None" option), and the row `Menu` (Edit, Delete).
2. A header band in the page padding: the state `Badge`, `<done> of <total - canceled> done`, the `StackedBar` with legend, and one `StackedBar` line per milestone with its name and `done/total` (the milestones in position order; the "Composition of one total" pattern).
3. A `SectionHeader` "Plan" that collapses; collapsed by default when the description is longer than 1200 characters, else expanded; the collapsed state per route key in `uiStore` like a table group. The body is the description through `ReadOnlyMarkdown`.
4. The `TicketTable` with the root project of the epic, `routeKey` of the epic page, and `search` = the URL view with `epic` fixed to the epic ref, `group` default `milestone`, and `scope` default `subprojects`. An epic belongs to a root and holds tickets of any project of that root, so the table reads the root with its sub-projects and its rows match the counts of the band. The URL of the epic page carries the same params as the project table (`group`, `sort`, `density`, `columns`, the other filters). The table's row actions, bulk bar, keyboard navigation, `PrCell` colors, and actor cell come with it. "Remove from epic" is the bulk bar "Set epic" with "None" and the rail row; the page adds no row menu.

The actor cell of every row (table `Row`, board card, epic page, needs-you) shows the provider mark only for the agent run that is assigned to that ticket. A ticket with no assigned agent shows its last actor without a provider mark. `ActorAvatar` takes the assigned run from `agentRuns.list { assigned: true }` (the `useWorkingAgents` query) by `run.ticketId === ticketId`, and reads the profile from that run alone; `useActorRun(actor)` no longer supplies the profile for an unassigned ticket.

The epics list page keeps its rows, aligned with the ticket table `Row` classes: the same row heights (`rowHeights[density]`), the same hover band, the same cell text sizes and tabular numbers, the same trailing `Menu` slot width. No page-specific control shape.

Adoption of the milestones for the Operator case, after the release:

```
trellis milestones create OP/routine-runtime --name "Phase 1: run state"
trellis milestones create OP/routine-runtime --name "Phase 2: unattended runs"
trellis milestones create OP/routine-runtime --name "Phase 3: proposals"
trellis milestones create OP/routine-runtime --name "Phase 4: system routines"
trellis milestones add OP/routine-runtime/phase-1-run-state OP-29 OP-30 OP-31 OP-32 OP-33 OP-34 OP-35 OP-36 OP-37 OP-38 OP-39
trellis milestones add OP/routine-runtime/phase-2-unattended-runs OP-40 OP-41 OP-42 OP-43 OP-44
trellis milestones add OP/routine-runtime/phase-3-proposals OP-45 OP-46 OP-47 OP-48 OP-49
trellis milestones add OP/routine-runtime/phase-4-system-routines OP-50 OP-51
```

## Follow-up build: what is next, and guidance for the planner

This section is a separate build. It starts after the milestones build lands. The milestones build does not read it.

Navid, 2026-09-18: "We need to add guidance for the agent that sets it up. How to create milestones, group work so it can move in parallel, organize items so we can work on multiple fronts together and then integrate. The trellis view should make it clear what needs to happen next. Right now I can't tell with a flat list." The human is the manager: no hold, no gate, no blocked state in the UI. The view informs; the person decides.

### The one rule that carries order

Order lives between milestones, never inside one. Every ticket of a milestone can start at the same time. A ticket that needs the result of another ticket goes in a later milestone. So the milestone order is the dependency structure, and Trellis needs no dependency edge to answer "what is next": it is the open tickets of the first milestone that is not done.

### Guidance for the planner agent

`packages/cli/src/instructions.md` gains a section "Plan an epic", and `trellis epics guide` prints the same text. The text, in STE:

1. Write the plan as the epic description: the goal, the fronts, the milestones, the decisions that the person must make.
2. Cut the work into fronts. A front is a line of work that one agent can finish with no result from another front: the server, the web, the CLI, the docs, a second repository. One ticket per front per milestone. The ticket title starts with the front: "Server: the milestones table and API".
3. Put the fronts that can run together in one milestone. Name the milestone for the state it reaches: "Foundation", "Surfaces", "Integrate", "Review", "Fix".
4. After each set of parallel fronts, add a milestone that integrates them: one ticket that merges the branches, runs the type check, the linter, and the tests, and fixes what the merge broke. Parallel work that nobody integrates is not done.
5. Keep sequential steps of one front inside its ticket as sub-tickets, in order. A sub-ticket is a step of one agent; a ticket is a front; a milestone is a point where the fronts meet.
6. Never put two tickets in one milestone when one needs the other. Move the second one to a later milestone.
7. File each decision for the person as a ticket in the human review status, in the first milestone that needs the answer. Write the options and your recommendation in its description.
8. State in each ticket: the files it owns, what it must not touch, the commands that verify it, and the result the next milestone reads. Two tickets of one milestone never own the same file.
9. Size: a milestone holds 2 to 8 tickets. A ticket is 1 agent session. A plan with more than 6 milestones is two epics.
10. Create everything in one pass: `trellis epics create`, `trellis milestones create` per milestone in order, `trellis create --milestone` per ticket.

The brief of a ticket with a milestone gains "## Results of earlier milestones": for each done ticket of each earlier milestone, its identifier, title, and last comment of its agent, so a front reads what it builds on.

### The view

Server: `EpicSummary` gains `currentMilestone: MilestoneLink | null`, the first milestone in position order whose state is open. Each `MilestoneSummary` gains `toStart`, the count of its tickets in the todo category with no open agent run, and `waitsForYou`, the count of its tickets in a status with the human reviewer.

Epic page, all canonical elements:

- The table groups by milestone in position order. A done milestone starts collapsed. The current milestone carries a `Badge` "Current" in its `GroupHeader`, and its count slot prints `done/total`. A later milestone stays expanded and prints "Later" in the muted count slot beside `done/total`.
- The header band opens with one line for the current milestone: `Current: <name>` and three counts, `<n> to start`, `<n> running`, `<n> wait for you`. Each count is a link that sets the table filter (status category todo with no agent, working, reviewer human) inside that milestone. The per-milestone bars below mark the current one with the same `Badge`.
- Inside a milestone group the default sort puts tickets that wait for the person first, then tickets to start, then running, then done.

Epics list row: after the name, the muted text `<current milestone name> · <i> of <n>`. Board card: no change.

Needs you: no change; a decision ticket already lists there.

## Revision 2026-09-19: waves, dependencies, PR rows

Navid, 2026-09-19: "we should show all prs for a ticket under the ticket in the table (indented) with pr specific statuses, including flows, unresolved comments, etc. We should rename milestones to waves since waves are not linear, milestones are. Dependencies are still not clear. waves may not be dependent on each other. tickets inside a wave may have dependencies, etc." This revision replaces the rule "order lives between milestones" and the section "Milestones" where they conflict.

### Waves

A wave is a set of tickets of one epic that the person intends to start together. Its `position` is the display order and carries no dependency. Two waves can run at the same time. Rename: table `milestones` to `waves`, `tickets.milestone_id` to `wave_id`, `MilestoneRef` to `WaveRef` (`KEY/epic-slug/wave-slug`), procedures `waves.*`, CLI `trellis waves list|create|edit|order|add|remove|delete|start` and `--wave` on create, sub, edit, list, the filter `wave`, the group `wave`, the brief headings, the web words. One migration renames the table, the column, the constraints, and the indexes; the data stays. `MILESTONE_OUTSIDE_EPIC` becomes `WAVE_OUTSIDE_EPIC`.

### Dependencies

Table `ticket_deps`: `ticket_id`, `depends_on_id`, `root_id`, actor columns, `created_at`; PK (ticket_id, depends_on_id); CHECK `ticket_id <> depends_on_id`; FK both to `tickets (id, root_id)` ON DELETE CASCADE; index (depends_on_id). Both tickets share one root; the service refuses a cycle with `DEPENDENCY_CYCLE` (400) after a walk of at most 64 steps. An edge crosses waves or stays inside one. Writes: `tickets.create`, `update`, and `updateMany` take `after: TicketRef[]` (full replace on update), CLI `--after OP-32,OP-33`, a rail `PropertyRow` "After" with the `TicketPicker` (many), and the planner writes them from the plan. `TicketSummary` gains `after: [{ identifier, done }]` and `blocks: number`. The brief prints `## After` with the state of each dependency and `## Unblocks`.

Derived: a ticket is **ready** when it is in the todo category and every dependency is done or canceled; **blocked** when one dependency is open. Nothing stops a person from a start on a blocked ticket. The planner guidance changes: a wave holds what starts together; a dependency says what finishes first; neither implies the other; a decision ticket is a dependency of the tickets that wait for its answer.

### Turn words

`You · question | flow | merge`, `Agent · <reason>`, `Checks · n pending`, `Stalled · <reason>`, `Ready`, `Blocked · after OP-32`, blank when done or canceled. The rules of the coordination panel stay, with `Blocked` in place of `Later`, and `Ready` no longer tied to a wave position. The band counts the whole epic: `You · Stalled · Agent · Checks · Ready · Blocked`.

### Start a wave

Withdrawn on 2026-09-20. Navid: "i don't want any queue features yet" and "i want dependency to be clear and i will start stuff myself." No `waves.start`, no queue, no `tickets.queued_at`, no capacity. The person starts each ticket from its page or the CLI, as today. The page makes the dependency clear instead: a todo ticket with no run and one open dependency reads `Blocked · after OP-52` in fg-muted; a todo ticket with no run and no open dependency reads `Ready`; the rail and the brief list After and Unblocks. A Blocked ticket can still be started; the page holds nothing.

### PR rows in the table

Every pull request of a ticket is an indented row under its ticket row, on by default on the epic page and off by default on the project table (a Display toggle "Pull requests"). `TicketSummary` gains `prs: PrRow[]` with `{ id, number, repo, url, title, state (draft|open|merged|closed), ciState, checks {pass, fail, pending}, reviewState, openThreads, flowRun: { name, step, of, status } | null, additions, deletions, baseIdentifier: identifier | null, updatedAt }`. The row prints, in the ticket table widths: a PR mark in the identifier column (`↳ #55569`), the title, then marks in the existing colors: state, checks ribbon, `n threads`, `flow <name> step 2 of 4`, review state, `+412 −38`, `on OP-32`, age. A click opens the review page. The ticket's turn reads the worst PR: a failing check or an open thread with no agent gives `Stalled`; a green non-draft PR with no thread and no run gives `You · merge`. The Row component gains a `PrRow` child in the shape of the sub-ticket rows; a new row kind needs Navid's approval and he asked for it on 2026-09-19.

### Resources on an epic

Navid, 2026-09-19: "We also need full document support. I need to be able to view the design document, assets, plans, etc. We should be able to add many resources to an epic. documents (opened in tiptap), links (opened in in-app browser), images, attachments, etc."

Table `epic_resources`: `id` ULID PK, `epic_id` FK epics(id) ON DELETE CASCADE, `root_id`, `kind` CHECK IN (document, link, image, file), `title` (1 to 200), `position` integer, `body` jsonb NULL (document: the TipTap document), `url` text NULL (link), `attachment_id` FK NULL (image, file; the blob rows the ticket attachments use, with `ticket_id` made nullable or a new owner column), actor columns, `created_at`, `updated_at`; CHECK one of `body`, `url`, `attachment_id` set per kind; index (epic_id, position). The epic `description` migrates into the first document resource named "Plan"; the brief prints every document of the epic as markdown from its TipTap JSON (a server-side serializer), so an agent reads what the person edits. Procedures `epicResources.list|create|update|reorder|delete`, and an upload path for image and file in the shape of `attachments.upload`. CLI: `trellis epics docs list|show|add|edit|rm` (markdown in and out), `trellis epics links add|rm`, `trellis epics files add|rm`.

Web: a "Resources" section on the epic page above the ticket table: one row per resource with a kind mark, the title, the size or the domain, the updated time, and a row menu; an Add action with the four kinds; collapsed to a row of chips when the table scrolls. A document opens in place in a TipTap editor (a new dependency: `@tiptap/react`, `@tiptap/starter-kit`, exact versions; ProseMirror under it), saved on blur with a version check, read-only under an archived project. A link opens in an in-app browser: on the desktop a sheet with a webview, in the plain web app a new tab. An image opens in the viewer the ticket attachments use; a file downloads. The ticket page keeps its attachments as they are.

### The rows of the epic page

Decided by a panel (13 agents) and an independent Codex opinion on 2026-09-19, from Navid's words: "I want all the info I need here on this page to get that birds eye view. Right now we have too many tags that don't give me all the info I need. For instance, for checks against a PR, we could show the ring that shows the check status. PR icon colors for draft, open, closed, merged. I should not have to read and parse every line. Clicking on a row to expand for more info."

Rules. One mark encodes two facts: shape for the class, color for the state. Worst wins in a rollup. Each fact has a fixed column, so the eye compares down a column. Color carries one axis: red is fail, closed, or changes requested; yellow is a wait; green is pass, open, or approved; purple is merged, an agent, or agent review. Text in a row is a name or a number, never a sentence. Every color pairs with a shape, and every mark has `role="img"` with the hover text as its label.

Epic route tracks: select 16 · priority 16 · id 72 (a caret slot of 16 then the identifier) · title 1fr · status 28 (the `StatusIcon` alone) · pr 88 (four 14 px slots: PR state, check ring, review state, open threads) · actor 20 · turn 150 (word, reason of at most 12 characters, age at the right). `labels` and `updated` are off on the epic route.

Marks. PR state: `PrStateIcon` in `packages/ui` with GitHub's four shapes and colors: open `success`, draft `fg-faint` with a dashed arm, merged `agent`, closed `danger` with an X; the ticket row shows the worst PR. Checks: `CheckRing`, new, a 14 px ring of three arcs by share (fail `danger`, pending `warning`, pass `success`) with an inner X, dot, or check in the worst bucket's color; empty when no checks. Review: approved double check `success`, changes requested X `danger`, review required circle `warning`. Threads: `ThreadCount`, a bubble with the open count in `fg-muted`, hidden at zero. Status: the existing `StatusIcon` ring. Actor: `ActorAvatar` with the glimmer for a working agent and the `needs-input` dot. Turn: a word in a tone (You `fg`, Stalled `warning`, Agent `agent`, Ready `success`, Checks and Blocked `fg-muted`), the reason, the age.

PR rows and the detail row. PR rows are collapsed by default; the ticket row carries the rollup. A plain click on a ticket row, its caret, or the Right key expands; Left collapses; Enter, Space, a double click, or `o` open the ticket; Shift and Cmd select. Under the ticket: one row per PR on the same tracks (`↳ #55569`, the title muted, `+412 −38`, the stack base when stacked, the flow step ring in the status track, the four PR slots, `review-pr 2/4` and the PR age in the turn track), then one detail row when the ticket has dependencies, a run, or sub-tickets: `after OP-52 ◎ · OP-24 ●`, `blocks 2`, the model and effort, `2/5`, labels. Expansion height is a count of rows times the row height, so the virtual list keeps exact sizes. The expanded set lives in `uiStore` per route key; Display gains "Expand all". The project table keeps click as open.

Wave header and band. `GroupHeader` with the `StatusIcon` by category (todo, started, done), the name, the Current chip where the wave has running work, and the count slot `0/5 · You 1 · Stalled 4 · Blocked 0` with zeros in `fg-faint`. Band line 1: the Open badge, `3 of 27 done`, "Waves" and one status ring per wave (hover the name, click scrolls). Line 2: the six turn counts as links with zeros. Both bars leave.

Phone, 400 px: the `PhoneRow` first line holds the id, the PR cell, the status ring, and the turn; a child row is 44 px; the ring adds `n/m` as text because there is no hover.

Data the server adds to `TicketSummary`: `prs[]` (state, draft, checks by bucket, review state, open threads, flow run and step, additions, deletions, base identifier, updated), `after` and `blocks`, `turn` fields. New glyphs to draw: `GitPullRequestDraft`, `GitPullRequestClosed`, `CheckRing`. Decisions taken: collapsed by default with the rollup on the row; the plain click toggles on the epic page; rings on both rows; dependencies ship before this page reads `Blocked` from them.

### Revision 2026-09-19, later: the brief for the page

Navid, 2026-09-19: "The user (me, a human) is trying to build software using AI agents at speed by using multiple agents at the same time, with tight control on quality and being completely aware of each pull request being merged and its contents. We do not want to be vibe coding. We are merging into a large enterprise codebase so we want strict quality controls. Since the human is not spending time writing code anymore and the AI agents do most of the implementation, the human only adds value by reviewing the code. He adds value by ensuring we merge small PRs that are not dangerous and he keeps track of the system architecture as it is built. The design decisions, the architecture is what matters."

Rules from the same message:

- The PR identity mark sits before the PR number, in the slot the caret used; it is not one of the marks in a cluster.
- Marks stay legible at their size: one glyph and one color per fact. A ring of three arcs with a glyph inside fails; a failing check is one red mark.
- The states of an agent run come from the harness implementations and hooks (Claude Code, Codex), not from a guess: asked a question, done, blocked, dead, and the rest the harness exposes. Each state names its signal.
- A live state moves. Yellow is not "in progress".
- The page shows the question or the last message of the agent without a click when the panel finds that this is what the human needs; the panel decides with evidence.
- Capacity, the wave queue, and the capacity meter leave the proposal. They return only when a real problem asks for them.

### The rows of the epic page, third design (2026-09-19, late)

An open panel (13 agents, brief: the product and the user only) and an independent Codex opinion converged. This replaces the second design where they conflict.

What matters most on the page, ranked: the person's move, visible without a click (a question, a finished turn whose claim needs a read, a PR to review or merge, a decision); whether a waiting PR is small and not dangerous (lines, files, areas, tests, checks, open threads); a run that burns with no output (failed, exited with no PR, stalled); the working agents, each with one moving mark; wave progress.

State model, one turn per ticket, derived on the client from the assigned run and the ticket, first match wins, about 2 s behind the harness:

| Turn | Signal | Color | Second line of the row |
|---|---|---|---|
| You · question | `attention.requests` non-empty, process running; or the status has the human reviewer and no PR exists (a decision ticket asks the same way) | warning | the first question line (Muse sends the text; Claude sends it in `tool_input`, one mapping change forwards it; Codex sends a title) |
| You · read | `activity idle`, `outcome completed`, alive, completion newer than the seen mark | warning | the first line of `lastMessage` |
| You · review | human reviewer with a PR, or a non-draft open PR with the turn seen and no working run | warning | none, the PR row follows |
| You · merge | non-draft open PR, approved, checks pass, no open thread, run not working | warning | none |
| Failed · exit 1 | `state failed`: an error, `outcome failed`, or a nonzero exit | danger | the first error line |
| Gone · no PR | exited with code 0, unknown, or interrupted, and no PR | danger | the last message |
| Exited | the same, with a PR | fg-muted | none |
| Stalled · 14m | `activity working` and the newest of `lastTool.updatedAt` and `lastMessage.at` older than 10 min | fg-muted | none |
| Agent · Edit 4m | working and not stalled; the tool name and the age since `workingSince` | agent; the mark moves | none |
| Idle · 3h | turn done, seen, no PR | fg-muted | none |
| Starting | `state starting` | fg-muted | none |
| Ready | todo, no run, no open dependency | fg-faint | none |
| Blocked · after OP-52 | todo, no run, one dependency open (added 2026-09-20) | fg-muted | none |
| blank | done, canceled | | |

Dead means Failed or Gone. Data the server adds: `lastMessage` and `lastTool` in the observation, the Claude question text forwarded into `questions`, `prs[]` per ticket, and later `additions`, `deletions`, `files[]`, and the PR body from the poller.

The page. Band: the Open badge, `3 of 27 done`, one `StackedBar` with a word legend and no percentages, then `You 4 · Stuck 1 · Working 3 · Ready 15`. Groups: a synthetic **You** group first, oldest wait first, then the waves in position order; a wave header prints `0/5 · You 2 · Stuck 1` and the Current badge; inside a wave the rank is stuck, working, ready, other, closed. The ticket row: select, priority, id, title (the wave name faint after it in the You group), the turn cell (owner · word · age; hover shows the last message and the tool), the agent card: the Avatar of the assigned run, the provider mark of its harness in an 18 px round card. Off on this route: the status ring, the PR cell, labels, updated. A click opens the ticket. A PR row under its ticket, always shown, one per PR: the PR glyph in GitHub's shape and color before the number, the title, `+84 −12`, `6 files`, `tests +2` or `no tests` in warning, one risk badge per class present (migration, auth, deps, shared types, test deleted), the areas, then the mini check ribbon and the check text (`1 fail` in danger with the failed check's name, `12 pending`, `37 pass`), open threads, the review state. Under a You · question, You · read, Failed, or Gone row, the ticket row takes a second line: the agent's name in fg-faint, then one truncated line of the question, the last message, or the error. No label; the name says who speaks, and the row grows only then. A separate say row with a `said:` label was rejected on 2026-09-19 as confusing. No caret and no expansion: the child rows are the expansion, each kind with a fixed height. Two things move on the page. The agent card of a working row carries the 7 s glimmer of the product tokens: 5.6 s still, then one sweep of light across the card. A pending check segment breathes at 2.4 s. The first design, a 3 s rainbow film across the box lines of the agent mark, was rejected on 2026-09-19 as dated; the agent card with the provider logo and the product glimmer replaced it. Yellow means one thing: a human is needed.

Dissent, recorded: the agent's second line prints what the agent claims in the place where the person reads the truth; the PR rows without size data add height until the poller fetches size, files, and body. Navid, 2026-09-20: no `decide` word; a decision ticket reads `You · question`. Navid, 2026-09-20: "no violet anywhere. or purple. except the github merge icon." On the page: the Agent turn word is `fg`, the review segment of the band and the review status ring leave `--agent`, the agent chips take `elevated` and `fg`, the `You` chip takes `warning`, and the film drops its violet stop. In the product this is one change to the tokens: `--film-gradient` without `--film-violet`, and every `--agent` use except the merged PR glyph moves to a neutral. The status category color of review is the largest of those uses. Decisions for Navid: PR rows always shown or behind a caret (pick: shown); a finished turn as You · read until seen or Idle (pick: You · read); the second line printed or on hover (pick: printed, the agent's name first).

## Adoption of the Operator case

After the release runs, three commands:

```
trellis epics create --project OP --name "Routine runtime" --description - < routine-runtime.md
trellis epics add OP/routine-runtime OP-29 OP-30 OP-31 OP-32 OP-33 OP-34 OP-35 OP-36 OP-37 OP-38 OP-39 OP-40 OP-41 OP-42 OP-43 OP-44 OP-45 OP-46 OP-47 OP-48 OP-49 OP-50 OP-51
trellis create -p OP --epic OP/routine-runtime --status human-review -t "Unattended writes: option A or option B?"
```

The document lives only in the worktree of the agent run 01M2S1BZFYJW83WQWYTVQ7R35P; the first command saves it.

## Ownership of files for the build

- Foundation: `apps/server/**`, `packages/api/**` except `packages/api/src/schemas/primitives.ts`.
- CLI: `packages/cli/**`.
- Web filters and surfaces: `apps/web/src/features/{filters,table,board,ticket,composer,command}/**`, `apps/web/src/lib/searchParams.ts`.
- Web routes and pages: `apps/web/src/routes/**`, `apps/web/src/features/epics/**`, `apps/web/src/features/sidebar/**`, `apps/web/src/features/shell/**`, `apps/web/src/lib/projectPath.ts`, `packages/api/src/schemas/primitives.ts`, `apps/web/src/routeTree.gen.ts`.
- Docs: `docs/ARCHITECTURE.md`, `docs/UI_PATTERNS.md`, this file.
