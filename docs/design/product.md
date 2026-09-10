# trellis product design document

This document is for the engineer who builds trellis. It gives one answer to each open question in the brief. Where Linear has a convention, trellis copies it. Where agent-driven work is different, trellis diverges and gives the reason.

---

## 0. Product thesis

Linear organizes work around people: assignees, cycles, and teams. trellis organizes work around one human who gives work to agents and reviews the result. These consequences control every decision below:

- The home screen is an inbox of the tickets that need the human ("Needs you"), not a board.
- The actor on every event is a human or an agent, and the two look different on every surface.
- A ticket exports as a brief that an agent can act on.
- PR and CI state show on the card. For agent work, the PR is the deliverable and CI is the first reviewer.

---

## 1. Information architecture and routes (web)

### 1.1 Sidebar (240px, `[` collapses it)

Top to bottom:

1. **Workspace row**: "trellis" wordmark, connection dot (green live, amber reconnecting, red down), theme toggle.
2. **Needs you**: a count badge (Human Review plus failing CI). This is the home page.
3. **Search**: opens Cmd-K in search mode.
4. **All tickets**: a table of every project.
5. **Projects** section header with `+`.
   - Root projects as rows: key badge (`CDE`) and name. A chevron expands the sub-projects.
   - Sub-projects nest below, with a 16px indent per level and no key badge (they share the root key).
   - Each row shows a muted count of open tickets (status category not done or canceled).
   - Right-click or `…` menu: New sub-project, New ticket, Settings, Copy CLI filter (`trellis ls -p CDE/web`).
   - The tree expansion state persists in localStorage.
6. **Bottom, pinned**: current actor chip (avatar initials, name, "human"), Settings gear, keyboard help `?`.

Views (Table | Board) are **not** sidebar items. They are a segmented control in the page header. The sidebar selects the location. The header selects the view.

### 1.2 Project tree rules

- The root project owns the key. All tickets in the subtree share the root sequence (`CDE-1`, `CDE-2` …).
- A sub-project has a URL slug (kebab-case, unique among siblings, editable in settings). Reserved slugs: `board`, `settings`, `new`, `issues`.
- A project page shows the tickets of **the project and all its descendants** by default. The filter bar shows this as an implicit chip `in CDE/web + sub-projects`. A click on the chip changes the scope to "this project only" (`?scope=self`).
- Statuses: a sub-project inherits the status set of its nearest ancestor, unless it defines its own. Settings shows the button "Inherited from CDE: Customize".

### 1.3 Routes

| Route | What |
|---|---|
| `/` | Redirect → `/needs-you` (or `/setup` on first run) |
| `/setup` | First run: name, first project |
| `/needs-you` | Home inbox (section 7.5) |
| `/all` | Table of all projects |
| `/all/board` | Board of all projects, columns by **category** (status sets differ) |
| `/p/CDE` | Project table (default view) |
| `/p/CDE/board` | Project kanban |
| `/p/CDE/web/auth` | Sub-project table; `/p/CDE/web/auth/board` for kanban |
| `/p/CDE/settings` | Statuses, sub-projects, default description, key |
| `/t/CDE-42` | Full ticket page |
| `/search?q=…` | Full search results (table component) |
| `/settings` | Actor name, theme, agent command template, GitHub/`gh` status |

Router shape: a `/p/$` splat, parsed as `[key, ...slugs, viewOrNothing]`. The router reads the last segment as a view only if the segment is in the reserved set.

View state lives in **search params** on the list and board routes: `?status=…&priority=…&pr=…&updated=…&sort=…&group=…&q=…&scope=…&peek=CDE-42&density=compact`. Section 5.2 gives the exact grammar.

### 1.4 How a ticket opens

A ticket opens on one of three surfaces:

| Surface | Trigger | URL | Why |
|---|---|---|---|
| **Side peek** (default) | Click row/card, `Enter`, `Space` | current route + `?peek=CDE-42` | Triage is the main loop in agent work. The peek keeps the list in view. `j`/`k` move between tickets while the peek is open, and `Esc` closes it. Browser back closes the peek, because the peek is a search param push. |
| **Full page** | `O`, click the ID chip, Cmd-click, or the expand icon in the peek header | `/t/CDE-42` | Long reads and edits of the description, long timelines, a link to share. The peek header has an "Open" button. The full page has "Back to list", which keeps the previous search params. |
| **Modal** | Never for tickets. | none | A modal locks the context. The composer and destructive confirms are the only dialogs. |

Peek: 720px wide. It slides in from the right over the list in 240ms. The list dims 4% and stays scrollable. A drag handle resizes the peek, and the width persists. When the viewport is less than 1100px, the peek is full width (it is still a peek: `Esc` returns).

### 1.5 Sub-tickets and parents

- **Breadcrumb** at the top of the ticket header: `CDE › web › auth  ·  CDE-12 Parent title`. The project path shows as links, then the parent ticket shows as a chip (ID and truncated title). A click on the chip opens the parent in the same surface. The breadcrumb shows one parent level only. The hover card of the parent chip shows the deeper ancestry.
- **Sub-tickets section** under the description: a progress bar (`3/5 done`, green fill), rows with status icon, ID, title, priority, and PR/CI indicator, and an inline "Add sub-ticket" input at the bottom. Rows open in the peek.
- In the **table**, sub-tickets show under their parent only when the view has no sort and no grouping (`group=parent` is an available grouping). In all other views they are flat rows with a muted `↳ CDE-12` chip after the title. The table does not always nest them: agents create many sub-tickets, and the human scans a flat, filterable list.
- On the **board**, a card with sub-tickets shows `2/5` with a mini ring. Each sub-ticket is its own card.

---

## 2. The ticket page

### 2.1 Layout

Full page: two columns. The main column is 760px maximum, left-aligned, with a 48px gutter. The properties rail is 280px on the right and sticky. Peek: the same content, but the rail becomes a **property grid** (2 columns of label and value) directly under the title, above the main content.

Main column, top to bottom:

1. **Header bar** (sticky): breadcrumb (1.5), then right-aligned actions: `Start with agent ▾`, `Copy ID`, the `…` menu (Copy brief, Copy branch name, Copy link, Move to project, Set parent, Delete), and in the peek: expand, close.
2. **ID and title**: `CDE-42` in muted tabular numerals above a 24px semibold title. The title is a contenteditable single-line field. It saves on blur or Enter. `Esc` reverts it.
3. **Description**: Tiptap 3 editor, markdown in and out. Placeholder: "Describe the work. Agents read this verbatim." It renders markdown with GFM (task lists, tables, fenced code with highlighting). The user edits in place (a click puts the caret there). There is no edit/preview toggle. It saves 800ms after the last keystroke and on blur, and the rail shows a small "Saved" state. A slash menu (`/`) inserts headings, a code block, a task list, or an image (uploaded as an attachment).
4. **Sub-tickets**: shows only if sub-tickets exist or the user clicks "Add sub-ticket" in the rail.
5. **Pull requests** (2.3).
6. **Attachments** (2.4).
7. **Timeline**: comments and activity in one list (2.5), with the comment composer pinned at the bottom.

### 2.2 Properties rail

Each row has a 13px muted label on the left and a value control on the right. Every value is a popover picker. The table inline edit and Cmd-K use the same components.

| Row | Control | Notes |
|---|---|---|
| Status | Status picker, grouped by category, type-to-filter | Shortcut `s` |
| Priority | Priority picker with Linear bars | Shortcut `p` |
| Project | Tree picker (project path) | A move across roots renumbers the ticket, so it is **disallowed**: a ticket moves only inside its root tree. The picker shows the reason. |
| Parent | Ticket search picker; "None" clears | `Shift+P` |
| Sub-tickets | Count + "Add" | |
| Branch | `cde-42-short-slug` with copy button | Computed, not stored. The slug comes from the title at creation and does not change after (stored `branch_slug`) |
| Created | `2h ago by ○ Navid` | Actor rendering per 2.6 |
| Updated | `4m ago by ⟡ claude · agent` | |
| Labels | **Not in v1.** | The project tree, priority, and status categories cover a solo workflow. Labels let agents create inconsistent taxonomies. Add them only on demand. |

### 2.3 Pull requests

The agent links a PR with the CLI (`trellis pr add CDE-42 https://github.com/o/r/pull/123`), or the user pastes a PR URL into the "Link PR" input in this section. The server also links PRs automatically. When `gh pr list` in a configured repo finds a PR whose branch name or title contains `CDE-42`, the server attaches it.

**PR row** (56px, comfortable):

```
[state icon]  o/r #123  Add OAuth callback handling            [check ribbon]  [✓ 12 · ✕ 1 · ○ 2]  [↗]
              feature/cde-42-oauth → main · updated 3m ago · by claude · agent
```

- State icon (lucide `GitPullRequest` family): open = green, draft = gray with dashed outline, merged = violet `GitMerge`, closed = red `GitPullRequestClosed`.
- **Check ribbon**: a 64×6px segmented bar with one segment per check, in run order. Green is pass, red is fail, gray is pending (animated shimmer), amber is skipped or neutral. Section 9.7 lists it as a distinctive detail.
- Summary pill: counts with icons. The pill is red if any check fails, amber if any check is pending, green if all pass, and gray if there are no checks. With zero checks, the pill text is "No checks".
- Review state (if any): a small `Approved` or `Changes requested` chip.
- A click or `Enter` expands the row into **per-check rows**: status icon, check name (for example `test (ubuntu, node 22)`), duration, and an "Open" link to the details URL of the check. Failing checks sort first. The session keeps the expanded state per PR.
- `↗` opens the PR on GitHub. Cmd-K also lists "Open PR #123".
- A merged PR on a ticket in a `review` status shows an inline prompt under the row: "PR merged. Mark Done?" with a button. v1 has no automatic transition. The human decides.

**Freshness**: the server refreshes open PRs every 60s through `gh` (only for tickets that are not done or canceled). The ↻ button in the section header refreshes on demand. The server pushes updates over SSE. The section header shows "Fetched 40s ago". If `gh` is missing or not authenticated, the section shows an inline setup notice with the exact command (`gh auth login`).

### 2.4 Attachments

- **Drop zone**: the whole ticket page accepts drops. On dragover, a dashed overlay on the full surface says "Drop to attach to CDE-42". The Attachments section also has a dashed box with "Drop files or click to upload".
- An image pasted into the description or a comment uploads as an attachment, and the editor inserts `![name](/files/<id>)` in the markdown.
- Rendering: images show as a grid of 96px-square thumbnails (a click opens a lightbox with arrow-key navigation). Other files show as rows: a file icon by type, name, size, uploader and time, and download. The `…` menu has Copy markdown link, Rename, and Delete.
- The server stores files on disk under its data directory and serves them at `/files/:id/:filename`, so agents can `curl` them from the brief.

### 2.5 Timeline: one list

**Decision: one timeline with comments and activity together, oldest first, with the comment composer pinned at the bottom.** A toggle in the section header switches between "All" and "Comments". One list shows the order of events. The status changes of an agent between its comments tell what happened ("moved to In Progress → commented plan → linked PR → moved to Agent Review"). A split view hides that order.

Rules:

- **Comment** = full card: actor line, relative time (hover: absolute), markdown body, `…` menu (Edit, Copy markdown, Delete). The user edits inline with Tiptap. Comment composer: Tiptap, `Cmd+Enter` posts, drag and paste add attachments.
- **Activity** = one 32px line: actor, verb, from → to, time. Examples: `⟡ claude · agent moved Todo → In Progress · 2h`, `○ Navid set priority High · 1d`, `⟡ claude · agent linked PR #123`.
- **Collapse**: consecutive activity by the same actor within 5 minutes collapses into one expandable row: `⟡ claude · agent changed status, priority, and linked a PR · 2h`.
- Agent comments get a left border in the agent accent color. Human comments get the neutral border. The border shows the author of each comment during a fast scroll.

### 2.6 Rendering the actor: human vs agent

| | Human | Agent |
|---|---|---|
| Avatar | Filled circle, initials, neutral color from a hash of the name | Rounded-square outline in agent accent (violet) with lucide `Bot` glyph |
| Name | `Navid` in UI font, medium weight | `claude` in monospace inside a chip: `⟡ claude · agent`; the `· agent` suffix muted |
| Where the chip appears | Everywhere an actor shows | Everywhere an actor shows. Board cards and table rows show the *last-touched-by* actor as a 16px avatar only, with the chip on hover |
| Live dot | none | If the agent made an event in the last 5 minutes, a small pulsing dot on the avatar ("live agent dot", 9.7). With reduced motion, the dot is static. |

Actor name and kind are the only stored identity fields. There is no profile page. A click on an actor chip applies the filter `actor=claude` to the current list.

---

## 3. Table view

TanStack Table v9 and TanStack Virtual. Row virtualization is always on.

### 3.1 Columns

| Column | Default | Width | Content |
|---|---|---|---|
| Select | visible (checkbox shows on hover or when any row is selected) | 32 | |
| Priority | visible | 32 | Bars icon; click → popover |
| ID | visible | 72 | `CDE-42` tabular numerals, muted; click opens full page |
| Title | visible, flexible | fill | Title; inline muted chips after it: `↳ CDE-12` (parent), sub-ticket ring `2/5`, paperclip and count, comment count |
| Status | visible | 140 | Category icon and name; click → popover |
| PR | visible | 96 | PR state icon and mini check ribbon (or summary dot when compact); hover card lists PRs with counts |
| Project | visible only when the scope includes sub-projects | 140 | Sub-path relative to the viewed project (`web/auth`) |
| Last actor | visible | 40 | 16px avatar (human circle, agent square) |
| Updated | visible | 80 | Relative, tabular |
| Created | hidden | 80 | |
| Parent | hidden | 120 | |
| Sub-tickets | hidden | 64 | |

Column visibility, order, density, grouping, and sort live in the **Display** popover (a button at the right end of the filter bar, as in Linear). Column visibility and density are UI preferences (localStorage per route). Sort and group are URL state.

### 3.2 Default sort and grouping

- Default: **group by status** (category order, then configured status order). Rows sort by **priority desc, then updated desc**. Group headers show the status icon, name, count, and a `+` that creates a ticket in that status.
- The Done and Canceled groups are collapsed by default, with a "Show 34" control. The collapse state of each group persists per route in localStorage.
- Sort options: Priority, Updated, Created, Status, ID, Title. Group options: None, Status, Priority, Project, Parent, PR state.

### 3.3 Density

`comfortable` (40px rows, 13px text) is the default. `compact` has 32px rows and 12px text. The toggle is in Display. The app writes `?density=compact` to the URL only when the user sets it, so shared links keep it.

### 3.4 Inline edits

- The Status and Priority cells open a popover on click, or with `s`/`p` on the focused row. The rail and Cmd-K use the same popover component: a searchable list, category icons, `Enter` applies, `Esc` cancels. The change applies optimistically (10.3).
- Project cell → tree picker. Parent cell → ticket picker.
- The table does **not** edit the title inline. `Enter` opens the peek, where the title is editable. Reason: fast keyboard navigation causes accidental edits.

### 3.5 Multi-select and bulk actions

- `x` toggles the selection of the focused row. `Shift+click` and `Shift+j/k` extend it. `Cmd+A` selects all rows in the current filter (selection is an ID set, so virtualization does not affect it). `Esc` clears.
- Selected rows get an accent left border and a tinted background. After the first selection, the checkbox column stays visible.
- **Bulk bar**: floats at the bottom center, 480px wide, and slides up in 180ms. It shows `12 selected` and the buttons Status, Priority, Move to project, Set parent, Copy IDs, and Delete (confirm). Each bulk change writes one activity entry per ticket with the current actor.
- With a selection, Cmd-K shows the "12 tickets" context actions at the top.

### 3.6 Keyboard navigation (table)

Roving focus on rows. The focused row has a 2px inset accent ring on the left edge and a subtle background.

| Key | Action |
|---|---|
| `j` / `k` or `↓` / `↑` | Move focus |
| `Enter` / `Space` | Open peek |
| `o` | Open full page |
| `x` | Toggle select |
| `Shift+j/k` | Extend selection |
| `s` / `p` | Status / priority popover for focused (or selected) rows |
| `Shift+P` | Parent picker |
| `m` | Move to project |
| `c` | New ticket (composer) |
| `Cmd+C` | Copy ID of focused row |
| `Cmd+Shift+C` | Copy branch name |
| `Cmd+.` | Copy link |
| `Backspace` / `Delete` | Delete (confirm) |
| `Esc` | Close peek → clear selection → blur |
| `g` then `s` | Focus filter bar |
| `1`–`9` | Toggle group collapse for the nth group |

### 3.7 Row count and empty states

- Footer bar (28px, muted): `42 tickets · 3 selected` and the active sort as text. Group headers show the count of each group.
- **No tickets in project**: an empty state without an illustration, with a title, a "Create ticket" button, and a CLI line to copy: `trellis new -p CDE "First ticket"`.
- **No results for filters**: "No tickets match. [Clear filters]". If `q` is set: "No tickets match 'oauth'".
- **Server unreachable**: the app handles this globally (10.4), not per table.

---

## 4. Kanban

Atlassian pragmatic-drag-and-drop with the hitbox and auto-scroll addons.

### 4.1 Columns

- One column per status in the effective status set of the viewed project. Columns sort by category (`todo → started → review → done → canceled`), then by configured order within a category.
- `/all/board`, and any view that spans more than one status set, use **category columns** (5 fixed). Each card shows its status name in the footer.
- Header: category icon, status name, count, WIP limit badge if set, `+` (add), `…` (collapse, set WIP limit, hide done older than…). When the count is over the WIP limit, the header turns amber and the count reads `7/5`. WIP limits are per-status settings, off by default.
- By default, the Done column shows tickets completed in the last **14 days**, with a footer link "Show all done". The Canceled column is **collapsed by default**.
- Collapsed column: 40px wide, vertical label and count. A click expands it. The collapsed state is a UI preference in localStorage per project, not URL state, because it is a personal layout choice and not part of the view definition.
- Horizontal scroll with column snap. Column width 300px. The column body is virtualized above 100 cards.

### 4.2 Card

```
CDE-42                                   [!! priority]
Add OAuth callback handling for GitHub
login (2 lines max, then ellipsis)
[PR ○ ▮▮▮▮▮▯▯] [2/5]  [📎 1]        ⟡ · 4m
```

- Row 1: ID in muted tabular numerals. The priority icon is right-aligned. Priority none shows nothing (not the dashes), so cards stay quiet.
- Rows 2–3: title, 13px, two-line clamp.
- Footer: PR state icon and mini check ribbon (only if a PR exists), sub-ticket ring with `2/5`, attachment count. Right side: last actor avatar (16px) and relative time.
- A card whose open PR has a **failing check** gets a 2px red top border. This meets the requirement to show a failing PR on the card. It is the only colored border a card uses.
- Hover: raise the shadow 1 step (shadow token), no scale. Focused card: accent ring.

### 4.3 Drag rules

- A drag between columns changes the status, with the current human as the actor. The change is optimistic. The activity entry reads `○ Navid moved In Progress → Human Review`.
- A drag within a column is a manual reorder, persisted as `board_position` per (ticket, status). Manual order is the default board sort. Any other sort in Display turns reorder off: no drop indicator shows within the column, and the card snaps to its sorted place.
- Drop indicator: a 2px accent line between cards. The target column gets a 4% tint. The dragged card shows as a small preview (title and ID only) at 0.9 opacity. The source slot shows a dashed placeholder.
- A drop onto a collapsed column is allowed. The column expands after 400ms of hover.
- Category columns on `/all/board`: a drop selects the **first** status of that category in the project of the ticket. If there is more than one, a small popover asks which.
- Multi-drag: not in v1. Use the table for bulk status changes.

### 4.4 Add a ticket in a column

The `+` in the column header adds at the top. The ghost "+ New ticket" row adds at the bottom. Both become an inline card with a single-line title input. `Enter` creates the ticket (project = current, status = column), and a new input shows for the next one. `Shift+Enter` opens the full composer with the values filled in. `Esc` cancels. New cards animate in (fade and 4px rise, 160ms).

### 4.5 Keyboard on the board

Arrow keys move focus across cards and columns. `Enter` opens the peek. `s` opens the status popover, which is the accessible equivalent of a drag. `[` and `]` move the focused card to the previous or next column (a status change). `Shift+↑/↓` reorders within the column.

---

## 5. Filters, sort, group, search, Cmd-K, shortcuts

### 5.1 Filter bar model

Chips under the page header, as in Linear. `F` or the "Filter" button opens a picker (cmdk list) of fields. A field opens its value picker. The chip shows as `Status is In Progress, Agent Review`. A click on the operator of the chip toggles `is` ⇄ `is not`. A click on the value opens the picker again. `×` removes the chip.

| Field | Operators | Values |
|---|---|---|
| Status | is / is not | statuses of the scope, plus category pseudo-values `@todo @started @review @done @canceled` |
| Priority | is / is not | none, urgent, high, medium, low |
| Project | is / is not | any project path; each chip has a "+ sub-projects" toggle |
| Parent | is / has parent / no parent | ticket |
| PR | has / none / open / draft / merged / passing / failing / pending | |
| Updated | after | `1h 24h 7d 30d` or a date |
| Created | after / before | same |
| Actor | last updated by | actor name, or kind `@agent` / `@human` |

Chips combine with AND. Values within one chip combine with OR (as in Linear). The first section of the filter picker has presets: **Active** (status not done or canceled), **Needs review** (status @review), **Failing CI** (pr=failing), **Touched by agents today** (actor=@agent, updated>24h).

### 5.2 URL serialization

One param per field, with comma-separated values. A leading `!` negates the whole set. Values are status **slugs**, not ids, so URLs are readable. A URL stays stable across a rename only if the slug does not change (the slug is editable, with a warning).

```
/p/CDE?status=in-progress,agent-review&priority=!none&pr=failing&updated=7d&actor=@agent&sort=-updated,priority&group=status&scope=self&q=oauth&peek=CDE-42
```

- `sort`: a comma list, where a `-` prefix means desc. `group`: one field, or absent.
- An absent param means the default. The app never writes default values into the URL, so `/p/CDE` stays clean.
- The bar has a "Copy link" action and a "Copy as CLI" action. "Copy as CLI" emits the equivalent `trellis ls -p CDE --status in-progress,agent-review --pr failing --updated 7d`. The URL and the CLI use the same grammar.

### 5.3 Saved views

**Not in v1.** The URL is the saved view: the browser bookmarks it, and the CLI accepts the same filters. Saved views can come later as a sidebar section, without a change to the URL model. The four presets above cover the common cases.

### 5.4 Full-text search

- Backend: a Postgres `tsvector` in PGlite over title (weight A), description (B), and comments (C), plus prefix match on ID without trigrams.
- Ranking: an exact ID match first, then title prefix and phrase matches, then `ts_rank_cd` with weights. Ties break by `updated desc`. With equal score, done and canceled tickets rank after active ones. Search never excludes them.
- Cmd-K shows the top 6 during input (80ms debounce). `Enter` opens the peek. `Cmd+Enter` opens `/search?q=` with the full table, and filters apply to the search results.
- `CDE-42` typed anywhere in the palette goes directly to that ticket.

### 5.5 Cmd-K palette (cmdk)

Sections in this order, based on the current location:

1. **This ticket** (when a ticket is open in the peek or full page, or a row has focus): Change status… (submenu), Set priority…, Move to project…, Set parent…, Add sub-ticket, Start with agent (copies command), Copy ID `CDE-42`, Copy branch name, Copy agent brief, Copy link, Open PR #123 (one per PR), Open full page, Delete.
2. **Selection** (when rows are selected): the bulk actions.
3. **Create**: New ticket, New sub-ticket (when a ticket is open), New project, New sub-project (in a project).
4. **Go to**: Needs you, All tickets, each project (fuzzy), Board / Table of current project, Settings.
5. **View**: Filter by…, Sort by…, Group by…, Toggle density, Toggle theme, Collapse sidebar.
6. **Search results**: tickets that match the query (5.4).

Each item shows its shortcut on the right. Ticket actions write activity with the current actor.

### 5.6 Global keyboard shortcut map

| Key | Action | Scope |
|---|---|---|
| `Cmd+K` | Command palette | global |
| `/` | Focus search (palette in search mode) | global |
| `c` | New ticket | global |
| `?` | Shortcut help sheet | global |
| `g` `h` | Go to Needs you | global |
| `g` `a` | Go to All tickets | global |
| `g` `p` | Go to project… (picker) | global |
| `g` `b` / `g` `t` | Switch to Board / Table | project routes |
| `g` `s` | Focus filter bar | list routes |
| `[` | Toggle sidebar | global |
| `Cmd+\` | Toggle theme | global |
| `Esc` | Close popover → close peek → clear selection | global |
| `j` `k` `↑` `↓` | Move focus / next-prev ticket in peek | list, board, peek |
| `Enter` / `Space` | Open peek | list, board |
| `o` | Open full page | list, board, peek |
| `x` | Toggle select | list |
| `Shift+j/k` | Extend selection / reorder in column | list / board |
| `s` | Status picker | list, board, ticket |
| `p` | Priority picker | list, board, ticket |
| `Shift+P` | Parent picker | list, board, ticket |
| `m` | Move to project | list, board, ticket |
| `[` / `]` (card focused) | Move to previous / next column | board |
| `a` | Approve (→ Done) | Needs you, review-status tickets |
| `r` | Send back (→ started status, with comment) | Needs you, review-status tickets |
| `e` | Edit description (focus editor) | ticket |
| `Shift+C` | Focus comment composer | ticket |
| `Cmd+Enter` | Submit composer / post comment | dialogs, editors |
| `Cmd+Shift+Enter` | Create and start another | composer |
| `Cmd+C` | Copy ID | list, board, ticket |
| `Cmd+Shift+C` | Copy branch name | list, board, ticket |
| `Cmd+.` | Copy link | list, board, ticket |
| `Cmd+Shift+A` | Start with agent (copy command) | ticket |
| `Cmd+Shift+B` | Copy agent brief | ticket |
| `Backspace` | Delete (confirm) | list, board |
| `1`–`9` | Toggle nth group / column collapse | list / board |

`Cmd` is `Ctrl` on Linux and Windows. A sequence (`g h`) has an 800ms window and shows a small "g…" hint at the bottom left.

---

## 6. Create ticket flow

### 6.1 Quick composer

- `c`, the sidebar `+`, a group or column `+`, or Cmd-K opens it. It is a centered dialog, 640px wide, with a 40% scrim and no backdrop blur (blur is slow).
- Fields: title (autofocus, single line, 16px), description (Tiptap, filled with the default description of the project if one is set, section 6.3), then a **property chip row**: Project, Status, Priority, Parent. Each chip is a popover that shows its current value. The chip row copies the rail, so the user learns nothing new.
- `Cmd+Enter` creates the ticket and closes the dialog. `Cmd+Shift+Enter` creates the ticket and keeps the dialog open with the same properties, and a toast "Created CDE-43: Open" shows each time. `Esc` closes. It asks for a discard confirm only if the title or description has text.
- After creation, the row or card animates into its list position. "Open" in the toast opens the peek.
- Draft persistence: sessionStorage keeps the composer body until the ticket is created or the user discards it, so an accidental `Esc` loses nothing.

### 6.2 Defaults from the current view

- Project = the viewed project. On `/all`, it is the top-level project, and the chip requires a choice before submit.
- Status = the filter status if the active filter has `status is <single value>`. Otherwise, the default status of the project (the first `todo`-category status). From a group header or column `+`, the status of that group.
- Priority = the value of a single-valued `priority is` filter, else none.
- Parent = the current ticket when the composer opens from a ticket ("Add sub-ticket", `Shift+C` in the sub-tickets section, Cmd-K "New sub-ticket"). The project chip locks to the project of the parent.

### 6.3 Templates

**No template system in v1.** Each project has one optional **default description** (markdown, editable in project settings). New tickets start with it. The shipped default:

```
## Context

## Acceptance criteria
- [ ]

## Out of scope
```

Agents need these sections to do the work, and the human needs them to review it. At this scale, a template picker adds a menu with no use.

---

## 7. Actor identity and the agent-facing product

### 7.1 First-run prompt

`/setup`, step 1: "What should we call you?", a single text field, and `Continue`. The app stores the name in localStorage (`trellis.actor = { name, kind: 'human' }`) and sends it as the `X-Trellis-Actor` and `X-Trellis-Actor-Kind` headers on every mutation. Step 2 creates the first project (10.1). The CLI takes `--as <name>` and `--kind agent|human`, or the `TRELLIS_ACTOR` and `TRELLIS_ACTOR_KIND` env vars. It defaults to `$USER` and `human`. Agent setups export `TRELLIS_ACTOR=claude TRELLIS_ACTOR_KIND=agent` in their environment, and the brief tells them to.

### 7.2 How the current actor shows in the UI

The bottom of the sidebar shows the avatar, the name, and a muted `human`. A click opens a rename popover. The web app attributes every mutation to this actor and asks the user nothing more.

### 7.3 Agents in activity

The `⟡ claude · agent` chip (2.6). Agents with different names (`claude`, `codex`, `cursor`) get different hash colors within the violet family. Each agent is distinct, and no agent looks human.

### 7.4 Agent features (the difference from Linear)

**Start with agent** (primary button on every ticket, `Cmd+Shift+A`): copies a shell command to the clipboard and shows the toast "Copied: paste in your terminal". The default template, configurable in Settings → Agents:

```
claude "$(trellis brief CDE-42)"
```

The dropdown next to the button: Copy command · Copy prompt only (the brief text) · Copy brief as markdown · Copy `trellis` CLI cheat-sheet. The dropdown has the checkbox "also mark In Progress". If the human checks it, the start also moves the ticket to the first `started` status. The app remembers the checkbox.

**Agent brief** (`trellis brief CDE-42`, and "Copy brief"): a markdown document with a fixed layout, so agents can parse it:

1. Header: `# CDE-42: Title`, project path, status, priority, parent (with title), branch name, and a link to the ticket URL.
2. The description, verbatim.
3. Sub-tickets with status (if any).
4. Linked PRs with state and the names of failing checks (if any).
5. Attachments as URLs.
6. The last 10 comments, newest last, with actor and kind.
7. **Protocol section** (fixed text): how to move status (`trellis status CDE-42 in-progress`), comment (`trellis comment CDE-42 "…"`), link a PR (`trellis pr add CDE-42 <url>`), and create sub-tickets, and the rule: "When your work is ready for review, set status `agent-review`. Do not set `done`."

**Status categories as workflow**: the default set is `Todo → In Progress → Agent Review → Human Review → Done`. Each `review`-category status has a `reviewer` attribute (`agent` | `human`; Agent Review = agent, Human Review = human). "Needs you" uses this attribute to work across custom status sets. The CLI refuses `trellis status X done` from an agent actor unless `--force` is set (exit code 3, stderr: "agents cannot mark Done; set human-review instead").

**Approve / Send back**: on a ticket in a human-reviewer status, the header shows two buttons. **Approve** moves the ticket to the first `done` status (`a`). **Send back** moves it to the first `started` status (`r`), and first opens a comment box: "What should change?". Both write activity, and Send back posts the comment. Needs you rows and the mobile app have the same pair.

**CI on the card**: red top border and ribbon (4.2). Failing CI on an open PR also shows in Needs you.

### 7.5 "Needs you" home screen

Route `/needs-you`. The header has no greeting: "Needs you" and a live count. Each section is a compact table (the row component of the table view, comfortable density, no grouping). Each section is collapsible and has a count in its header:

1. **Review**: tickets in a human-reviewer status, sorted by time in status desc (the longest wait first). Each row has Approve, Send back, and Open PR actions on hover and through `a` / `r`. Approve animates the row out (9.6) and decrements the count.
2. **Failing CI**: tickets not done or canceled with an open PR that has a failing check. The row shows the PR, the names of the failing checks, and "Re-run with agent". That action is the Start with agent command with an added instruction (`… fix the failing checks: test (node 22)`).
3. **Stalled**: tickets in a `started` status with no activity for 24h (configurable). The usual cause is a dead agent session. Actions: Start with agent, Move to Todo.
4. **Done by agents today**: collapsed by default. It shows the work that closed without human input. Each row has "Reopen".

When all sections are empty, the screen shows one line: "Nothing needs you. 3 tickets in progress by agents.", with a link to the Active preset. This is the first screen the user sees.

---

## 8. Mobile app (Expo)

### 8.1 Navigation

Bottom tabs: **Needs you** (home) · **Search** · **Projects** · **Settings**. Each tab has stack navigation. The ticket screen is a stack push (never a modal) with the ID as the header title.

### 8.2 Screens

| Screen | Content | Editable |
|---|---|---|
| Server setup | URL field with `http://` default, "Test connection" (calls `GET /health` → shows server name, version, ticket count), name field, Save. Shows until both are set. Settings → Server opens it later. | none |
| Needs you | The four sections from 7.5 as a sectioned list. Rows: status icon, ID, title, PR/CI ribbon, time waiting. Swipe right on a Review row = Approve (green). Swipe left = Send back (opens comment sheet). Pull to refresh. | Approve, Send back |
| Search | Search field, recent searches, results list | none |
| Projects | The tree as an indented list. A tap opens the ticket list of the project, with a status segmented filter (Active / Review / Done) and a sort toggle. No board on mobile. | none |
| Ticket | Title, property grid (status, priority, project, parent), rendered markdown description, sub-tickets, PR cards (state, check counts, ribbon; a tap opens GitHub in the system browser), attachments (image viewer; other files open externally), timeline, comment composer at the bottom. | Status (bottom sheet), Priority (bottom sheet), Comment (plain text, markdown allowed), Approve / Send back. **Not** editable: title, description, attachments (v1). |
| Settings | Name, server, theme (system default), version, "Copy `trellis` install command". | none |

Notifications: **none in v1.** The app has no push infrastructure, and a local server cannot reach APNs. A v2 can poll with a background fetch. Settings shows "Notifications: not yet".

### 8.3 Live updates, offline, errors

- SSE through `expo/fetch` streaming when the app is in the foreground. Otherwise, a refetch on focus.
- The TanStack Query cache persists to AsyncStorage. On launch, the last data shows immediately with a thin amber banner, "Offline: showing cached data", until the first request succeeds.
- Unreachable server: a full-screen state on the current tab: "Can't reach 192.168.1.20:4400", "Retry", "Change server". If the URL never answered (a typo in setup), the setup screen shows the specific error (`ECONNREFUSED`, timeout, non-trellis response).
- A mutation while offline fails immediately with a toast. v1 has no queue.

---

## 9. Visual design system

### 9.1 Type

Inter variable (`font-feature-settings: "cv11", "ss01"` for the single-storey a and open digits; `tnum` on IDs, counts, and times). Monospace: JetBrains Mono for agent chips, branch names, code, and CLI snippets.

| Token | Size / line | Use |
|---|---|---|
| `text-2xs` | 11 / 16 | Badges, table footer |
| `text-xs` | 12 / 16 | Compact rows, timestamps, labels |
| `text-sm` | 13 / 20 | Default UI text, table rows, cards |
| `text-base` | 14 / 22 | Description body, comments |
| `text-md` | 16 / 24 | Composer title input, section headers |
| `text-lg` | 20 / 28 | Page titles |
| `text-xl` | 24 / 32 | Ticket title |

Weights: 400 body, 500 UI labels and titles, 600 headings. Never 700.

### 9.2 Spacing and radius

4px base: `1=4 2=8 3=12 4=16 5=20 6=24 8=32 10=40 12=48`. Radii: `sm=4` (chips, inputs), `md=6` (buttons, cards), `lg=8` (popovers), `xl=12` (dialogs, peek). For nested surfaces, the outer radius = the inner radius + the padding.

### 9.3 Color tokens (semantic)

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#FAFAFA` | `#0E0E11` | App background |
| `surface` | `#FFFFFF` | `#141418` | Sidebar, cards, rows |
| `elevated` | `#FFFFFF` + shadow | `#1B1B21` | Popovers, dialogs, peek |
| `border` | `#E6E6EA` | `#26262E` | Hairlines |
| `border-strong` | `#D0D0D6` | `#33333D` | Inputs, focused rows |
| `fg` | `#121215` | `#EDEDF0` | Primary text |
| `fg-muted` | `#6B6B76` | `#9A9AA6` | Secondary text, IDs |
| `fg-faint` | `#A0A0AA` | `#5E5E6A` | Placeholders, disabled |
| `accent` | `#5B5BD6` | `#7C7CF0` | Focus ring, selection, links, primary buttons |
| `accent-soft` | `#EEEEFB` | `#22224A` | Selected row tint |
| `agent` | `#7C3AED` | `#A78BFA` | Agent chips, agent comment border |
| `agent-soft` | `#F3EEFF` | `#2A1F47` | Agent chip background |
| `success` | `#16A34A` | `#4ADE80` | Passing checks, done |
| `warning` | `#D97706` | `#FBBF24` | Pending, WIP over limit, reconnecting |
| `danger` | `#DC2626` | `#F87171` | Failing checks, urgent, destructive |
| `scrim` | `rgba(0,0,0,.4)` | `rgba(0,0,0,.6)` | Dialog backdrop |

Shadows: `sm` (row hover) `0 1px 2px rgba(0,0,0,.06)`, `md` (popovers) `0 4px 12px rgba(0,0,0,.10)`, `lg` (peek, dialogs) `0 12px 32px rgba(0,0,0,.16)`. In dark mode, a 1px `border-strong` and a lighter shadow replace the shadows.

### 9.4 Status colors by category (icons use the Linear circle set)

| Category | Color | Icon |
|---|---|---|
| todo | `fg-faint` | Empty circle |
| started | `warning` | Circle with a half-filled ring (progress ring; sub-ticket progress fills the ring when present) |
| review | `accent` (agent-reviewer statuses use `agent`) | Circle with a dotted ring; the agent-review variant contains the `⟡` glyph |
| done | `success` | Filled circle with check |
| canceled | `fg-faint` | Circle with ×; ticket title struck through |

### 9.5 Priority icons

Signal bars as in Linear, 16px: none = three faint dashes (only in pickers; hidden on cards), low = 1 of 3 bars filled, medium = 2, high = 3, urgent = a filled `danger` rounded square with `!`. Bars use `fg-muted`, not a color, so priority never competes with CI red.

### 9.6 Motion rules (`motion`)

| Thing | Duration / easing |
|---|---|
| Hover/pressed state, popover open | 120ms, ease-out |
| Popover/dialog enter | 160ms, opacity + 4px translate; exit 100ms |
| Peek slide | 240ms, `cubic-bezier(.2,.8,.2,1)`; exit 180ms |
| Row/card enter (created) | 160ms fade + 4px rise |
| Row/card leave (approved, moved out of filter) | 200ms height collapse + fade ("approve sweep") |
| Bulk bar | 180ms rise |
| Toasts (sonner) | defaults |

These never animate: table rows that re-sort on SSE updates (they jump, with no FLIP, because an animation of 200 rows is noise), text content changes, numbers and counters, skeleton → content (instant swap), and the theme switch. Fixed row heights prevent layout shift from live data.

### 9.7 Distinctive details

1. **Check ribbon**: the segmented CI bar on PR rows and cards. It shows the CI result as a barcode that the user reads at a glance.
2. **Agent chips with the live dot**: `⟡ claude · agent` in mono, with a pulsing dot while the agent is active. A board of these chips shows which agents work now.
3. **Approve sweep**: on Needs you, `a` approves and the row collapses out while the count goes down. Ten keystrokes approve ten tickets.
4. **Start with agent**: a primary button. A click copies a ready shell command and shows it in the toast in mono. One frame shows the purpose of the product.

### 9.8 Focus rings and density

`:focus-visible` only: a 2px `accent` outline, 2px offset, with the radius of the element. Rows and cards use an inset left bar and not an outline, because an outline clips in virtualized containers. A mouse click gets no focus style.

---

## 10. Empty states, loading, errors, offline

### 10.1 First-run onboarding

`/setup`: two steps in one card. (1) Name. (2) First project: a name field, and a key suggested from the name (first letters of the words, uppercase, 2–5 chars, unique; editable, with live validation: `A–Z`, 2–5 chars). Below it: "Tickets will be numbered `CDE-1`, `CDE-2` …". Create goes to `/p/CDE` with the project empty state, which includes the CLI install line and `trellis new -p CDE "…"`. A dismissible "Set up agents" card on Needs you links to Settings → Agents.

### 10.2 Skeletons vs spinners

- Lists, boards, ticket pages: **skeletons** in the shape of the real rows (same height and density) for up to 300ms. If data arrives sooner, the app shows it directly (no flash). A navigation between routes already in the cache never shows a skeleton: TanStack Query serves cached data at once and revalidates.
- Spinners show only inside buttons, during a pending action that is not optimistic (for example, PR refresh). File upload progress uses a bar.
- Each route has its own suspense boundary, so the sidebar never shows a skeleton.

### 10.3 Optimistic updates and rollback

Optimistic: status, priority, project, parent, board reorder, title, comment post, ticket create (the temporary ID `CDE-…` shows as `…` until the server responds). Not optimistic: delete (confirm first, then a pending state), file upload, PR link (needs `gh` validation).

On failure, TanStack Query `onError` restores the snapshot. sonner shows `Couldn't move CDE-42 to Done`, with the server message on the second line and a **Retry** action. Error toasts stay 6s. Success toasts stay 3s. Success toasts show only for actions whose result is not on screen (copy, create from the composer, bulk actions).

SSE events reconcile the client state. Every mutation response and every event carries `updatedAt`, and the client applies the newer one. A stale event never overwrites an optimistic write.

### 10.4 Server restarts and SSE reconnect

- SSE at `/events` with `Last-Event-ID`. The server keeps a ring buffer of the last 1000 events with sequence numbers.
- On disconnect, the client reconnects with backoff 1s → 2s → 4s → 8s (cap). After 3s without a connection, a thin amber top banner shows "Reconnecting to trellis…", with no spinner. Mutations still try, and fail with a toast.
- On reconnect with a valid `Last-Event-ID`, the server replays the gap. If the server does not know the ID (it restarted), the client invalidates all queries (one burst of refetches) and shows a green "Reconnected" banner for 2s.
- The connection dot in the sidebar shows the same state.

### 10.5 Other errors

- 404 ticket (`/t/CDE-999`): "CDE-999 doesn't exist" with a search link.
- Validation (for example, a ticket move across root projects): an inline message in the picker, never a toast alone.
- `gh` errors: shown in the PR section, not globally.

---

## 11. Accessibility

- Every action has a keyboard route: the shortcut map (5.6), a visible button, or a Cmd-K entry. No action is hover-only. Row actions that show on hover are also in the `…` menu of the row, and `Tab` reaches them when the row has focus.
- Table: `role="grid"` with roving `tabindex`, `aria-rowcount` for the virtualized count, `aria-selected` on selected rows, and group headers as `role="rowgroup"` with `aria-expanded`.
- Board: columns are `role="list"` with `aria-label="In Progress, 4 tickets"`. Cards are `role="listitem"` and focusable. Drag and drop has a full keyboard equivalent (`s`, `[`/`]`, `Shift+↑/↓`). pragmatic-dnd announces through a live region: "CDE-42 picked up from Todo, position 2 of 5", "Moved to In Progress, position 1 of 3", "Drop canceled". The shortcut help shows the status picker as the primary method. Drag is the secondary method.
- The peek is a non-modal `role="dialog"` (`aria-modal="false"`). On open, focus moves to the title. On close, focus returns to the row that opened it. The full page is a normal document.
- Popovers, dialogs, menus, and toasts come from shadcn/radix and keep their built-in focus management. The sonner region announces politely.
- Color is never the only signal: status has icons, priority has bar counts, CI has icons and counts next to the ribbon, and agent chips have the glyph and the `· agent` text.
- Contrast: all text ≥ 4.5:1 on its surface. Icons and controls next to hairlines ≥ 3:1. The token table meets these ratios in both themes.
- Reduced motion (`prefers-reduced-motion`): slides and rises become 80ms opacity fades. The approve sweep becomes an instant removal. The live agent dot stops its pulse. The check ribbon shimmer stops.
- Mobile touch targets ≥ 44px. Each swipe action has an equivalent button in the ticket header.

---

## Appendix A: Data that this design implies (for the schema)

- `status`: `id, project_id, name, slug, category, reviewer (nullable; only for review), position, wip_limit (nullable), is_default`.
- `ticket`: adds `branch_slug`, `board_position` per status (`ticket_board_position` table keyed by ticket and status), `search_vector`.
- `pr`: `ticket_id, url, number, repo, title, state (open|draft|merged|closed), head_ref, base_ref, review_state, checks_json, fetched_at`.
- `activity`: `ticket_id, actor_name, actor_kind, type, from, to, at`.
- Every mutation procedure takes `actor: { name, kind }` from headers. The CLI and the web app both set them.

## Appendix B: CLI commands this design references

`trellis brief <id>`, `trellis status <id> <slug>`, `trellis comment <id> "<md>"`, `trellis pr add <id> <url>`, `trellis new -p <path> "<title>"`, `trellis ls` with the URL filter grammar, `trellis show <id>`. Exit codes: 0 ok, 1 error, 2 not found, 3 refused (policy, for example agent → done).

---

### Critical Files for Implementation

No code existed when this document was written. This design sets the content of these files, to create in the worktree:

- `/Users/navidkhan/.superset/worktrees/7e236463-fb17-43f1-952f-5a03530a7516/meadow-mass/apps/web/src/routes/p.$.tsx`: the project splat route. Path, slug, and view parse; the search-param schema for filter, sort, and group; the peek param (sections 1.3, 5.2).
- `/Users/navidkhan/.superset/worktrees/7e236463-fb17-43f1-952f-5a03530a7516/meadow-mass/apps/web/src/features/ticket/TicketView.tsx`: the ticket body for the peek and the full page. Rail, PR rows with check ribbon, attachments, the timeline, actor chips (section 2).
- `/Users/navidkhan/.superset/worktrees/7e236463-fb17-43f1-952f-5a03530a7516/meadow-mass/apps/web/src/features/needs-you/NeedsYou.tsx`: the home inbox sections, the approve and send-back actions, and the sweep animation (section 7.5).
- `/Users/navidkhan/.superset/worktrees/7e236463-fb17-43f1-952f-5a03530a7516/meadow-mass/packages/server/src/db/schema.ts`: statuses with `category` and `reviewer`, board positions, PR checks, activity with actor name and kind (Appendix A).
- `/Users/navidkhan/.superset/worktrees/7e236463-fb17-43f1-952f-5a03530a7516/meadow-mass/apps/web/src/styles/tokens.css`: Tailwind v4 theme tokens for light and dark, the status, priority, and agent colors, and the type and spacing scales (section 9).
