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

One migration, `0076_omniscient_sentinels`, generated with `bun run db:generate` after `0075_steady_invaders`. Keep the snapshot. The SQL holds only the `epics` table, the `tickets.epic_id` column, its FK, and its index. Never edit an earlier migration.

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
